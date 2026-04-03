import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { events } from '@/data/events';
import { artists } from '@/data/artists';
import { mixes } from '@/data/mixes';

export async function GET() {
  const dir = path.join(process.cwd(), 'src/data');
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events, null, 2));
  fs.writeFileSync(path.join(dir, 'artists.json'), JSON.stringify(artists, null, 2));
  fs.writeFileSync(path.join(dir, 'mixes.json'), JSON.stringify(mixes, null, 2));
  return NextResponse.json({ success: true });
}
