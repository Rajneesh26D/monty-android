import type { State } from '../../shared/types';
import { uid } from '../../shared/types';
import { createBackup } from './backup';
import { download } from './repository';

export async function exportOffline(state: State) {
  const response = await fetch('/offline-shell.html');
  if (!response.ok) throw new Error('Could not download the offline app. Reconnect and retry.');
  const template = await response.text();
  if (!template.includes('<!--MONTY_SNAPSHOT-->'))
    throw new Error('The offline app is unavailable. Please refresh Monty.');
  const backup = await createBackup(state);
  let binary = '';
  for (let i = 0; i < backup.length; i += 16384)
    binary += String.fromCharCode(...backup.subarray(i, i + 16384));
  const snapshot = `<script id="monty-offline-data" type="application/json" data-library="${uid()}">${btoa(binary)}</script>`;
  const html = template.replace('<!--MONTY_SNAPSHOT-->', () => snapshot);
  await download(
    new TextEncoder().encode(html),
    `Monty-offline-${new Date().toISOString().slice(0, 10)}.html`,
    'text/html',
  );
}
