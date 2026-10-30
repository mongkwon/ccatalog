import test from "node:test";
import assert from "node:assert/strict";
import {
  safeNaverUrl,
  sharedInput,
  fetchNaverPage,
  pagePlace,
  resolveSharedPlace,
} from "../supabase/functions/naver-place-search/naver-link.js";

const url = "https://map.naver.com/p/entry/place/123456/home";
const candidate = {
  name: "정돈 논현점",
  address: "서울특별시 강남구 논현동 1",
  roadAddress: "서울특별시 강남구 강남대로 1",
  lat: 37.5,
  lng: 127.02,
};
const shared = `[네이버지도]\n정돈 논현점\n서울 강남구 강남대로 1\nhttps://naver.me/example`;

test("only HTTPS Naver map hosts without credentials or custom ports are accepted", () => {
  assert.equal(safeNaverUrl(url + "#test").href, url);
  for (const value of [
    "http://naver.me/example",
    "https://naver.me.evil.test/x",
    "https://naver.me@127.0.0.1/",
    "https://naver.me:8443/x",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://user:password@naver.me/x",
    "file:///etc/passwd",
    "https://nid.naver.com/",
  ])
    assert.throws(() => safeNaverUrl(value), /invalid_naver_link/);
  assert.equal(sharedInput(shared).name, candidate.name);
  assert.equal(sharedInput(shared).address, "서울 강남구 강남대로 1");
  assert.throws(
    () => sharedInput("https://naver.me/" + "x".repeat(4096)),
    /invalid_naver_link/,
  );
});

test("each redirect is checked before any outgoing request and loops are bounded", async () => {
  let calls = 0;
  await assert.rejects(
    fetchNaverPage("https://naver.me/example", async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      });
    }),
    /invalid_naver_link/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    fetchNaverPage("https://naver.me/example", async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "https://naver.me/example" },
      });
    }),
    /too_many_redirects/,
  );
  assert.equal(calls, 5);
});

test("structured place data must match the URL place ID and valid Korean coordinates", () => {
  const html = `<script>window.__APOLLO_STATE__=${JSON.stringify({ "PlaceDetailBase:123456": { id: "123456", ...candidate, x: 127.02, y: 37.5 } })};window.shouldNotExecute=true;</script>`;
  assert.equal(pagePlace(html, "123456").name, candidate.name);
  assert.equal(pagePlace(html, "123456").lat, candidate.lat);
  assert.equal(pagePlace(html, "9999").name, undefined);
  assert.equal(globalThis.shouldNotExecute, undefined);
  const ld = `<script type="application/ld+json">${JSON.stringify({ "@type": "Restaurant", url, name: candidate.name, address: { addressRegion: "서울", addressLocality: "강남구", streetAddress: "강남대로 1" }, geo: { latitude: 37.5, longitude: 127.02 } })}</script>`;
  assert.equal(pagePlace(ld, "123456").lng, candidate.lng);
});

test("a verified place link imports directly without an extra search", async () => {
  let requests = 0;
  const fetcher = async () =>
    ++requests === 1
      ? new Response(null, { status: 307, headers: { location: url } })
      : new Response(
          `<script type="application/ld+json">${JSON.stringify({ id: "123456", ...candidate })}</script>`,
        );
  const result = await resolveSharedPlace(
    "https://naver.me/example",
    async () => {
      throw new Error("search should not run");
    },
    { fetcher },
  );
  assert.equal(result.verified, true);
  assert.equal(result.items[0].name, candidate.name);
});

test("blocked pages use shared name and address while ambiguous candidates require selection", async () => {
  const fetcher = async () => new Response("rate limited", { status: 429 });
  const result = await resolveSharedPlace(
    shared,
    async (query) => {
      assert.equal(query, candidate.name);
      return [candidate];
    },
    { fetcher },
  );
  assert.equal(result.verified, true);
  const uncertain = await resolveSharedPlace(
    `[네이버지도]\n${candidate.name}\nhttps://naver.me/example`,
    async () => [candidate],
    { fetcher },
  );
  assert.equal(uncertain.verified, false);
  assert.equal(uncertain.items.length, 1);
  const unavailable = await resolveSharedPlace(
    "https://naver.me/example",
    async () => {
      throw new Error("no query");
    },
    { fetcher },
  );
  assert.equal(unavailable.verified, false);
  assert.equal(unavailable.items.length, 0);
});

test("oversized pages are cancelled", async () => {
  await assert.rejects(
    fetchNaverPage(
      url,
      async () =>
        new Response("test", { headers: { "content-length": "3000000" } }),
    ),
    /page_too_large/,
  );
});
