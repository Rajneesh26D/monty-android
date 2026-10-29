import fs from 'node:fs';
import path from 'node:path';
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
let text =
  'Monty third-party notices\n\nOriginal application copyright (c) 2026 Rajneesh26D.\nThird-party components retain their own licenses.\n';
const seen = new Set();
for (const [folder, item] of Object.entries(lock.packages)) {
  if (!folder || item.dev || !fs.existsSync(path.join(folder, 'package.json'))) continue;
  const p = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));
  if (seen.has(p.name + '@' + p.version)) continue;
  seen.add(p.name + '@' + p.version);
  text +=
    '\n\n========================================\n' +
    p.name +
    ' ' +
    p.version +
    '\nLicense: ' +
    (typeof p.license === 'string' ? p.license : JSON.stringify(p.license)) +
    '\n';
  for (const name of fs
    .readdirSync(folder)
    .filter((n) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(n))) {
    const file = path.join(folder, name);
    if (fs.statSync(file).isFile())
      text += '\n' + name + '\n' + fs.readFileSync(file, 'utf8') + '\n';
  }
}
const native = 'licenses/android-third-party.txt';
if (fs.existsSync(native)) text += '\n\n' + fs.readFileSync(native, 'utf8');
fs.writeFileSync('public/third-party-notices.txt', text);
console.log('Collected ' + seen.size + ' production npm license notices.');
