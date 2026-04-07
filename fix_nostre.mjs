import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually parse .env.local because dotenv is not in package.json
const envPath = path.resolve(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').map(line => line.trim()).forEach(line => {
  if (!line || line.startsWith('#')) return;
  const [key, ...val] = line.split('=');
  if (key && val.length > 0) {
    env[key.trim()] = val.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars in .env.local');
  console.log('Available keys:', Object.keys(env));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixNostre() {
  const { data: before } = await supabase.from('artists').select('*').eq('slug', 'nostre').single();
  console.log('Value Before:', JSON.stringify(before?.photoUrl));

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/artists-avatar/nostre/profile.jpg`;
  
  const { error } = await supabase.from('artists').update({ photoUrl: publicUrl }).eq('slug', 'nostre');
  
  if (error) {
    console.error('Update error:', error);
  } else {
    const { data: after } = await supabase.from('artists').select('*').eq('slug', 'nostre').single();
    console.log('Value After:', JSON.stringify(after?.photoUrl));
    console.log('Full API Record:', JSON.stringify(after, null, 2));
  }
}

fixNostre();
