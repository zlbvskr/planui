import { writeFile } from 'node:fs/promises';
import { startUiRuntime, installUiFixture, loadAxe, UI_CONTEXT } from './ui-runtime';

/** Later stages extend this list; never silently exclude a failing screen. */
export const ROUTES = [
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
] as const;
type Finding={rule:string;target:string;detail:string};

/** Exported so rule behavior can be tested independently of today's baseline. */
export function inspectUiHygiene():Finding[] {
  const findings:Finding[]=[];const width=innerWidth;
  const target=(e:Element)=>e.getAttribute('data-testid')||e.id||`${e.tagName.toLowerCase()}${e.className&&typeof e.className==='string'?'.'+e.className.split(' ').filter(Boolean).slice(0,2).join('.'):''}`;
  const add=(rule:string,e:Element,detail:string)=>findings.push({rule,target:target(e),detail});
  const rendered=(e:Element)=>{const rect=e.getBoundingClientRect();if(!rect.width||(!rect.height&&!e.matches('[data-ui="content-start"]')))return false;if(e.classList.contains('sr-only')&&document.activeElement!==e)return false;for(let a:Element|null=e;a;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;if(a.tagName==='DETAILS'&&!a.hasAttribute('open')&&a!==e&&!a.querySelector('summary')?.contains(e))return false;}return true;};
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
  const content=Array.from(document.querySelectorAll('[data-ui="content-start"]')).find(rendered);
  if(!content)add('content-start',document.body,'Missing content-start marker');
  else if(content.getBoundingClientRect().top>320)add('content-start',content,`${content.getBoundingClientRect().top.toFixed(1)} > 320`);
  return findings;
}

export async function runUiHygiene() {
  const runtime=await startUiRuntime();const records=[];
  try {
    for(const theme of ['dark','light'] as const)for(const variant of ['filled','empty'] as const)for(const route of ROUTES){
      const context=await runtime.browser.newContext({...UI_CONTEXT,colorScheme:theme,serviceWorkers:'block'});
      const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      try {
        await installUiFixture(page,variant,theme);await page.goto(runtime.url+route.path);
        await page.getByTestId('destination-view-today').waitFor();await page.waitForTimeout(100);
        await page.getByRole('button',{name:route.mode,exact:true}).click();await page.waitForTimeout(100);
        await page.evaluate(()=>{scrollTo(0,0);document.getAnimations().forEach(a=>{try{a.finish();}catch{}});});
        if('position' in route && route.position==='midnight') {
          await page.evaluate(()=>{const el=document.querySelector<HTMLElement>('.continuous-time-scroll')!;const day=el.querySelector<HTMLElement>('[data-date="2026-11-06"]')!;el.scrollTop+=day.getBoundingClientRect().top-el.getBoundingClientRect().top+day.offsetHeight-140;});
          await page.waitForTimeout(100);
        }
        if('overlay' in route) {
          if(route.overlay==='triage') { await page.getByRole('button',{name:'Інші дії дня',exact:true}).click(); await page.getByRole('menuitem',{name:'Переглянути попередні плани',exact:true}).click(); }
          else if(route.overlay==='weekly') { await page.goto(runtime.url+'/#/life_areas'); await page.getByRole('button',{name:'Щотижневий огляд · 4 кроки',exact:true}).click(); if('step' in route)for(let step=0;step<route.step;step++)await page.getByRole('dialog').getByRole('button',{name:'Далі',exact:true}).click(); }
          else { await page.getByRole('button',{name:'Створити новий запис у поточному розділі',exact:true}).last().click(); if(route.overlay!=='task')await page.getByRole('button',{name:route.overlay==='event'?'Подія':'Звичка',exact:true}).click(); }
          await page.waitForTimeout(100);
        }
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
        records.push({route:route.id,theme,variant,total:findings.length,counts,findings});
        console.log(`${route.id} ${theme} ${variant}: ${findings.length}`);
        if(process.env.UI_SCREENSHOTS!=='0')await page.screenshot({path:`${runtime.out}/${route.id}-${theme}-${variant}.png`,animations:'disabled'});
      }catch(error){records.push({route:route.id,theme,variant,total:1,counts:{harness:1},findings:[{rule:'harness',target:'page',detail:String(error)}]});}
      finally{await context.close();}
    }
    await writeFile(`${runtime.out}/hygiene-baseline.json`,JSON.stringify(records,null,2));
    const markdown=['| Route | Theme | Fixture | Failures | Rules |','|---|---|---|---:|---|',...records.map(r=>`| ${r.route} | ${r.theme} | ${r.variant} | ${r.total} | ${Object.entries(r.counts).map(([key,count])=>`${key}: ${count}`).join(', ')||'none'} |`)].join('\n');
    await writeFile(`${runtime.out}/hygiene-baseline.md`,markdown+'\n');console.log(markdown);
    const failures=records.reduce((n,r)=>n+r.total,0);
    console.log(`UI hygiene: ${failures} baseline failures across ${records.length} cases. Artifacts: ${runtime.out}`);
    if(failures)process.exitCode=1;
  }finally{await runtime.close();}
}
if(process.argv[1]?.endsWith('ui-hygiene.spec.ts'))await runUiHygiene();
