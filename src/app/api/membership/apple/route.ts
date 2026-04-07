import { NextResponse } from 'next/server';
import { PKPass } from 'passkit-generator';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import forge from 'node-forge';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Extracts PEM-formatted certificate and private key from a PKCS#12 (.p12) file buffer.
 */
function extractFromP12(p12Buffer: Buffer, passphrase?: string) {
  const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);

  let signerCert = '';
  let signerKey = '';

  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.type === forge.pki.oids.certBag) {
        signerCert += forge.pki.certificateToPem(safeBag.cert as forge.pki.Certificate);
      } else if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) {
        signerKey += forge.pki.privateKeyToPem(safeBag.key as forge.pki.PrivateKey);
      }
    }
  }

  if (!signerCert || !signerKey) {
    throw new Error('Could not find both a certificate and a private key in the P12 source.');
  }

  return { signerCert, signerKey };
}

/**
 * Gets the P12 certificate buffer from either Base64 ENV or local fallback.
 * Returns { buffer, source } for diagnostic purposes.
 */
function getP12Buffer(): { buffer: Buffer; source: string } {
  const p12Base64 = process.env.APPLE_WALLET_P12_BASE64;
  const p12Path = process.env.APPLE_WALLET_P12_PATH || path.join(process.cwd(), 'certs', 'singularity-wallet-pass-cert.p12');

  // 1. Try Base64 (Production priority)
  if (p12Base64) {
    try {
      const buffer = Buffer.from(p12Base64, 'base64');
      return { buffer, source: 'APPLE_WALLET_P12_BASE64' };
    } catch {
      throw new Error('Invalid APPLE_WALLET_P12_BASE64 value — could not decode Base64');
    }
  }

  // 2. Try Local File (Development fallback)
  if (fs.existsSync(p12Path)) {
    const buffer = fs.readFileSync(p12Path);
    return { buffer, source: `file:${p12Path}` };
  }

  throw new Error(`P12 not found. No APPLE_WALLET_P12_BASE64 env and file missing at: ${p12Path}`);
}

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('[apple-wallet] Auth verification failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // 3. Resolve configuration
    const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID;
    const teamId = process.env.APPLE_WALLET_TEAM_ID;
    const p12Passphrase = process.env.APPLE_WALLET_P12_PASSPHRASE?.trim();
    const iconPath = process.env.APPLE_WALLET_ICON_PATH || path.join(process.cwd(), 'public', 'wallet', 'icon.png');
    const logoPath = process.env.APPLE_WALLET_LOGO_PATH || path.join(process.cwd(), 'public', 'wallet', 'logo.png');
    const wwdrPath = process.env.APPLE_WALLET_WWDR_PATH || path.join(process.cwd(), 'certs', 'AppleWWDRCAG4.pem');

    // --- DIAGNOSTIC: env presence ---
    console.log('[apple-wallet] ENV check:', JSON.stringify({
      PASS_TYPE_ID: !!passTypeId,
      TEAM_ID: !!teamId,
      P12_PASSPHRASE_exists: !!p12Passphrase,
      P12_PASSPHRASE_length: p12Passphrase?.length ?? 0,
      P12_PASSPHRASE_first3: p12Passphrase?.substring(0, 3) ?? 'N/A',
      P12_PASSPHRASE_last3: p12Passphrase?.slice(-3) ?? 'N/A',
      P12_BASE64_exists: !!process.env.APPLE_WALLET_P12_BASE64,
      P12_BASE64_length: process.env.APPLE_WALLET_P12_BASE64?.length ?? 0,
      P12_PATH_env: process.env.APPLE_WALLET_P12_PATH ?? '(not set)',
    }));

    if (!passTypeId || !teamId || !p12Passphrase) {
      const missing = [
        !passTypeId && 'APPLE_WALLET_PASS_TYPE_ID',
        !teamId && 'APPLE_WALLET_TEAM_ID',
        !p12Passphrase && 'APPLE_WALLET_P12_PASSPHRASE',
      ].filter(Boolean);
      console.error('[apple-wallet] Missing mandatory env:', missing.join(', '));
      return NextResponse.json({ error: `Missing mandatory env: ${missing.join(', ')}` }, { status: 500 });
    }

    // 4. Load P12 Certificate
    let p12Buffer: Buffer;
    let p12Source: string;
    try {
      const result = getP12Buffer();
      p12Buffer = result.buffer;
      p12Source = result.source;
      console.log('[apple-wallet] P12 loaded:', JSON.stringify({
        source: p12Source,
        bufferSize: p12Buffer.length,
      }));
    } catch (err: any) {
      console.error('[apple-wallet] P12 load failed:', err.message);
      return NextResponse.json({ error: 'P12 load failed', details: err.message }, { status: 500 });
    }

    // 5. Extract signer cert and key from P12
    let signerCert: string;
    let signerKey: string;
    try {
      const extracted = extractFromP12(p12Buffer, p12Passphrase);
      signerCert = extracted.signerCert;
      signerKey = extracted.signerKey;
      console.log('[apple-wallet] P12 extraction OK:', JSON.stringify({
        certLength: signerCert.length,
        keyLength: signerKey.length,
      }));
    } catch (err: any) {
      console.error('[apple-wallet] P12 extraction failed:', err.message);
      return NextResponse.json({
        error: 'P12 extraction failed',
        details: err.message,
        hint: 'Likely cause: passphrase mismatch or corrupted P12 data',
        p12Source,
        p12BufferSize: p12Buffer.length,
        passphraseLength: p12Passphrase.length,
      }, { status: 500 });
    }

    // 6. Verify asset files exist
    const fileChecks = {
      wwdr: { path: wwdrPath, exists: fs.existsSync(wwdrPath) },
      icon: { path: iconPath, exists: fs.existsSync(iconPath) },
      logo: { path: logoPath, exists: fs.existsSync(logoPath) },
    };
    console.log('[apple-wallet] File checks:', JSON.stringify(fileChecks));

    const missingFiles = Object.entries(fileChecks).filter(([, v]) => !v.exists).map(([k]) => k);
    if (missingFiles.length > 0) {
      console.error('[apple-wallet] Missing asset files:', missingFiles.join(', '));
      return NextResponse.json({
        error: 'Missing asset files on server',
        missing: missingFiles,
        paths: fileChecks,
      }, { status: 500 });
    }

    // 7. Generate Pass
    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      organizationName: 'Singularity Oslo',
      description: 'Singularity Collective Membership',
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(0, 0, 0)',
      labelColor: 'rgb(153, 153, 153)',
      sharingProhibited: true,
      generic: {
        headerFields: [{ key: 'tier', label: 'TIER', value: profile.tier || 'Observer' }],
        primaryFields: [{ key: 'name', label: 'MEMBER', value: profile.display_name }],
        secondaryFields: [{ key: 'points', label: 'RAVE POINTS', value: `${profile.points || 0} RP` }],
        auxiliaryFields: [
          { key: 'memberCode', label: 'MEMBER CODE', value: profile.member_code || '—' },
          {
            key: 'memberSince',
            label: 'MEMBER SINCE',
            value: profile.member_since
              ? new Date(profile.member_since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase()
              : '—'
          }
        ],
        backFields: [{ key: 'info', label: 'ABOUT', value: 'This pass grants access to Singularity Collective rewards and events.' }]
      },
      barcodes: [{
        message: profile.qr_token || profile.id,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1'
      }]
    };

    const buffers = {
      'pass.json': Buffer.from(JSON.stringify(passJson)),
      'icon.png': fs.readFileSync(iconPath),
      'icon@2x.png': fs.readFileSync(iconPath),
      'logo.png': fs.readFileSync(logoPath),
      'logo@2x.png': fs.readFileSync(logoPath)
    };

    let pass: PKPass;
    try {
      pass = new PKPass(buffers, {
        wwdr: fs.readFileSync(wwdrPath),
        signerCert,
        signerKey,
        signerKeyPassphrase: p12Passphrase
      }, {
        serialNumber: profile.member_code || profile.id
      });
      console.log('[apple-wallet] PKPass created OK');
    } catch (err: any) {
      console.error('[apple-wallet] PKPass creation failed:', err.message);
      return NextResponse.json({ error: 'PKPass creation failed', details: err.message }, { status: 500 });
    }

    return new Response(new Uint8Array(pass.getAsBuffer()), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': 'attachment; filename="singularity_membership.pkpass"',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error('[apple-wallet] Unhandled error:', error.message, error.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
