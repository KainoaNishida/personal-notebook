import { test, expect } from "@playwright/test";

const notebook = "/notebooks/00000000-0000-4000-8000-000000000003";

test("compact formatting menus preserve selection, focus, undo and drafts", async ({
  page,
}) => {
  await page.goto(notebook);
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  const editor = page.getByRole("textbox", { name: "Note editor" });
  await editor.fill("first line\nsecond line");
  await editor.press("ControlOrMeta+a");
  const heading = page.getByRole("button", { name: "Heading", exact: true });
  await heading.focus();
  await heading.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Heading 1", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Heading 2", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText("## first line## second line");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveText("first linesecond line");

  for (const [menu, item, expected] of [
    ["Code", "Inline code", "`first line\nsecond line`"],
    ["Math", "Inline math", "$first line\nsecond line$"],
    ["More", "Numbered list", "1. first line\n2. second line"],
  ]) {
    await editor.press("ControlOrMeta+a");
    await page.getByRole("button", { name: menu, exact: true }).click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveText(expected.replaceAll("\n", ""));
    await editor.press("ControlOrMeta+z");
    await expect(editor).toHaveText("first linesecond line");
  }

  await editor.fill("```js\nconst value = 1;\n```");
  await editor.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.getByRole("menuitem", { name: "Code block", exact: true }).click();
  await expect(editor).toHaveText("```````jsconst value = 1;```````");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveText("```jsconst value = 1;```");

  const math = page.getByRole("button", { name: "Math", exact: true });
  await math.click();
  await page.keyboard.press("Escape");
  await expect(math).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await editor.fill("");
  await page.getByRole("button", { name: "Math", exact: true }).click();
  await page.getByRole("menuitem", { name: "Display equation" }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.type("y^2");
  await expect(editor).toHaveText("$$y^2$$");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await expect(editor).toHaveText("$$y^2$$");
});

test("live prose keeps its height when activated and code copying excludes the header", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(notebook);
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  const editor = page.getByRole("textbox", { name: "Note editor" });
  const paragraph = "A useful thought deserves enough room to unfold. "
    .repeat(6)
    .trim();
  const code = "for value in [1, 2, 3]:\n    print(value)\n";
  await editor.fill(
    `${paragraph}\n\n\`\`\`python\n${code}\`\`\`\n\nContinue here`,
  );
  await editor.press("ControlOrMeta+End");
  await page.getByRole("button", { name: "Use live preview" }).click();
  await page.evaluate(() => document.fonts.ready);
  const rendered = page.locator(".live-block p").filter({ hasText: paragraph });
  await expect(rendered).toHaveCSS("line-height", "30px");
  const before = await rendered.boundingBox();
  await editor.press("ControlOrMeta+Home");
  const active = page.locator(".cm-line").filter({ hasText: paragraph });
  await expect(active).toHaveCSS("line-height", "30px");
  await expect
    .poll(async () =>
      Math.abs((await active.boundingBox())!.height - before!.height),
    )
    .toBeLessThan(1);
  await expect(page.locator(".code-language")).toHaveText("python");
  const header = await page.locator(".code-header").boundingBox();
  const codeContent = await page.locator(".code-content").boundingBox();
  expect(header!.y + header!.height).toBeLessThan(codeContent!.y);
  await expect(page.locator(".code-block")).toHaveCSS("padding", "16px 20px");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await expect(page.locator(".cm-scroller")).toHaveCSS("line-height", "26px");
});

test("toolbar stays compact and sidebar has one current destination", async ({
  page,
}) => {
  await page.goto(notebook);
  await expect(
    page.locator('.app-sidebar nav a[aria-current="page"]'),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Notebooks", exact: true }),
  ).not.toHaveAttribute("aria-current");
  for (const width of [640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const toolbar = page.getByRole("group", { name: "Formatting" });
    expect(
      await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    const math = await page
      .getByRole("button", { name: "Math", exact: true })
      .boundingBox();
    expect(math!.width).toBeLessThan(75);
    const guide = await page
      .getByRole("button", { name: "Markdown guide", exact: true })
      .boundingBox();
    const source = await page
      .getByRole("button", { name: "Edit Markdown source", exact: true })
      .boundingBox();
    expect(guide!.y).toBe(source!.y);
    if (width >= 1024) expect(guide!.y).toBe(math!.y);
    await page.screenshot({ path: `test-results/format-toolbar-${width}.png` });
  }
  await page.goto("/");
  const today = page.locator(".activity-table thead .activity-today");
  expect(
    await today.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator(".activity-table thead th")).toHaveCount(15);
});
