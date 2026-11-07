import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startUiRuntime, installUiFixture, UI_CONTEXT } from './ui-runtime';

const runtime = await startUiRuntime();
const out = process.env.UI_ARTIFACT_DIR ?? '/tmp/planui-d1';
await mkdir(out, { recursive: true });

try {
  // 1. WebKit 390x844 verification on /dev/gallery (primitives, press feedback, thumb, sheet drag, orb morph, toast)
  {
    const context = await runtime.browser.newContext({
      ...UI_CONTEXT,
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem('planui_theme_bootstrap', 'dark');
      (globalThis as any).__name = (v: any) => v;
    });

    await page.goto(runtime.url + '/dev/gallery');
    await page.getByRole('heading', { name: 'Компоненти', exact: true }).waitFor();

    // Ambient canvas is mounted and running in normal motion mode
    const ambient = page.locator('[data-ui="ambient-canvas"]');
    assert.equal(await ambient.count(), 1);
    assert.equal(await ambient.getAttribute('data-paused'), 'false');

    // Press feedback on Button: scale(0.97) on pointerdown, springs back to idle on release
    const firstBtn = page.getByRole('button', { name: 'Додати справу' }).first();
    await firstBtn.scrollIntoViewIfNeeded();
    const btnBox = (await firstBtn.boundingBox())!;
    await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
    await page.mouse.down();
    assert.equal(await firstBtn.getAttribute('data-pressed'), 'true');
    assert.match(await firstBtn.evaluate((el) => (el as HTMLElement).style.transform), /scale\(0\.97\)/);
    await page.mouse.up();
    assert.equal(await firstBtn.getAttribute('data-pressed'), null);
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await firstBtn.elementHandle()
    );

    // Segmented & PillRow shared selection thumb glides to active item and settles at idle
    const segmented = page.locator('.ui-segmented').first();
    const segThumb = segmented.locator('[data-ui="selection-thumb"]');
    assert.equal(await segThumb.count(), 1);
    const thumbBefore = await segThumb.boundingBox();
    await segmented.getByRole('button', { name: 'Фокус' }).click();
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await segmented.elementHandle()
    );
    const thumbAfter = await segThumb.boundingBox();
    assert.ok(thumbBefore && thumbAfter && thumbAfter.x > thumbBefore.x, 'Segmented thumb moved to active segment');

    // Sub-screen push/pop on gallery
    await page.getByRole('button', { name: 'Підрозділ' }).click();
    assert.equal(await page.locator('main.dev-gallery').getAttribute('data-nav-direction'), 'push');
    await page.waitForFunction(
      () => document.querySelector('main.dev-gallery')?.getAttribute('data-motion') === 'idle'
    );
    await page.getByRole('button', { name: 'Назад' }).click();
    assert.equal(await page.locator('main.dev-gallery').getAttribute('data-nav-direction'), 'pop');
    await page.waitForFunction(
      () => document.querySelector('main.dev-gallery')?.getAttribute('data-motion') === 'idle'
    );

    // Quick Add + orb shared-element morph into Sheet and back
    const orbBtn = page.getByTestId('gallery-quick-add-orb');
    await orbBtn.scrollIntoViewIfNeeded();
    await orbBtn.click();
    const dialog = page.getByRole('dialog', { name: 'Нова справа' });
    await dialog.waitFor();
    assert.equal(await dialog.getAttribute('data-orb-morph'), 'true');
    assert.equal(await page.locator('main.dev-gallery').getAttribute('data-sheet-open'), 'true');
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await dialog.elementHandle()
    );

    // Interactive sheet drag: small drag (<30%) springs back and keeps sheet open
    const sheetBox = (await dialog.boundingBox())!;
    await page.mouse.move(sheetBox.x + sheetBox.width / 2, sheetBox.y + 18);
    await page.mouse.down();
    await page.mouse.move(sheetBox.x + sheetBox.width / 2, sheetBox.y + 48, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.equal(await dialog.isVisible(), true, 'Small drag springs back without closing sheet');

    // Interactive sheet drag (>35% height) dismisses sheet
    const sheetBox2 = (await dialog.boundingBox())!;
    await page.mouse.move(sheetBox2.x + sheetBox2.width / 2, sheetBox2.y + 18);
    await page.mouse.down();
    await page.mouse.move(
      sheetBox2.x + sheetBox2.width / 2,
      sheetBox2.y + Math.max(180, sheetBox2.height * 0.55),
      { steps: 5 }
    );
    await page.mouse.up();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('main.dev-gallery').getAttribute('data-sheet-open'), null);

    // Toast spring entrance & downward swipe dismiss
    await page.getByRole('button', { name: 'Показати повідомлення' }).click();
    const toast = page.locator('[data-ui="toast"]');
    await toast.waitFor();
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await toast.elementHandle()
    );
    const tb = (await toast.boundingBox())!;
    await page.mouse.move(tb.x + tb.width / 2, tb.y + 10);
    await page.mouse.down();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + 70, { steps: 3 });
    await page.mouse.up();
    await toast.waitFor({ state: 'hidden' });

    await page.screenshot({ path: `${out}/d1-gallery-webkit.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS WebKit 390x844 /dev/gallery D1 primitives, press, thumb, orb morph, sheet drag, toast');
  }

  // 2. WebKit 390x844 verification on UI fixture (tab switch, scroll collapse, task completion choreography, sub-screen push/pop, reduced motion)
  {
    const context = await runtime.browser.newContext({
      ...UI_CONTEXT,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await installUiFixture(page, 'filled', 'dark');
    await page.goto(runtime.url + '/#/today');
    await page.getByTestId('destination-view-today').waitFor();

    // Switch to Tasks view ("Усі") where document scrolls and verify scroll header collapse writes --collapse: 0..1
    await page.getByRole('button', { name: 'Завдання', exact: true }).click();
    await page.getByRole('button', { name: 'Усі', exact: true }).click();
    await page.waitForTimeout(200);
    const heading = page.locator('.today-heading');
    assert.equal(
      Number(await heading.evaluate((el) => getComputedStyle(el).getPropertyValue('--collapse').trim())),
      0
    );
    await page.evaluate(() => {
      document.body.style.minHeight = '1600px';
      window.scrollTo(0, 80);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(80);
    const collapseVal = Number(
      await heading.evaluate((el) => getComputedStyle(el).getPropertyValue('--collapse').trim())
    );
    assert.ok(collapseVal > 0.5, `Expected --collapse > 0.5 after scroll, got ${collapseVal}`);
    await page.evaluate(() => {
      document.body.style.minHeight = '';
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(50);

    // Completing a task choreography in Today Tasks
    const completeBtn = page.getByRole('button', { name: 'Завершити: Купити ліки', exact: true });
    await completeBtn.click();
    await page.getByTestId('today-undo-lifecycle-button').waitFor();
    assert.equal(await page.locator('.task-completed').count(), 1);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.task-completed').count(), 1);
    await page.screenshot({ path: `${out}/d1-today-task-completed-webkit.png` });

    // Tab switch choreography + shared tab thumb
    const tabStage = page.locator('[data-ui="tab-stage"]');
    await page.getByTestId('mobile-nav-item-calendar').click();
    await page.getByTestId('destination-view-calendar').waitFor();
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await tabStage.elementHandle()
    );

    // Calendar period slide & mode switch
    const calStage = page.locator('[data-ui="calendar-stage"]');
    await page.getByRole('button', { name: 'Наступний період' }).click();
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await calStage.elementHandle()
    );
    await page.getByRole('button', { name: 'Тиждень', exact: true }).click();
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await calStage.elementHandle()
    );

    // Sub-screen push/pop in Me workspace
    await page.getByTestId('mobile-nav-item-me').click();
    const meRoot = page.getByTestId('destination-view-me');
    await meRoot.waitFor();
    await page.getByRole('button', { name: /Налаштування/ }).click();
    assert.equal(await meRoot.getAttribute('data-nav-direction'), 'push');
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await meRoot.elementHandle()
    );

    // Toggle "Зменшити рух" in Settings -> sets data-reduced-motion="true" and pauses ambient drift
    const reducedToggle = page.getByRole('switch', { name: 'Зменшити рух' });
    await reducedToggle.scrollIntoViewIfNeeded();
    await reducedToggle.click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-reduced-motion') === 'true'
    );
    assert.equal(
      await page.locator('[data-ui="ambient-canvas"]').getAttribute('data-paused'),
      'true'
    );

    // Pop back to Me overview in reduced motion mode
    await page.getByRole('button', { name: 'Назад' }).click();
    assert.equal(await meRoot.getAttribute('data-nav-direction'), 'pop');
    await page.waitForFunction(
      (el) => el.getAttribute('data-motion') === 'idle',
      await meRoot.elementHandle()
    );

    await page.screenshot({ path: `${out}/d1-me-webkit.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS WebKit 390x844 UI fixture: scroll collapse, task completion, tab switch, calendar slide, sub-screen push/pop, reduced motion');
  }

  // 3. Chromium 4x CPU throttle performance check (LoAF / longtask <= 50ms, <= 3 consecutive dropped frames)
  {
    const browser = await chromium
      .launch({ args: ['--no-sandbox'] })
      .catch(() =>
        chromium.launch({
          executablePath: '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
          args: ['--no-sandbox'],
        })
      );
    try {
      const context = await browser.newContext({
        ...UI_CONTEXT,
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        localStorage.setItem('planui_theme_bootstrap', 'dark');
        (globalThis as any).__name = (v: any) => v;
      });
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      await page.goto(runtime.url + '/dev/gallery');
      await page.getByRole('heading', { name: 'Компоненти', exact: true }).waitFor();
      await page.waitForTimeout(300);

      const perfReport = await page.evaluate(async () => {
        const loafOver50ms: number[] = [];
        const deltas: number[] = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              loafOver50ms.push(Math.round(entry.duration));
            }
          }
        });
        observer.observe({ type: 'longtask', buffered: false });

        let last = performance.now();
        let active = true;
        const tick = (now: number) => {
          if (!active) return;
          deltas.push(now - last);
          last = now;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        const waitFrames = async (count: number) => {
          for (let i = 0; i < count; i++) {
            await new Promise(requestAnimationFrame);
          }
        };

        // a) Scroll header collapse (--collapse: 0..1)
        for (let i = 1; i <= 16; i++) {
          window.scrollTo(0, i * 6);
          window.dispatchEvent(new Event('scroll'));
          await new Promise(requestAnimationFrame);
        }
        for (let i = 15; i >= 0; i--) {
          window.scrollTo(0, i * 6);
          window.dispatchEvent(new Event('scroll'));
          await new Promise(requestAnimationFrame);
        }

        // b) Press feedback spring on Button, RoundButton, Pill, ItemCard
        const pressTargets = Array.from(
          document.querySelectorAll<HTMLElement>('.ui-pressable')
        ).slice(0, 6);
        for (const el of pressTargets) {
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          await waitFrames(2);
          el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          await waitFrames(10);
        }

        // c) Segmented & PillRow shared thumb FLIP animations
        const segBtns = document.querySelectorAll<HTMLButtonElement>('.ui-segmented button');
        if (segBtns[1]) {
          segBtns[1].click();
          await waitFrames(14);
        }
        if (segBtns[0]) {
          segBtns[0].click();
          await waitFrames(14);
        }

        active = false;
        observer.disconnect();

        let maxConsecutiveDropped = 0;
        let currentDropped = 0;
        for (const d of deltas.slice(2)) {
          if (d > 50) {
            currentDropped += 1;
            if (currentDropped > maxConsecutiveDropped) {
              maxConsecutiveDropped = currentDropped;
            }
          } else {
            currentDropped = 0;
          }
        }
        return {
          loafOver50ms,
          totalFramesSampled: deltas.length,
          maxConsecutiveDropped,
          p95FrameMs: Math.round(
            [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length * 0.95)] ?? 16
          ),
        };
      });

      await writeFile(`${out}/performance.json`, JSON.stringify(perfReport, null, 2));
      console.log('PASS Chromium 4x CPU D1 motion performance:', JSON.stringify(perfReport));
      assert.equal(
        perfReport.loafOver50ms.length,
        0,
        `Expected 0 long tasks > 50ms during animations, got ${JSON.stringify(perfReport.loafOver50ms)}`
      );
      assert.ok(
        perfReport.maxConsecutiveDropped <= 3,
        `Expected <= 3 consecutive dropped frames, got ${perfReport.maxConsecutiveDropped}`
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await runtime.close();
}
