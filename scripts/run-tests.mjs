import { readdir } from 'node:fs/promises';
const dir = new URL('../src/storage/__tests__/', import.meta.url);
for (const file of (await readdir(dir)).filter(file => file.endsWith('.test.ts')).sort()) {
  await import(new URL(file, dir).href);
}
await import('./pwa-worker.test.mjs');
await import('./zip-stream.test.mjs');
await import('../src/lib/__tests__/format.test.ts');
await import('../src/ui/__tests__/primitives.test.tsx');
await import('../src/ui/__tests__/motion.test.ts');
await import('../src/ui/__tests__/sourceGuards.test.ts');
await import('../src/test/ui-fixture.test.ts');
await import('../src/components/timeline/__tests__/timeline.test.ts');
