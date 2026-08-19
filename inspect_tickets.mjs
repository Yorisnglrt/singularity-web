import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const getEnvVal = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return null;
  let val = match[1].trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.substring(1, val.length - 1);
  }
  return val;
};

const supabaseUrl = getEnvVal('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnvVal('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars', { supabaseUrl, supabaseKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: ticketTypes, error } = await supabase
    .from('event_ticket_types')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching ticket types:', error);
    process.exit(1);
  }

  console.log('Ticket Types:');
  for (const tt of ticketTypes) {
    console.log({
      id: tt.id,
      event_id: tt.event_id,
      name: tt.name,
      sale_starts_at: tt.sale_starts_at,
      sale_ends_at: tt.sale_ends_at,
      is_active: tt.is_active
    });
  }
}

main();
