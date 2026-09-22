import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174`,
        url: "http://127.0.0.1:5174",
        env: { VITE_DEMO_MODE: "true" },
        reuseExistingServer: false,
      },
});
