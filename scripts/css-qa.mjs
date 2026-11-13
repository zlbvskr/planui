import fs from 'node:fs/promises';
import { createSession, openScreen } from './shot.mjs';

// The same clock and completed animations keep CSS comparisons independent of capture time.
process.env.PLANUI_QA_NOW ||= '2026-11-13T10:00:00+02:00';
const output = process.argv[2];
if (!output) throw new Error('Вкажіть каталог знімків');
const screens = ['today-day', 'today-tasks', 'today-habits', 'calendar-month', 'calendar-week', 'projects', 'project-detail', 'goals', 'me-areas', 'statistics', 'wishlist', 'settings', 'add-today', 'review-step', 'area-detail'];
await fs.mkdir(output, { recursive: true });
const session = await createSession();
if (process.argv.includes('--reduced')) await session.page.emulateMedia({ reducedMotion: 'reduce' });
const evidence = [];
try {
  for (const screen of screens) {
    await openScreen(session, screen);
    if (process.argv.includes('--original')) {
      await session.page.locator('style').evaluateAll(styles => styles.forEach(style => style.remove()));
      for (const file of ['spheres', 'create', 'onboarding', 'index', 'candy-glass', 'today-materials', 'dock-materials', 'workspace-layout', 'layout-adjustments']) {
        await session.page.addStyleTag({ url: `${session.base}qa/c3-source/${file}.css?direct` });
      }
    }
    if (screen === 'today-day') await session.page.mouse.click(8, 18);
    await session.page.waitForTimeout(450);
    if (process.argv.includes('--dark')) {
      await session.page.evaluate(() => document.documentElement.classList.add('dark'));
      await session.page.waitForTimeout(450);
    }
    await session.page.screenshot({ path: `${output}/390-${screen}.png`, animations: 'disabled' });
    const styles = await session.page.evaluate(() => {
      const properties = ['background', 'color', 'border', 'border-radius', 'box-shadow', 'display', 'position', 'width', 'height', 'min-width', 'min-height', 'padding', 'margin', 'gap', 'font-size', 'font-weight', 'line-height', 'opacity', 'outline', 'overflow', 'grid-template-columns', 'align-items', 'justify-content', 'backdrop-filter'];
      return [...document.querySelectorAll('body *')].map(el => ({
        tag: el.tagName, classes: el.getAttribute('class'), inline: el.getAttribute('style'),
        styles: Object.fromEntries(properties.map(p => [p, getComputedStyle(el).getPropertyValue(p)])),
      }));
    });
    await fs.writeFile(`${output}/${screen}.json`, JSON.stringify(styles));
    evidence.push({ screen, errors: [...session.errors], overflow: await session.page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
  }
  await fs.writeFile(`${output}/manifest.json`, JSON.stringify(evidence, null, 2));
  if (evidence.some(item => item.errors.length || item.overflow)) throw new Error('Помилка виконання або горизонтальне переповнення');
} finally {
  await session.browser.close();
}
