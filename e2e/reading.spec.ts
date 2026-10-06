import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
const notebook = "00000000-0000-4000-8000-000000000004";
const url = `/notebooks/${notebook}`;
async function log(
  page: Page,
  title: string,
  minutes: string,
  date?: string,
  note = "",
) {
  await page.getByRole("button", { name: "Log reading", exact: true }).click();
  const form = page.getByRole("form", { name: "Log reading session" });
  await form
    .getByRole("combobox", { name: "Book title", exact: true })
    .fill(title);
  await form
    .getByRole("spinbutton", { name: "Minutes", exact: true })
    .fill(minutes);
  if (date) await form.getByLabel("Reading date", { exact: true }).fill(date);
  if (note)
    await form.getByRole("textbox", { name: "Notes (optional)" }).fill(note);
  await form.getByRole("button", { name: "Save log" }).click();
  await expect(form).toHaveCount(0);
}

test("reading table logs multiple sessions, sorts days, and keeps optional notes editable", async ({
  page,
}) => {
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Reading log", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reading-row")).toHaveCount(0);
  await log(
    page,
    "The Creative Act",
    "30",
    "2026-09-25",
    "A way of being attentive",
  );
  await log(page, "A Philosophy of Software Design", "25");
  await log(page, "The Creative Act", "15");
  await expect(page.locator(".reading-row")).toHaveCount(3);
  await expect(page.locator(".reading-row").first()).toContainText(
    "The Creative Act",
  );
  await expect(page.locator(".reading-row").last()).toContainText(
    "Sep 25, 2026",
  );
  await expect(page.locator(".reading-footer")).toContainText(
    "70 minutes in view",
  );
  await expect(page.locator(".reading-footer")).toContainText(
    "3 sessions · 2 books",
  );
  for (const width of [1440, 1024, 640]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const headers = await page.locator(".reading-table thead th").all();
    const cells = await page
      .locator(".reading-row")
      .first()
      .locator("th, td")
      .all();
    for (let i = 0; i < 4; i++)
      expect(
        Math.abs(
          (await headers[i].boundingBox())!.x -
            (await cells[i].boundingBox())!.x,
        ),
      ).toBeLessThan(1);
    await page.screenshot({
      path: `test-results/reading-table-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".reading-row")
    .first()
    .getByRole("button", { name: /Add notes/ })
    .click();
  await page.getByRole("button", { name: "Edit Markdown source" }).click();
  await page.locator(".cm-content").fill("One thought worth writing down.");
  await page.getByRole("button", { name: "Edit log", exact: true }).click();
  const edit = page.getByRole("form", { name: "Edit reading session" });
  await edit
    .getByRole("spinbutton", { name: "Minutes", exact: true })
    .fill("20");
  await edit
    .getByRole("textbox", { name: "Author (optional)" })
    .fill("Rick Rubin");
  await edit.getByRole("button", { name: "Save details" }).click();
  await expect(edit).toHaveCount(0);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/reading-expanded.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close notes", exact: true }).click();
  await expect(page.locator(".reading-row").first()).toContainText(
    "One thought worth writing down.",
  );
  await expect(page.locator(".reading-footer")).toContainText(
    "75 minutes in view",
  );
  await page
    .getByRole("textbox", { name: "Search books or notes" })
    .fill("Rick Rubin");
  await expect(page.locator(".reading-row")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Search books or notes" }),
  ).toHaveValue("Rick Rubin");
  await expect(page.locator(".reading-row")).toContainText("Rick Rubin");
  await expect(page.locator(".reading-footer")).toContainText(
    "20 minutes in view",
  );
  const id = await page.locator(".reading-row").getAttribute("id");
  await page.goto(`/entries/${id!.replace("reading-", "")}`);
  await expect(
    page.getByRole("region", { name: "Notes for The Creative Act" }),
  ).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText(
    "One thought worth writing down.",
  );
  await page.getByRole("link", { name: "All pages", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Manage labels", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".index-entry")).toHaveCount(3);
  await page.getByRole("link", { name: "Open reading log" }).click();
  await expect(page.locator(".reading-row")).toHaveCount(3);
});

test("unfinished reading forms recover after navigation and reload without creating records", async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole("button", { name: "Log reading", exact: true }).click();
  const form = page.getByRole("form", { name: "Log reading session" });
  await form
    .getByRole("combobox", { name: "Book title", exact: true })
    .fill("Recovered book");
  await form
    .getByRole("spinbutton", { name: "Minutes", exact: true })
    .fill("0");
  await form.getByRole("button", { name: "Save log" }).click();
  await expect(page.locator(".reading-row")).toHaveCount(0);
  await form
    .getByRole("spinbutton", { name: "Minutes", exact: true })
    .fill("42");
  await page.screenshot({
    path: "test-results/reading-quick-add.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page.goto(url);
  await expect(
    form.getByRole("combobox", { name: "Book title", exact: true }),
  ).toHaveValue("Recovered book");
  await page.reload();
  await expect(
    form.getByRole("spinbutton", { name: "Minutes", exact: true }),
  ).toHaveValue("42");
  await expect(page.locator(".reading-row")).toHaveCount(0);
  await form.getByRole("button", { name: "Save log" }).click();
  await expect(page.locator(".reading-row")).toHaveCount(1);
  await page.reload();
  await expect(form).toHaveCount(0);
  await expect(page.locator(".reading-row")).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("commonplace:recovery:reading-form:"),
        ).length,
    ),
  ).toBe(0);
});

test("legacy reading pages remain available with original content and date", async ({
  page,
}) => {
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Reading log", exact: true }),
  ).toBeVisible();
  await page.evaluate((notebook) => {
    const records = JSON.parse(localStorage.getItem("commonplace:preview:v1")!);
    records.push({
      id: "00000000-0000-4000-8000-000000000099",
      kind: "entry",
      data: {
        notebookId: notebook,
        title: "An older page",
        date: "2026-09-24",
        markdown: "These original notes must remain intact.",
      },
      revision: 1,
      updated_at: "2026-09-24T12:00:00Z",
      deleted_at: null,
    });
    localStorage.setItem("commonplace:preview:v1", JSON.stringify(records));
  }, notebook);
  await page.reload();
  await page.getByRole("link", { name: /An older page/ }).click();
  await expect(page.getByRole("textbox", { name: "Entry title" })).toHaveValue(
    "An older page",
  );
  await expect(page.locator(".cm-content")).toContainText(
    "These original notes must remain intact.",
  );
  await expect(
    page.getByText("Thursday, September 24, 2026", { exact: true }),
  ).toBeVisible();
});

test("a reading draft keeps its writing day across midnight and a new form uses the new day", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-06T06:59:50Z") });
  await page.goto(url);
  await page.getByRole("button", { name: "Log reading", exact: true }).click();
  const form = page.getByRole("form", { name: "Log reading session" });
  await form
    .getByRole("combobox", { name: "Book title" })
    .fill("Midnight reading");
  await form
    .getByRole("spinbutton", { name: "Minutes", exact: true })
    .fill("15");
  await form
    .getByRole("textbox", { name: "Notes (optional)" })
    .fill("Five words from last night");
  await page.clock.runFor(20000);
  await expect(form.getByLabel("Reading date", { exact: true })).toHaveValue(
    "2026-10-05",
  );
  await form.getByRole("button", { name: "Save log" }).click();
  await expect(form).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("commonplace:preview:v1")!)
        .filter((r: { kind: string }) => r.kind === "writing_progress")
        .map((r: { data: { date: string } }) => r.data.date),
    ),
  ).toEqual(["2026-10-05"]);
  await page.getByRole("button", { name: "Log reading", exact: true }).click();
  await expect(form.getByLabel("Reading date", { exact: true })).toHaveValue(
    "2026-10-06",
  );
});

test("a new reading notebook opens its own empty log from the notebook card", async ({
  page,
}) => {
  await page.goto("/notebooks");
  await page.getByRole("button", { name: "New notebook" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Evening books");
  await page.getByLabel("Notebook layout").selectOption("reading");
  await page.getByRole("button", { name: "Save notebook" }).click();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "Evening books" }) })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reading log", exact: true }),
  ).toBeVisible();
  await log(page, "Book in another notebook", "15");
  await page.goto(url);
  await expect(page.locator(".reading-row")).toHaveCount(0);
});
