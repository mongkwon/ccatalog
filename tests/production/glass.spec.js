import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";

// Exercise the minified artifact: source CSS alone cannot detect this regression.
const css = readdirSync("dist/assets")
  .filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(`dist/assets/${name}`, "utf8"))
  .join("\n");

for (const surface of ["bottom-dock", "search-panel", "selected-card"]) {
  test(`production ${surface} visibly blurs its backdrop`, async ({ page }, testInfo) => {
    await page.setContent(`<style>${css}</style>
      <style>
        .test-pattern { position: fixed; inset: 0; background: repeating-linear-gradient(90deg, #132e48 0 4px, #e8f6ff 4px 8px); }
        .glass-probe { position: absolute; inset: 80px auto auto 24px; }
        .glass-probe > div {
          position: relative; top: auto; right: auto; bottom: auto; left: auto;
          width: 320px; min-width: 320px; max-width: 320px; height: 120px;
          opacity: 1; visibility: visible; transform: none; transition: none; padding: 0;
        }
      </style>
      <div class="test-pattern"></div><div class="glass-probe"><div class="${surface}"></div></div>`);
    const element = page.locator(`.glass-probe > .${surface}`);
    const filter = await element.evaluate((element) => getComputedStyle(element).getPropertyValue("backdrop-filter"));
    expect(filter).toContain("blur(34px)");
    if (testInfo.project.name === "mobile-webkit") {
      const prefixed = await element.evaluate((element) => getComputedStyle(element).getPropertyValue("-webkit-backdrop-filter"));
      expect(prefixed).toContain("blur(34px)");
      testInfo.annotations.push({ type: "limitation", description: "This WebKit screenshot runtime does not render backdrop blur, including on a minimal standalone reproduction. Both computed declarations are checked here; rendered pixel checks run on Chromium." });
      return;
    }

    const glass = await element.screenshot({ scale: "css" });
    await element.evaluate((element) => {
      element.style.setProperty("backdrop-filter", "none", "important");
      element.style.setProperty("-webkit-backdrop-filter", "none", "important");
    });
    const clear = await element.screenshot({ scale: "css" });
    const difference = await page.evaluate(async ([first, second]) => {
      async function pixels(data) {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      }
      const [a, b] = await Promise.all([pixels(first), pixels(second)]);
      let difference = 0;
      let samples = 0;
      for (let y = 35; y < a.height - 35; y++) {
        for (let x = 45; x < a.width - 45; x++) {
          const i = (y * a.width + x) * 4;
          for (let channel = 0; channel < 3; channel++) {
            difference += Math.abs(a.data[i + channel] - b.data[i + channel]);
            samples++;
          }
        }
      }
      return difference / samples;
    }, [glass.toString("base64"), clear.toString("base64")]);
    expect(difference).toBeGreaterThan(20);
    await testInfo.attach("blurred", { body: glass, contentType: "image/png" });
    await testInfo.attach("unblurred", { body: clear, contentType: "image/png" });
  });
}
