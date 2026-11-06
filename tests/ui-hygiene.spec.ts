import { writeFile } from 'node:fs/promises';
import type { Page } from 'playwright';
import { startUiRuntime, installUiFixture, loadAxe, UI_CONTEXT } from './ui-runtime';

/** Covers every screen, sheet and sub-screen across Today, Calendar, Directions and Me. */
export const ROUTES = [
  ...(['hub','areas','area-sheet','areas-review','planning','state','state-sleep','inspiration','inspiration-sheet','wishlist','wishlist-add','wishlist-categories','settings','settings-backup','settings-reset'] as const).map(me=>({id:`me-${me}`,path:'/#/me',mode:'Я',me} as const)),
  {id:'today-day',path:'/#/today',mode:'День',position:'now'},
  {id:'today-day-midnight',path:'/#/today',mode:'День',position:'midnight'},
  {id:'today-tasks',path:'/#/today',mode:'Завдання'},
  {id:'today-habits',path:'/#/today',mode:'Звички'},
  {id:'quick-task',path:'/#/today',mode:'Завдання',overlay:'task'},
  {id:'quick-event',path:'/#/today',mode:'Завдання',overlay:'event'},
  {id:'quick-habit',path:'/#/today',mode:'Звички',overlay:'habit'},
  {id:'triage',path:'/#/today',mode:'Завдання',overlay:'triage'},
  {id:'weekly',path:'/#/today',mode:'Завдання',overlay:'weekly'},
  ...([1,2,3] as const).map(step=>({id:`weekly-step-${step+1}`,path:'/#/today',mode:'Завдання',overlay:'weekly',step} as const)),
  ...(['root','folder','goal','project','roadmap','goal-roadmap','filters'] as const).map(screen=>({id:`directions-${screen}`,path:'/#/plans',mode:'Напрями',directions:screen} as const)),
  {id:'calendar-month',path:'/#/calendar',mode:'Місяць'},
  {id:'calendar-week',path:'/#/calendar',mode:'Тиждень'},
  {id:'calendar-day',path:'/#/calendar',mode:'День'},
  {id:'calendar-roster',path:'/#/calendar',mode:'Графік'},
  {id:'calendar-stamp',path:'/#/calendar',mode:'Місяць',stamp:'stamp'},
  {id:'calendar-templates',path:'/#/calendar',mode:'Місяць',stamp:'templates'},
] as const;
export type RouteSpec = (typeof ROUTES)[number];
type Finding={rule:string;target:string;detail:string};

/** Exported so rule behavior can be tested independently of today's baseline. */
export function inspectUiHygiene():Finding[] {
  const findings:Finding[]=[];const width=innerWidth;
  const target=(e:Element)=>e.getAttribute('data-testid')||e.id||`${e.tagName.toLowerCase()}${e.className&&typeof e.className==='string'?'.'+e.className.split(' ').filter(Boolean).slice(0,2).join('.'):''}`;
  const add=(rule:string,e:Element,detail:string)=>findings.push({rule,target:target(e),detail});
  const rendered=(e:Element)=>{const rect=e.getBoundingClientRect();if(!rect.width||(!rect.height&&!e.matches('[data-ui="content-start"]')))return false;if(e.classList.contains('sr-only')&&document.activeElement!==e)return false;for(let a:Element|null=e;a;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;if(a.tagName==='DETAILS'&&!a.hasAttribute('open')&&a!==e&&!a.querySelector('summary')?.contains(e))return false;}return true;};
  const meta=document.querySelector('meta[name="viewport"]');
  for(const token of ['width=device-width','initial-scale=1','minimum-scale=1','maximum-scale=1','user-scalable=no','viewport-fit=cover'])if(!meta?.getAttribute('content')?.split(',').map(v=>v.trim()).includes(token))add('viewport-meta',document.documentElement,token);
  const root=document.getElementById('root');
  if(root&&getComputedStyle(root).touchAction!=='pan-x pan-y')add('root-touch-action',root,getComputedStyle(root).touchAction);
  const gesture=new Event('gesturestart',{cancelable:true,bubbles:true});document.dispatchEvent(gesture);
  if(!gesture.defaultPrevented)add('gesture-zoom',document.documentElement,'gesturestart was not cancelled');
  for(const input of document.querySelectorAll('input,textarea,select'))if(parseFloat(getComputedStyle(input).fontSize)<16)add('focus-zoom',input,getComputedStyle(input).fontSize);
  for(const toast of document.querySelectorAll('[data-ui="toast"]'))if(getComputedStyle(toast).position!=='fixed')add('toast-flow',toast,'Toast must float');
  for(const slider of document.querySelectorAll('.ui-slider[data-unset="true"]'))if(getComputedStyle(slider).getPropertyValue('--slider-fill').trim()!=='0%')add('unset-slider-fill',slider,'Unset track must have zero fill');
  for(const sheet of document.querySelectorAll('[data-ui="sheet"]')) {
    for(const button of sheet.querySelectorAll('button'))if(['Закрити','Скасувати'].includes(button.textContent?.trim()??''))add('sheet-text-dismiss',button,button.textContent??'');
    for(const button of sheet.querySelectorAll('.ui-primary,[data-variant="primary"]'))if(rendered(button)&&button.parentElement&&button.getBoundingClientRect().width<button.parentElement.clientWidth-parseFloat(getComputedStyle(button.parentElement).paddingLeft)-parseFloat(getComputedStyle(button.parentElement).paddingRight)-2)add('sheet-primary-width',button,'Primary must fill its container');
  }
  const pillRow=(e:Element)=>e.closest('[data-ui="pill-row"],.ui-pill-row,.quick-options,.ui-topbar-actions');
  if(document.documentElement.scrollWidth>width+1)add('page-overflow',document.documentElement,`${document.documentElement.scrollWidth} > ${width}`);
  const headings=Array.from(document.querySelectorAll('h1')).filter(rendered);
  if(headings.length!==1)add('h1',document.body,`Expected one h1, found ${headings.length}`);
  const settings=location.hash.includes('settings');
  for(const e of Array.from(document.body.querySelectorAll('*')).filter(rendered)){
    const rect=e.getBoundingClientRect();
    // Horizontal scroll is reserved for explicitly designated pill rows.
    if(rect.right>width+1&&!pillRow(e))add('right-edge',e,`${rect.right.toFixed(1)} > ${width}`);
    if(getComputedStyle(e).textTransform==='uppercase')add('uppercase',e,'Computed text-transform: uppercase');
    const ownText=Array.from(e.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim();
    if(ownText){
      if(/\p{Extended_Pictographic}/u.test(ownText)&&!e.closest('[data-user-content],.user-content,input,textarea,blockquote'))add('emoji-icon',e,ownText);
      if(/\d{4}-\d{2}-\d{2}/.test(ownText))add('iso-date',e,ownText);
      if(!settings&&ownText.includes('Europe/Kyiv'))add('timezone',e,ownText);
      if(/\(0\)\s*$/.test(ownText))add('zero-counter',e,ownText);
      if(/[▶▼]/.test(ownText))add('text-triangle',e,ownText);
    }
    const tag=e.tagName.toLowerCase();
    if((tag==='select'||(tag==='input'&&['date','time','checkbox'].includes((e as HTMLInputElement).type)))&&e.getAttribute('data-ui')!=='native-overlay')add('native-control',e,tag==='input'?(e as HTMLInputElement).type:tag);
    const text=(e as HTMLElement).innerText?.replace(/\s+/g,' ').trim()??'';
    const block=/^(P|LI|LABEL|SUMMARY|BUTTON|H[1-6])$/.test(e.tagName)||(!Array.from(e.children).some(c=>/^(DIV|P|LI|UL|SECTION|ARTICLE|HEADER|FOOTER|FORM)$/.test(c.tagName))&&Boolean(ownText));
    if(block&&text.length>140&&!e.closest('[data-ui="info-sheet"]'))add('long-text',e,`${text.length} characters: ${text.slice(0,160)}`);
    if(e.matches('button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[role="switch"]')&&!e.hasAttribute('disabled')&&e.getAttribute('data-ui')!=='native-overlay'&&(rect.width<43.5||rect.height<43.5))add('small-target',e,`${rect.width.toFixed(1)}×${rect.height.toFixed(1)}`);
    if(e.matches('[data-ui="group"],.ui-surface')&&e.parentElement?.closest('[data-ui="group"],.ui-surface'))add('nested-group',e,'A group container is nested inside another group');
  }
  const rootFontSize=parseFloat(getComputedStyle(document.documentElement).fontSize)||17;
  const content=Array.from(document.querySelectorAll('[data-ui="content-start"]')).find(rendered);
  if(!content)add('content-start',document.body,'Missing content-start marker');
  else if(rootFontSize<=20&&content.getBoundingClientRect().top>320)add('content-start',content,`${content.getBoundingClientRect().top.toFixed(1)} > 320`);
  return findings;
}

export async function navigateToRoute(page: Page, baseUrl: string, route: RouteSpec, variant: 'filled' | 'empty') {
  if(page.url().includes('#')){await page.keyboard.press('Escape');await page.goto(baseUrl+'/#/me');await page.evaluate(()=>window.dispatchEvent(new HashChangeEvent('hashchange')));await page.goto(baseUrl+(route.path==='/#/calendar'?'/#/today':'/#/calendar'));}
  await page.goto(baseUrl+route.path);
  await page.getByTestId(route.path.includes('plans')?'destination-view-plans':route.path.includes('calendar')?'destination-view-calendar':route.path.includes('me')?'destination-view-me':'destination-view-today').waitFor();await page.waitForTimeout(100);
  if(!('directions' in route)&&!('me' in route))await page.getByRole('button',{name:route.mode,exact:true}).click();await page.waitForTimeout(100);
  await page.evaluate(()=>{scrollTo(0,0);document.getAnimations().forEach(a=>{try{a.finish();}catch{}});});
  if('me' in route){
    if(['areas','area-sheet','areas-review'].includes(route.me))await page.getByTestId('me-drilldown-life-areas').click();
    if(route.me==='area-sheet')await page.locator('.area-list-row').first().click();
    if(route.me==='areas-review')await page.getByRole('button',{name:'Огляд сфер',exact:true}).click();
    if(route.me==='planning')await page.getByRole('button',{name:'Короткий огляд планування',exact:true}).click();
    if(['state','state-sleep'].includes(route.me)){
      await page.goto(baseUrl+'/#/records');
      if(route.me==='state-sleep'){await page.waitForTimeout(80);await page.getByRole('button',{name:'Сон',exact:true}).click();}
    }
    if(['inspiration','inspiration-sheet'].includes(route.me)){
      await page.getByTestId('me-drilldown-inspiration').click();
      if(route.me==='inspiration-sheet'){
        if(variant==='filled')await page.locator('[data-testid^="open-inspiration-detail-"]').first().click();
        else await page.getByTestId('open-inspiration-modal-button').click();
      }
    }
    if(['wishlist','wishlist-add','wishlist-categories'].includes(route.me)){
      await page.getByTestId('me-drilldown-wishlist').click();
      if(route.me==='wishlist-add')await page.getByTestId('open-add-wish-button').click();
      if(route.me==='wishlist-categories'){
        await page.getByTestId('wishlist-header-menu').click();
        await page.getByRole('menuitem',{name:'Керувати категоріями',exact:true}).click();
      }
    }
    if(['settings','settings-backup','settings-reset'].includes(route.me)){
      await page.getByTestId('me-drilldown-settings').click();
      if(route.me==='settings-backup')await page.getByTestId('open-backup-sheet-button').click();
      if(route.me==='settings-reset')await page.getByTestId('open-reset-confirm-button').click();
    }
    await page.waitForTimeout(100);
  }
  if('directions' in route){
    if(['folder','goal','goal-roadmap'].includes(route.directions)&&variant==='filled')await page.getByRole('button',{name:'Перехід на іншу роботу',exact:true}).click();
    if(['goal','goal-roadmap'].includes(route.directions)&&variant==='filled')await page.locator('.ui-disclosure').filter({hasText:'Перехід на іншу роботу'}).click();
    if(route.directions==='project'&&variant==='filled'){await page.getByRole('button',{name:'Творчість',exact:true}).click();await page.locator('.ui-disclosure').filter({hasText:'Альбом із другом'}).click();}
    if(route.directions==='roadmap')await page.getByRole('button',{name:'Глобальна дорожня карта',exact:true}).click();
    if(route.directions==='goal-roadmap')await page.getByRole('button',{name:variant==='filled'?'Дорожня карта':'Глобальна дорожня карта',exact:true}).click();
    if(route.directions==='filters')await page.getByRole('button',{name:/^Фільтри/}).click();
  }
  if('position' in route && route.position==='midnight') {
    await page.evaluate(()=>{const el=document.querySelector<HTMLElement>('.continuous-time-scroll')!;const day=el.querySelector<HTMLElement>('[data-date="2026-11-06"]')!;el.scrollTop+=day.getBoundingClientRect().top-el.getBoundingClientRect().top+day.offsetHeight-140;});
    await page.waitForTimeout(100);
  }
  if('stamp' in route){await page.getByRole('button',{name:'Штамп змін',exact:true}).click();if(route.stamp==='templates')await page.getByRole('dialog').last().getByRole('button',{name:'Шаблони',exact:true}).click();}
  if('overlay' in route) {
    if(route.overlay==='triage') { await page.getByRole('button',{name:'Інші дії дня',exact:true}).click(); await page.getByRole('menuitem',{name:'Переглянути попередні плани',exact:true}).click(); }
    else if(route.overlay==='weekly') { await page.goto(baseUrl+'/#/me'); await page.getByRole('button',{name:'Щотижневий огляд',exact:true}).click(); if('step' in route)for(let step=0;step<route.step;step++)await page.getByRole('dialog').getByRole('button',{name:'Далі',exact:true}).click(); }
    else { await page.getByRole('button',{name:'Створити новий запис у поточному розділі',exact:true}).last().click(); if(route.overlay!=='task')await page.getByRole('button',{name:route.overlay==='event'?'Подія':'Звичка',exact:true}).click(); }
    await page.waitForTimeout(100);
  }
}

async function runWithConcurrency<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>) {
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      await worker(current);
    }
  }));
}

export async function runUiHygiene() {
  const runtime=await startUiRuntime();
  const records:{route:string;theme:string;variant:string;total:number;counts:Record<string,number>;findings:Finding[]}[]=[];
  const filteredRoutes=ROUTES.filter(route=>!process.env.UI_ROUTE_PREFIX||route.id.startsWith(process.env.UI_ROUTE_PREFIX));
  const concurrency=Number(process.env.UI_CONCURRENCY??3);
  try {
    type CaseSpec={route:RouteSpec;theme:'dark'|'light';variant:'filled'|'empty';viewport:{width:number;height:number};modeLabel:string;reducedTransparency?:boolean;moreContrast?:boolean;textZoom?:boolean;saveScreenshot?:boolean};
    const cases:CaseSpec[]=[];
    for(const theme of ['dark','light'] as const)for(const variant of ['filled','empty'] as const)for(const route of filteredRoutes){
      cases.push({route,theme,variant,viewport:UI_CONTEXT.viewport,modeLabel:theme,saveScreenshot:process.env.UI_SCREENSHOTS!=='0'});
    }
    if(process.env.UI_FULL_SWEEP==='1'){
      for(const viewport of [{width:320,height:568},{width:430,height:932}] as const){
        for(const theme of ['dark','light'] as const)for(const variant of ['filled','empty'] as const)for(const route of filteredRoutes){
          cases.push({route,theme,variant,viewport,modeLabel:`${theme}-${viewport.width}x${viewport.height}`});
        }
      }
      for(const route of filteredRoutes){
        cases.push({route,theme:'dark',variant:'filled',viewport:UI_CONTEXT.viewport,modeLabel:'dark-reduced-transparency',reducedTransparency:true});
        cases.push({route,theme:'dark',variant:'filled',viewport:UI_CONTEXT.viewport,modeLabel:'dark-contrast-more',moreContrast:true});
        cases.push({route,theme:'light',variant:'filled',viewport:UI_CONTEXT.viewport,modeLabel:'light-contrast-more',moreContrast:true});
        cases.push({route,theme:'dark',variant:'filled',viewport:UI_CONTEXT.viewport,modeLabel:'dark-zoom-200',textZoom:true});
      }
    }
    await runWithConcurrency(cases,concurrency,async(c)=>{
      const context=await runtime.browser.newContext({...UI_CONTEXT,viewport:c.viewport,colorScheme:c.theme,serviceWorkers:'block'});
      const page=await context.newPage();page.setDefaultTimeout(10000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      try {
        await installUiFixture(page,c.variant,c.theme);
        if(c.reducedTransparency)await page.addInitScript(()=>{document.documentElement.setAttribute('data-reduced-transparency','true');});
        if(c.moreContrast)await page.addInitScript(()=>{document.documentElement.setAttribute('data-contrast','more');});
        await navigateToRoute(page,runtime.url,c.route,c.variant);
        if(c.reducedTransparency)await page.evaluate(()=>document.documentElement.setAttribute('data-reduced-transparency','true'));
        if(c.moreContrast)await page.evaluate(()=>document.documentElement.setAttribute('data-contrast','more'));
        if(c.textZoom)await page.evaluate(()=>{document.documentElement.style.fontSize='34px';});
        const findings=await page.evaluate(inspectUiHygiene);
        for(const error of errors)findings.push({rule:'page-error',target:'page',detail:error});
        await loadAxe(page);
        const axeFindings=await page.evaluate(async()=>{
          const axe=(window as unknown as {axe:{run:(root:Document,options:unknown)=>Promise<{violations:{id:string;impact:string;nodes:{target:string[];failureSummary:string}[]}[]}>}}).axe;
          const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
          return result.violations.filter(v=>v.impact==='serious'||v.impact==='critical').flatMap(v=>v.nodes.map(n=>({rule:`axe:${v.id}`,target:n.target.join(' '),detail:n.failureSummary})));
        });
        findings.push(...axeFindings);
        const databases=await page.evaluate(()=>indexedDB.databases());
        if(databases.length)findings.push({rule:'fixture-storage',target:'indexedDB',detail:JSON.stringify(databases)});
        const counts:Record<string,number>={};for(const finding of findings)counts[finding.rule]=(counts[finding.rule]??0)+1;
        records.push({route:c.route.id,theme:c.modeLabel,variant:c.variant,total:findings.length,counts,findings});
        console.log(`${c.route.id} ${c.modeLabel} ${c.variant}: ${findings.length}`);
        if(c.saveScreenshot)await page.screenshot({path:`${runtime.out}/${c.route.id}-${c.theme}-${c.variant}.png`,animations:'disabled'});
      }catch(error){records.push({route:c.route.id,theme:c.modeLabel,variant:c.variant,total:1,counts:{harness:1},findings:[{rule:'harness',target:'page',detail:String(error)}]});}
      finally{await context.close();}
    });
    await writeFile(`${runtime.out}/hygiene-baseline.json`,JSON.stringify(records,null,2));
    const markdown=['| Route | Theme | Fixture | Failures | Rules |','|---|---|---|---:|---|',...records.map(r=>`| ${r.route} | ${r.theme} | ${r.variant} | ${r.total} | ${Object.entries(r.counts).map(([key,count])=>`${key}: ${count}`).join(', ')||'none'} |`)].join('\n');
    await writeFile(`${runtime.out}/hygiene-baseline.md`,markdown+'\n');
    const failures=records.reduce((n,r)=>n+r.total,0);
    console.log(`UI hygiene: ${failures} baseline failures across ${records.length} cases. Artifacts: ${runtime.out}`);
    if(failures)process.exitCode=1;
  }finally{await runtime.close();}
}
if(process.argv[1]?.endsWith('ui-hygiene.spec.ts'))await runUiHygiene();
