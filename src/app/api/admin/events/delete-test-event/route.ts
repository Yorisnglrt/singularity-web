import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * GET /api/admin/events/delete-test-event?eventId=...
 * Returns stats/counts for what will be deleted if the test event is removed.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing auth header' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const token = authHeader.replace('Bearer ', '');
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: stats, error } = await userSupabase.rpc('get_test_event_stats', {
      p_event_id: eventId,
    });

    if (error) {
      console.error('[delete-test-event GET stats error]', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(stats);
  } catch (err: any) {
    console.error('[delete-test-event GET error]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/events/delete-test-event
 * Body: { eventId: string }
 * Executes atomic deletion of test event and its associated test data.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing auth header' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { eventId } = body;

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const token = authHeader.replace('Bearer ', '');
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: result, error } = await userSupabase.rpc('delete_test_event', {
      p_event_id: eventId,
    });

    if (error) {
      console.error('[delete-test-event POST deletion error]', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[delete-test-event POST error]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
