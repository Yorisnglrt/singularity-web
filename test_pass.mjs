import { PKPass } from 'passkit-generator';
import fs from 'fs';
import path from 'path';
import forge from 'node-forge';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const getEnvVal = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return null;
  let val = match[1].trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.substring(1, val.length - 1);
  }
  return val;
};

const p12Path = getEnvVal('APPLE_WALLET_P12_PATH');
const p12Passphrase = getEnvVal('APPLE_WALLET_P12_PASSPHRASE');
const wwdrPath = getEnvVal('APPLE_WALLET_WWDR_PATH');
const iconPath = getEnvVal('APPLE_WALLET_ICON_PATH');
const logoPath = getEnvVal('APPLE_WALLET_LOGO_PATH');

console.log("Loading files from paths in .env.local...", {
  p12Path,
  wwdrPath,
  iconPath,
  logoPath
});

const p12Buffer = fs.readFileSync(p12Path);
const wwdrBuffer = fs.readFileSync(wwdrPath);
const iconBuffer = fs.readFileSync(iconPath);
const logoBuffer = fs.readFileSync(logoPath);

console.log("Extracting P12...");
const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Passphrase);
let signerCert = ''; let signerKey = '';
for (const safeContents of p12.safeContents) {
  for (const safeBag of safeContents.safeBags) {
    if (safeBag.type === forge.pki.oids.certBag) signerCert += forge.pki.certificateToPem(safeBag.cert);
    else if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) signerKey += forge.pki.privateKeyToPem(safeBag.key);
  }
}

const passJson = {
  formatVersion: 1,
  passTypeIdentifier: getEnvVal('APPLE_WALLET_PASS_TYPE_ID') || 'pass.no.singularityoslo.membership',
  teamIdentifier: getEnvVal('APPLE_WALLET_TEAM_ID') || '4BRG5L8P7P',
  organizationName: 'Singularity Oslo',
  description: 'Membership',
  foregroundColor: 'rgb(255, 255, 255)',
  backgroundColor: 'rgb(0, 0, 0)',
  labelColor: 'rgb(153, 153, 153)',
  generic: {
    primaryFields: [{ key: 'name', label: 'MEMBER', value: 'Test' }]
  }
};

const buffers = {
  'pass.json': Buffer.from(JSON.stringify(passJson)),
  'icon.png': iconBuffer,
  'icon@2x.png': iconBuffer,
  'logo.png': logoBuffer,
  'logo@2x.png': logoBuffer
};

console.log("Generating pass...");
async function generate() {
  try {
    const pass = new PKPass(buffers, {
      wwdr: wwdrBuffer,
      signerCert,
      signerKey,
      signerKeyPassphrase: p12Passphrase
    }, {
      serialNumber: '123'
    });
    
    const bufPromise = pass.getAsBuffer();
    console.log("Is promise:", bufPromise instanceof Promise);
    const buf = await bufPromise;
    fs.writeFileSync('test.pkpass', buf);
    console.log("Generated test.pkpass (" + buf.length + " bytes)");
  } catch (e) {
    console.error("Pass generation failed:", e);
  }
}

generate();

