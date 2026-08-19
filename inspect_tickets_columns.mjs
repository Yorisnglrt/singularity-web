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

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: tickets, error } = await supabase
    .from('tickets')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching tickets:', error);
    process.exit(1);
  }

  console.log('Ticket keys (columns):');
  if (tickets && tickets.length > 0) {
    console.log(JSON.stringify(Object.keys(tickets[0])));
    console.log('Sample ticket:', JSON.stringify(tickets[0]));
  } else {
    console.log('No tickets found in table.');
  }
}

main();
