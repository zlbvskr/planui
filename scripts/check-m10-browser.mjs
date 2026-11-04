// Requires Playwright and a running Vite dev server. Uses isolated browser contexts only.
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.PLANUI_TEST_URL || 'http://localhost:3006';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
  // Exercise every supported native old-version entry point, plus an aborted versionchange.
  for (const oldVersion of [1,2,3,4,5,6,7,8]) {
    const context = await browser.newContext(); const page = await context.newPage();
    await page.goto(`${base}/icon.svg`);
    const result = await page.evaluate(async ({oldVersion}) => {
      const {STORE_NAMES,createDefaultSettings,IndexedDbStorageEngine} = await import('/src/storage/db.ts');
      const {PlanuiRepositories} = await import('/src/storage/repositories.ts');
      const {exportFullBackupZip,validateBackupArchive} = await import('/src/storage/backup/backupService.ts');
      const now='2026-11-04T10:00:00.000Z', name=`m10-upgrade-${oldVersion}`;
      const settings={...createDefaultSettings(now),dbSchemaVersion:oldVersion};
      if(oldVersion<3)delete settings.roadmapLayer;
      if(oldVersion<4)delete settings.dailyPlans;
      const text={id:'legacy',recordedAt:now,localDate:'2026-11-04',zoneId:'Europe/Kyiv',text:'  Історія\n',mood:null,energy:null,stress:null,tags:['зміна'],createdAt:now,updatedAt:now,revision:3};
      const wish={id:'wish',title:'Раніше здійснено',note:'Без змін',categoryId:null,timing:'someday',estimatedPrice:{amountMinor:120,amountDecimal:'001.20',currency:'EUR'},state:'fulfilled',fulfilledAt:now,archived:true,createdAt:now,updatedAt:now,revision:5};
      const folder={id:'folder',name:'Напрям',parentId:null,order:1,createdAt:now,updatedAt:now,revision:2};
      const task={id:'task',title:'Історична справа',description:null,state:'open',priority:'normal',deadline:{kind:'date_only',localDate:'2026-11-05'},estimatedDurationMinutes:null,planningState:'date_only',plannedDate:'2026-11-04',ownership:oldVersion===1?{kind:'standalone',folderId:'folder'}:{kind:'folder',folderId:'folder'},checklist:[],createdAt:now,updatedAt:now,completedAt:null,canceledAt:null,revision:4};
      const habit={id:'habit',name:'Вода',description:null,icon:null,lifeAreaId:null,projectId:null,state:'paused',ruleRevisions:[{id:'rule',effectiveFromLocalDate:'2026-11-01',rule:{kind:'daily'},target:{kind:'numeric',targetValue:2000,unitUk:'мл'},createdAt:now}],createdAt:now,updatedAt:now,revision:3};
      const entry={id:'custom-log',habitId:'habit',localDate:'2026-11-03',status:'partial',numericValue:500,note:'Після нічної зміни',recordedAt:now,updatedAt:now,revision:2};
      const scored={...text,id:'scored',text:null,mood:2,energy:3,stress:4};
      const inspiration={id:'saved',kind:'quote',title:'Старе',contentText:'Цитата',linkUrl:null,mediaId:null,isFavorite:true,projectId:null,createdAt:now,updatedAt:now,revision:2};
      await new Promise((resolve,reject)=>{const request=indexedDB.open(name,oldVersion);request.onupgradeneeded=()=>{for(const store of Object.values(STORE_NAMES))if(!(oldVersion===1&&store==='goals'))request.result.createObjectStore(store,{keyPath:'id'});};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['settings','personalRecords','wishes','folders','tasks','habits','habitEntries','inspirationItems'],'readwrite');tx.objectStore('settings').put(settings);tx.objectStore('personalRecords').put(text);tx.objectStore('wishes').put(wish);tx.objectStore('folders').put(folder);tx.objectStore('tasks').put(task);tx.objectStore('habits').put(habit);tx.objectStore('habitEntries').put(entry);tx.objectStore('personalRecords').put(scored);tx.objectStore('inspirationItems').put(inspiration);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
      let aborted=false, oldPreserved=false, blockedCode=null, abandonedVersion=null;
      if(oldVersion===1){
        const blocker=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
        blocker.onversionchange=()=>{};
        const blocked=new IndexedDbStorageEngine(name);
        try{await new PlanuiRepositories(blocked).captureCoherentSnapshot(now);}catch(error){blockedCode=error.code;}finally{blocked.close();blocker.close();}
        abandonedVersion=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const version=db.version;db.close();resolve(version);};});
        const update=IDBCursor.prototype.update;let once=true;
        IDBCursor.prototype.update=function(value){if(once){once=false;this.source.transaction.abort();return undefined;}return update.call(this,value);};
        const failed=new IndexedDbStorageEngine(name);
        try{await new PlanuiRepositories(failed).captureCoherentSnapshot(now);}catch{aborted=true;}finally{failed.close();IDBCursor.prototype.update=update;}
        oldPreserved=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('settings'),q=tx.objectStore('settings').get('singleton');let preserved=false;q.onsuccess=()=>{preserved=db.version===1&&q.result.dbSchemaVersion===1;};tx.oncomplete=()=>{db.close();resolve(preserved);};};});
      }
      const repos=new PlanuiRepositories(new IndexedDbStorageEngine(name));
      const first=(await repos.captureCoherentSnapshot(now)).snapshot;
      const olderBlocked=await new Promise(resolve=>{const request=indexedDB.open(name,8);request.onerror=()=>resolve(request.error.name==='VersionError');request.onsuccess=()=>{request.result.close();resolve(false);};});
      const zip=await exportFullBackupZip(repos,now), checked=await validateBackupArchive(zip.zipBytes);
      repos.engine.close();repos.tabSync.close();
      const reopened=new PlanuiRepositories(new IndexedDbStorageEngine(name));
      const second=(await reopened.captureCoherentSnapshot(now)).snapshot;
      reopened.engine.close();reopened.tabSync.close();
      return {olderBlocked,first,second,checked:checked.snapshot,text,scored,habit,entry,inspiration,task:{...task,ownership:{kind:'folder',folderId:'folder'}},wish,folder,aborted,oldPreserved,blockedCode,abandonedVersion};
    },{oldVersion});
    assert.equal(result.olderBlocked,true);assert.deepEqual(result.first,result.second);assert.deepEqual(result.checked,result.first);
    assert.deepEqual(result.first.personalRecords,[result.text,result.scored]);assert.deepEqual(result.first.tasks,[result.task]);assert.deepEqual(result.first.habits,[result.habit]);assert.deepEqual(result.first.habitEntries,[result.entry]);assert.deepEqual(result.first.inspirationItems,[result.inspiration]);assert.deepEqual(result.first.wishes,[result.wish]);assert.deepEqual(result.first.folders,[result.folder]);
    assert.equal(result.first.settings.dbSchemaVersion,9);
    if(oldVersion===1){assert.equal(result.aborted,true);assert.equal(result.oldPreserved,true);assert.equal(result.blockedCode,'DB_VERSION_BLOCKED');assert.equal(result.abandonedVersion,1);}
    await context.close();
  }
  console.log('PASS: native v1–v8 → v9 entry points, aborted v1 migration rollback/retry, repeated startup and ZIP export preserve legacy records and exact money.');

  const images=await browser.newContext(), imagePage=await images.newPage();await imagePage.goto(`${base}/icon.svg`);
  const imageCheck=await imagePage.evaluate(async()=>{
    const {PlanuiRepositories}=await import('/src/storage/repositories.ts');
    const {IndexedDbStorageEngine,STORE_NAMES}=await import('/src/storage/db.ts');
    const {exportFullBackupZip,validateBackupArchive}=await import('/src/storage/backup/backupService.ts');
    const {createZipArchive,sha256Hex}=await import('/src/storage/backup/zipCodec.ts');
    const {validateAndPrepareRasterMedia}=await import('/src/domain/personalSpace.ts');
    const {buildWishItemRecord}=await import('/src/domain/wishlist.ts');
    const now='2026-11-04T10:00:00.000Z',repos=new PlanuiRepositories(new IndexedDbStorageEngine('m10-images'));
    await repos.getOrInitSettings(now);
    const bytes=new Uint8Array(await (await fetch('/pwa-192x192.png')).arrayBuffer());
    const media=await validateAndPrepareRasterMedia({id:'image',bytes,declaredMimeType:'image/png',nowIso:now});
    await repos.saveWishItem({...buildWishItemRecord({id:'wish',title:'Зображення',nowIso:now}).wish,mediaId:'image'},undefined,{media});
    const preview=await validateBackupArchive((await exportFullBackupZip(repos,now)).zipBytes);
    const preserved=preview.mediaBlobs.get('image').every((value,index)=>value===bytes[index]);
    const bad=bytes.slice(0,32),hash=await sha256Hex(bad),meta=preview.snapshot.mediaMeta[0];meta.sha256Hex=hash;meta.byteSize=bad.length;
    const data=new TextEncoder().encode(JSON.stringify(preview.snapshot));
    for(const file of preview.manifest.files){const content=file.path==='data.json'?data:bad;file.byteSize=content.length;file.sha256Hex=await sha256Hex(content);}
    const zip=await createZipArchive([{path:'manifest.json',bytes:new TextEncoder().encode(JSON.stringify(preview.manifest))},{path:'data.json',bytes:data},{path:'media/image.png',bytes:bad}]);
    let importCode,exportCode,fallbackCode;try{await validateBackupArchive(zip);}catch(error){importCode=error.code;}
    const bitmap=globalThis.createImageBitmap;globalThis.createImageBitmap=undefined;
    try{await validateBackupArchive((await exportFullBackupZip(repos,now)).zipBytes);try{await validateBackupArchive(zip);}catch(error){fallbackCode=error.code;}}finally{globalThis.createImageBitmap=bitmap;}
    await repos.engine.runTransaction([STORE_NAMES.mediaMeta,STORE_NAMES.mediaBlobs],'readwrite',async tx=>{await tx.put(STORE_NAMES.mediaMeta,meta);await tx.put(STORE_NAMES.mediaBlobs,{id:'image',mimeType:'image/png',bytes:bad});});
    try{await exportFullBackupZip(repos,now);}catch(error){exportCode=error.code;}
    repos.engine.close();repos.tabSync.close();return {preserved,importCode,exportCode,fallbackCode};
  });
  assert.equal(imageCheck.preserved,true);assert.equal(imageCheck.importCode,'MEDIA_SIGNATURE_MISMATCH');assert.equal(imageCheck.exportCode,'MEDIA_SIGNATURE_MISMATCH');assert.equal(imageCheck.fallbackCode,'MEDIA_SIGNATURE_MISMATCH');await images.close();
  console.log('PASS: browser decodes valid local image bytes and rejects corrupt header-only raster on import and export.');

  const context=await browser.newContext();const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/#/settings`);await page.getByTestId('toggle-module-wishlist').check();
  await page.goto(`${base}/#/wishlist`);await page.getByTestId('wishlist-quick-title-input').fill('Збережено');await page.getByTestId('wishlist-quick-submit-button').click();await page.getByText('Збережено',{exact:true}).waitFor();
  const other=await context.newPage();await other.goto(`${base}/#/settings`);await other.getByTestId('export-backup-zip-button').waitFor();
  // Native commit/QuotaExceeded failure: live records and recovery records roll back together.
  const rollback=await other.evaluate(async()=>{
    const {PlanuiRepositories}=await import('/src/storage/repositories.ts');
    const {exportFullBackupZip,validateBackupArchive,executeAtomicBackupReplacement}=await import('/src/storage/backup/backupService.ts');
    const repos=new PlanuiRepositories(),before=await repos.captureCoherentSnapshot(),preview=await validateBackupArchive((await exportFullBackupZip(repos)).zipBytes);
    const put=IDBObjectStore.prototype.put;let code;
    IDBObjectStore.prototype.put=function(value,...args){if(this.name==='wishes')throw new DOMException('Isolated quota injection','QuotaExceededError');return put.call(this,value,...args);};
    try{await executeAtomicBackupReplacement(repos,preview,{explicitUserConfirmation:true});}catch(error){code=error.code;}finally{IDBObjectStore.prototype.put=put;}
    const after=await repos.captureCoherentSnapshot(),recoveries=await repos.listRecoverySnapshots();repos.engine.close();repos.tabSync.close();return {before:before.snapshot,after:after.snapshot,recoveries:recoveries.length,code};
  });
  assert.deepEqual(rollback.after,rollback.before);assert.equal(rollback.recoveries,0);assert.equal(rollback.code,'STORAGE_QUOTA_EXCEEDED');

  // Export and select actual ZIP through the import UI; do not confirm yet.
  const downloadPromise=other.waitForEvent('download');await other.getByTestId('export-backup-zip-button').click();const download=await downloadPromise;
  await other.getByTestId('import-backup-file-input').setInputFiles(await download.path());await other.getByTestId('import-replacement-preview').waitFor();
  assert.equal(await other.getByTestId('recovery-snapshot-item-').count(),0);
  const edit=page.getByTestId(/^edit-wish-button-/);await edit.click();
  const title=page.getByTestId('edit-wish-title-input');await title.fill('Мій незбережений текст');
  await other.getByTestId('confirm-import-replacement-button').click();await other.getByTestId('import-replacement-preview').waitFor({state:'hidden'});
  await page.getByText(/В іншій вкладці замінено локальні дані/).waitFor();assert.equal(await title.inputValue(),'Мій незбережений текст');
  await page.getByTestId('confirm-save-wish-button').click();await page.getByRole('dialog').getByRole('alert').waitFor();assert.equal(await title.inputValue(),'Мій незбережений текст');
  const stale=await page.getByRole('dialog').getByRole('alert').innerText();assert.match(stale,/дан|вклад|змін|онов/);
  const final=await other.evaluate(async()=>{const {PlanuiRepositories}=await import('/src/storage/repositories.ts');const r=new PlanuiRepositories();const s=await r.captureCoherentSnapshot();const recoveries=await r.listRecoverySnapshots();r.engine.close();r.tabSync.close();return {title:s.snapshot.wishes[0].title,recoveries:recoveries.length};});
  assert.equal(final.title,'Збережено');assert.equal(final.recoveries,1);assert.deepEqual(errors,[]);
  console.log('PASS: native quota failure rolls back; import preview requires explicit confirmation; two tabs preserve unsaved form input and block stale save after replacement.');
  await context.close();

  const newer=await browser.newContext(), p=await newer.newPage();await p.goto(`${base}/icon.svg`);
  await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('planui_local_db',10);r.onupgradeneeded=()=>r.result.createObjectStore('sentinel',{keyPath:'id'});r.onsuccess=()=>{const db=r.result,tx=db.transaction('sentinel','readwrite');tx.objectStore('sentinel').put({id:'keep',text:'Нова схема'});tx.oncomplete=()=>{db.close();resolve();};};r.onerror=()=>reject(r.error);}));
  await p.goto(`${base}/#/settings`);await p.getByRole('alert').filter({hasText:/новіш|нової|несуміс|версі/}).waitFor();
  const preserved=await p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('planui_local_db');r.onsuccess=()=>{const db=r.result,tx=db.transaction('sentinel'),q=tx.objectStore('sentinel').get('keep');q.onsuccess=()=>resolve(q.result.text);tx.oncomplete=()=>db.close();};}));assert.equal(preserved,'Нова схема');await newer.close();
  console.log('PASS: older app displays a localized newer-schema error and preserves the database.');
} finally {await browser.close();}
