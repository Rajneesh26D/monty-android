import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import { join } from 'node:path';

// Decrypt only inside the release runner. The unlock code is an Actions secret.
let source = process.env.MONTY_SIGNING_BUNDLE;
if (!source && process.env.MONTY_SIGNING_KEY) {
  const envelope = JSON.parse(readFileSync('.github/signing/monty-release.enc.json', 'utf8'));
  const key = Buffer.from(process.env.MONTY_SIGNING_KEY.trim(), 'base64url');
  if (envelope.format !== 1 || envelope.algorithm !== 'aes-256-gcm' || key.length !== 32) {
    throw new Error('Invalid signing unlock code or envelope');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  source = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
if (!source) {
  throw new Error(
    'One-time setup: add repository Actions secret MONTY_SIGNING_KEY using the private unlock code, then rerun this workflow.',
  );
}
const bundle = JSON.parse(source);
const keyPath = join(process.env.RUNNER_TEMP, 'monty-release.jks');
const settings = {
  MONTY_KEYSTORE_PATH: keyPath,
  MONTY_KEYSTORE_PASSWORD: bundle.storePassword,
  MONTY_KEY_ALIAS: bundle.keyAlias,
  MONTY_KEY_PASSWORD: bundle.keyPassword,
};
if (bundle.mobileUploadToken) settings.MONTY_UPLOAD_TOKEN = bundle.mobileUploadToken;
for (const value of Object.values(settings)) {
  if (typeof value !== 'string' || /[\r\n]/.test(value))
    throw new Error('Invalid signing configuration');
  console.log('::add-mask::' + value);
}
writeFileSync(keyPath, Buffer.from(bundle.keystoreBase64, 'base64'), { mode: 0o600 });
appendFileSync(
  process.env.GITHUB_ENV,
  Object.entries(settings)
    .map(([name, value]) => `${name}=${value}\n`)
    .join(''),
);
console.log('Restored the release key into the runner temporary directory.');
