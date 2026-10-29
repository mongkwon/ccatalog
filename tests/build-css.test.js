import test from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";

test("production CSS retains standard and WebKit backdrop filters", async () => {
  const result = await build({ logLevel: "silent", build: { write: false } });
  const css = result.output
    .filter((item) => item.type === "asset" && item.fileName.endsWith(".css"))
    .map((item) => String(item.source))
    .join("\n");
  const standard = css.match(/(?:^|[;{])backdrop-filter\s*:/g) ?? [];
  const prefixed = css.match(/(?:^|[;{])-webkit-backdrop-filter\s*:/g) ?? [];
  assert.ok(standard.length >= 9, "Production minification removed a standard backdrop-filter declaration");
  assert.equal(standard.length, prefixed.length, "Both browser spellings must survive the CSS build");
});
