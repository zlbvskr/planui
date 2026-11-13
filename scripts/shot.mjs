import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

// Reuse a local installation or tools installed outside the project.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.PLANUI_QA_TOOLS || path.join(os.tmpdir(), 'planui-qa-tools'), 'package.json'))('playwright'); }

export async function createSession() {
  const browser = await playwright.chromium.launch({ channel: process.env.PLANUI_BROWSER || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
  const page = await context.newPage();
  if (process.env.PLANUI_QA_NOW) await page.clock.setFixedTime(new Date(process.env.PLANUI_QA_NOW));
  const base = process.env.PLANUI_URL || 'http://127.0.0.1:3000/';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
  });
  await context.addInitScript(() => localStorage.setItem('planui_onboarding_completed', '1'));
  await page.goto(base);
  // Only this disposable context is seeded. Never use the user's browser profile.
  await page.evaluate(async () => {
    const { PlanuiRepositories } = await import('/src/storage/repositories.ts');
    const { loadDemoData } = await import('/src/demo/index.ts');
    await loadDemoData(new PlanuiRepositories(), 'Europe/Kyiv');
  });
  await page.reload();
  return { browser, page, base, errors };
}

export async function openScreen({ page, base }, screen) {
  await page.goto(`${base}#/${screen.startsWith('today') || screen === 'add' || screen.startsWith('add-today') ? 'today' : 'directions'}`);
  await page.reload();
  if (screen === 'today') return;
  if (['add-task','add-habit','add-event','add-shift','add-project'].includes(screen)) {
    if (screen !== 'add-project') await page.getByTestId('nav-tab-today').click();
    await page.getByTestId('nav-create-Action').click();
    await page.getByTestId('creation-type-pill-' + screen.slice(4)).click();
    return;
  }
  if (screen === 'calendar-month' || screen === 'calendar-week') {
    await page.getByTestId('dock-calendar-button').click();
    if (screen === 'calendar-week') await page.getByTestId('dock-context-week').click();
    return;
  }
  if (['review-step','area-detail','statistics'].includes(screen)) {
    await page.getByTestId('nav-tab-me').click();
    if (screen === 'statistics') await page.getByTestId('dock-context-records').click();
    if (screen === 'review-step') await page.getByRole('button',{name:'Огляд',exact:true}).click();
    if (screen === 'area-detail') await page.locator('.sphere-balance-wheel [role="button"]').first().click();
    return;
  }
  if (screen === 'wishlist' || screen === 'settings') { await page.getByTestId('nav-tab-me').click(); await page.getByTestId(`dock-context-${screen}`).click(); return; }
  if (screen === 'me-areas') { await page.getByTestId('nav-tab-me').click(); return; }
  if (screen === 'today-day') { await page.getByTestId('dock-context-day').click(); return; }
  if (screen === 'today-tasks' || screen === 'today-habits') {
    await page.getByTestId(`dock-context-${screen === 'today-tasks' ? 'tasks' : 'habits'}`).click();
    return;
  }
  if (screen.startsWith('add-today')) {
    await page.getByTestId('dock-context-day').click();
    await page.getByTestId('nav-create-Action').click();
    const type = screen.endsWith('-habit') ? 'habit' : screen.endsWith('-event') ? 'event' : 'task';
    await page.getByTestId(`creation-type-pill-${type}`).click();
    await page.getByTestId('create-task-title-input').fill(screen === 'add-today-hint' ? 'Читати завтра о 18:00 20 хв' : 'Підготувати план на завтра');
    return;
  }
  if (screen === 'add-calendar') {
    await page.getByTestId('dock-calendar-button').click();
    await page.locator('.calendar-month-cell[data-adjacent="false"][data-today="false"]').last().click();
    await page.getByTestId('nav-create-Action').click();
    await page.getByTestId('create-task-title-input').fill('Зустріч у вибраний день');
    return;
  }
  if (screen === 'add-wish') {
    await page.getByTestId('nav-tab-me').click();
    await page.getByTestId('dock-context-wishlist').click();
    await page.getByTestId('nav-create-Action').click();
    await page.getByTestId('create-task-title-input').fill('Книжка для нових ідей');
    return;
  }
  if (screen === 'add') { await page.getByTestId('nav-create-Action').click(); return; }
  if (screen === 'goals' || screen === 'goal-detail') {
    await page.getByTestId('dock-context-goals').click();
    if (screen === 'goal-detail') await page.getByText('Захистити курсову', { exact: true }).first().click();
    return;
  }
  if (screen === 'project-detail') {
    await page.getByText('Подорож додому', { exact: true }).first().click();
  }
}

const screens = ['add-task','add-habit','add-event','add-shift','add-project','wishlist','settings','calendar-month','calendar-week','review-step','area-detail','statistics','add-today-hint', 'add-today-habit', 'add-today-event', 'add-calendar', 'add-wish', 'me-areas', 'today-day', 'today-tasks', 'today-habits', 'add-today', 'today', 'add', 'projects', 'project-detail', 'goals', 'goal-detail'];
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const requested = process.argv.slice(2);
  if (!requested.length || requested.some(screen => !screens.includes(screen))) throw new Error(`Вкажіть екрани: ${screens.join(', ')}`);
  const output = process.env.PLANUI_QA_OUTPUT || 'qa';
  await fs.mkdir(output, { recursive: true });
  const session = await createSession();
  const evidence = [];
  try {
    for (const screen of requested) {
      await openScreen(session, screen);
      if (screen === 'today-day') await session.page.mouse.click(8, 18);
      await session.page.waitForTimeout(450);
      await session.page.screenshot({ path: `${output}/390-${screen}.png`, animations: 'disabled' });
      if (screen === 'add-today-hint') {
        const hint = session.page.getByTestId('smart-parse-hint');
        const title = session.page.getByTestId('create-task-title-input');
        const time = session.page.getByTestId('chip-time');
        if (await hint.count() !== 1 || await hint.getAttribute('aria-pressed') !== 'false') throw new Error('Expected a single unapplied suggestion');
        if ((await time.innerText()).includes('18:00')) throw new Error('Time applied automatically');
        await hint.click();
        if (await title.inputValue() !== 'Читати' || !(await time.innerText()).includes('18:00') || !(await session.page.getByTestId('chip-duration').innerText()).includes('20')) throw new Error('Suggestion did not apply');
        await hint.click();
        if (await title.inputValue() !== 'Читати завтра о 18:00 20 хв' || (await time.innerText()).includes('18:00')) throw new Error('Suggestion did not undo');
        const suggestions = session.page.locator('.create-sphere-suggestions .ui-pill');
        if (await suggestions.count() !== 3 || await session.page.locator('.create-sphere-reason').count() !== 3) throw new Error('Expected three explained recommendations');
        await session.page.getByRole('button', {name:'Не зараз', exact:true}).click();
        await session.page.getByRole('button', {name:'Усі', exact:true}).click();
        const picker = session.page.getByTestId('inline-panel-area');
        if (await picker.locator('[data-testid^="area-orb-option-"]').count() !== 10) throw new Error('Expected ten areas');
        const columns = await picker.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        if (columns !== 2) throw new Error('Expected two columns');
        await picker.locator('[data-testid^="area-orb-option-"]').last().click();
        await session.page.getByTestId('chip-area').click();
        await session.page.getByRole('button', {name:'Без сфери', exact:true}).click();
        if (await suggestions.count() !== 0) throw new Error('Dismissed recommendations repeated');
        await title.fill('Купити 3 кг яблук');
        if (await hint.count()) throw new Error('False positive shown');
      }
      if (screen === 'today-day') {
        if (!await session.page.locator('.today-brief img[src*="hero-target"]').count()) throw new Error('Missing day focus art');
        for (let week=0;week<12;week++) await session.page.getByTestId('week-strip-next-week').click();
        await session.page.locator('[data-testid^="week-strip-day-"]').first().click();
        const cue=session.page.getByTestId('timeline-empty-cue');
        await cue.first().waitFor({state:'attached'});
        if (!await cue.first().locator('img[src*="hero-moon"]').count()) throw new Error('Missing empty timeline art');
      }
      if (screen === 'today-habits') {
        if (!await session.page.locator('.habit-streak-summary img[src*="hero-medal"]').count()) throw new Error('Missing series medal');
        const rows=session.page.locator('.habit-row');
        for (const row of await rows.all()) if (await row.locator('.habit-bead').count()!==7) throw new Error('Expected seven history beads');
      }
      if (screen === 'today-tasks' || screen === 'today-habits') {
        const root=session.page.getByTestId(screen==='today-tasks'?'today-tasks-mode':'destination-view-habits');
        const last=root.locator(screen==='today-tasks'?'.ui-soft-row':'.habit-row').last();
        await last.scrollIntoViewIfNeeded();
        await session.page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
        const bounds=await last.boundingBox(), dock=await session.page.getByTestId('dock-contextual-bar').boundingBox();
        if (bounds && dock && bounds.y+bounds.height>dock.y) throw new Error('Last row is covered by dock');
      }
      if (screen === 'calendar-month' || screen === 'calendar-week') {
        const capsules=session.page.locator(screen==='calendar-month'?'.calendar-mini-bar':'.calendar-week-all-day-pill,[data-ui="week-block"]');
        if ((await capsules.allInnerTexts()).some(text=>text.trim())) throw new Error('Capsules still contain cut labels');
        const selected=session.page.locator(screen==='calendar-month'?'.calendar-month-cell[data-selected="true"]':'.calendar-week-head-btn[data-selected="true"]');
        if (await selected.count()!==1) throw new Error('Expected one selected calendar tile');
        const destination=session.page.locator(screen==='calendar-month'?'.calendar-month-cell[data-adjacent="false"][data-selected="false"]':'.calendar-week-head-btn[data-selected="false"]').first();
        const destinationDate=await destination.getAttribute('data-calendar-date');
        await destination.click();
        if (await session.page.locator(`[data-calendar-date="${destinationDate}"][data-selected="true"]`).count()!==1) throw new Error('Calendar date selection failed');
        await session.page.locator('.calendar-agenda-container').waitFor();
      }
      if (screen === 'review-step') {
        await session.page.getByRole('slider',{name:'Задоволеність'}).focus();
        await session.page.keyboard.press('ArrowRight');
        await session.page.getByLabel('Нотатка',{exact:true}).fill('QA: зберегти ранкові прогулянки');
        for (let i=0;i<10;i++) await session.page.getByRole('button',{name:'Далі',exact:true}).click();
        await session.page.getByTestId('review-finish').waitFor();
        while (await session.page.locator('.sphere-review-finish [aria-pressed="true"]').count()) await session.page.locator('.sphere-review-finish [aria-pressed="true"]').first().click();
        if (!await session.page.getByRole('button',{name:'Зберегти Огляд',exact:true}).isDisabled()) throw new Error('Review accepted zero focuses');
        await session.page.locator('.sphere-review-finish [aria-pressed]').first().click();
        await session.page.getByRole('button',{name:'Зберегти Огляд',exact:true}).click();
        await session.page.getByTestId('review-finish').waitFor({state:'hidden'});
        const saved=await session.page.evaluate(async()=>{const {PlanuiRepositories}=await import('/src/storage/repositories.ts');const repo=new PlanuiRepositories();try{return (await repo.captureCoherentSnapshot(new Date().toISOString())).snapshot.lifeAreaAssessments.sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt))[0];}finally{repo.tabSync.close();}});
        if (saved.answers.length!==10 || saved.answers[0].score!==7 || saved.answers[0].usefulChangeUk!=='QA: зберегти ранкові прогулянки' || saved.answers.filter(a=>a.attentionNow).length!==1) throw new Error('Review score/note/focus did not persist');
      }
      if (screen === 'area-detail') {
        await session.page.getByRole('button',{name:'Оновити оцінку',exact:true}).click();
        await session.page.getByRole('slider',{name:'Задоволеність'}).waitFor();
        await session.page.keyboard.press('Escape');
        if (!await session.page.getByTestId('area-detail').isVisible()) throw new Error('Closing editor popped area detail');
        const log=session.page.getByTestId('measure-log-plus-1').first();
        if (await log.count()) {
          const before=await session.page.evaluate(async()=>{const {PlanuiRepositories}=await import('/src/storage/repositories.ts');const {resolveItemAreaId}=await import('/src/domain/modelHelpers.ts');const repo=new PlanuiRepositories();try{const snapshot=(await repo.captureCoherentSnapshot(new Date().toISOString())).snapshot;const area=snapshot.lifeAreaQuestions.find(a=>a.questionTextUk===document.querySelector('.sphere-detail h1').textContent);const e=[...snapshot.tasks,...snapshot.habits,...snapshot.projects,...snapshot.goals,...snapshot.wishes].find(e=>e.measure && resolveItemAreaId(e,snapshot)===area.id);return {id:e.id,current:e.measure.current};}finally{repo.tabSync.close();}});
          await log.click();
          await session.page.waitForFunction(async previous=>{const {PlanuiRepositories}=await import('/src/storage/repositories.ts');const repo=new PlanuiRepositories();try{const s=(await repo.captureCoherentSnapshot(new Date().toISOString())).snapshot;const e=[...s.tasks,...s.habits,...s.projects,...s.goals,...s.wishes].find(e=>e.id===previous.id);return e.measure.current===previous.current+1;}finally{repo.tabSync.close();}},before);
        }
        await session.page.goBack();
        await session.page.getByTestId('area-detail').waitFor({state:'hidden'});
        await session.page.locator('.sphere-balance-wheel [role="button"]').first().click();
        await session.page.getByRole('button',{name:'Додати крок у цю сферу',exact:true}).click();
        await session.page.getByTestId('create-task-title-input').waitFor();
        if (!(await session.page.getByTestId('chip-area').innerText()).includes('Фізичне здоров')) throw new Error('Creation lost inherited area');
        await session.page.keyboard.press('Escape');
      }
      if (screen === 'statistics') {
        if (await session.page.locator('.sphere-heat-cell').count()!==120) throw new Error('Expected 10 by 12 heatmap');
        await session.page.locator('.sphere-heatmap [role="rowheader"]').first().click();
        await session.page.getByTestId('area-detail').waitFor();
        await session.page.getByRole('button',{name:'‹ Назад до сфер',exact:true}).click();
        if (!await session.page.getByTestId('statistics').isVisible()) throw new Error('Did not return to statistics');
      }
      if (screen === 'me-areas') {
        if (await session.page.locator('.sphere-balance-wheel [role="button"]').count() !== 10 || await session.page.locator('.sphere-score-bar').count() !== 10) throw new Error('Expected ten wheel petals and score bars');
        await session.page.locator('.sphere-balance-wheel [role="button"]').first().press('Enter');
        await session.page.getByTestId('area-detail').waitFor();
        await session.page.getByRole('button',{name:'‹ Назад до сфер',exact:true}).click();
      }
      if (screen === 'today-day' || screen === 'today-tasks') {
        if (await session.page.locator('.sphere-heat-hit').count() !== 10) throw new Error('Expected ten score beads');
        if (screen === 'today-tasks' && await session.page.locator('.sphere-step-marker').count() === 0) throw new Error('Expected a weak/focus area task marker');
        await session.page.locator('.sphere-heat-hit').first().click();
        await session.page.getByTestId('area-detail').waitFor();
        await session.page.getByRole('button',{name:'‹ Назад до сфер',exact:true}).click();
        await session.page.getByTestId('nav-tab-today').click();
        const reminder = session.page.getByTestId('sphere-review-reminder');
        if (await reminder.count()) {
          await reminder.click();
          await session.page.getByText('Огляд сфер життя', {exact:true}).waitFor();
          await session.page.keyboard.press('Escape');
        }
      }
      let submitStates;
      if (screen.startsWith('add-today')) {
        const button = session.page.getByTestId('shared-editor-submit-button');
        const inspect = () => button.evaluate(el => {const c = getComputedStyle(el); return {disabled:el.disabled,background:c.backgroundImage,color:c.color,fontSize:c.fontSize,opacity:c.opacity,shadow:c.boxShadow};});
        const enabled = await inspect();
        await session.page.getByTestId('create-task-title-input').fill('');
        const disabled = await inspect();
        submitStates = {enabled, disabled};
      }
      const controls = await session.page.locator('button').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => { const r = el.getBoundingClientRect(); return { text: el.innerText || el.getAttribute('aria-label'), width: r.width, height: r.height }; }));
      evidence.push({ screen, submitStates, errors: [...session.errors], overflow: await session.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), controls });
    }
    if (evidence.some(item => item.errors.length || item.overflow)) throw new Error('Помилка виконання або горизонтальне переповнення');
    await fs.writeFile(`${output}/manifest.json`, JSON.stringify(evidence, null, 2));
  } finally { await session.browser.close(); }
}

