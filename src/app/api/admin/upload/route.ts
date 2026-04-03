import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const password = formData.get('password') as string;
    const file = formData.get('file') as File | null;

    if (password !== 'Dj.fabrikken$0583!') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp3', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|jpg|jpeg|png|webp)$/i)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const isImage = file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|webp)$/i);
    const subDir = isImage ? 'images/artists' : 'audio';
    const uploadDir = path.join(process.cwd(), 'public', subDir);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\s]/g, '').trim();
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ 
      success: true, 
      path: `/${subDir}/${safeName}`,
      filename: safeName
    });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
