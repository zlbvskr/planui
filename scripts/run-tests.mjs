import { readdir } from 'node:fs/promises';
const dir = new URL('../src/storage/__tests__/', import.meta.url);
for (const file of (await readdir(dir)).filter(file => file.endsWith('.test.ts')).sort()) {
  await import(new URL(file, dir).href);
}
await import('./pwa-worker.test.mjs');
await import('./zip-stream.test.mjs');
