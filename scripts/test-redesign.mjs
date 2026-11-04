import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base=process.env.PLANUI_TEST_URL || 'http://localhost:3000';
const out=process.env.AUDIT_DIR || '/tmp/planui-redesign-browser';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${base}/#/today`);
 await page.getByTestId('mobile-global-create-button').waitFor();
 await page.evaluate(async()=>{
  const { PlanuiRepositories }=await import('/src/storage/repositories.ts');
  const repos=new PlanuiRepositories();const now=new Date().toISOString();
  await repos.saveTask({id:'review',title:'Попередній план',state:'open',priority:'normal',description:null,deadline:{kind:'date_only',localDate:'2030-12-01'},estimatedDurationMinutes:60,planningState:'date_only',plannedDate:'2020-01-01',ownership:{kind:'standalone'},checklist:[],createdAt:now,updatedAt:now,completedAt:null,canceledAt:null,revision:1});
 });
 await page.reload();
 await page.getByText('Переглянути попередні плани',{exact:true}).click();
 await page.getByRole('button',{name:'Попередній план',exact:true}).click();
 await page.getByText('Зменшити обсяг / розбити на кроки',{exact:true}).click();
 await page.getByLabel('Менший наступний крок').fill('Посильний крок');
 await page.getByLabel('Додати кроки до списку — кожен з нового рядка').fill('Відкрити матеріал\nПрочитати сторінку');
 await page.getByRole('button',{name:'Зберегти посильний крок',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Посильний крок',exact:true}).click();
 await page.getByRole('button',{name:'Пауза — переглянути зняття з розкладу',exact:true}).click();
 await page.getByRole('button',{name:'Підтвердити ці зміни',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 const task=await page.evaluate(async()=>{const {PlanuiRepositories}=await import('/src/storage/repositories.ts');return (await new PlanuiRepositories().captureCoherentSnapshot()).snapshot.tasks.find(t=>t.id==='review');});
 assert.equal(task.plannedDate,null);assert.equal(task.checklist.length,2);assert.equal(task.deadline.localDate,'2030-12-01');
 // Module changes retain all core routes and hide optional creation actions.
 await page.goto(`${base}/#/settings`);
 for(const module of ['habits','state-check-ins','desired-life','wishlist']) {
  const toggle=page.getByTestId(`toggle-module-${module}`);await toggle.waitFor();if(await toggle.isChecked()) await toggle.uncheck();
 }
 await page.getByTestId('mobile-nav-item-today').click();
 await page.getByTestId('mobile-global-create-button').click();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='create-task-title-input');
 for(const kind of ['task','shift','event','goal','project']) assert.equal(await page.getByTestId(`create-action-tab-${kind}`).count(),1);
 for(const kind of ['habit','personal_record','inspiration','wish']) assert.equal(await page.getByTestId(`create-action-tab-${kind}`).count(),0);
 await page.waitForTimeout(450);
 await page.screenshot({path:`${out}/quick-add.png`});
 await page.getByTestId('modal-close-button').click();
 for(const tab of ['calendar','directions','me','today']) {await page.getByTestId(`mobile-nav-item-${tab}`).click();assert.equal(await page.getByTestId(`mobile-nav-item-${tab}`).getAttribute('aria-current'),'page');await page.screenshot({path:`${out}/${tab}.png`});}
 await page.goto(`${base}/#/calendar`);
 for(const mode of ['Місяць','Тиждень','День','Графік роботи']) {await page.getByRole('group',{name:'Режим календаря',exact:true}).getByRole('button',{name:mode,exact:true}).click();await page.screenshot({path:`${out}/calendar-${mode}.png`,fullPage:true});}
 await page.evaluate(async()=>{const {PlanuiRepositories}=await import('/src/storage/repositories.ts');await new PlanuiRepositories().updateSettingsPatch({theme:'dark',reducedTransparencyOverride:true,reducedMotionOverride:true},new Date().toISOString());});
 await page.reload();await page.getByTestId('mobile-floating-capsule').waitFor();
 assert.equal(await page.getByTestId('mobile-floating-capsule').evaluate(node=>getComputedStyle(node).backdropFilter),'none');
 await page.screenshot({path:`${out}/dark-solid.png`});
 await page.getByTestId('mobile-global-create-button').click();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='create-task-title-input');
 await page.keyboard.press('Shift+Tab');
 assert.equal(await page.getByRole('dialog').evaluate(node=>node.contains(document.activeElement)),true);
 await page.getByTestId('modal-close-button').click();
 await page.goto(`${base}/#/today`);
 await page.getByTestId('mobile-floating-capsule').waitFor();
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const frames=await page.evaluate(async()=>{const samples=[];let previous=performance.now();for(let i=0;i<60;i++){await new Promise(resolve=>requestAnimationFrame(resolve));const now=performance.now();samples.push(now-previous);previous=now;window.scrollBy(0,12);}return samples;});
 console.log('4x CPU scroll smoke (emulation, not a physical phone):',JSON.stringify({frames:frames.length,medianMs:[...frames].sort((a,b)=>a-b)[30],maxMs:Math.max(...frames)}));
 assert.equal(await page.getByTestId('mobile-floating-capsule').getAttribute('data-collapsed'),'true');
 assert.equal(await page.getByTestId('mobile-global-create-button').isVisible(),true);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
 assert.deepEqual(errors,[]);
 console.log('PASS: triage scope/checklist/pause, deadline preservation, disabled modules, tabs, calendar modes, focus, dark/solid accessibility. Screenshots:',out);
} finally {await browser.close();}
