import { PKPass } from 'passkit-generator';

console.log("Testing passkit-generator constructor signatures:");
try {
  const p = new PKPass({}, {
    wwdr: Buffer.from(''),
    signerCert: '',
    signerKey: ''
  });
  console.log("pass created without pass.json");
} catch (e) {
  console.log("Constructor empty errored:", e.message);
}

try {
  const p = new PKPass({
    'pass.json': Buffer.from(JSON.stringify({
       formatVersion: 1, passTypeIdentifier: 'A', teamIdentifier: 'B', generic: {}
    }))
  }, {
    wwdr: Buffer.from(''),
    signerCert: '',
    signerKey: ''
  });
  console.log("pass created WITH pass.json in buffer");
} catch (e) {
  console.log("Constructor with pass.json in buffer errored:", e.message);
}
