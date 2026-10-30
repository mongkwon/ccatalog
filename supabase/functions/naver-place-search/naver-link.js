import { parseDocument } from "htmlparser2";

const HOSTS = new Set([
  "naver.me",
  "map.naver.com",
  "m.map.naver.com",
  "m.place.naver.com",
  "pcmap.place.naver.com",
  "place.naver.com",
]);

export function safeNaverUrl(value, base) {
  const url = new URL(value, base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !HOSTS.has(url.hostname)
  )
    throw new Error("invalid_naver_link");
  url.hash = "";
  return url;
}

export function sharedInput(text) {
  const value = String(text || "").trim();
  if (value.length > 4096) throw new Error("invalid_naver_link");
  const match = value.match(/https?:\/\/[^\s<>"\u3000]+/i);
  if (!match) throw new Error("invalid_naver_link");
  const url = safeNaverUrl(match[0].replace(/[)\],.]+$/, ""));
  const lines = value
    .replace(match[0], "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) => line && !/^\[?(?:네이버\s*지도|naver\s*map)\]?$/i.test(line),
    );
  return {
    url,
    name: lines[0]?.slice(0, 100) || "",
    address: lines.slice(1).join(" ").slice(0, 300),
  };
}

export function placeId(url) {
  return (
    url.pathname.match(/\/(?:place|restaurant|cafe)\/(\d+)(?:\/|$)/)?.[1] ||
    null
  );
}

async function readHtml(response) {
  if (Number(response.headers.get("content-length")) > 2_000_000) {
    await response.body?.cancel();
    throw new Error("page_too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let total = 0;
  let html = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2_000_000) throw new Error("page_too_large");
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    await reader.cancel();
  }
}

// Validate every redirect before issuing a request; no cookies or API credentials are forwarded.
export async function fetchNaverPage(initial, fetcher = fetch, signal) {
  let url = safeNaverUrl(initial);
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetcher(url.href, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/html" },
    });
    const location = response.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      await response.body?.cancel();
      url = safeNaverUrl(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { url, html: "", blocked: true };
    }
    return { url, html: await readHtml(response), blocked: false };
  }
  throw new Error("too_many_redirects");
}

function assignedJson(script) {
  const marker = "__APOLLO_STATE__";
  const at = script.indexOf(marker);
  if (at < 0) return null;
  const equals = script.indexOf("=", at + marker.length);
  if (equals < 0) return null;
  const start = script.indexOf("{", equals);
  if (start < 0 || script.slice(equals + 1, start).trim()) return null;
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < script.length; i++) {
    const char = script[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try {
        return JSON.parse(script.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function pagePlace(html, id) {
  const document = parseDocument(html);
  const data = [];
  let title = "";
  const nodes = [...document.children];
  while (nodes.length) {
    const node = nodes.pop();
    if (node.name === "meta" && node.attribs?.property === "og:title")
      title = node.attribs.content || "";
    if (node.name === "script") {
      const text = (node.children || [])
        .map((child) => child.data || "")
        .join("");
      try {
        if (
          ["application/ld+json", "application/json"].includes(
            node.attribs?.type,
          )
        )
          data.push(JSON.parse(text));
        else {
          const state = assignedJson(text);
          if (state) data.push(state);
        }
      } catch {
        /* Ignore unrelated or malformed data without executing scripts. */
      }
    }
    if (node.children) nodes.push(...node.children);
  }
  const queue = data.map((value) => ({ value, key: "" }));
  while (queue.length) {
    const { value, key } = queue.pop();
    if (!value || typeof value !== "object") continue;
    const matches =
      id &&
      (String(value.id || "") === id ||
        key.split(":").at(-1) === id ||
        [value.url, value["@id"]].some(
          (link) =>
            typeof link === "string" &&
            link.match(
              new RegExp(`/(?:place|restaurant|cafe)/${id}(?:/|$|[?])`),
            ),
        ));
    if (matches && typeof value.name === "string") {
      title = value.name;
      const geo = value.geo || value.coordinate || value;
      const lat = Number(geo.latitude ?? geo.lat ?? geo.y);
      const lng = Number(geo.longitude ?? geo.lng ?? geo.x);
      const address =
        typeof value.address === "string"
          ? value.address
          : [
              value.address?.addressRegion,
              value.address?.addressLocality,
              value.address?.streetAddress,
            ]
              .filter(Boolean)
              .join(" ");
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= 33 &&
        lat <= 39 &&
        lng >= 124 &&
        lng <= 132 &&
        (value.roadAddress || address)
      )
        return {
          name: title,
          category: String(value.category || ""),
          address,
          roadAddress: value.roadAddress || address,
          lat,
          lng,
        };
    }
    for (const [key, child] of Object.entries(value))
      if (child && typeof child === "object") queue.push({ value: child, key });
  }
  return {
    query: title.replace(/\s*[-:|]\s*네이버\s*(?:지도|플레이스).*$/, "").trim(),
  };
}

function compact(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "");
}
function compactAddress(value) {
  return compact(value)
    .replace(/서울특별시/g, "서울")
    .replace(/(부산|대구|인천|광주|대전|울산)광역시/g, "$1")
    .replace(/경기도/g, "경기");
}

export async function resolveSharedPlace(
  text,
  searchPlaces,
  { fetcher = fetch, signal = AbortSignal.timeout(10000) } = {},
) {
  const shared = sharedInput(text);
  let query = shared.name;
  let page;
  try {
    page = await fetchNaverPage(shared.url.href, fetcher, signal);
    const id = placeId(page.url);
    let info = pagePlace(page.html, id);
    if (
      id &&
      !info.name &&
      !page.blocked &&
      ["map.naver.com", "m.map.naver.com"].includes(page.url.hostname)
    ) {
      const detail = await fetchNaverPage(
        `https://pcmap.place.naver.com/restaurant/${id}/home`,
        fetcher,
        signal,
      );
      info = pagePlace(detail.html, id);
    }
    if (info.name)
      return {
        items: [{ ...info, link: page.url.href }],
        verified: true,
        query: info.name,
      };
    query ||=
      info.query ||
      page.url.searchParams.get("query") ||
      page.url.searchParams.get("q") ||
      "";
    if (!query && page.url.pathname.startsWith("/p/search/"))
      query = decodeURIComponent(page.url.pathname.slice(10));
  } catch (error) {
    if (error.message === "invalid_naver_link") throw error;
  }
  query = query.trim().slice(0, 100);
  if (query.length < 2)
    return {
      items: [],
      verified: false,
      query: "",
      reason: "place_unavailable",
    };
  const items = await searchPlaces(query);
  const exact = items.filter(
    (item) =>
      compact(item.name) === compact(query) &&
      [item.address, item.roadAddress].some(
        (address) =>
          address &&
          shared.address &&
          compactAddress(shared.address).includes(compactAddress(address)),
      ),
  );
  return {
    items: exact.length === 1 ? exact : items,
    verified: exact.length === 1,
    query,
  };
}
