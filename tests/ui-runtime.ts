import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { webkit, type Page } from 'playwright';
import { UI_CLOCK, UI_ZONE, type UiFixtureVariant } from '../src/test/ui-fixture';

export async function startUiRuntime() {
  const url=process.env.UI_TEST_URL??'http://127.0.0.1:3030';
  const server=process.env.UI_TEST_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3030','--strictPort'],{env:{...process.env,DISABLE_HMR:'true'},stdio:['ignore','pipe','pipe']});
  let log='';server?.stdout?.on('data',v=>{log+=v;});server?.stderr?.on('data',v=>{log+=v;});
  try {
    for(let attempt=0;attempt<100;attempt++) { try{if((await fetch(url)).ok)break;}catch{} if(server?.exitCode!==null&&server?.exitCode!==undefined)throw new Error(log);if(attempt===99)throw new Error(`Vite did not start: ${log}`);await new Promise(r=>setTimeout(r,100)); }
    const browser=await webkit.launch();
    const out=process.env.UI_ARTIFACT_DIR??'/tmp/planui-stage-0';await mkdir(out,{recursive:true});
    return {url,browser,out,async close(){await browser.close();server?.kill();}};
  }catch(error){server?.kill();throw error;}
}

export async function installUiFixture(page:Page,variant:UiFixtureVariant,theme:'dark'|'light') {
  await page.clock.setFixedTime(new Date(UI_CLOCK));
  // A hard guard proves no fixture/setup write can silently fall back to IndexedDB.
  await page.addInitScript({content:'globalThis.__name = value => value;'}); // tsx keep-names helper for serialized evaluators
  await page.addInitScript(()=>{indexedDB.open=()=>{throw new Error('Persistent storage is forbidden in UI fixture tests');};});
  await page.route(/\/src\/storage\/db\.ts(?:\?.*)?$/,async route=>{
    let source=await (await route.fetch()).text();
    const needle='return new IndexedDbStorageEngine(dbName);';if(!source.includes(needle))throw new Error('Memory interception no longer matches storage factory');
    source=source.replace(needle,'return globalThis.__planuiUiFixtureEngine ??= new InMemoryTransactionalEngine("planui-ui-fixture");');
    await route.fulfill({body:source,contentType:'application/javascript'});
  });
  await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{
    const source=await (await route.fetch()).text();
    await route.fulfill({contentType:'application/javascript',body:`import {createStorageEngine} from '/src/storage/db.ts';\nimport {seedUiFixture} from '/src/test/ui-fixture.ts';\nawait seedUiFixture(createStorageEngine(),${JSON.stringify(variant)},${JSON.stringify(theme)});\n`+source});
  });
}
export const UI_CONTEXT={viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:UI_ZONE} as const;

/** External audit runtime, pinned and never a project dependency. */
export async function loadAxe(page:Page) {
  const file=process.env.UI_AXE_PATH;
  if(!file)throw new Error('Set UI_AXE_PATH to axe-core 4.14.0 axe.min.js (external test tool; see tests/README.md)');
  const bytes=await readFile(file);
  if(createHash('sha256').update(bytes).digest('hex')!=='20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878')throw new Error('Unexpected axe runtime: use the pinned 4.14.0 artifact');
  await page.addScriptTag({content:bytes.toString()});
}
