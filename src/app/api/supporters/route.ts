import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use service role to bypass RLS for aggregation of names
const supabase = createClient(supabaseUrl, serviceRoleKey);

export async function GET() {
  try {
    // 1. Fetch new supporters from ticket_order_items
    // We join with ticket_orders to get the customer name and check if the order is paid
    const { data: newSupporters, error: newError } = await supabase
      .from('ticket_order_items')
      .select(`
        is_supporter,
        ticket_orders!inner (
          payment_status,
          customer_name
        )
      `)
      .eq('is_supporter', true)
      .eq('ticket_orders.payment_status', 'paid')
      .not('ticket_orders.customer_name', 'is', null);

    if (newError) {
      console.error('Error fetching new supporters:', newError);
      throw newError;
    }

    // 2. Fetch legacy supporters
    const { data: legacySupporters, error: legacyError } = await supabase
      .from('supporters')
      .select('name');

    if (legacyError) {
      console.error('Error fetching legacy supporters:', legacyError);
      throw legacyError;
    }

    // 3. Combine and deduplicate
    const nameMap = new Map<string, string>(); // Normalized name -> Original name

    const normalize = (name: string) => name.toLowerCase().trim().replace(/\s+/g, ' ');

    legacySupporters?.forEach(s => {
      if (s.name && s.name.trim()) {
        nameMap.set(normalize(s.name), s.name.trim());
      }
    });

    newSupporters?.forEach((item: any) => {
      const name = item.ticket_orders?.customer_name;
      if (name && name.trim()) {
        nameMap.set(normalize(name), name.trim());
      }
    });

    // 4. Sort alphabetically
    const sortedNames = Array.from(nameMap.values()).sort((a, b) => a.localeCompare(b));

    // Return as objects for frontend compatibility, but without amount
    return NextResponse.json(sortedNames.map((name, index) => ({ 
      id: `supporter-${index}`, 
      name 
    })));
  } catch (err: any) {
    console.error('Public supporters API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
