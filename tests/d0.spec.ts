import assert from 'node:assert/strict';
import {startUiRuntime,UI_CONTEXT,loadAxe} from './ui-runtime';
import {inspectUiHygiene} from './ui-hygiene.spec';
const runtime=await startUiRuntime();
const foundationRules=new Set(['viewport-meta','root-touch-action','gesture-zoom','focus-zoom','emoji-icon','sheet-text-dismiss','sheet-primary-width','toast-flow','unset-slider-fill','page-overflow','right-edge']);
try {
 for(const theme of ['dark','light'] as const)for(const scale of [100,125]) {
  const context=await runtime.browser.newContext({...UI_CONTEXT,colorScheme:theme});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({theme})=>{localStorage.setItem('planui_theme_bootstrap',theme);(globalThis as any).__name=(v:any)=>v;},{theme});
  await page.goto(runtime.url+'/dev/gallery');await page.getByRole('heading',{name:'Компоненти',exact:true}).waitFor();
  await page.evaluate(scale=>document.documentElement.style.setProperty('--text-scale',`${scale}%`),scale);
  let findings=(await page.evaluate(inspectUiHygiene)).filter(f=>foundationRules.has(f.rule));assert.deepEqual(findings,[],`${theme} ${scale}: ${JSON.stringify(findings)}`);
  const slider=page.getByRole('slider',{name:'Без відповіді'});assert.equal(await slider.locator('..').getAttribute('data-unset'),'true');
  await slider.scrollIntoViewIfNeeded();const box=(await slider.boundingBox())!;await page.mouse.move(box.x+box.width*.25,box.y+box.height/2);await page.mouse.down();assert.match(await page.locator('.ui-slider-bubble').innerText(),/^[23]$/);await page.mouse.up();assert.equal(await slider.locator('..').getAttribute('data-unset'),'false');
  await page.getByRole('button',{name:'Дії: Без відповіді'}).click();await page.getByRole('menuitem',{name:'Скинути'}).click();
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);await page.screenshot({path:`${runtime.out}/gallery-${theme}-${scale}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Відкрити аркуш',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Нова справа'});await dialog.waitFor();
  assert.match(await dialog.evaluate(e=>getComputedStyle(e).backdropFilter),/blur\(28px\)/);
  assert.ok(await dialog.evaluate(e=>e.getBoundingClientRect().height<=innerHeight*.92+1));
  findings=(await page.evaluate(inspectUiHygiene)).filter(f=>foundationRules.has(f.rule));assert.deepEqual(findings,[]);
  await page.screenshot({path:`${runtime.out}/sheet-${theme}-${scale}.png`,animations:'disabled'});
  await page.evaluate(()=>document.documentElement.setAttribute('data-reduced-transparency','true'));
  assert.equal(await dialog.evaluate(e=>getComputedStyle(e).backdropFilter),'none');
  await page.evaluate(()=>document.documentElement.removeAttribute('data-reduced-transparency'));
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Показати повідомлення'}).click();const toast=page.locator('[data-ui="toast"]');await toast.waitFor();assert.equal(await toast.evaluate(e=>getComputedStyle(e).position),'fixed');
  await page.screenshot({path:`${runtime.out}/toast-${theme}-${scale}.png`,animations:'disabled'});
  const tb=(await toast.boundingBox())!;await page.mouse.move(tb.x+tb.width/2,tb.y+10);await page.mouse.down();await page.mouse.move(tb.x+tb.width/2,tb.y+70);await page.mouse.up();await toast.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Показати повідомлення'}).click();await toast.waitFor();await toast.waitFor({state:'hidden',timeout:4500});
  await loadAxe(page);const violations=await page.evaluate(async()=>{const {violations}=await (window as any).axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return violations.filter((v:any)=>['serious','critical'].includes(v.impact));});assert.deepEqual(violations,[]);
  assert.deepEqual(errors,[]);console.log(`PASS D0 gallery ${theme} ${scale}%: gestures, layout, fields, slider, sheet, toast and axe`);await context.close();
 }
} finally {await runtime.close();}
