import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { Script } from 'node:vm';
const base = process.env.BASE_URL || '/planui/';
const origin = 'https://zlbvskr.github.io';
const html = await readFile('dist/index.html', 'utf8');
const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
const sw = await readFile('dist/sw.js', 'utf8');
new Script(sw);
assert(!/__PLANUI_(CACHE_VERSION|PRECACHE_MANIFEST)__/.test(sw), 'Service worker build placeholders remain');
assert(!html.includes('%BASE_URL%'), 'HTML base placeholder remains');
for (const field of ['id', 'start_url', 'scope']) {
  assert.equal(new URL(manifest[field], `${origin}${base}manifest.webmanifest`).pathname, base);
}
const urls = JSON.parse(sw.match(/const INJECTED_PRECACHE = (\[[\s\S]*?\]);/)[1]);
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
for (const icon of manifest.icons) refs.push(new URL(icon.src, `${origin}${base}manifest.webmanifest`).pathname);
for (const url of [...refs, ...urls]) {
  assert(url.startsWith(base), `Resource escapes project base: ${url}`);
  const file = url === base ? 'index.html' : url.slice(base.length);
  assert(!file.includes('..'), `Unsafe resource: ${url}`);
  assert((await stat(`dist/${file}`)).isFile(), `Missing resource: ${url}`);
}
assert(refs.some(url => url.endsWith('.js')), 'No JavaScript entry');
assert(refs.some(url => url.endsWith('.css')), 'No stylesheet');
assert(urls.includes(base) && urls.includes(`${base}index.html`));
assert(urls.some(url => url.endsWith('.js')) && urls.some(url => url.endsWith('.css')));
for (const file of await readdir('dist/assets')) {
  if (file.endsWith('.webp')) assert(urls.includes(`${base}assets/${file}`), `WebP missing from precache: ${file}`);
}
console.log(`PASS: dist shell, manifest, icons and ${urls.length} precache URLs stay inside ${base}`);

for (const file of await readdir('dist/assets')) {
  if (!/\.(js|css)$/.test(file)) continue;
  const source=await readFile(`dist/assets/${file}`,'utf8');
  assert(!source.includes('dev-gallery')&&!source.includes('Сторінку видно крізь скло.'),'DEV gallery leaked into production');
}
console.log('PASS: DEV gallery excluded from production assets');
