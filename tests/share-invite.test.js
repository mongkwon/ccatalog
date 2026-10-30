import test from "node:test";
import assert from "node:assert/strict";
import { shareInvite } from "../outputs/ccatalog/src/lib/share-invite.js";

const url = "https://mongkwon.github.io/ccatalog/?invite=example";
test("native sharing gets the invitation and cancellation does not copy", async () => {
  let shared;
  const browser = {
    share: async (data) => {
      shared = data;
    },
  };
  assert.equal(await shareInvite(url, "친구들", browser), "shared");
  assert.equal(shared.url, url);
  assert.equal(shared.title, "까탈로그 · 친구들");
  browser.share = async () => {
    throw new DOMException("Cancelled", "AbortError");
  };
  assert.equal(await shareInvite(url, "친구들", browser), "cancelled");
});
test("unsupported sharing uses clipboard or keeps manual copying available", async () => {
  let copied;
  assert.equal(
    await shareInvite(url, "친구들", {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        },
      },
    }),
    "copied",
  );
  assert.equal(copied, url);
  assert.equal(await shareInvite(url, "친구들", {}), "manual");
});
test("lost user activation keeps a reusable invitation with a clipboard fallback", async () => {
  const browser = {
    share: async () => {
      throw new DOMException("Activation expired", "NotAllowedError");
    },
    clipboard: { writeText: async () => {} },
  };
  assert.equal(await shareInvite(url, "친구들", browser), "retry-copied");
  delete browser.clipboard;
  assert.equal(await shareInvite(url, "친구들", browser), "retry");
});
