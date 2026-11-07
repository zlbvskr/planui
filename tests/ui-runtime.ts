import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { webkit, chromium, type Page } from 'playwright';
import { UI_CLOCK, UI_ZONE, type UiFixtureVariant } from '../src/test/ui-fixture';

export async function startUiRuntime() {
  const port=process.env.UI_TEST_PORT??'3030';
  const url=process.env.UI_TEST_URL??`http://127.0.0.1:${port}`;
  let alreadyUp=false;try{alreadyUp=(await fetch(url)).ok;}catch{}
  const server=process.env.UI_TEST_URL||alreadyUp?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',port,'--strictPort'],{env:{...process.env,DISABLE_HMR:'true'},stdio:['ignore','pipe','pipe']});
  if(server)process.once('exit',()=>server.kill());
  let log='';let started=alreadyUp;server?.stdout?.on('data',v=>{log+=v;if(String(v).includes('Local:'))started=true;});server?.stderr?.on('data',v=>{log+=v;});
  try {
    for(let attempt=0;attempt<100;attempt++) { try{if((!server||started)&&(await fetch(url)).ok){await new Promise(r=>setTimeout(r,50));if(server?.exitCode!==null&&server?.exitCode!==undefined)throw new Error(log);break;}}catch{} if(server?.exitCode!==null&&server?.exitCode!==undefined)throw new Error(log);if(attempt===99)throw new Error(`Vite did not start: ${log}`);await new Promise(r=>setTimeout(r,100)); }
    let browser;
    try {
      browser=await webkit.launch();
    } catch {
      try {
        browser=await chromium.launch({args:['--no-sandbox']});
      } catch {
        browser=await chromium.launch({executablePath:'/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
      }
    }
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
  await page.route(/\/src\/ui-fixture-app\.tsx(?:\?.*)?$/,async route=>{
    await route.fulfill({contentType:'application/javascript',body:`import React from '/node_modules/.vite/deps/react.js';import App from '/src/App.tsx';import {HabitPresentationContext} from '/src/components/habits/presentation.ts';import {createUiFixture} from '/src/test/ui-fixture.ts';const fixture=createUiFixture(${JSON.stringify(variant)},${JSON.stringify(theme)});const value=Object.fromEntries(Object.entries(fixture.habitDurationMinutes).map(([id,durationMinutes])=>[id,{durationMinutes}]));export default function FixtureApp(){return React.createElement(HabitPresentationContext.Provider,{value},React.createElement(App));}`});
  });
  await page.route(/\/src\/main\.tsx(?:\?.*)?$/,async route=>{
    const source=(await (await route.fetch()).text()).replace(/(['"])\/src\/App\.tsx\1/g,'$1/src/ui-fixture-app.tsx$1');
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
