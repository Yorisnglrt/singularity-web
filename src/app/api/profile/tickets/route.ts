import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: Request) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Get auth token from header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];

  // 2. Resolve user session
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = user.id;
  const userEmail = user.email;

  if (!userEmail) {
    return NextResponse.json({ error: 'User email not found' }, { status: 400 });
  }

  // 3. Call the secure RPC to fetch tickets
  // This RPC enforces ownership checks: profile_id, customer_email, or holder_email
  const { data, error: rpcError } = await supabase.rpc('get_my_tickets', {
    p_user_id: userId,
    p_user_email: userEmail
  });

  if (rpcError) {
    console.error('[api/profile/tickets] RPC Error:', rpcError);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
