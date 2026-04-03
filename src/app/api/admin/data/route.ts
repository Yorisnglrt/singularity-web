import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    
    if (!['artists', 'events', 'mixes', 'supporters'].includes(type || '')) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'src/data', `${type}.json`);
    const data = fs.readFileSync(filePath, 'utf8');
    
    return NextResponse.json(JSON.parse(data));
  } catch (err) {
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
  }
}
