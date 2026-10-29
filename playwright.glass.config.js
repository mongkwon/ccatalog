import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/production",
  timeout: 20000,
  fullyParallel: true,
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
});
