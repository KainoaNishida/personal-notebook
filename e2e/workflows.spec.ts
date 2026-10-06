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
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.locator(".goal-card").filter({ hasText: "Art & portraits" }),
  ).toContainText("Write five new words");
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page.locator(".cm-content").fill("one two three four five");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.locator(".cm-content").fill("");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
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
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  // Autosave reorders the query cache, then a server refresh replaces object
  // references. Neither event should navigate back to an old source link.
  await page.getByRole("spinbutton", { name: "PDF page" }).fill("2");
  await page.getByRole("button", { name: /Rename paper:/ }).click();
  await page
    .getByRole("textbox", { name: "Paper title", exact: true })
    .fill("Reading on page two");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
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

test("image captions, search and removal of deletion controls", async ({
  page,
}) => {
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
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Image caption" })
    .fill("A hand-drawn [study] $&");
  await page.getByRole("textbox", { name: "Image caption" }).press("Enter");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".asset-image img")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Image caption" }),
  ).toHaveValue("A hand-drawn [study] $&");
  await expect(page.getByText("Section options", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Move entry to trash" }),
  ).toHaveCount(0);
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
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
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
  await expect(
    other.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
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
  expect(download.suggestedFilename()).toMatch(
    /^kais-notebook-\d{4}-\d{2}-\d{2}\.zip$/,
  );
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
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await editor.press("ControlOrMeta+End");
  await editor.press("End");
  const first = await page.locator(".live-block").first().elementHandle();
  const scroll = await page
    .locator(".science-notes")
    .evaluate((el) => el.scrollTop);
  await page.keyboard.type(" continuing through the autosave boundary", {
    delay: 65,
  });
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
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
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
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

test("label creation, filtering, editing and shared color controls", async ({
  page,
}) => {
  const book = "00000000-0000-4000-8000-000000000004";
  await page.goto(`/notebooks/${book}`);
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("Filtered page");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page.locator(".cm-content").fill("Five new words are here");
  await page.getByRole("button", { name: "Add label", exact: true }).click();
  await page.getByRole("textbox", { name: "Label name" }).fill("Theory");
  await page.getByRole("textbox", { name: "Label color hex" }).fill("#bad");
  await expect(
    page.getByRole("button", { name: "Create label", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Label color: #60a5fa", exact: true })
    .click();
  await page.getByRole("button", { name: "Create label", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Theory", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Theory", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Theory", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Theory", exact: true })
    .press("Space");
  await expect(
    page.getByRole("button", { name: "Theory", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("Five new words");
  await page.getByRole("link", { name: "All pages", exact: true }).click();
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await page.getByRole("button", { name: "Theory", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("textbox", { name: "Search pages" }).fill("Filtered");
  await expect(page.locator(".index-entry")).toHaveCount(1);
  await page.reload();
  await expect(
    page
      .locator(".active-filters")
      .getByRole("button", { name: "Theory", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Manage labels", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Theory", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Label name" }).fill("Foundations");
  await page.getByRole("textbox", { name: "Label color hex" }).fill("#ff00ff");
  await page.getByRole("button", { name: "Save label", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Foundations", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/third-label-dialog.png",
    fullPage: true,
  });
  await page.getByRole("textbox", { name: "Label name" }).fill(" foundations ");
  await page.getByRole("button", { name: "Create label", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("textbox", { name: "Label name" }).fill("Practice");
  await page.getByRole("button", { name: "Create label", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Practice", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Labels (1)", exact: true }).click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".index-entry")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".active-filters .label-chip")).toHaveCount(2);
  await page
    .locator(".active-filters")
    .getByRole("button", { name: "Practice", exact: true })
    .click();
  await expect(page.locator(".index-entry")).toHaveCount(1);
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  await page.getByRole("button", { name: "Add label", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Foundations", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/settings");
  await page.getByRole("textbox", { name: "Accent color hex" }).fill("invalid");
  await expect(
    page.getByRole("button", { name: "Save colors" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Accent color: #60a5fa", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("button", { name: "Main color: Midnight", exact: true })
    .click();
  await page.getByRole("button", { name: "Save colors" }).click();
  await expect(page.getByText("Colors saved.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Accent color hex" }),
  ).toHaveValue("#60a5fa");
  await expect(
    page.getByRole("button", { name: "Main color: Midnight" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "test-results/third-colors.png",
    fullPage: true,
  });
  await page.goto("/history");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Productive time", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Save time" })).toHaveCount(0);
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

test("Quick Links isolate today, historical links preserve drafts and index sorts dates", async ({
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
  await page.goto(`/notebooks/${notebook}?entry=${oldest}`);
  await expect(page).toHaveURL(new RegExp(`/entries/${oldest}$`));
  await expect(page.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "Older page",
  );
  await expect(page.locator(".cm-editor")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Notebook outline" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page
    .locator(".cm-content")
    .fill("Earlier paragraph with five saved words.");
  await page.getByRole("link", { name: "Chronology", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "",
  );
  await expect(page.getByText("Newer paragraph.", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Older page", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "All pages", exact: true }).click();
  await expect(page.locator(".index-entry h2")).toHaveText([
    "Newer page",
    "Older page",
  ]);
  await page
    .getByRole("combobox", { name: "Sort by date" })
    .selectOption("asc");
  await expect(page.locator(".index-entry h2")).toHaveText([
    "Older page",
    "Newer page",
  ]);
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Older page", exact: true }),
    })
    .click();
  await expect(page.locator(".cm-content")).toContainText(
    "Earlier paragraph with five saved words.",
  );
  await page.getByRole("link", { name: "Back to pages" }).click();
  await page.goto(
    `/notebooks/${notebook}/pages?from=2020-01-02&to=2020-01-02&sort=asc&q=page`,
  );
  await expect(page).not.toHaveURL(/from=/);
  await expect(page.locator(".index-entry")).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Sort by date" }),
  ).toHaveValue("asc");
  await page.screenshot({
    path: "test-results/third-index.png",
    fullPage: true,
  });
});

test("Activity dates align at narrow and wide widths and empty days do not navigate", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.locator(".activity-table").evaluate((table) => {
      const headers = [...table.querySelectorAll("thead th")].slice(1);
      const cells = [...table.querySelectorAll("tbody tr:first-child td")];
      return headers.map((h, i) => ({
        header: h.getBoundingClientRect().x,
        cell: cells[i].getBoundingClientRect().x,
        width: cells[i].getBoundingClientRect().width,
      }));
    });
    for (const cell of geometry) {
      expect(Math.abs(cell.header - cell.cell)).toBeLessThan(1);
      expect(cell.width).toBeGreaterThanOrEqual(32);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.locator(".activity-table tbody td:not(:last-child) a"),
    ).toHaveCount(0);
    await expect(page.locator(".activity-table tbody a")).toHaveCount(1);
    await page.screenshot({
      path: `test-results/third-today-${width}.png`,
      fullPage: true,
    });
  }
});

test("daily writing rolls over at midnight without moving the prior day's text", async ({
  page,
}) => {
  const book = "00000000-0000-4000-8000-000000000003";
  await page.clock.install({ time: new Date("2026-09-29T06:59:30Z") });
  await page.goto(`/notebooks/${book}`);
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("Before midnight");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page.locator(".cm-content").fill("This belongs to the previous day.");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(31000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".entry-date")).toContainText("September 29, 2026");
  await expect(page.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "",
  );
  await expect(page.locator(".cm-content")).not.toContainText("previous day");
  await page.getByRole("link", { name: "All pages", exact: true }).click();
  await expect(page.locator(".index-entry")).toHaveCount(1);
  await page.locator(".index-entry").click();
  await expect(page.locator(".entry-date")).toContainText("September 28, 2026");
  await expect(page.locator(".cm-content")).toContainText(
    "This belongs to the previous day.",
  );
});

test("research caret stays at the insertion point through source links and pane changes", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-28T18:00:00Z") });
  await page.goto("/papers");
  await page.locator("input[type=file]").setInputFiles({
    name: "cursor-study.pdf",
    mimeType: "application/pdf",
    buffer: pdf(),
  });
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  const editor = page.locator(".cm-content");
  await editor.fill(
    Array.from(
      { length: 8 },
      (_, i) =>
        `## Section ${i}\n\n$$\n\\frac{x^2}{\\sqrt{y}}\n$$\n\nParagraph ${i}: a research explanation with enough text to wrap when the notes pane is narrow.`,
    ).join("\n\n") + "\n\nInsertion target",
  );
  await editor.press("ControlOrMeta+End");
  await page.getByRole("button", { name: "Use live preview" }).click();
  await editor.press("ControlOrMeta+End");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  // Link actual PDF text while the editor has an existing insertion position.
  const span = page
    .locator(".textLayer span")
    .filter({ hasText: "Attention combines" });
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator(".pdf-page").dispatchEvent("mouseup");
  await page.getByRole("button", { name: "Link to notes" }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type("After source link");
  const caretGeometry = async () =>
    page.evaluate(() => {
      const selection = window.getSelection()!;
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(false);
      const actual = range.getBoundingClientRect();
      const drawn = document
        .querySelector(".cm-cursor")
        ?.getBoundingClientRect();
      return {
        nativeX: actual.x,
        nativeY: actual.y,
        drawnX: drawn?.x,
        drawnY: drawn?.y,
        caretColor: getComputedStyle(document.querySelector(".cm-content")!)
          .caretColor,
        node: selection.anchorNode?.textContent,
        offset: selection.anchorOffset,
      };
    });
  const assertNativeCaret = async () => {
    const caret = await caretGeometry();
    expect(caret.drawnX).toBeUndefined();
    expect(caret.caretColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(caret.nativeX).toBeGreaterThan(0);
    expect(caret.nativeY).toBeGreaterThan(0);
    expect(caret.node).toContain("After source link");
    expect(caret.offset).toBe(caret.node?.length);
  };
  await assertNativeCaret();
  await page.getByRole("button", { name: "Expand PDF", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore split view", exact: true })
    .click();
  const divider = page.getByRole("separator", { name: "Resize PDF and notes" });
  await divider.press("ArrowRight");
  await divider.press("ArrowRight");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" after resize");
  await assertNativeCaret();
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await expect(editor).toContainText("After source link after resize");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" after reload");
  await assertNativeCaret();
  await editor.press("Shift+ArrowLeft");
  await editor.press("Shift+ArrowLeft");
  await page.keyboard.type("XX");
  await expect(editor).toContainText("after reloXX");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toContainText("after reload");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  // A click on rendered prose activates its source without losing insertion.
  const paragraph = page
    .locator(".live-block p")
    .filter({ hasText: "Paragraph 7:" });
  await paragraph.click();
  await editor.press("End");
  await page.keyboard.type(" clicked-here");
  await expect(editor).toContainText("clicked-here");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const paperUrl = page.url();
  await page.clock.fastForward(86400000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("link", { name: "Back to paper library" }).click();
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("Another notebook");
  await page.goto(paperUrl);
  await page.getByRole("link", { name: "Back to paper library" }).click();
  await expect(page.locator(".research-timeline .entry-row")).toHaveCount(2);
  await page.locator(".research-timeline .entry-row").last().click();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" after navigation");
  await assertNativeCaret();
  await expect(
    page.locator(".textLayer span").filter({ hasText: "Attention combines" }),
  ).toBeVisible();
  const sourceColor = await editor
    .locator("span")
    .filter({ hasText: /^\(?annotation:/ })
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  expect(sourceColor).toBe("rgb(201, 206, 217)");
  await page.screenshot({
    path: "test-results/fourth-research-caret.png",
    fullPage: true,
  });
});

test("whole goal cards navigate and the Markdown guide is accessible", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Kai’s Notebook");
  await expect(
    page.getByRole("link", { name: "Kai’s Notebook home" }),
  ).toBeVisible();
  await expect(page.getByText("Kai’s Journal", { exact: true })).toHaveCount(0);
  const card = page.locator(".goal-card").filter({ hasText: "System design" });
  await expect(card).toHaveAttribute("href", /\/notebooks\//);
  const box = (await card.boundingBox())!;
  await card.click({ position: { x: box.width - 8, y: box.height - 8 } });
  await expect(
    page.getByRole("heading", { name: "System design", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cm-content")).toHaveCount(1);
  await page.goto("/");
  const research = page
    .locator(".goal-card")
    .filter({ hasText: "Research papers" });
  await research.focus();
  await research.press("Enter");
  await expect(page.locator(".research-timeline")).toBeVisible();
  await page.goto("/help/markdown");
  await expect(
    page.getByRole("heading", { name: "Markdown guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Code blocks", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".markdown-help")).toContainText("\\frac{-b");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy code blocks example" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '```python\ndef greet(name):\n    print(f"Hello, {name}!")\n```',
  );
  await page.getByText("Diagrams and plots", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mermaid diagram", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Markdown guide", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/fourth-markdown-guide.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 640, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/fourth-markdown-guide-narrow.png",
    fullPage: true,
  });
});

test("single-line code has a labeled header and preserves code when copied", async ({
  page,
  context,
}) => {
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page
    .locator(".cm-content")
    .fill('```python\nprint("hello world")\n```\n\nContinue here');
  await page.getByRole("button", { name: "Use live preview" }).click();
  const block = page.locator(".code-block");
  await expect(block).toBeVisible();
  const geometry = await block.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const content = el.querySelector(".code-content")!.getBoundingClientRect();
    const button = el.querySelector("button")!.getBoundingClientRect();
    return {
      height: box.height,
      contentTop: content.top - box.top,
      buttonTop: button.top - box.top,
    };
  });
  await expect(block.locator(".code-language")).toHaveText("python");
  expect(geometry.height).toBeLessThan(100);
  expect(geometry.buttonTop).toBe(16);
  expect(geometry.contentTop).toBeGreaterThan(geometry.buttonTop + 20);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await block.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'print("hello world")\n',
  );
  await page.screenshot({
    path: "test-results/fourth-code-block.png",
    fullPage: true,
  });
});

test("Markdown guide scrolls with the wheel across its full pane and with the keyboard", async ({
  page,
}) => {
  for (const width of [1920, 1440, 640]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/help/markdown");
    const guide = page.getByRole("main");
    await expect(
      page.getByRole("heading", { name: "Markdown guide", exact: true }),
    ).toBeVisible();
    // Wheel over the right side of the application, including the guide's gutter.
    await page.mouse.move(width - 24, 400);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => guide.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await guide.focus();
    await page.keyboard.press("End");
    await expect(
      page.getByText("Diagrams and plots", { exact: true }),
    ).toBeInViewport();
    await page.getByText("Diagrams and plots", { exact: true }).click();
    await guide.focus();
    await page.keyboard.press("End");
    await expect(
      page.getByRole("heading", { name: "Plot", exact: true }),
    ).toBeInViewport();
    await page.keyboard.press("Home");
    await expect(
      page.getByRole("heading", { name: "Markdown guide", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  }
});

test("Calm desk formatting preserves selection, undo, drafts and helper scrolling", async ({
  page,
}) => {
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  const editor = page.locator(".cm-content");
  await page
    .getByRole("button", { name: "Edit Markdown source", exact: true })
    .click();
  await editor.fill("A useful thought");
  await editor.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(editor).toHaveText("**A useful thought**");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveText("A useful thought");
  await editor.press(
    process.platform === "darwin" ? "Meta+Shift+z" : "Control+y",
  );
  await expect(editor).toHaveText("**A useful thought**");
  await editor.press("ControlOrMeta+z");
  await editor.press("ControlOrMeta+a");
  await editor.press("ControlOrMeta+i");
  await expect(editor).toHaveText("*A useful thought*");
  await editor.press("ControlOrMeta+z");
  await editor.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Math", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Display equation", exact: true })
    .click();
  await expect(editor).toContainText("$$");
  await editor.press("ControlOrMeta+z");
  await editor.press("ControlOrMeta+End");
  await page
    .getByRole("button", { name: "Markdown guide", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const guide = page.locator(".guide-dialog-scroll");
  await guide.focus();
  await guide.press("End");
  await expect
    .poll(() => guide.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await dialog.getByText("Diagrams and plots", { exact: true }).click();
  await guide.press("Home");
  await page.mouse.move(650, 500);
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => guide.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Markdown guide", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page.keyboard.type("continued");
  await expect(editor).toContainText("A useful thought*continued*");
  await expect(
    page.getByText("All changes saved", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Edit Markdown source", exact: true })
    .click();
  await expect(editor).toContainText("A useful thought*continued*");
  for (const width of [640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".editor-toolbar")).toBeVisible();
    expect(
      await page
        .locator(".daily-page")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/calm-writing-${width}.png` });
    await page
      .getByRole("button", { name: "Markdown guide", exact: true })
      .click();
    await page.screenshot({ path: `test-results/calm-guide-${width}.png` });
    await page.keyboard.press("Escape");
  }
  await page.goto("/");
  await expect(page.locator(".activity-table")).toBeVisible();
  await expect(
    page
      .locator(".app-sidebar")
      .getByRole("link", { name: "Markdown guide", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/calm-today.png" });
});

test("daily time calculator multiplies durations and restores only today's list", async ({
  page,
}) => {
  await page.goto("/");
  const times = page.getByRole("textbox", {
    name: "Times (MM:SS, separated by commas)",
  });
  const total = page.getByLabel("Time total multiplied by seven");
  await times.fill("10:00");
  await expect(total).toHaveText("01:10:00");
  await times.fill("10:00, 10:00");
  await expect(total).toHaveText("02:20:00");
  await page.reload();
  await expect(times).toHaveValue("10:00, 10:00");
  await times.fill("10:60");
  await expect(times).toHaveAttribute("aria-invalid", "true");
  await expect(total).toHaveText("—");
  await times.fill("");
  await expect(total).toHaveText("00:00:00");
  await page.evaluate(() =>
    localStorage.setItem(
      "kais-notebook:time-calculator:preview",
      JSON.stringify({ date: "2000-01-01", input: "10:00" }),
    ),
  );
  await page.reload();
  await expect(times).toHaveValue("");
  await page.setViewportSize({ width: 640, height: 900 });
  expect(
    await page
      .locator(".time-calculator-card")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("actual work time syncs daily earnings across edits, reloads, and midnight", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-02T19:00:00Z") });
  await page.goto("/");
  const actual = page.getByRole("textbox", {
    name: "Actual time worked (HH:MM:SS)",
  });
  const dailyEarnings = page.getByLabel("Today's earnings");
  const allEarnings = page.getByLabel("All-time earnings");
  await expect(allEarnings).toHaveText("$1,464.47");
  await page
    .getByRole("textbox", { name: "Times (MM:SS, separated by commas)" })
    .fill("10:00, 10:00");
  await expect(page.getByLabel("Time total multiplied by seven")).toHaveText(
    "02:20:00",
  );
  await actual.fill("01:30:00");
  await expect(dailyEarnings).toHaveText("$120.00");
  await expect(allEarnings).toHaveText("$1,584.47");
  await actual.fill("02:00:00");
  await expect(allEarnings).toHaveText("$1,624.47");
  await page.reload();
  await expect(actual).toHaveValue("02:00:00");
  await expect(allEarnings).toHaveText("$1,624.47");
  await page.clock.setSystemTime(new Date("2026-10-03T19:00:00Z"));
  await page.clock.runFor(1000);
  await expect(actual).toHaveValue("");
  await expect(dailyEarnings).toHaveText("$0.00");
  await expect(allEarnings).toHaveText("$1,624.47");
  await actual.fill("00:30:00");
  await expect(allEarnings).toHaveText("$1,664.47");
  await expect(page.getByLabel("All-time hours")).toHaveText("20:48:21");
  await page
    .locator(".time-calculator-card")
    .screenshot({ path: "test-results/time-earnings-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(actual).toBeVisible();
  expect(
    await page
      .locator(".time-calculator-card")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page
    .locator(".time-calculator-card")
    .screenshot({ path: "test-results/time-earnings-mobile.png" });
});
