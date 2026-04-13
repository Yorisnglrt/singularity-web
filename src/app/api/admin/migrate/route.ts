import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    // If not local host, check token
    // For now we assume the user calls this from admin panel once
    
    const tables = ['artists', 'events', 'mixes', 'supporters'];
    const summary: any = {};

    for (const table of tables) {
      const filePath = path.join(process.cwd(), 'src', 'data', `${table}.json`);
      if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(rawData);
        
        const { mapPayloadToDb } = await import('@/lib/mapping');
        const mappedData = mapPayloadToDb(table, data);
        
        const { error } = await supabase.from(table).upsert(mappedData);
        if (error) {
          summary[table] = { status: 'error', message: error.message };
        } else {
          summary[table] = { status: 'success', count: data.length };
        }
      } else {
        summary[table] = { status: 'file-not-found' };
      }
    }

    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error('Migration error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
