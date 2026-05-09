import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
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

  // 3. Call the existing Postgres function
  // public.claim_starting_points_for_user(target_user_id uuid)
  const { data, error: rpcError } = await supabase.rpc('claim_starting_points_for_user', {
    target_user_id: user.id
  });

  if (rpcError) {
    console.error('[api/membership/claim-starting-points] RPC Error:', rpcError);
    return NextResponse.json({ error: 'Failed to claim points' }, { status: 500 });
  }

  // Expected responses:
  // - CLAIMED: points were awarded
  // - ALREADY_CLAIMED: do nothing
  // - NO_SEED_POINTS_FOUND: do nothing
  // - USER_EMAIL_NOT_FOUND: log server-side

  const status = typeof data === 'string' ? data : data?.status;
  
  if (status === 'USER_EMAIL_NOT_FOUND') {
    console.warn(`[api/membership/claim-starting-points] USER_EMAIL_NOT_FOUND for user: ${user.id} (${user.email})`);
  }

  return NextResponse.json(data);
}
