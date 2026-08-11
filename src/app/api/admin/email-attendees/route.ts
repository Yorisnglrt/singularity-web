import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEventBroadcastEmail } from '@/lib/email/sendEventBroadcastEmail';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(req: Request) {
  try {
    // 1. Admin Authentication Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No auth header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin via profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Request Body and Validation
    const body = await req.json();
    const { eventId, subject, message, campaignKey, sendMode, autoSendToLateBuyers, startsAt, images, testMode, testEmail } = body;

    if (testMode) {
      if (!eventId || !subject || !message) {
        return NextResponse.json({ error: 'eventId, subject, and message are required' }, { status: 400 });
      }
      if (
        typeof eventId !== 'string' ||
        typeof subject !== 'string' ||
        typeof message !== 'string'
      ) {
        return NextResponse.json({ error: 'Required fields must be strings' }, { status: 400 });
      }
      if (!eventId.trim() || !subject.trim() || !message.trim()) {
        return NextResponse.json({ error: 'Required fields cannot be empty' }, { status: 400 });
      }
      if (images !== undefined) {
        if (!Array.isArray(images) || !images.every(img => typeof img === 'string')) {
          return NextResponse.json({ error: 'images must be an array of strings' }, { status: 400 });
        }
        if (images.length > 5) {
          return NextResponse.json({ error: 'A maximum of 5 images is allowed' }, { status: 400 });
        }
      }
      if (!testEmail || typeof testEmail !== 'string' || !testEmail.trim() || !testEmail.includes('@')) {
        return NextResponse.json({ error: 'Valid testEmail is required' }, { status: 400 });
      }

      // Send test email via shared helper
      const { sentCount, error: sendError } = await sendEventBroadcastEmail({
        subject: `[TEST] ${subject.trim()}`,
        message: message.trim(),
        images: images || [],
        recipients: [{ email: testEmail.trim().toLowerCase(), name: 'Test Recipient' }]
      });

      if (sendError) {
        console.error('[email-attendees] Resend send test error:', sendError);
        return NextResponse.json({ error: sendError.message || 'Error sending test email via Resend' }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        sentCount: 1,
        skippedAlreadySentCount: 0,
        totalEligibleCount: 1
      });
    }

    if (!eventId || !subject || !message || !campaignKey || !sendMode) {
      return NextResponse.json({ error: 'eventId, subject, message, campaignKey, and sendMode are required' }, { status: 400 });
    }

    if (
      typeof eventId !== 'string' ||
      typeof subject !== 'string' ||
      typeof message !== 'string' ||
      typeof campaignKey !== 'string' ||
      typeof sendMode !== 'string'
    ) {
      return NextResponse.json({ error: 'Required fields must be strings' }, { status: 400 });
    }

    if (images !== undefined) {
      if (!Array.isArray(images) || !images.every(img => typeof img === 'string')) {
        return NextResponse.json({ error: 'images must be an array of strings' }, { status: 400 });
      }
      if (images.length > 5) {
        return NextResponse.json({ error: 'A maximum of 5 images is allowed' }, { status: 400 });
      }
    }

    const normalizedCampaignKey = campaignKey.trim().toLowerCase();
    if (!eventId.trim() || !subject.trim() || !message.trim() || !normalizedCampaignKey) {
      return NextResponse.json({ error: 'Required fields cannot be empty' }, { status: 400 });
    }

    if (sendMode !== 'all' && sendMode !== 'unsent_only') {
      return NextResponse.json({ error: 'sendMode must be either "all" or "unsent_only"' }, { status: 400 });
    }

    // Parse startsAt date and handle defaults
    let startsAtDateStr: string | null = null;
    if (autoSendToLateBuyers) {
      if (startsAt) {
        const parsedTime = new Date(startsAt).getTime();
        if (isNaN(parsedTime)) {
          return NextResponse.json({ error: 'Invalid startsAt date string' }, { status: 400 });
        }
        startsAtDateStr = new Date(startsAt).toISOString();
      } else {
        startsAtDateStr = new Date().toISOString();
      }
    } else {
      if (startsAt) {
        const parsedTime = new Date(startsAt).getTime();
        if (isNaN(parsedTime)) {
          return NextResponse.json({ error: 'Invalid startsAt date string' }, { status: 400 });
        }
        startsAtDateStr = new Date(startsAt).toISOString();
      }
    }

    // 3. Upsert campaign details into event_broadcast_campaigns
    const { error: campaignError } = await supabaseAdmin
      .from('event_broadcast_campaigns')
      .upsert({
        event_id: eventId,
        campaign_key: normalizedCampaignKey,
        subject: subject.trim(),
        message: message.trim(),
        images: images || [],
        auto_send_to_late_buyers: !!autoSendToLateBuyers,
        starts_at: startsAtDateStr,
        created_by: user.id,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'event_id,campaign_key'
      });

    if (campaignError) {
      console.error('[email-attendees] Database error upserting campaign:', campaignError);
      return NextResponse.json({ error: 'Database error upserting campaign details' }, { status: 500 });
    }

    // 4. Query eligible ticket holders for this event
    const { data: tickets, error: ticketsError } = await supabaseAdmin
      .from('tickets')
      .select('holder_email, holder_name')
      .eq('event_id', eventId)
      .in('status', ['valid', 'used'])
      .not('holder_email', 'is', null);

    if (ticketsError) {
      console.error('[email-attendees] Database error fetching tickets:', ticketsError);
      return NextResponse.json({ error: 'Database error fetching tickets' }, { status: 500 });
    }

    // Deduplicate recipients (case-insensitive & trimmed emails)
    const uniqueRecipientsMap = new Map<string, { email: string; name: string | null }>();
    for (const t of tickets || []) {
      if (!t.holder_email) continue;
      const emailKey = t.holder_email.trim().toLowerCase();
      if (!uniqueRecipientsMap.has(emailKey)) {
        uniqueRecipientsMap.set(emailKey, {
          email: emailKey, // store normalized
          name: t.holder_name || null
        });
      }
    }

    const uniqueRecipients = Array.from(uniqueRecipientsMap.values());
    const totalEligibleCount = uniqueRecipients.length;

    if (totalEligibleCount === 0) {
      return NextResponse.json({
        ok: true,
        sentCount: 0,
        skippedAlreadySentCount: 0,
        totalEligibleCount: 0
      });
    }

    const emailsToLookup = Array.from(uniqueRecipientsMap.keys());

    // 5. Query already sent logs for this campaign to skip if needed
    const { data: existingLogs, error: logsError } = await supabaseAdmin
      .from('event_broadcast_email_log')
      .select('recipient_email')
      .eq('event_id', eventId)
      .eq('campaign_key', normalizedCampaignKey)
      .in('recipient_email', emailsToLookup);

    if (logsError) {
      console.error('[email-attendees] Database error fetching campaign email logs:', logsError);
      return NextResponse.json({ error: 'Database error checking sent log history' }, { status: 500 });
    }

    const sentEmailsSet = new Set<string>();
    for (const log of existingLogs || []) {
      if (log.recipient_email) {
        sentEmailsSet.add(log.recipient_email.trim().toLowerCase());
      }
    }

    // Determine target recipients depending on sendMode
    let unsentRecipients = uniqueRecipients;
    if (sendMode === 'unsent_only') {
      unsentRecipients = uniqueRecipients.filter(r => !sentEmailsSet.has(r.email));
    }

    const skippedAlreadySentCount = totalEligibleCount - unsentRecipients.length;

    if (unsentRecipients.length === 0) {
      return NextResponse.json({
        ok: true,
        sentCount: 0,
        skippedAlreadySentCount,
        totalEligibleCount
      });
    }

    // 6. Send broadcast email via shared helper
    const { sentCount, error: sendError } = await sendEventBroadcastEmail({
      subject,
      message,
      images: images || [],
      recipients: unsentRecipients
    });

    if (sendError) {
      console.error('[email-attendees] Resend send error:', sendError);
      return NextResponse.json({ error: sendError.message || 'Error sending email batch via Resend' }, { status: 500 });
    }

    // 7. Log successful sends into event_broadcast_email_log
    if (sentCount > 0) {
      const logInserts = unsentRecipients.slice(0, sentCount).map(r => ({
        event_id: eventId,
        campaign_key: normalizedCampaignKey,
        recipient_email: r.email,
        sent_at: new Date().toISOString(),
        sent_by: user.id
      }));

      // Insert and capture errors but do not crash the API response since the emails were sent
      const { error: logError } = await supabaseAdmin
        .from('event_broadcast_email_log')
        .insert(logInserts);

      if (logError) {
        console.error('[email-attendees] Failed to log email sending events:', logError);
      }
    }

    return NextResponse.json({
      ok: true,
      sentCount,
      skippedAlreadySentCount,
      totalEligibleCount
    });

  } catch (err: any) {
    console.error('[email-attendees] Unexpected error in route:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
