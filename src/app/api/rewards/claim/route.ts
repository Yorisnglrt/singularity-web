import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: Request) {
  try {
    // 1. Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // 2. Initialize user Supabase client to preserve auth.uid() context
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // 3. Authenticate user session
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 4. Call claim_reward RPC forcing 'free_ticket' and 500 points
    const { data: claimId, error: rpcError } = await userSupabase.rpc('claim_reward', {
      p_reward_type: 'free_ticket',
      p_points_cost: 500,
    });

    if (rpcError) {
      console.error('[api/rewards/claim] claim_reward failed:', rpcError);
      return NextResponse.json({ 
        error: rpcError.message || 'Failed to claim reward' 
      }, { status: 400 });
    }

    return NextResponse.json({ ok: true, claimId });

  } catch (err: any) {
    console.error('[api/rewards/claim] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
