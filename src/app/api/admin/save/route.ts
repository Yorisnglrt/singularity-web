import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'No auth header' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { type, data } = body;

    console.log(`[API Save] Saving ${type}, count: ${Array.isArray(data) ? data.length : 0}`);

    if (type === 'artists' && Array.isArray(data)) {
      console.log(
        `[API Save] Artist names: ${data
          .map((a: { name?: string }) => a.name ?? 'Unnamed')
          .join(', ')}`
      );
    }

    if (!['artists', 'events', 'mixes', 'supporters', 'event_ticket_types'].includes(type) || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { mapPayloadToDb } = await import('@/lib/mapping');
    const mappedData = mapPayloadToDb(type, data);

    const { error } = await supabase.from(type).upsert(mappedData);

    if (error) {
      console.error('Supabase save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('API Save Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
