import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

// Serve only real files under /planui/: no Vite fallback to conceal bad paths.
const dir = await mkdtemp(path.join(tmpdir(), 'planui-pages-'));
await cp('dist', `${dir}/v1`, {recursive: true});
await cp('dist', `${dir}/v2`, {recursive: true});
await cp('dist', `${dir}/broken`, {recursive: true});
const originalSw = await readFile('dist/sw.js', 'utf8');
await writeFile(`${dir}/v2/sw.js`, originalSw.replace(/const CACHE_VERSION = "([^"]+)";/, 'const CACHE_VERSION = "$1-update-test";'));
await writeFile(`${dir}/v2/index.html`, (await readFile('dist/index.html', 'utf8')).replace('</head>', '<meta name="pages-test-version" content="2"></head>'));
await writeFile(`${dir}/broken/sw.js`, originalSw.replace(/const CACHE_VERSION = "([^"]+)";/, 'const CACHE_VERSION = "$1-broken-test";').replace('const INJECTED_PRECACHE = [', 'const INJECTED_PRECACHE = ["/planui/missing-test.js",'));
let version = 'v1';
const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/planui/')) { res.writeHead(404); res.end('Outside app'); return; }
  const rel = decodeURIComponent(url.pathname.slice('/planui/'.length)) || 'index.html';
  if (rel.includes('..')) { res.writeHead(400); res.end(); return; }
  try { const bytes = await readFile(path.join(dir, version, rel)); res.writeHead(200, {'Content-Type':types[path.extname(rel)] || 'application/octet-stream', 'Cache-Control':'no-cache'}); res.end(bytes); }
  catch { res.writeHead(404); res.end('Missing'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launchPersistentContext(`${dir}/profile`, {headless:true, executablePath:process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox'], viewport:{width:390,height:844}, acceptDownloads:true});
  const context = browser;
  const page = await context.newPage();
  const errors=[], bad=[], consoleErrors=[];
  page.on('console',message=>{
    if(message.type()==='error' && !/Failed to load resource.*(404|ERR_INTERNET_DISCONNECTED)/.test(message.text())) consoleErrors.push(message.text());
  });page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400 && !r.url().includes('missing-test') && !r.url().endsWith('/outside-test'))bad.push(`${r.status()} ${r.url()}`);});
  await page.goto(`${origin}/planui/`);
  await page.getByTestId('mobile-nav-item-today').waitFor();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller)).catch(async error => { console.error(await page.evaluate(async()=>({sw: await navigator.serviceWorker.getRegistrations().then(rs=>rs.map(r=>({scope:r.scope,active:r.active?.state,installing:r.installing?.state}))), body:document.body.innerText.slice(-1000)}))); throw error; });
  await page.evaluate(async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller) await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
  console.log('PASS: worker activated');
  const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);assert.equal(scope,`${origin}/planui/`);
  const manifest=await page.evaluate(async()=>{const url=document.querySelector('link[rel=manifest]').href;return {url,data:await(await fetch(url)).json()};});
  assert.equal(new URL(manifest.data.start_url,manifest.url).href,`${origin}/planui/`);
  assert.equal(new URL(manifest.data.scope,manifest.url).href,`${origin}/planui/`);
  const cdp=await context.newCDPSession(page);
  const setOffline=async offline=>{
    await context.setOffline(offline);
    // Chromium's request emulation and navigator.onLine are separate CDP settings.
    await cdp.send('Network.overrideNetworkState',{offline,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  };
  const installability=await cdp.send('Page.getInstallabilityErrors');
  console.log('Chromium installability diagnostics:',JSON.stringify(installability.installabilityErrors));
  assert.equal(installability.installabilityErrors.length,0);
  // Exercise every primary destination through the actual capsule.
  for(const name of ['calendar','directions','me','today']) { await page.getByTestId(`mobile-nav-item-${name}`).click(); }
  await page.getByTestId('mobile-global-create-button').click();
  await page.getByTestId('create-task-title-input').pressSequentially('Перевірка Pages', {delay: 30});
  assert.equal(await page.getByTestId('create-task-title-input').inputValue(), 'Перевірка Pages');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'create-task-title-input');
  await page.getByTestId('create-task-title-input').press('Enter');
  await page.getByTestId('create-task-title-input').waitFor({state:'hidden'}).catch(async error=>{console.error(await page.locator('body').innerText());throw error;});
  const getData=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('planui_local_db');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['tasks','settings']);const result={};for(const name of ['tasks','settings']){const q=tx.objectStore(name).getAll();q.onsuccess=()=>result[name]=q.result;}tx.oncomplete=()=>{db.close();resolve(result);};};}));
  console.log('PASS: navigation and task creation');
  let saved=await getData(); assert(saved.tasks.some(t=>t.title==='Перевірка Pages'));
  const quickTask=saved.tasks.find(t=>t.title==='Перевірка Pages'); assert.equal(quickTask.plannedDate,null); assert.equal(quickTask.deadline,null); assert.equal(quickTask.ownership.kind,'standalone');
  await page.evaluate(()=>localStorage.setItem('pages-test','збережено'));
  await page.reload(); assert.equal(await page.evaluate(()=>localStorage.getItem('pages-test')),'збережено'); assert.deepEqual((await getData()).tasks,saved.tasks);
  await page.goto(`${origin}/planui/#/settings`);
  const downloadPromise=page.waitForEvent('download');await page.getByTestId('export-backup-zip-button').click();const download=await downloadPromise.catch(async error=>{console.error(await page.locator('body').innerText());throw error;});const backup=await download.path();assert(backup);
  await page.getByTestId('import-backup-file-input').setInputFiles({name:'planui.zip',mimeType:'application/zip',buffer:await readFile(backup)});
  await page.getByTestId('confirm-import-replacement-button').click();
  await page.getByTestId('import-replacement-preview').waitFor({state:'hidden'});
  assert.deepEqual((await getData()).tasks,saved.tasks);
  console.log('PASS: storage and ZIP restore');
  await setOffline(true);await page.reload();await page.getByTestId('pwa-offline-banner').waitFor().catch(async error=>{console.error('OFFLINE DIAGNOSTICS',await page.evaluate(()=>({online:navigator.onLine,body:document.body.innerText,html:document.documentElement.outerHTML.slice(0,800)})),errors);throw error;});assert.deepEqual((await getData()).tasks,saved.tasks);await setOffline(false);
  // A controlled page's request outside /planui/ must go to network, never app fallback/cache.
  const outside=await page.evaluate(async()=>{const r=await fetch('/outside-test');return {status:r.status,body:await r.text()};});assert.equal(outside.status,404);assert.equal(outside.body,'Outside app');
  const cacheBefore=await page.evaluate(async()=>{await caches.open('other-app-cache');return caches.keys();});
  console.log('PASS: offline and scope boundary');
  version='broken';
  const broken=await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;const changed=new Promise(resolve=>reg.addEventListener('updatefound',()=>{const sw=reg.installing;sw.addEventListener('statechange',()=>{if(sw.state==='redundant')resolve(sw.state);});},{once:true}));await reg.update();return changed;});assert.equal(broken,'redundant');
  console.log('PASS: failed worker rejected');
  version='v2';
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;await reg.update();});
  await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.ready).waiting),undefined,{timeout:90000});
  console.log('PASS: update worker staged');
  await page.getByTestId('pwa-update-banner').waitFor();assert.equal(await page.locator('meta[name=pages-test-version]').count(),0);
  await page.getByTestId('mobile-nav-item-today').click();
  await page.getByTestId('mobile-global-create-button').click();
  await page.getByTestId('create-task-title-input').pressSequentially('Незбережена справа', {delay: 20});
  assert.equal(await page.getByTestId('pwa-apply-update-button').isDisabled(),true);
  await page.getByTestId('modal-close-button').click();
  await page.getByRole('button',{name:'Скасувати зміни',exact:true}).click();
  await page.getByTestId('pwa-apply-update-button').click();await page.waitForFunction(()=>document.querySelector('meta[name=pages-test-version]')?.content==='2');
  const cacheAfter=await page.evaluate(()=>caches.keys());assert(cacheAfter.includes('other-app-cache'));for(const key of cacheBefore.filter(k=>k.startsWith('planui-assets-')))assert(!cacheAfter.includes(key));
  assert.deepEqual((await getData()).tasks,saved.tasks);assert.equal(await page.evaluate(()=>localStorage.getItem('pages-test')),'збережено');
  await setOffline(true);await page.reload();await page.getByTestId('pwa-offline-banner').waitFor().catch(async error=>{console.error('OFFLINE DIAGNOSTICS',await page.evaluate(()=>({online:navigator.onLine,body:document.body.innerText,html:document.documentElement.outerHTML.slice(0,800)})),errors);throw error;});await setOffline(false);
  await page.setViewportSize({width:1440,height:900});await page.reload();
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(bad.length,0,JSON.stringify(bad));assert.equal(consoleErrors.length,0,JSON.stringify(consoleErrors));
  console.log('PASS: /planui/ resources, navigation, IndexedDB/localStorage, ZIP export/restore, scoped manifest/worker, offline reload, failed update recovery, explicit update activation, cache cleanup and data preservation (390px and 1440px Chromium).');
  console.log('Native OS installation and physical-device behavior are not exercised.');
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await rm(dir,{recursive:true,force:true}); }
