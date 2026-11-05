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
  await page.goto(runtime.url + "/#/plans");
  await page.getByTestId("destination-view-plans").waitFor();
  const first = await page
    .getByRole("button", { name: "Англійська", exact: true })
    .boundingBox();
  assert.ok(first && first.y < 320);
  await page.getByRole("button", { name: "Творчість", exact: true }).click();
  assert.equal(
    await page.getByText("Власне артистичне ім’я", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Ідеї", exact: true }).click();
  await page.getByText("Власне артистичне ім’я", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Активні", exact: true }).click();
  assert.equal(
    await page.getByText("Власне артистичне ім’я", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Усі напрями", exact: true }).click();
  await page
    .getByRole("button", { name: "Глобальна дорожня карта", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Дії: Визначити роль", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Змінити дати й точки", exact: true })
    .click();
  await page.getByLabel("Місяць", { exact: true }).fill("2026-12");
  await page
    .getByRole("button", { name: "Зберегти дати", exact: true })
    .click();
  await page
    .getByText("Переглянути й зсунути наступні етапи чи залишити їхні дати?", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(
    (await snapshot()).stages,
    before.stages,
    "No automatic shifting before confirmation",
  );
  await page
    .getByRole("button", { name: "Залишити їхні дати й зберегти", exact: true })
    .click();
  await page.waitForTimeout(150);
  const after = await snapshot();
  assert.deepEqual(
    after.stages.find((s: any) => s.id === "career-stage-1"),
    before.stages.find((s: any) => s.id === "career-stage-1"),
  );
  for (const key of ["events", "reservations", "tasks"] as const)
    assert.deepEqual(
      after[key],
      before[key],
      "Stage periods never reserve calendar time",
    );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Stage 4 WebKit: first content, ideas, dependent confirmation, informational periods",
  );
  await context.close();
} finally {
  await runtime.close();
}
