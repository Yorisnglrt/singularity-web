import { PKPass } from 'passkit-generator';
import fs from 'fs';
import path from 'path';
import forge from 'node-forge';

const cwd = process.cwd();
const p12Buffer = fs.readFileSync(path.join(cwd, 'certs', 'singularity-wallet-pass-cert.p12'));
const p12Passphrase = 'Dj.fabrikken$0583!';
const wwdrBuffer = fs.readFileSync(path.join(cwd, 'certs', 'AppleWWDRCAG4.pem'));

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
  passTypeIdentifier: 'pass.no.singularityoslo.membership',
  teamIdentifier: '4BRG5L8P7P',
  organizationName: 'Singularity Oslo',
  description: 'Singularity Membership',
  foregroundColor: 'rgb(255, 255, 255)',
  backgroundColor: 'rgb(0, 0, 0)',
  labelColor: 'rgb(153, 153, 153)',
  generic: {
    primaryFields: [{ key: 'name', label: 'MEMBER', value: 'Test' }]
  }
};

const buffers = {
  'pass.json': Buffer.from(JSON.stringify(passJson)),
  'icon.png': fs.readFileSync(path.join(cwd, 'public', 'wallet', 'icon.png')),
  'icon@2x.png': fs.readFileSync(path.join(cwd, 'public', 'wallet', 'icon.png')),
  'logo.png': fs.readFileSync(path.join(cwd, 'public', 'wallet', 'logo.png')),
  'logo@2x.png': fs.readFileSync(path.join(cwd, 'public', 'wallet', 'logo.png'))
};

async function test() {
  try {
    const pass = new PKPass(buffers, {
      wwdr: wwdrBuffer,
      signerCert,
      signerKey,
      signerKeyPassphrase: p12Passphrase
    });
    const buf = pass.getAsBuffer();
    console.log("Is promise:", buf instanceof Promise);
    const resolvedBuf = await buf;
    fs.writeFileSync('debug.pkpass', resolvedBuf);
    console.log("Done. Wrote debug.pkpass, bytes: " + resolvedBuf.length);
  } catch(e) {
    console.error(e);
  }
}
test();
