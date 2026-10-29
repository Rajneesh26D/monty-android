import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

// A complete app in one HTML file: no CDN, server, credentials or account needed.
export async function buildOffline() {
  const result = await build({
    configFile: false,
    publicDir: false,
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: /^\.\/worker\?worker$/,
          replacement: resolve('src/pdf/worker.ts') + '?worker&inline',
        },
      ],
    },
    define: {
      'import.meta.env.VITE_HOSTED': JSON.stringify('false'),
      'import.meta.env.VITE_OFFLINE': JSON.stringify('true'),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      write: false,
      target: 'chrome80',
      chunkSizeWarningLimit: 5000,
      lib: { entry: resolve('src/main.tsx'), name: 'MontyOffline', formats: ['iife'] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const output = (Array.isArray(result) ? result[0] : result).output;
  const js = output
    .filter((a) => a.type === 'chunk')
    .map((a) => a.code)
    .join('\n');
  const css = output
    .filter((a) => a.type === 'asset' && a.fileName.endsWith('.css'))
    .map((a) => a.source)
    .join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#173e38"><title>Monty Offline</title><style>${css}</style></head><body><!--MONTY_SNAPSHOT--><div id="root"><p>Opening offline Monty…</p></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  await mkdir('client-dist', { recursive: true });
  await writeFile('client-dist/offline-shell.html', html);
}
