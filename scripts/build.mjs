import { build as viteBuild } from 'vite';
import { build as bundle } from 'esbuild';
import { readFile, readdir, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildOffline } from './build-offline.mjs';
process.env.VITE_HOSTED = 'true';
await viteBuild({ build: { outDir: 'client-dist' } });
await buildOffline();
const assets = {};
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
async function collect(dir, prefix = '') {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name),
      name = prefix + '/' + item.name;
    if (item.isDirectory()) await collect(path, name);
    else
      assets[name] = {
        type: mime[extname(item.name)] ?? 'application/octet-stream',
        data: gzipSync(await readFile(path)).toString('base64'),
      };
  }
}
await collect('client-dist');
await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await bundle({
  stdin: {
    contents: `import {createWorker} from './server/app.ts'; export default createWorker(${JSON.stringify(assets)});`,
    resolveDir: process.cwd(),
    sourcefile: 'worker-entry.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: 'dist/server/index.js',
});
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
await writeFile('dist/package.json', '{"type":"module"}\n');
console.log('Built browser assets and private Sites Worker.');
