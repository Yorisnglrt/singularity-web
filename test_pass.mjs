import { PKPass } from 'passkit-generator';
import fs from 'fs';
import path from 'path';
import forge from 'node-forge';

const cwd = process.cwd();
const p12Path = path.join(cwd, 'certs', 'singularity-wallet-pass-cert.p12');
const p12Passphrase = 'Dj.fabrikken$0583!';
const wwdrPath = path.join(cwd, 'certs', 'AppleWWDRCAG4.pem');
const iconPath = path.join(cwd, 'public', 'wallet', 'icon.png');
const logoPath = path.join(cwd, 'public', 'wallet', 'logo.png');

console.log("Loading files...");
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
  passTypeIdentifier: 'pass.no.singularityoslo.membership',
  teamIdentifier: '4BRG5L8P7P',
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
  'icon.png': iconBuffer,
  'icon@2x.png': iconBuffer,
  'logo.png': logoBuffer,
  'logo@2x.png': logoBuffer
};

console.log("Generating pass...");
try {
  const pass = new PKPass(buffers, {
    wwdr: wwdrBuffer,
    signerCert,
    signerKey,
    signerKeyPassphrase: p12Passphrase
  }, {
    serialNumber: '123'
  });
  
  // Test how passJson injection works in passkit-generator v3
  // In v3, pass.json is usually passed in the first parameter `buffers` or created via pass object methods.
  // Wait, if passing buffers, it just inserts them. But PKPass v3 has specific APIs for pass.json.
  
  const buf = pass.getAsBuffer();
  fs.writeFileSync('test.pkpass', buf);
  console.log("Generated test.pkpass (" + buf.length + " bytes)");
} catch (e) {
  console.error("Pass generation failed:", e);
}
