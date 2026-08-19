import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeTest = searchParams.get('includeTest') === 'true';

    let isAdmin = false;

    // Only attempt admin verification if includeTest=true is explicitly requested
    if (includeTest && supabaseAdmin) {
      const authHeader = req.headers.get('Authorization');
      let token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : undefined;

      if (!token) {
        // Fallback to cookie
        const cookieHeader = req.headers.get('cookie') || '';
        const match = cookieHeader.match(/sb-access-token=([^;]+)/);
        token = match ? match[1] : undefined;
      }

      if (token) {
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (!userError && user) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single();
          isAdmin = !!profile?.is_admin;
        }
      }
    }

    let query = supabase
      .from('events')
      .select('*')
      .order('date', { ascending: false });

    // If caller is NOT a verified admin or includeTest is not requested, strictly filter out test events
    if (!isAdmin || !includeTest) {
      query = query.eq('is_test_event', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Public events read error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err: any) {
    console.error('Public events API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
