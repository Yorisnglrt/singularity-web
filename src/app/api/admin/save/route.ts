import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, data, password } = body;

    if (password !== 'Dj.fabrikken$0583!') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['artists', 'events', 'mixes', 'supporters'].includes(type) || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const dir = path.join(process.cwd(), 'src/data');
    const filePath = path.join(dir, `${type}.json`);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('API Save Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
