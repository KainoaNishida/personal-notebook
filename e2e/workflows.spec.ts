import { test, expect } from "@playwright/test";

function pdf() {
  const stream =
    "BT /F1 18 Tf 50 730 Td (A synthetic research paper) Tj 0 -35 Td (Attention combines queries and keys.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}

test("manual goals and Markdown persist independently", async ({ page }) => {
  await page.goto("/");
  const goal = page.getByRole("checkbox", { name: "Mark Reading complete" });
  await expect(goal).not.toBeChecked();
  await page.screenshot({
    path: "test-results/today-dark.png",
    fullPage: true,
  });
  await goal.click();
  await expect(goal).toBeChecked();
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000003");
  await page.getByRole("button", { name: "New entry", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("A small discovery");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page
    .locator(".cm-content")
    .fill("# Research notes\n\nAn **important** idea.\n\n$$x^2 + y^2$$\n\n");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "A small discovery",
  );
  await expect(page.locator(".katex").first()).toBeVisible();
  await page.goto("/");
  await expect(goal).toBeChecked();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(goal).not.toBeChecked();
});

test("PDF regions survive zoom and reload; AI only opens on request", async ({
  page,
}) => {
  await page.goto("/papers");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "synthetic-paper.pdf",
      mimeType: "application/pdf",
      buffer: pdf(),
    });
  await page.getByRole("button", { name: "New dated entry" }).click();
  await expect(page.locator(".textLayer")).toContainText("Attention combines");
  await page.getByRole("button", { name: "Select PDF region" }).click();
  const bounds = (await page.locator(".region-layer").boundingBox())!;
  await page.mouse.move(bounds.x + 40, bounds.y + 40);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 300, bounds.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Link to notes" }).click();
  await expect(page.locator(".highlight")).toHaveCount(1);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
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
  await expect(page.locator(".paper-card")).toHaveCount(1);
  await expect(page.locator(".paper-card")).toContainText("2 dated entries");
});

test("image, diagram, undo, search and trash recovery", async ({ page }) => {
  await page.goto("/notebooks/00000000-0000-4000-8000-000000000002");
  await page.getByRole("button", { name: "New entry", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Entry title" })
    .fill("A visual notebook");
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page
    .locator(".cm-content")
    .fill("```mermaid\nflowchart LR\n  Q[Queries] --> S[Scores]\n```\n\n");
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
  await expect(page.locator(".cm-content")).toContainText("sketch.png");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".asset-image img")).toBeVisible();
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

test("light theme and narrow desktop panes remain usable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: "test-results/today-light.png",
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
  await page.getByRole("button", { name: "New entry", exact: true }).click();
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
  await expect(other.getByText("Not saved", { exact: true })).toBeVisible();
  await other.getByText("Review the saved version", { exact: true }).click();
  await expect(other.locator(".conflict-preview")).toContainText(
    "First window",
  );
  await other
    .getByRole("button", { name: "Save my recovered version" })
    .click();
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
  await page.getByRole("button", { name: "New dated entry" }).click();
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
