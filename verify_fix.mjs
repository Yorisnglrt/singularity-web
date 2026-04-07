import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyFix() {
  console.log('--- Testing Admin Save Flow Simulation ---');
  
  // 1. Simulate the path we established
  const testImageUrl = `${supabaseUrl}/storage/v1/object/public/artists-avatar/nostre/profile.jpg`;
  
  // 2. Perform the update to the 'image' column (new source of truth)
  const { error } = await supabase
    .from('artists')
    .update({ image: testImageUrl })
    .eq('slug', 'nostre');
    
  if (error) {
    console.error('Update Error:', error);
    return;
  }

  // 3. Verify what the API (and normalization) will see
  const { data: record } = await supabase
    .from('artists')
    .select('*')
    .eq('slug', 'nostre')
    .single();

  console.log('Record for Nostre in DB:');
  console.log(' - image (NEW):', record.image);
  console.log(' - photoUrl (OLD):', record.photoUrl);
  
  if (record.image === testImageUrl) {
    console.log('✅ SUCCESS: Data correctly persisted to "image" column.');
  } else {
    console.log('❌ FAILURE: Data did not persist to "image" column.');
  }
}

verifyFix();
