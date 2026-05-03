import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const ALLOWED_TYPES = ['artists', 'events', 'mixes', 'supporters', 'event_ticket_types', 'tickets'] as const;
type AllowedType = typeof ALLOWED_TYPES[number];

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'No auth header' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as AllowedType | null;

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    let query = supabase.from(type).select('*');

    if (type === 'artists') {
      query = query.order('name', { ascending: true });
    } else if (type === 'events') {
      query = query.order('date', { ascending: false });
    } else if (type === 'mixes') {
      query = query.order('date', { ascending: false });
    } else if (type === 'event_ticket_types') {
      // Order by event grouping, then sort_order, then name
      query = (query as any)
        .order('event_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase read error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error('API Read Error:', err);
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
  }
}
