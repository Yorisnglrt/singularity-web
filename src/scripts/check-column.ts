import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function getEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  const env: any = {};
  content.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '');
  });
  return env;
}

const env = getEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkColumn() {
  console.log('Checking ticket_price_ore column...');
  // Try to select the column specifically
  const { data, error } = await supabase.from('events').select('id, ticket_price_ore').limit(1);
  
  if (error) {
    console.error('Error fetching column:', error);
    
    // Check table info if possible
    console.log('Attempting to fetch all columns from one row...');
    const { data: allData, error: allErr } = await supabase.from('events').select('*').limit(1);
    if (allErr) {
      console.error('Full fetch error:', allErr);
    } else {
      console.log('Available columns in events:', Object.keys(allData[0] || {}));
    }
  } else {
    console.log('Success! Column exists. Data:', data);
  }
}

checkColumn();
