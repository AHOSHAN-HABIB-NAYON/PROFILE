// Generates the Ed25519 key pair used to sign update packages.
//   keys/update-private.pem  → keep OFFLINE / in CI secrets. Never commit.
//   server/update-public-key.pem → shipped with ShopiGo, verifies packages.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privFile = path.join(root, 'keys', 'update-private.pem');
if (fs.existsSync(privFile) && !process.argv.includes('--force')) {
  console.error('keys/update-private.pem already exists (use --force to overwrite)');
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(privFile), { recursive: true });
fs.writeFileSync(privFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(path.join(root, 'server', 'update-public-key.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Wrote keys/update-private.pem (secret) and server/update-public-key.pem');
