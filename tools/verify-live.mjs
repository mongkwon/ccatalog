import { chromium, webkit, devices } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:4174/";
mkdirSync("test-results/live", { recursive: true });
for (const [name, engine, device] of [
  ["desktop", chromium, { viewport: { width: 1440, height: 900 } }],
  ["mobile", webkit, devices["iPhone 13"]],
]) {
  const browser = await engine.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({
      ...device,
      geolocation: { latitude: 37.566535, longitude: 126.977969, accuracy: 15 },
      permissions: ["geolocation"],
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error(JSON.stringify({ name, pageError: error.stack }));
    });
    await page.addInitScript(() =>
      localStorage.setItem("ccatalog.tutorial.v3", "complete"),
    );
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#adminButton")?.textContent === "로그인",
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => document.querySelector(".user-location-marker"),
      { timeout: 20000 },
    );
    await page.waitForTimeout(1200);
    const glassFilters = await page.evaluate(() =>
      Object.fromEntries(
        [
          ".brand",
          ".bottom-dock",
          ".search-panel",
          ".restaurant-panel",
          ".selected-card",
        ].map((selector) => [
          selector,
          getComputedStyle(document.querySelector(selector)).getPropertyValue(
            "backdrop-filter",
          ),
        ]),
      ),
    );
    await page.screenshot({ path: `test-results/live/${name}-list.png` });
    await page.locator("#adminButton").click();
    await page.getByRole("button", { name: "카카오로 시작하기" }).waitFor();
    await page.screenshot({ path: `test-results/live/${name}-guest.png` });
    await page.locator("#searchToggle").click();
    await page.locator("#searchInput").fill("없는식당테스트");
    await page.waitForTimeout(600);
    const result = await page.locator("#resultCount").textContent();
    await page.locator("#filterModeButton").click();
    console.log(
      JSON.stringify({
        name,
        url,
        result,
        errors,
        glassFilters,
        mapVisible: await page.locator("#map").isVisible(),
        listCount: await page.locator(".restaurant-item").count(),
      }),
    );
    if (
      errors.length ||
      result !== "0곳" ||
      Object.values(glassFilters).some((value) => !value.includes("blur("))
    )
      process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ name, message: error.message, errors }));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
