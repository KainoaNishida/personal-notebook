import { test, expect } from "@playwright/test";

function pdf(twoPages = false) {
  const stream =
    "BT /F1 18 Tf 50 730 Td (A synthetic research paper) Tj 0 -35 Td (Attention combines queries and keys.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    twoPages
      ? "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>"
      : "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  if (twoPages)
    objects.push(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    );
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}

test("five saved new words complete a goal and deletion cannot undo it", async ({
  page,
}) => {
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("A small discovery");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page.locator(".cm-content").fill("one two three four");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(
    page.locator(".goal-card").filter({ hasText: "Art & portraits" }),
  ).toContainText("Write five new words");
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page.locator(".cm-content").fill("one two three four five");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.locator(".cm-content").fill("");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(
    page.locator(".goal-card").filter({ hasText: "Art & portraits" }),
  ).toContainText("Completed");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Today —",
  );
  await expect(page.getByRole("button", { name: "Previous day" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "test-results/today-dark.png",
    fullPage: true,
  });
});

test("PDF regions survive zoom and reload; AI only opens on request", async ({
  page,
}) => {
  await page.goto("/papers");
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic-paper.pdf",
    mimeType: "application/pdf",
    buffer: pdf(true),
  });
  await expect(page.locator(".textLayer")).toContainText("Attention combines");
  await expect(
    page.getByRole("combobox", { name: "Workspace panes" }),
  ).toHaveCount(0);
  const before = (await page.locator(".science-pdf").boundingBox())!;
  await page.getByRole("button", { name: "Expand PDF", exact: true }).click();
  await expect(page.locator(".science-notes")).toBeHidden();
  expect(
    (await page.locator(".science-pdf").boundingBox())!.width,
  ).toBeGreaterThan(before.width * 1.5);
  await page
    .getByRole("button", { name: "Restore split view", exact: true })
    .click();
  const divider = page.getByRole("separator", { name: "Resize PDF and notes" });
  await divider.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "52");
  await divider.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "50");

  await page.getByRole("button", { name: "Select PDF region" }).click();
  const bounds = (await page.locator(".region-layer").boundingBox())!;
  await page.mouse.move(bounds.x + 40, bounds.y + 40);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 300, bounds.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Link to notes" }).click();
  await expect(page.locator(".highlight")).toHaveCount(1);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  // Autosave reorders the query cache, then a server refresh replaces object
  // references. Neither event should navigate back to an old source link.
  await page.getByRole("spinbutton", { name: "PDF page" }).fill("2");
  await page.getByRole("button", { name: /Rename paper:/ }).click();
  await page
    .getByRole("textbox", { name: "Paper title", exact: true })
    .fill("Reading on page two");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const other = await page.context().newPage();
  await other.goto("/");
  await page.bringToFront();
  await expect(page.getByRole("spinbutton", { name: "PDF page" })).toHaveValue(
    "2",
  );
  await other.close();
  await page.getByRole("button", { name: /Figure or equation · p. 1/ }).click();
  await expect(page.getByRole("spinbutton", { name: "PDF page" })).toHaveValue(
    "1",
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".highlight")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".highlight")).toHaveCount(1);
  await expect(page.locator(".pdf-loading")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("Figure or equation");
  await expect(page.locator(".ai-panel")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/science-dark.png",
    fullPage: true,
  });
  await page.goto("/settings");
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export archive" }).click();
  const archive = await exported;
  await page.locator("input[type=file]").setInputFiles((await archive.path())!);
  await expect(page.getByText(/Restored \d+ records/)).toBeVisible();
  await page.goto("/papers");
  await expect(page.locator(".research-timeline .entry-row")).toHaveCount(1);
});

test("image, diagram, undo, search and trash recovery", async ({ page }) => {
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000002");
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("A visual notebook");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page
    .locator(".cm-content")
    .fill(
      '```mermaid\nflowchart LR\n  Q["Queries"] --> S["Divide by sqrt(d_k) -> Scores"]\n```\n\n',
    );
  await page.getByRole("button", { name: "Use live preview" }).click();
  await expect(page.locator(".diagram svg")).toBeVisible();
  const png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#b7cba3";
      ctx.fillRect(0, 0, 16, 16);
      return c.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "sketch.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("img", { name: "Reference image" }),
  ).toBeVisible();
  await expect(page.locator(".cm-content")).not.toContainText("sketch.png");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Image caption" })
    .fill("A hand-drawn [study] $&");
  await page.getByRole("textbox", { name: "Image caption" }).press("Enter");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".asset-image img")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Image caption" }),
  ).toHaveValue("A hand-drawn [study] $&");
  await page.getByText("Section options", { exact: true }).click();
  await page.getByRole("button", { name: "Move entry to trash" }).click();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search entries" })
    .fill("A visual notebook");
  await expect(
    page.getByRole("heading", { name: "A visual notebook" }),
  ).toBeVisible();
});

test("dark theme and narrow desktop panes remain usable", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Toggle color theme" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/today-dark-wide.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 640, height: 700 });
  await expect(
    page.getByRole("button", { name: "Toggle sidebar" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/today-zoom.png",
    fullPage: true,
  });
});

test("concurrent edits show recoverable conflict instead of overwriting", async ({
  page,
  context,
}) => {
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "",
  );
  await page.getByRole("textbox", { name: "Entry title" }).fill("First window");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await other
    .getByRole("textbox", { name: "Entry title" })
    .fill("Second window");
  await expect(
    other.getByText("Save needs review", { exact: true }),
  ).toBeVisible();
  await other.reload();
  await expect(
    other.getByText("Save needs review", { exact: true }),
  ).toBeVisible();
  await expect(other.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "Second window",
  );
  await other
    .getByRole("button", { name: "Review versions", exact: true })
    .click();
  await expect(other.locator(".conflict-review")).toContainText("First window");
  await other.getByRole("button", { name: "Keep this window" }).click();
  await expect(other.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "Second window",
  );
});

test("optional private attention sample: page four and exact-context preview", async ({
  page,
}) => {
  test.skip(
    !process.env.SAMPLE_PDF_PATH,
    "Private PDF is supplied locally, never committed.",
  );
  await page.goto("/papers");
  await page
    .locator("input[type=file]")
    .setInputFiles(process.env.SAMPLE_PDF_PATH!);
  await expect(page.locator(".pdf-loading")).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "PDF page" }).fill("4");
  await expect(page.getByRole("spinbutton", { name: "PDF page" })).toHaveValue(
    "4",
  );
  await expect(page.locator(".pdf-loading")).toHaveCount(0);
  await expect(page.locator(".textLayer")).toContainText("Attention");
  const span = page
    .locator(".textLayer span")
    .filter({ hasText: "Attention" })
    .first();
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator(".pdf-page").dispatchEvent("mouseup");
  await page.getByRole("button", { name: "Explain", exact: true }).click();
  await expect(page.locator(".ai-panel")).toBeVisible();
  await expect(page.locator(".context-card")).toContainText("page 4");
  await expect(page.locator(".pdf-loading")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/attention-context.png",
    fullPage: true,
  });
});

test("notebook management and archive export restore", async ({ page }) => {
  await page.goto("/notebooks");
  await page.getByRole("button", { name: "New notebook" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Field notes");
  await page.getByRole("button", { name: "Save notebook" }).click();
  await page.getByRole("button", { name: "Archive Field notes" }).click();
  await expect(
    page.getByRole("button", { name: "Restore Field notes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore Field notes" }).click();
  await page.goto("/settings");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export archive" }).click();
  const download = await pending;
  const path = (await download.path())!;
  await page.locator("input[type=file]").setInputFiles(path);
  await expect(page.getByText(/Restored \d+ records/)).toBeVisible();
});

test("long research notes preserve preview nodes, cursor, scroll and undo across saves", async ({
  page,
  context,
}) => {
  await page.goto("/papers");
  await page.locator("input[type=file]").setInputFiles({
    name: "long-note.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  const text =
    Array.from(
      { length: 35 },
      (_, i) =>
        `## Section ${i}\n\nSynthetic research text on attention and vector spaces.\n\n$$\nx^2 + y^2\n$$`,
    ).join("\n\n") + "\n\nBottom";
  const editor = page.locator(".cm-content");
  await editor.fill(text);
  await page.getByRole("button", { name: "Use live preview" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await editor.press("ControlOrMeta+End");
  await editor.press("End");
  const first = await page.locator(".live-block").first().elementHandle();
  const scroll = await page
    .locator(".science-notes")
    .evaluate((el) => el.scrollTop);
  await page.keyboard.type(" continuing through the autosave boundary", {
    delay: 65,
  });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await first!.evaluate((el) => el.isConnected)).toBe(true);
  expect(
    await page.locator(".science-notes").evaluate((el) => el.scrollTop),
  ).toBeGreaterThanOrEqual(scroll - 10);
  await page.keyboard.type(" xyz");
  await editor.press("ControlOrMeta+z");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await expect(editor).not.toContainText(" xyz");
  await expect(editor).toContainText(
    "Bottom continuing through the autosave boundary",
  );
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await editor.press("ControlOrMeta+End");
  await expect(editor).toContainText(
    "Bottom continuing through the autosave boundary",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
});

test("labels, indexes, Quick Links and productive time keep distinct destinations", async ({
  page,
}) => {
  const book = "00000000-0000-4000-8000-000000000004";
  await page.goto("/notebooks");
  await page
    .locator(".notebook-card")
    .filter({ hasText: "Reading" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(new RegExp(`/notebooks/${book}/pages`));
  await page.getByText("Manage notebook labels", { exact: true }).click();
  await page.getByRole("textbox", { name: "Label name" }).fill("Theory");
  await page.getByRole("button", { name: "Add label", exact: true }).click();
  await page.getByRole("link", { name: "Open notebook", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("Filtered page");
  await page.getByRole("checkbox", { name: "Theory", exact: true }).check();
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page.locator(".cm-content").fill("Five new words are here");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All pages & labels" }).click();
  await page
    .getByRole("group", { name: "Match all selected labels" })
    .getByRole("checkbox", { name: "Theory", exact: true })
    .check();
  await page.getByRole("textbox", { name: "Search pages" }).fill("Filtered");
  await expect(page.locator(".entry-row")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Theory", exact: true }),
  ).toBeChecked();
  await page.goto("/");
  await page
    .getByRole("spinbutton", { name: "Reading hours", exact: true })
    .fill("1");
  await page
    .getByRole("spinbutton", { name: "Reading minutes", exact: true })
    .fill("15");
  await page
    .locator(".time-log")
    .filter({
      has: page.getByRole("spinbutton", { name: "Reading hours", exact: true }),
    })
    .getByRole("button", { name: "Save time" })
    .click();
  await expect(page.getByText("Today: 1h 15m")).toBeVisible();
  await page.getByRole("link", { name: "View history" }).click();
  await expect(
    page.getByRole("heading", { name: "1 hours 15 minutes" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Notebook", exact: true })
    .selectOption(book);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "1 hours 15 minutes" }),
  ).toBeVisible();
});

test("slow image uploads preserve insertion position through intervening edits", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = (async (
      ...args: Parameters<typeof createImageBitmap>
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 1400));
      return original(...args);
    }) as typeof createImageBitmap;
  });
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  const editor = page.locator(".cm-content");
  await editor.fill("Beginning\n\nTail");
  await editor.press("ControlOrMeta+Home");
  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#f59a56";
      ctx.fillRect(0, 0, 16, 16);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "slow.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByText("Uploading image…", { exact: true }),
  ).toBeVisible();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" intervening edit");
  await expect(editor).toContainText("asset:");
  const source = await editor.innerText();
  expect(source.indexOf("asset:")).toBeLessThan(source.indexOf("Beginning"));
  expect(source).toContain("Tail intervening edit");
  await editor.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("asset:");
  await expect(editor).toContainText("Tail intervening edit");
  await page.keyboard.type(" after upload");
  await expect(editor).toContainText("Tail intervening edit after upload");
});

test("old entry links open chronological sections and switching sections preserves drafts", async ({
  page,
}) => {
  const notebook = "11111111-1111-4111-8111-111111111111";
  const oldest = "22222222-2222-4222-8222-222222222222";
  const newer = "33333333-3333-4333-8333-333333333333";
  await page.addInitScript(
    ({ notebook, oldest, newer }) => {
      const envelope = {
        revision: 1,
        updated_at: "2020-01-02T12:00:00Z",
        deleted_at: null,
      };
      localStorage.setItem(
        "commonplace:preview:v1",
        JSON.stringify([
          {
            ...envelope,
            id: notebook,
            kind: "notebook",
            data: {
              name: "Chronology",
              description: "",
              icon: "reading",
              research: false,
              color: "#f59a56",
              order: 0,
              archived: false,
            },
          },
          {
            ...envelope,
            id: oldest,
            kind: "entry",
            data: {
              notebookId: notebook,
              date: "2020-01-01",
              title: "Older page",
              markdown: "Original earlier paragraph.",
            },
          },
          {
            ...envelope,
            id: newer,
            kind: "entry",
            data: {
              notebookId: notebook,
              date: "2020-01-02",
              title: "Newer page",
              markdown: "Newer paragraph.",
            },
          },
        ]),
      );
    },
    { notebook, oldest, newer },
  );
  await page.goto(`/entries/${oldest}`);
  await expect(page.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "Older page",
  );
  await expect(page.locator(".dated-section")).toHaveCount(3);
  await expect(page.locator(".cm-editor")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page
    .locator(".cm-content")
    .fill("Earlier paragraph with five saved words.");
  await page
    .getByRole("navigation", { name: "Notebook outline" })
    .getByRole("button", { name: /Newer page/ })
    .click();
  await expect(page.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "Newer page",
  );
  await page
    .getByRole("navigation", { name: "Notebook outline" })
    .getByRole("button", { name: /Older page/ })
    .click();
  await expect(page.locator(".cm-content")).toContainText(
    "Earlier paragraph with five saved words.",
  );
  await expect(
    page.getByText("Previous entries", { exact: false }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/notebook-sections.png",
    fullPage: true,
  });
});
