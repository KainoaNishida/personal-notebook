import { test, expect } from "@playwright/test";

const notebook = "/notebooks/00000000-0000-4000-8000-000000000003";

test("Graphite navigation keeps drafts mounted and makes search available at every width", async ({
  page,
}) => {
  await page.goto(notebook);
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  const editor = page.locator(".cm-content");
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("A Graphite navigation note");
  await editor.fill("An unfinished thought stays here");
  await editor.press("ControlOrMeta+End");
  const mounted = await editor.elementHandle();
  const toggle = page.getByRole("button", { name: "Toggle sidebar" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  for (const width of [640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const dialog = page.getByRole("dialog", {
      name: "Navigate your notebooks",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Settings", { exact: true })).toBeVisible();
    const close = dialog.getByRole("button", { name: "Close navigation" });
    await expect(close).toBeFocused();
    await close.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "Sign out" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.screenshot({
      animations: "disabled",
      path: `test-results/graphite-navigation-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    expect(
      await mounted!.evaluate(
        (el) => el === document.querySelector(".cm-content"),
      ),
    ).toBe(true);
    await expect(editor).toContainText("An unfinished thought stays here");
  }
  await page.setViewportSize({ width: 640, height: 900 });
  const railSearch = page.getByRole("button", {
    name: "Open search and navigation",
  });
  await railSearch.click();
  await page.keyboard.press("Escape");
  await expect(railSearch).toBeFocused();
  await railSearch.click();
  const search = page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Search entries" });
  await search.fill("Graphite navigation");
  await search.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link")
    .filter({ hasText: "A Graphite navigation note" })
    .click();
  await expect(editor).toContainText("An unfinished thought stays here");
  await page.reload();
  await expect(editor).toContainText("An unfinished thought stays here");
});

test("Graphite writing, hours and full-width scrolling hold at 640, 1024 and 1440 pixels", async ({
  page,
}) => {
  await page.goto(notebook);
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("A little closer to understanding");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page
    .locator(".cm-content")
    .fill(
      "A useful notebook leaves room for a thought to unfold. **Clarity** comes from returning to the question, and *noticing* what changed.\n\n## The shape of an idea\n\nStart with a small example. Let the details follow when they are useful.\n\n$$\nE = mc^2\n$$\n\n```python\nfor idea in notebook:\n    explore(idea)\n```\n\nContinue here",
    );
  await page.getByRole("button", { name: "Use live preview" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page
        .locator(".daily-page")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const typography = await page.locator(".cm-editor").evaluate((el) => ({
      family: getComputedStyle(el).fontFamily,
      width: el.getBoundingClientRect().width,
    }));
    expect(typography.family).toContain("Lora");
    expect(typography.width).toBeLessThanOrEqual(992);
    if (width === 1440) expect(typography.width).toBe(992);
    await page.screenshot({
      animations: "disabled",
      path: `test-results/graphite-writing-${width}.png`,
    });
  }
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Times (MM:SS, separated by commas)" })
    .fill("10:00, 10:00");
  await page
    .getByRole("textbox", { name: "Actual time worked (HH:MM:SS)" })
    .fill("01:30:00");
  await page.getByRole("heading", { name: "Time calculator × 7" }).click();
  for (const width of [640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator("main").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      animations: "disabled",
      path: `test-results/graphite-today-${width}.png`,
    });
    await page
      .locator(".time-calculator-card")
      .screenshot({ path: `test-results/graphite-hours-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1920, height: 800 });
  await page.locator("main").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.mouse.move(1896, 400);
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => page.locator("main").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.goto("/notebooks");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    animations: "disabled",
    path: "test-results/graphite-notebooks.png",
  });
  await page.goto(`${notebook}/pages`);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/graphite-pages.png",
  });
});

test("custom appearance persists, reset restores Graphite, and reduced motion disables overlays", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Main color: Midnight" }).click();
  await page.getByRole("textbox", { name: "Accent color hex" }).fill("#60a5fa");
  await page.getByRole("button", { name: "Save colors" }).click();
  await expect(page.getByText("Colors saved.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Main color: Midnight" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(250, 250, 250)");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/graphite-custom-settings.png",
  });
  await page.getByRole("button", { name: "Reset colors" }).click();
  await expect(page.getByText("Default colors restored.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Main color: Graphite" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(236, 238, 241)");
  await expect(
    page.getByRole("textbox", { name: "Accent color hex" }),
  ).toHaveValue("#c9ced9");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/graphite-settings.png",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
});
