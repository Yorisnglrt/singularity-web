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
 */
function getP12Buffer() {
  const p12Base64 = process.env.APPLE_WALLET_P12_BASE64;
  const p12Path = process.env.APPLE_WALLET_P12_PATH || path.join(process.cwd(), 'certs', 'singularity-wallet-pass-cert.p12');

  // 1. Try Base64 (Production priority)
  if (p12Base64) {
    try {
      return Buffer.from(p12Base64, 'base64');
    } catch {
      throw new Error('Invalid APPLE_WALLET_P12_BASE64 value');
    }
  }

  // 2. Try Local File (Development fallback)
  if (fs.existsSync(p12Path)) {
    return fs.readFileSync(p12Path);
  }

  throw new Error('Apple Wallet certificate not found. Provide APPLE_WALLET_P12_BASE64 or a valid local .p12 file.');
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
      console.error('Auth verification failed');
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
    const iconPath = process.env.APPLE_WALLET_ICON_PATH || path.join(process.cwd(), 'public', 'wallet', 'icon.png');
    const logoPath = process.env.APPLE_WALLET_LOGO_PATH || path.join(process.cwd(), 'public', 'wallet', 'logo.png');
    const wwdrPath = process.env.APPLE_WALLET_WWDR_PATH || path.join(process.cwd(), 'certs', 'AppleWWDRCAG4.pem');

    const p12Passphrase = process.env.APPLE_WALLET_P12_PASSPHRASE;

    if (!passTypeId || !teamId || !p12Passphrase) {
      return NextResponse.json({ error: 'Server configuration error: Missing mandatory Apple Wallet ENV variables' }, { status: 500 });
    }

    // 4. Load & Extract Certificate (Hybrid Approach)
    let signerCert, signerKey;
    try {
      const p12Buffer = getP12Buffer();
      const extracted = extractFromP12(p12Buffer, p12Passphrase);
      signerCert = extracted.signerCert;
      signerKey = extracted.signerKey;
    } catch (err: any) {
      console.error('Certificate error:', err.message);
      return NextResponse.json({ error: 'Failed to process Apple Wallet certificate' }, { status: 500 });
    }

    // 5. Generate Pass
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

    // For icons and logos, we still need file paths, ensure they exist or use fallbacks
    // If these are missing on production, we should handle it (best to have them in `public/wallet/`)
    const buffers = {
      'pass.json': Buffer.from(JSON.stringify(passJson)),
      'icon.png': fs.readFileSync(iconPath),
      'icon@2x.png': fs.readFileSync(iconPath),
      'logo.png': fs.readFileSync(logoPath),
      'logo@2x.png': fs.readFileSync(logoPath)
    };

    const pass = new PKPass(buffers, {
      wwdr: fs.readFileSync(wwdrPath),
      signerCert,
      signerKey,
      signerKeyPassphrase: p12Passphrase
    }, {
      serialNumber: profile.member_code || profile.id
    });

    return new Response(new Uint8Array(pass.getAsBuffer()), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': 'attachment; filename="singularity_membership.pkpass"',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error('Fatal pass generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
