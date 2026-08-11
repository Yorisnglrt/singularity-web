import { createClient } from '@supabase/supabase-js';
import { sendEventBroadcastEmail } from './sendEventBroadcastEmail';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export interface SendActiveBroadcastCampaignsForTicketsParams {
  eventId: string;
  tickets: Array<{
    holder_email?: string | null;
    holder_name?: string | null;
  }>;
}

/**
 * Automatically sends active broadcast campaigns to newly issued ticket holders
 * if they have not already received the campaign.
 * This helper catches all errors to prevent disrupting the ticket/payment flow.
 */
export async function sendActiveBroadcastCampaignsForTickets({
  eventId,
  tickets,
}: SendActiveBroadcastCampaignsForTicketsParams): Promise<void> {
  try {
    if (!eventId || !tickets || tickets.length === 0) {
      return;
    }

    // 1. Gather and normalize recipients from tickets (trim & lowercase)
    const recipientMap = new Map<string, { email: string; name: string | null }>();
    for (const t of tickets) {
      if (!t.holder_email) continue;
      const normalizedEmail = t.holder_email.trim().toLowerCase();
      if (!recipientMap.has(normalizedEmail)) {
        recipientMap.set(normalizedEmail, {
          email: normalizedEmail,
          name: t.holder_name || null,
        });
      }
    }

    const uniqueRecipients = Array.from(recipientMap.values());
    if (uniqueRecipients.length === 0) {
      return;
    }

    // 2. Fetch active broadcast campaigns for this event
    // Active campaigns are defined by:
    // - event_id matches eventId
    // - auto_send_to_late_buyers = true
    // - starts_at is not null
    // - starts_at <= now()
    const now = new Date().toISOString();
    const { data: campaigns, error: campaignsError } = await supabaseAdmin
      .from('event_broadcast_campaigns')
      .select('campaign_key, subject, message, images')
      .eq('event_id', eventId)
      .eq('auto_send_to_late_buyers', true)
      .not('starts_at', 'is', null)
      .lte('starts_at', now);

    if (campaignsError) {
      console.error(`[campaigns-auto] Failed to fetch active campaigns for event ${eventId}:`, campaignsError);
      return;
    }

    if (!campaigns || campaigns.length === 0) {
      return;
    }

    const emailsToLookup = Array.from(recipientMap.keys());

    // 3. For each active campaign, filter and send to recipients who have not received it yet
    for (const campaign of campaigns) {
      try {
        // Query logs for already sent emails for this campaign
        const { data: logs, error: logsError } = await supabaseAdmin
          .from('event_broadcast_email_log')
          .select('recipient_email')
          .eq('event_id', eventId)
          .eq('campaign_key', campaign.campaign_key)
          .in('recipient_email', emailsToLookup);

        if (logsError) {
          console.error(`[campaigns-auto] Failed to fetch email logs for campaign ${campaign.campaign_key}:`, logsError);
          continue;
        }

        const sentEmails = new Set<string>();
        if (logs) {
          for (const log of logs) {
            if (log.recipient_email) {
              sentEmails.add(log.recipient_email.trim().toLowerCase());
            }
          }
        }

        // Filter out recipients already logged
        const unsentRecipients = uniqueRecipients.filter(r => !sentEmails.has(r.email));

        if (unsentRecipients.length === 0) {
          continue;
        }

        // Send campaign email to unsent recipients
        const { sentCount, error: sendError } = await sendEventBroadcastEmail({
          subject: campaign.subject,
          message: campaign.message,
          images: (campaign as any).images || [],
          recipients: unsentRecipients,
        });

        if (sendError) {
          console.error(`[campaigns-auto] Failed to send campaign ${campaign.campaign_key} to late buyers:`, sendError);
        }

        // Log successful sends
        if (sentCount > 0) {
          const logInserts = unsentRecipients.slice(0, sentCount).map(r => ({
            event_id: eventId,
            campaign_key: campaign.campaign_key,
            recipient_email: r.email,
            sent_at: new Date().toISOString(),
          }));

          const { error: logError } = await supabaseAdmin
            .from('event_broadcast_email_log')
            .insert(logInserts);

          if (logError) {
            console.error(`[campaigns-auto] Failed to log email events for campaign ${campaign.campaign_key}:`, logError);
          }
        }
      } catch (campaignErr: any) {
        console.error(`[campaigns-auto] Error processing campaign ${campaign.campaign_key} for event ${eventId}:`, campaignErr.message);
      }
    }
  } catch (err: any) {
    console.error(`[campaigns-auto] Unexpected error in sendActiveBroadcastCampaignsForTickets for event ${eventId}:`, err.message);
  }
}
