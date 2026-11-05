import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { startUiRuntime, installUiFixture, UI_CONTEXT } from "./ui-runtime";

const runtime = await startUiRuntime();
const out = process.env.UI_ARTIFACT_DIR ?? "/tmp/planui-stage1";
await mkdir(out, { recursive: true });
try {
  if (!process.env.UI_PERF_ONLY) {
    const context = await runtime.browser.newContext({
      ...UI_CONTEXT,
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await installUiFixture(page, "filled", "dark");
    await page.goto(runtime.url + "/#/today");
    await page.locator(".continuous-time-scroll").waitFor();
    await page.waitForTimeout(250);
    const scroll = async (position: "start" | "end") =>
      page.evaluate((position) => {
        const el = document.querySelector<HTMLElement>(
          ".continuous-time-scroll",
        )!;
        const nodes = Array.from(
          el.querySelectorAll<HTMLElement>(".timeline-day"),
        );
        const anchor = position === "start" ? nodes[0] : nodes.at(-1)!;
        el.scrollTop =
          position === "start" ? 1 : el.scrollHeight - el.clientHeight - 1;
        return {
          date: anchor.dataset.date!,
          top: anchor.getBoundingClientRect().top,
        };
      }, position);
    for (const position of ["start", "end"] as const) {
      const before = await scroll(position);
      await page.waitForTimeout(100);
      const after = await page
        .locator(`[data-date="${before.date}"]`)
        .evaluate((el) => el.getBoundingClientRect().top);
      assert.ok(
        Math.abs(before.top - after) <= 1,
        `${position} anchor jump: ${after - before.top}`,
      );
    }
    await page.locator(".ui-week button").filter({ hasText: "Пт" }).click();
    await page.waitForTimeout(200);
    assert.match(
      await page.getByTestId("today-selected-date-heading").innerText(),
      /6 листопада/,
    );
    const delta = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
          ".continuous-time-scroll",
        )!,
        day = el.querySelector<HTMLElement>('[data-date="2026-11-06"]')!;
      return (
        day.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        7 * 56
      );
    });
    assert.ok(Math.abs(delta) < 2, `strip should scroll to 07:00: ${delta}`);
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
          ".continuous-time-scroll",
        )!,
        day = el.querySelector<HTMLElement>('[data-date="2026-11-06"]')!;
      el.scrollTop +=
        day.getBoundingClientRect().top -
        el.getBoundingClientRect().top +
        23.5 * 56;
    });
    await page.waitForTimeout(150);
    const continuity = await page
      .locator('[data-source="night-6"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          top: n.getBoundingClientRect().top,
          bottom: n.getBoundingClientRect().bottom,
          before: n.getAttribute("data-continues-before"),
          after: n.getAttribute("data-continues-after"),
        })),
      );
    assert.equal(continuity.length, 2);
    assert.ok(
      Math.abs(continuity[0].bottom - continuity[1].top) <= 1,
      "overnight split has a gap",
    );
    await page.screenshot({ path: out + "/day-midnight-dark.png" });
    // Manual scrolling updates both header and strip.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
          ".continuous-time-scroll",
        )!,
        day = el.querySelector<HTMLElement>('[data-date="2026-11-07"]')!;
      el.scrollTop +=
        day.getBoundingClientRect().top - el.getBoundingClientRect().top + 300;
    });
    await page.waitForTimeout(150);
    assert.match(
      await page.getByTestId("today-selected-date-heading").innerText(),
      /7 листопада/,
    );
    for(let i=0;i<5;i++){
      await page.evaluate(()=>{const el=document.querySelector<HTMLElement>('.continuous-time-scroll')!;el.scrollTop=el.scrollHeight-el.clientHeight-1;});
      await page.waitForTimeout(150);
    }
    assert.ok(await page.locator('.timeline-day').count()<=7,'far days are unmounted');
    assert.match(await page.locator('.today-now-jump svg').getAttribute('class')??'',/arrow-up/);
    await page.locator('.today-now-jump').click();await page.waitForTimeout(150);
    await page.locator(".ui-week button").filter({ hasText: "Чт" }).click();
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "Завдання", exact: true }).click();
    await page.getByRole("button", { name: "Усі", exact: true }).click();
    assert.ok(
      await page
        .getByRole("heading", { name: "Фокус дня", exact: true })
        .count(),
    );
    await page.screenshot({ path: out + "/tasks-dark.png" });
    for(const title of ['Урок 12 · аудіювання','Купити ліки','Тези до семінару']) {
      await page.getByRole('button',{name:`Дії: ${title}`,exact:true}).click();
      await page.getByRole('menuitem',{name:'Додати до фокусу',exact:true}).click();
      await page.waitForTimeout(100);
    }
    const focusSection=page.locator('.ui-section').filter({has:page.getByRole('heading',{name:'Фокус дня',exact:true})});
    assert.equal(await focusSection.locator('.today-task-row').count(),4,'focus permits a fourth task');
    await page.getByRole('button',{name:'Завершити: Купити ліки',exact:true}).click();
    await page.getByTestId('today-undo-lifecycle-button').waitFor();
    assert.equal(await page.locator('.task-completed').count(),1);
    await page.getByTestId('today-undo-lifecycle-button').click();await page.waitForTimeout(100);
    assert.equal(await page.locator('.task-completed').count(),0);
    await page.getByRole('button',{name:'У вільне вікно: Урок 12 · аудіювання',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    assert.ok(await page.getByRole('dialog').locator('button.ui-disclosure').count()>=2);
    await context.close();
    for (const theme of ["dark", "light"] as const)
      for (const mode of ["День", "Завдання"]) {
        const c = await runtime.browser.newContext({
            ...UI_CONTEXT,
            serviceWorkers: "block",
          }),
          p = await c.newPage();
        await installUiFixture(p, "filled", theme);
        await p.goto(runtime.url + "/#/today");
        await p.getByTestId("destination-view-today").waitFor();
        await p.getByRole("button", { name: mode, exact: true }).click();
        await p.waitForTimeout(150);
        await p.screenshot({
          path: `${out}/${mode === "День" ? "day" : "tasks"}-${theme}.png`,
        });
        if (theme === "dark") {
          await p.evaluate(
            () =>
              (document.documentElement.dataset.reducedTransparency = "true"),
          );
          await p.screenshot({
            path: `${out}/${mode === "День" ? "day" : "tasks"}-reduced-transparency.png`,
          });
        }
        await c.close();
      }
    console.log(
      "WebKit: prepend/append anchoring, strip/scroll sync, midnight continuity, reduced motion PASS",
    );
  }
  if (process.env.UI_FUNCTIONAL_ONLY) process.exitCode = 0;
  else {
    // Chromium CDP provides actual 4x CPU throttling (WebKit has no such API).
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
      const c = await browser.newContext({
          ...UI_CONTEXT,
          serviceWorkers: "block",
        }),
        p = await c.newPage();
      await installUiFixture(p, "filled", "dark");
      await p.route(/\/src\/test\/ui-fixture\.ts(?:\?.*)?$/, async (route) => {
        let source = await (await route.fetch()).text();
        const injection = `snapshot.events = []; snapshot.reservations = []; snapshot.tasks = []; for(let d=-2;d<=2;d++)for(let i=0;i<60;i++){ const date=new Date(Date.UTC(2026,10,5+d)).toISOString().slice(0,10); const start=String(Math.floor(i*24/60)).padStart(2,'0')+':'+String((i*24)%60).padStart(2,'0'); const startMs=Date.parse(date+'T'+start+':00+02:00'); const e=event('stress-'+d+'-'+i,'Подія '+i,'personal','dayoff',date,start,start); e.schedule.interval.endInstant=new Date(startMs+20*60000).toISOString();snapshot.events.push(e); }`;
        const needle = "// Tiny local PNG;";
        if (!source.includes(needle))
          throw new Error("Fixture stress injection mismatch");
        source = source.replace(needle, injection + "\n" + needle);
        await route.fulfill({
          body: source,
          contentType: "application/javascript",
        });
      });
      const session = await c.newCDPSession(p);
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await p.goto((process.env.UI_PERF_URL ?? runtime.url) + "/#/today");
      await p.locator(".continuous-time-scroll").waitFor();
      await p.waitForTimeout(500);
      if (process.env.UI_CPU_PROFILE) {
        await session.send("Profiler.enable");
        await session.send("Profiler.start");
      }
      await p.evaluate(() => {
        (window as any).__scrollLongTasks = [];
        new PerformanceObserver((list) => {
          (window as any).__scrollLongTasks.push(
            ...list.getEntries().map((e) => e.duration),
          );
        }).observe({ type: "longtask" });
      });
      await p.evaluate(async () => {
        const el = document.querySelector<HTMLElement>(
          ".continuous-time-scroll",
        )!;
        const frames: number[] = [];
        let previous = performance.now();
        for (let i = 0; i < 180; i++) {
          el.scrollTop += i < 90 ? 40 : -40;
          await new Promise(requestAnimationFrame);
          const now = performance.now();
          frames.push(now - previous);
          previous = now;
        }
        (window as any).__scrollFrames = frames;
      });
      await p.waitForTimeout(100);
      if (process.env.UI_CPU_PROFILE) {
        const profile = await session.send("Profiler.stop");
        await writeFile(out + "/cpu-profile.json", JSON.stringify(profile));
      }
      const numbers = await p.evaluate(() => ({
        longTasks: (window as any).__scrollLongTasks as number[],
        frames: (window as any).__scrollFrames as number[],
        mountedDays: document.querySelectorAll(".timeline-day").length,
        items: document.querySelectorAll("[data-source]").length,
      }));
      await writeFile(
        out + "/performance.json",
        JSON.stringify(
          {
            cpuThrottle: 4,
            fixtureDays: 5,
            itemsPerDay: 60,
            build: process.env.UI_PERF_URL
              ? "production fixture"
              : "development fixture",
            ...numbers,
          },
          null,
          2,
        ),
      );
      console.log("4x CPU scrolling", JSON.stringify(numbers));
      assert.equal(
        numbers.longTasks.filter((n) => n > 50).length,
        0,
        "scroll long task >50ms",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await runtime.close();
}
