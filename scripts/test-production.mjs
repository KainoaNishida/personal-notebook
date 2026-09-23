import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5175",
    "--strictPort",
  ],
  { stdio: "pipe", windowsHide: true },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null)
      throw new Error("Production preview server exited");
    try {
      ready = (await fetch("http://127.0.0.1:5175")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Production preview did not start");
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5175");
  await page.getByRole("heading", { name: "Password to enter" }).waitFor();
  assert.equal(await page.locator("input[type=email]").count(), 0);
  if (await page.locator('input[type="password"]').count()) {
    await page.setViewportSize({ width: 1280, height: 800 });
    const form = await page.locator(".login-form").boundingBox();
    assert.ok(form && Math.abs(form.x + form.width / 2 - 640) < 2);
    assert.ok(Math.abs(form.y + form.height / 2 - 400) < 2);
    await page.screenshot({ path: "test-results/password-entry-desktop.png" });
    await page.setViewportSize({ width: 640, height: 400 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({ path: "test-results/password-entry-narrow.png" });
    console.log(
      "PASS password-only screen stays centered at desktop and narrow sizes",
    );
  }
  assert.equal(
    await page
      .getByRole("heading", { name: "Make room for curiosity." })
      .count(),
    0,
  );
  await page.evaluate(() =>
    localStorage.setItem("commonplace:preview:v1", "[]"),
  );
  await page.goto("http://127.0.0.1:5175/papers");
  await page.getByRole("heading", { name: "Password to enter" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Add a paper" }).count(),
    0,
  );
  console.log(
    "PASS production build keeps the authentication/setup gate even with preview storage and a deep link",
  );
} finally {
  await browser?.close();
  server.kill();
}
