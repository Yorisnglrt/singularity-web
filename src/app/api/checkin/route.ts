import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use Service Role Key for server-side elevated access
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: Request) {
  try {
    const { qrToken, eventId } = await request.json();

    if (!qrToken || !eventId) {
      return NextResponse.json({ error: 'Missing qrToken or eventId' }, { status: 400 });
    }

    // Call the atomic PostgreSQL function
    // Result format: { success: true, profile_id: "...", display_name: "...", awarded: 50 }
    const { data, error } = await supabaseAdmin.rpc('handle_qr_checkin', {
      p_qr_token: qrToken,
      p_event_id: eventId
    });

    if (error) {
      console.error('RPC Error:', error.message);

      // Map custom SQL exceptions to HTTP statuses
      if (error.message.includes('invalid_qr_token')) {
        return NextResponse.json({ error: 'Invalid or expired QR token' }, { status: 404 });
      }
      if (error.message.includes('invalid_event_id')) {
        return NextResponse.json({ error: 'Invalid event ID' }, { status: 404 });
      }
      if (error.message.includes('already_checked_in')) {
        return NextResponse.json({ 
          success: false, 
          status: 'already_checked_in',
          message: 'User already checked in for this event'
        }, { status: 409 });
      }

      // 2. Map Postgres data type errors (e.g. malformed UUID) to 400
      if (error.code === '22P02') {
        return NextResponse.json({ error: 'Invalid event ID format' }, { status: 400 });
      }
      
      throw error;
    }

    return NextResponse.json({ 
      success: true, 
      profile: {
        id: data.profile_id,
        displayName: data.display_name
      },
      awarded: data.awarded
    });

  } catch (error: any) {
    console.error('Check-in exception:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
