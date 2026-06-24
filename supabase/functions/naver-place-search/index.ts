const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const { query } = await request.json().catch(() => ({ query: "" }));
  const normalizedQuery = String(query || "").trim();
  if (normalizedQuery.length < 2) {
    return json({ error: "Query must be at least 2 characters" }, 400);
  }

  const clientId = Deno.env.get("NAVER_SEARCH_CLIENT_ID");
  const clientSecret = Deno.env.get("NAVER_SEARCH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return json({ error: "Naver Search API credentials are not configured" }, 500);
  }

  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", normalizedQuery);
  url.searchParams.set("display", "3");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "random");

  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json({ error: payload.errorMessage || "Naver local search failed" }, response.status);
  }

  const items = Array.isArray(payload.items) ? payload.items.map(toPlaceCandidate) : [];
  return json({ items });
});

function toPlaceCandidate(item: Record<string, unknown>) {
  const mapx = toNumber(item.mapx);
  const mapy = toNumber(item.mapy);
  const scaledCoord = toScaledWgs84(mapx, mapy);

  return {
    name: cleanText(item.title),
    category: cleanText(item.category),
    address: cleanText(item.address),
    roadAddress: cleanText(item.roadAddress),
    link: String(item.link || ""),
    mapx,
    mapy,
    lat: scaledCoord?.lat ?? null,
    lng: scaledCoord?.lng ?? null,
  };
}

function toScaledWgs84(mapx: number, mapy: number) {
  const lng = mapx / 10000000;
  const lat = mapy / 10000000;
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { lat, lng };
  }
  return null;
}

function toNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : NaN;
}

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
