import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const userId = "22222222-2222-4222-8222-222222222222";
const restaurantId = "11111111-1111-4111-8111-111111111111";
const secondId = "33333333-3333-4333-8333-333333333333";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1kAAAAASUVORK5CYII=",
  "base64",
);
const mapScript = readFileSync(
  new URL("../fixtures/naver-sdk.js", import.meta.url),
  "utf8",
);

async function setup(page, { role = "guest", tutorial = false } = {}) {
  await page.route("https://cdn.jsdelivr.net/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: { nickname: "테스트회원" },
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
  };
  const claims = Buffer.from(
    JSON.stringify({ sub: userId, exp: 2097857037, role: "authenticated" }),
  ).toString("base64url");
  const token = `eyJhbGciOiJIUzI1NiJ9.${claims}.signature`;
  await page.addInitScript(
    ({ user, token, role, tutorial }) => {
      if (!tutorial) localStorage.setItem("ccatalog.tutorial.v2", "complete");
      if (role !== "guest")
        localStorage.setItem(
          "ccatalog.supabase.auth",
          JSON.stringify({
            access_token: token,
            refresh_token: "fixture-refresh",
            token_type: "bearer",
            expires_at: 2097857037,
            expires_in: 3600,
            user,
          }),
        );
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(success) {
            setTimeout(
              () =>
                success({
                  coords: {
                    latitude: 37.566535,
                    longitude: 126.977969,
                    accuracy: 15,
                  },
                }),
              50,
            );
          },
          watchPosition(success) {
            setTimeout(
              () =>
                success({
                  coords: {
                    latitude: 37.566535,
                    longitude: 126.977969,
                    accuracy: 15,
                  },
                }),
              100,
            );
            return 1;
          },
          clearWatch() {},
        },
      });
    },
    { user, token, role, tutorial },
  );
  const state = {
    restaurants: [
      {
        id: restaurantId,
        name: "테스트면옥",
        category: "한식",
        rating: 3,
        area: "서울 중구",
        lat: 37.5666,
        lng: 126.978,
        menus: ["냉면"],
        menu_items: [{ name: "냉면", price: "15,000원" }],
        delivery_apps: ["baemin"],
        memo: "깔끔한 국물",
      },
      {
        id: secondId,
        name: "테스트카페",
        category: "카페",
        rating: 1,
        area: "서울 종로구",
        lat: 37.572,
        lng: 126.985,
        menus: ["커피"],
        menu_items: [{ name: "커피", price: "5,000원" }],
        delivery_apps: [],
        memo: "",
      },
    ],
    photos: [],
    visits: [],
    proposals: [],
    searches: [],
    writes: [],
  };
  await page.route("**/config.json", (route) =>
    route.fulfill({
      json: {
        naverMapKey: "fixture-map-key",
        supabaseUrl: "https://fixture.supabase.co",
        supabaseAnonKey: "fixture-public-key",
      },
    }),
  );
  await page.route("https://oapi.map.naver.com/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: mapScript }),
  );
  await page.route("https://fixture.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    if (method === "OPTIONS")
      return route.fulfill({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        },
      });
    let payload;
    try {
      payload = request.postDataJSON();
    } catch {
      payload = null;
    }
    if (method !== "GET") state.writes.push({ path, method, payload });
    let body = [];
    if (path.includes("/auth/v1/user")) body = user;
    else if (path.includes("/auth/v1/logout")) body = {};
    else if (path.includes("/functions/v1/naver-place-search")) {
      state.searches.push(payload.query);
      body = {
        items: [
          {
            name: "검색된식당",
            category: "음식점>일식",
            roadAddress: "서울 중구 세종대로 1",
            lat: 37.5667,
            lng: 126.9782,
            link: "https://map.naver.com/",
          },
        ],
      };
    } else if (path.endsWith("/rpc/confirm_restaurant_visit")) {
      state.visits.push({ restaurant_id: payload.p_restaurant_id });
      body = [
        {
          visit_count: state.visits.length,
          is_catalist: state.visits.length >= 3,
          distance_m: 10,
        },
      ];
    } else if (path.endsWith("/rpc/submit_restaurant_proposal")) {
      const proposal = {
        id: secondId,
        name: payload.p_name,
        status: "pending",
        created_at: new Date().toISOString(),
        category: payload.p_category,
        suggested_rating: payload.p_suggested_rating,
        area: payload.p_area,
        menu_items: payload.p_menu_items,
        delivery_apps: payload.p_delivery_apps,
      };
      state.proposals.push(proposal);
      body = [
        {
          proposal_id: proposal.id,
          proposal_status: "pending",
          proposal_created_at: proposal.created_at,
        },
      ];
    } else if (path.endsWith("/rpc/review_restaurant_proposal")) {
      const proposal = state.proposals.find(
        (item) => item.id === payload.p_proposal_id,
      );
      proposal.status = payload.p_decision;
      body = [
        {
          proposal_id: proposal.id,
          proposal_status: proposal.status,
          approved_restaurant_id: null,
        },
      ];
    } else if (path.endsWith("/profiles"))
      body = [
        {
          id: userId,
          nickname: "테스트회원",
          is_catalist: role === "catalist" || state.visits.length >= 3,
        },
      ];
    else if (path.endsWith("/admin_users"))
      body = role === "admin" ? [{ user_id: userId }] : [];
    else if (path.endsWith("/restaurant_visits")) body = state.visits;
    else if (path.endsWith("/restaurant_proposals"))
      body = state.proposals.filter(
        (item) => !url.searchParams.has("status") || item.status === "pending",
      );
    else if (path.endsWith("/restaurants")) {
      if (method === "POST") {
        const row = { ...payload, id: "44444444-4444-4444-8444-444444444444" };
        state.restaurants.push(row);
        body = row;
      } else if (method === "PATCH") {
        const row = state.restaurants.find(
          (item) => `eq.${item.id}` === url.searchParams.get("id"),
        );
        Object.assign(row, payload);
        body = row;
      } else if (method === "DELETE") {
        state.restaurants = state.restaurants.filter(
          (item) => `eq.${item.id}` !== url.searchParams.get("id"),
        );
        body = null;
      } else body = state.restaurants;
    } else if (path.endsWith("/restaurant_photos")) {
      if (method === "POST") {
        const photo = {
          ...payload,
          id: `photo-${state.photos.length}`,
          created_at: new Date().toISOString(),
        };
        state.photos.push(photo);
        body = photo;
      } else if (method === "DELETE") {
        state.photos = state.photos.filter(
          (item) => `eq.${item.id}` !== url.searchParams.get("id"),
        );
        body = null;
      } else if (method === "PATCH") {
        const photo = state.photos.find(
          (item) => `eq.${item.id}` === url.searchParams.get("id"),
        );
        Object.assign(photo, payload);
        body = null;
      } else body = state.photos;
    } else if (path.includes("/storage/v1/object/public/"))
      return route.fulfill({ contentType: "image/png", body: png });
    else if (path.includes("/storage/")) body = {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body),
    });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#resultCount")).toHaveText("2곳");
  await expect
    .poll(() => page.evaluate(() => window.__mapStats?.created))
    .toBe(1);
  return { state, errors };
}

async function adminMode(page) {
  await page.locator("#adminButton").click();
  await page.getByRole("button", { name: "관리자", exact: true }).click();
}

test("filter, search, details and location share state without recreating the map", async ({
  page,
}, testInfo) => {
  const { errors } = await setup(page);
  await expect(page.locator(".user-location-marker")).toBeVisible();
  const initialLayout = await page.evaluate(() => {
    const marker = document
      .querySelector(".user-location-marker")
      .getBoundingClientRect();
    const card = document
      .querySelector("#restaurantPanel")
      .getBoundingClientRect();
    return {
      markerY: marker.top + marker.height / 2,
      centerY: card.top / 2,
      scrollHeight: document.documentElement.scrollHeight,
      height: innerHeight,
    };
  });
  expect(Math.abs(initialLayout.markerY - initialLayout.centerY)).toBeLessThan(
    2,
  );
  expect(initialLayout.scrollHeight).toBe(initialLayout.height);
  await page.screenshot({ path: testInfo.outputPath("list.png") });
  await page.locator('.dock-filter-button[data-filter="3"]').click();
  await expect(page.locator("#resultCount")).toHaveText("1곳");
  await page.locator(".restaurant-item").click();
  await expect(page.locator("#selectedCard h2")).toHaveText("테스트면옥");
  const selectedLayout = await page.evaluate(() => {
    const pin = document
      .querySelector("#map .pin-marker.is-selected")
      .getBoundingClientRect();
    const top = Math.min(
      ...[
        ...document.querySelectorAll(
          ".restaurant-panel.is-open, .selected-card:not(.hidden)",
        ),
      ].map((card) => card.getBoundingClientRect().top),
    );
    return { pinY: pin.top + pin.height / 2, centerY: top / 2 };
  });
  expect(Math.abs(selectedLayout.pinY - selectedLayout.centerY)).toBeLessThan(
    2,
  );
  await page.screenshot({ path: testInfo.outputPath("detail.png") });
  await expect(page.locator('#selectedCard [data-action="edit"]')).toHaveCount(
    0,
  );
  await page.locator("#searchToggle").click();
  await expect(page.locator("#selectedCard")).toHaveClass(/hidden/);
  await page.locator("#searchInput").fill("없는식당");
  await expect(page.locator("#resultCount")).toHaveText("0곳");
  await page.locator("#searchInput").fill("냉면");
  await expect(page.locator("#resultCount")).toHaveText("1곳");
  await page.locator("#filterModeButton").click();
  await expect(page.locator(".dock-cluster")).not.toHaveClass(/is-search-mode/);
  expect(await page.evaluate(() => window.__mapStats.created)).toBe(1);
  expect(errors).toEqual([]);
});

test("drag previews the new medal and commits only on release", async ({
  page,
}) => {
  const { errors } = await setup(page);
  const first = await page
    .locator('.dock-filter-button[data-filter="all"]')
    .boundingBox();
  const last = await page
    .locator('.dock-filter-button[data-filter="3"]')
    .boundingBox();
  const start = { x: first.x + first.width / 2, y: first.y + first.height / 2 };
  const end = { x: last.x + last.width / 2, y: last.y + last.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await expect(page.locator(".bottom-dock")).toHaveClass(/is-dragging/);
  await expect(page.locator("#resultCount")).toHaveText("2곳");
  await expect(
    page.locator('.dock-filter-button[data-filter="3"]'),
  ).toHaveClass(/is-preview/);
  await page.mouse.up();
  await expect(page.locator("#resultCount")).toHaveText("1곳");
  await expect(page.locator(".bottom-dock")).not.toHaveClass(
    /is-dragging|is-pressing/,
  );
  expect(errors).toEqual([]);
});

test("member can submit proposals and admin can review them", async ({
  page,
}) => {
  const { state, errors } = await setup(page, { role: "admin" });
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#adminButton").click();
  await page.getByRole("button", { name: "까탈리스트", exact: true }).click();
  await page.locator("#addButton").click();
  await expect(page.locator("#spotDialogTitle")).toHaveText("맛집 건의");
  await page.locator("#nameInput").fill("건의식당");
  await page.locator("#nameInput").press("Enter");
  await page.locator(".place-result").click();
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator(".proposal-status-row")).toContainText("검토 중");
  expect(state.proposals).toHaveLength(1);
  await page.getByRole("button", { name: "관리자", exact: true }).click();
  await page.getByRole("button", { name: "맛집 건의 검토" }).click();
  await expect(page.locator(".proposal-review-item")).toHaveCount(1);
  await page.getByRole("button", { name: "승인", exact: true }).click();
  await expect(page.locator(".proposal-review-status")).toContainText(
    "승인했습니다",
  );
  expect(state.proposals[0].status).toBe("approved");
  expect(errors).toEqual([]);
});

test("editing and deleting preserves selected restaurant identity", async ({
  page,
}) => {
  const { state, errors } = await setup(page, { role: "admin" });
  page.on("dialog", (dialog) => dialog.accept());
  await adminMode(page);
  await page.locator(".restaurant-item").first().click();
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await page.locator("#memoInput").fill("수정된 메모");
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator("#selectedCard .memo")).toHaveText("수정된 메모");
  expect(state.restaurants.find((item) => item.id === restaurantId).memo).toBe(
    "수정된 메모",
  );
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.locator("#resultCount")).toHaveText("1곳");
  expect(state.restaurants.some((item) => item.id === restaurantId)).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

test("login keeps custom Kakao provider and local callback; logout clears privileges", async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.locator("#adminButton").click();
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL(/fixture\.supabase\.co\/auth\/v1\/authorize/);
  const authorize = new URL(page.url());
  expect(authorize.searchParams.get("provider")).toBe("custom:kakao-test");
  expect(authorize.searchParams.get("redirect_to")).toBe(
    "http://127.0.0.1:4174/",
  );
  expect(errors).toEqual([]);
});

test("logout removes admin controls from the active detail", async ({
  page,
}) => {
  const { errors } = await setup(page, { role: "admin" });
  await adminMode(page);
  await page.locator(".restaurant-item").first().click();
  await page.locator("#adminButton").click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator("#adminButton")).toHaveText("로그인");
  await expect(page.locator("#addButton")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(
    page
      .locator("#selectedCard")
      .getByRole("button", { name: "삭제", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("admin permissions update all controls; Enter searches and selected places are required", async ({
  page,
}) => {
  const { state, errors } = await setup(page, { role: "admin" });
  await adminMode(page);
  await page.locator("#addButton").click();
  await page.locator("#nameInput").fill("임의입력");
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator("#placeResultList")).toContainText(
    "장소 검색 결과에서 식당을 선택해주세요",
  );
  expect(
    state.writes.filter((item) => item.path.endsWith("/restaurants")),
  ).toHaveLength(0);
  await page.locator("#nameInput").press("Enter");
  await expect(page.locator(".place-result")).toHaveCount(1);
  expect(state.searches).toEqual(["임의입력"]);
  await page.locator(".place-result").click();
  await page.locator("#menuDraftInput").fill("초밥");
  await page.locator("#menuPriceDraftInput").fill("16000");
  await page.locator("#addMenuButton").click();
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator("#selectedCard h2")).toHaveText("검색된식당");
  await expect(page.locator("#selectedCard .menu-chip")).toHaveText(
    "초밥 16,000원",
  );
  await expect(
    page
      .locator("#selectedCard")
      .getByRole("button", { name: "수정", exact: true }),
  ).toBeVisible();
  await page.locator("#adminButton").click();
  await page.getByRole("button", { name: "일반회원", exact: true }).click();
  await expect(
    page
      .locator("#selectedCard")
      .getByRole("button", { name: "수정", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#addButton")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(errors).toEqual([]);
});

test("visit is counted only after agreeing", async ({ page }) => {
  const { state, errors } = await setup(page, { role: "member" });
  await page.locator(".restaurant-item").first().click();
  await page.getByRole("button", { name: "방문 인증", exact: true }).click();
  await expect(page.locator(".visit-title")).toContainText(
    "평가에 동의하시나요",
  );
  expect(state.visits).toHaveLength(0);
  await page.getByRole("button", { name: "네", exact: true }).click();
  await expect(page.locator(".visit-confirmed-label")).toHaveText(
    "방문 확인됨",
  );
  expect(state.visits).toHaveLength(1);
  await expect(page.locator(".visit-feedback")).toContainText("앞으로 2곳");
  expect(errors).toEqual([]);
});

test("photo upload, viewer, reorder and deletion", async ({ page }) => {
  const { state, errors } = await setup(page, { role: "admin" });
  page.on("dialog", (dialog) => dialog.accept());
  await adminMode(page);
  await page.locator(".restaurant-item").first().click();
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "사진", exact: true })
    .click();
  await page.locator("#photoUploadInput").setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: png },
    { name: "two.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.locator(".photo-manager-item")).toHaveCount(2);
  await expect(page.locator(".photo-manager-status")).toHaveText(
    "사진을 추가했습니다",
  );
  await page.getByRole("button", { name: "사진 뒤로 이동" }).first().click();
  await expect(page.locator(".photo-manager-status")).toHaveText(
    "사진 순서를 변경했습니다",
  );
  await page.getByRole("button", { name: "사진 관리 닫기" }).click();
  await page.locator(".restaurant-photo-button").first().click();
  await expect(page.locator(".photo-viewer-figure img")).toBeVisible();
  await page.getByRole("button", { name: "다음 사진", exact: true }).click();
  await expect(page.locator(".photo-viewer-figure figcaption")).toContainText(
    "2 / 2",
  );
  await page.getByRole("button", { name: "사진 닫기", exact: true }).click();
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "사진", exact: true })
    .click();
  await page.locator(".photo-delete-button").first().click();
  await expect(page.locator(".photo-manager-item")).toHaveCount(1);
  expect(state.photos).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("tutorial keeps all three steps and completion flag", async ({ page }) => {
  const { errors } = await setup(page, { tutorial: true });
  await expect(page.locator("#tutorialOverlay")).toHaveClass(/is-open/);
  await expect(page.locator("#tutorialTitle")).toHaveText(
    "까탈스러운 맛집 로그",
  );
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("#tutorialTitle")).toHaveText(
    "메달은 추천의 강도예요",
  );
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await expect(page.locator("#tutorialOverlay")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("ccatalog.tutorial.v2")),
  ).toBe("complete");
  expect(errors).toEqual([]);
});
