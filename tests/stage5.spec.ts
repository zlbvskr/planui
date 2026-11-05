import assert from 'node:assert/strict';
import {startUiRuntime,installUiFixture,UI_CONTEXT} from './ui-runtime';
import {mkdir} from 'node:fs/promises';
const runtime=await startUiRuntime();
try {
 const context=await runtime.browser.newContext({...UI_CONTEXT,serviceWorkers:'block'});
 const page=await context.newPage();await installUiFixture(page,'filled','dark');
 await page.goto(runtime.url+'/#/life_areas');await page.locator('.area-list-row').first().waitFor();
 assert.equal(await page.locator('.area-list-row').count(),10);
 const last=await page.locator('.area-list-row').last().boundingBox();assert.ok(last&&last.y+last.height<790,'Ten areas fit first viewport');
 const snapshot=()=>page.evaluate(async()=>{const path='/src/storage/repositories.ts';const {PlanuiRepositories}=await import(path);return (await new PlanuiRepositories((globalThis as any).__planuiUiFixtureEngine).captureCoherentSnapshot(new Date().toISOString())).snapshot;});
 const before=await snapshot();await page.clock.setFixedTime(new Date("2026-11-05T03:42:00.000Z"));
 await page.evaluate(async()=>{const path='/src/storage/repositories.ts';const {PlanuiRepositories}=await import(path);const repo=new PlanuiRepositories((globalThis as any).__planuiUiFixtureEngine);const s=(await repo.captureCoherentSnapshot(new Date().toISOString())).snapshot;const t=s.tasks.find((t:any)=>t.state==='open')!;await repo.saveTask({...t,state:'completed',completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()},t.revision);});
 assert.deepEqual((await snapshot()).lifeAreaAssessments,before.lifeAreaAssessments,'Completed effort never writes a satisfaction score');
 await page.locator('.area-list-row').first().click();
 assert.deepEqual((await snapshot()).lifeAreaAssessments,before.lifeAreaAssessments,'Opening and effort rollup do not change score');
 await page.getByRole('slider',{name:'Задоволеність',exact:true}).fill('7');
 assert.deepEqual((await snapshot()).lifeAreaAssessments,before.lifeAreaAssessments,'Slider draft requires explicit save');
 await page.getByRole('button',{name:'Зберегти',exact:true}).click();
 assert.equal((await snapshot()).lifeAreaAssessments.length,before.lifeAreaAssessments.length+1);
 await page.clock.setFixedTime(new Date('2026-11-05T03:43:00.000Z'));await page.locator('.area-list-row').first().waitFor();await page.getByRole('button',{name:'Огляд сфер',exact:true}).click();await page.getByRole('switch',{name:'Приділити увагу зараз?',exact:true}).click();await page.getByRole('button',{name:'Зберегти огляд',exact:true}).click();
 const partial=(await snapshot()).lifeAreaAssessments.find((r:any)=>r.answers.length===10&&!before.lifeAreaAssessments.some((b:any)=>b.id===r.id))!;
 assert.equal(partial.answers.find((a:any)=>a.questionId===before.lifeAreaQuestions[0].id)?.score,7,'Focus-only review preserves the manual score');
 assert.equal(partial.answers.find((a:any)=>a.questionId===before.lifeAreaQuestions[1].id)?.score,before.lifeAreaAssessments[0].answers.find((a:any)=>a.questionId===before.lifeAreaQuestions[1].id)?.score,'Untouched areas keep their manual score in partial reviews');
 await page.goto(runtime.url+'/#/records');await page.getByRole('img',{name:'Стан за 14 днів на тлі робочих змін'}).waitFor();assert.ok(await page.locator('[data-shift-date]').count()>0,'State history overlays shifts');
 await mkdir('docs/stage5',{recursive:true});await page.screenshot({path:'docs/stage5/state-dark-filled.png'});
 await context.close();
} finally {await runtime.close();}
