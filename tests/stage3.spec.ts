import assert from "node:assert/strict";
import { startUiRuntime, installUiFixture, UI_CONTEXT } from "./ui-runtime";
const runtime = await startUiRuntime();
try {
  const context = await runtime.browser.newContext({
    ...UI_CONTEXT,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installUiFixture(page, "filled", "dark");
  await page.goto(runtime.url + "/#/calendar");
  await page.getByTestId("calendar-workspace").waitFor();
  const snapshot = () =>
    page.evaluate(async () => {
      const path = "/src/storage/repositories.ts";
      const { PlanuiRepositories } = await import(path);
      return (
        await new PlanuiRepositories(
          (globalThis as any).__planuiUiFixtureEngine,
        ).captureCoherentSnapshot(new Date().toISOString())
      ).snapshot;
    });
  const grid = page.getByTestId("calendar-month-grid");
  const bounds = await grid.boundingBox();
  assert.ok(bounds && bounds.y <= 280, `Grid first on screen: ${bounds?.y}`);
  assert.equal(await grid.locator("[data-calendar-date]").count(), 42);
  assert.ok(await grid.locator(".calendar-night-bridge").count());
  const header = await page.locator('[data-ui="page-header"]').boundingBox();
  assert.ok(header && header.height <= 260, `Header ${header?.height}`);
  await page.evaluate(() => scrollTo(0, 350));
  await page.waitForTimeout(100);
  assert.equal(
    await page.locator('[data-ui="page-header"]').getAttribute("data-compact"),
    "true",
  );
  const stampBounds = await page
    .getByRole("button", { name: "Штамп змін", exact: true })
    .boundingBox();
  assert.ok(
    stampBounds && stampBounds.y < 120,
    "Stamp stays reachable in the compact bar",
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page
    .getByRole("button", { name: "Наступний період", exact: true })
    .click();
  assert.match(
    await page.getByTestId("calendar-period-heading").innerText(),
    /грудень/i,
  );
  await page
    .getByRole("button", { name: "Попередній період", exact: true })
    .click();
  await page.getByRole("button", { name: "Тиждень", exact: true }).click();
  assert.equal(
    await page
      .getByTestId("calendar-month-grid")
      .locator("[data-calendar-date]")
      .count(),
    7,
  );
  await page
    .getByRole("button", { name: "Підсумок тижня", exact: true })
    .click();
  assert.match(await page.getByRole("dialog").innerText(), /2 зміни/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "День", exact: true }).click();
  await page.locator(".continuous-time-scroll").waitFor();
  assert.ok(
    (await page.locator(".calendar-stage3 .timeline-day").count()) > 1,
    "Reuses continuous timeline",
  );
  await page.getByRole("button", { name: "Місяць", exact: true }).click();
  const before = await snapshot();
  await page.getByRole("button", { name: "Штамп змін", exact: true }).click();
  let sheet = page.getByRole("dialog").last();
  assert.equal(await sheet.getByTestId("calendar-month-grid").count(), 1);
  await sheet.getByRole("button", { name: /^Нічна / }).click();
  await sheet.getByRole("button", { name: /^Нічна /, pressed: true }).waitFor();
  await sheet.locator('[data-calendar-date="2026-11-18"]').click();
  await page.waitForFunction(() =>
    Boolean((globalThis as any).__planuiUiFixtureEngine),
  );
  await page.waitForTimeout(150);
  const stamped = await snapshot();
  const newShift = stamped.events.find(
    (e: any) =>
      !before.events.some((old: any) => old.id === e.id) &&
      e.type === "work_shift",
  );
  assert.ok(newShift);
  assert.equal(newShift.schedule.interval.originStartLocalDate, "2026-11-18");
  assert.equal(newShift.schedule.interval.originEndLocalDate, "2026-11-19");
  await sheet.locator('[data-calendar-date="2026-11-18"]').click();
  for (const label of ["Змінити тільки цей день", "Вихідний", "Видалити зміну"])
    assert.equal(
      await page
        .getByRole("dialog")
        .last()
        .getByRole("button", { name: label, exact: true })
        .count(),
      1,
    );
  await page.keyboard.press("Escape");
  const firstDrag = await sheet
    .locator('[data-calendar-date="2026-11-20"]')
    .boundingBox();
  const lastDrag = await sheet
    .locator('[data-calendar-date="2026-11-21"]')
    .boundingBox();
  assert.ok(firstDrag && lastDrag);
  await page.mouse.move(
    firstDrag.x + firstDrag.width / 2,
    firstDrag.y + firstDrag.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    lastDrag.x + lastDrag.width / 2,
    lastDrag.y + lastDrag.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(150);
  const dragged = (await snapshot()).events.filter(
    (e: any) =>
      e.type === "work_shift" &&
      e.schedule.kind === "timed" &&
      ["2026-11-20", "2026-11-21"].includes(
        e.schedule.interval.originStartLocalDate,
      ),
  );
  assert.equal(dragged.length, 2, "Drag stamps each crossed day once");
  await sheet.getByRole("button", { name: "Шаблони", exact: true }).click();
  await sheet
    .getByRole("button", { name: "Шаблон: Нічна", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Редагувати", exact: true }).click();
  await page.getByTestId("template-name-input").fill("Нічна оновлена");
  await page.getByTestId("template-save-button").click();
  await page.getByTestId("template-name-input").waitFor({ state: "hidden" });
  assert.deepEqual(
    (await snapshot()).events.find((e: any) => e.id === newShift.id),
    newShift,
    "Template editing leaves instances intact",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Графік", exact: true }).click();
  await page
    .getByRole("button", { name: "Пакетний вибір", exact: true })
    .click();
  await page
    .getByTestId("calendar-month-grid")
    .locator('[data-calendar-date="2026-11-23"]')
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Застосувати", exact: true })
      .isEnabled(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Stage 3 WebKit: first-screen grid/header, periods, week count, shared continuous Day, stamp, immutable template instances and batch selection",
  );
  await context.close();
} finally {
  await runtime.close();
}
