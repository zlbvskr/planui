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
  await page.goto(runtime.url + "/#/today");
  await page.getByTestId("destination-view-today").waitFor();
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
  const before = await snapshot();
  assert.ok(!(await page.getByRole("dialog").count()), "No launch modal");
  await page
    .getByRole("button", { name: "Переглянути", exact: true })
    .first()
    .click();
  const triage = page.getByRole("dialog");
  await triage.getByText("Залишити як є", { exact: true }).waitFor();
  for (const action of [
    "Перенести",
    "Зменшити обсяг",
    "Розділити",
    "Поставити на паузу",
    "Відмовитися",
  ])
    assert.equal(
      await triage.getByRole("button", { name: action, exact: true }).count(),
      1,
    );
  await triage
    .getByRole("button", { name: "Залишити як є", exact: true })
    .click();
  await page.keyboard.press("Escape");
  const after = await snapshot();
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(after.reservations, before.reservations);
  await page.getByRole("button", { name: "Звички", exact: true }).click();
  await page
    .getByRole("button", { name: "Стандарт: Розтяжка", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Дії: Розтяжка", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Пауза", exact: true }).click();
  await page.getByRole("button", { name: "⌄", exact: true }).click();
  await page.getByTestId("habit-row-stretch").waitFor();
  assert.equal(
    (await snapshot()).habits.find((h: any) => h.id === "stretch").state,
    "paused",
  );
  await page
    .getByRole("button", { name: "Усі звички та історія", exact: true })
    .click();
  assert.equal(await page.locator("h1:visible").count(), 1);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page
    .getByRole("button", { name: "Мінімальний день: вимкнено", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Мінімальний день: увімкнено", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Інші дії дня", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Повернути все", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Мінімальний день: вимкнено", exact: true })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Створити новий запис у поточному розділі",
      exact: true,
    })
    .last()
    .click();
  await page.getByTestId("quick-title").fill("Перевірка швидкого додавання");
  await page.getByTestId("quick-title").press("Enter");
  await page.getByTestId("quick-title").waitFor({ state: "hidden" });
  assert.ok(
    (await snapshot()).tasks.some(
      (t: any) => t.title === "Перевірка швидкого додавання",
    ),
  );
  await page
    .getByRole("button", {
      name: "Створити новий запис у поточному розділі",
      exact: true,
    })
    .last()
    .click();
  await page.getByRole("button", { name: "Подія", exact: true }).last().click();
  await page.getByRole("button", { name: /^Дата й час/ }).click();
  const field = page.getByRole("dialog").last();
  await field.getByRole("switch", { name: "Увесь день", exact: true }).click();
  await field.getByRole("button", { name: "Готово", exact: true }).click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Створити новий запис у поточному розділі",
      exact: true,
    })
    .last()
    .click();
  await page.getByRole("button", { name: "Зміна", exact: true }).last().click();
  await page.getByRole("button", { name: /^Шаблон/ }).click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Нічна", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Готово", exact: true })
    .click();
  await page.getByRole("button", { name: /^Дата й час/ }).click();
  await page
    .getByRole("dialog")
    .last()
    .locator('input[aria-label="Дата"]')
    .fill("2026-11-08");
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Готово", exact: true })
    .click();
  await page.getByRole("button", { name: /^Дні/ }).click();
  await page
    .getByRole("dialog")
    .last()
    .locator('input[aria-label="Додати день зміни"]')
    .fill("2026-11-10");
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Додати день", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Готово", exact: true })
    .click();
  await page.getByRole("button", { name: "Додати", exact: true }).click();
  await page.getByTestId("quick-title").waitFor({ state: "hidden" });
  const shifts = (await snapshot()).events.filter(
    (e: any) =>
      e.type === "work_shift" &&
      !before.events.some((old:any)=>old.id===e.id) &&
      e.schedule.kind === "timed" &&
      ["2026-11-08", "2026-11-10"].includes(
        e.schedule.interval.originStartLocalDate,
      ),
  );
  assert.equal(shifts.length, 2);
  assert.ok(
    shifts.every(
      (e: any) =>
        e.schedule.interval.originStartLocalDate !==
        e.schedule.interval.originEndLocalDate,
    ),
  );
  await page.goto(runtime.url + "/#/life_areas");
  await page
    .getByRole("button", { name: "Щотижневий огляд · 4 кроки", exact: true })
    .click();
  const weekly = page.getByRole("dialog");
  for (let i = 0; i < 2; i++)
    await weekly.getByRole("button", { name: "Далі", exact: true }).click();
  const toggle = weekly.getByRole("switch").first();
  const chosen = await toggle.getAttribute("aria-label");
  await toggle.click();
  await weekly.getByRole("button", { name: "Далі", exact: true }).click();
  await weekly
    .getByRole("button", { name: "Завершити огляд", exact: true })
    .click();
  await page.getByTestId("weekly-review").waitFor({ state: "hidden" });
  assert.ok(
    (await snapshot()).settings.dailyPlans["2026-11-05"].focusNoteUk.includes(
      chosen,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Stage 2 WebKit: triage never moves, habit pause, archive heading, manual Minimum Day, Quick Add Enter/fields, saved weekly focus",
  );
  await context.close();
} finally {
  await runtime.close();
}
