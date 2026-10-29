import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const userId = "22222222-2222-4222-8222-222222222222";
const otherId = "99999999-9999-4999-8999-999999999999";
const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondGroupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const restaurantId = "11111111-1111-4111-8111-111111111111";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1kAAAAASUVORK5CYII=",
  "base64",
);
const mapScript = readFileSync(
  new URL("../fixtures/naver-sdk.js", import.meta.url),
  "utf8",
);
const invitation = "a".repeat(48);

async function setup(
  page,
  {
    guest = false,
    tutorial = false,
    noGroups = false,
    duplicate = false,
    invite = false,
    withPhoto = false,
  } = {},
) {
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
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
    ({ user, token, guest, tutorial }) => {
      if (!tutorial) localStorage.setItem("ccatalog.tutorial.v3", "complete");
      if (!guest)
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
          watchPosition() {
            return 1;
          },
          clearWatch() {},
        },
      });
    },
    { user, token, guest, tutorial },
  );
  const state = {
    groups: noGroups
      ? []
      : [
          { id: groupId, name: "친구들", color: "#5285bc" },
          { id: secondGroupId, name: "회사", color: "#b87981" },
        ],
    restaurants: [
      {
        id: restaurantId,
        group_id: groupId,
        created_by: userId,
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
        id: "33333333-3333-4333-8333-333333333333",
        group_id: secondGroupId,
        created_by: otherId,
        name: duplicate ? "테스트면옥" : "테스트카페",
        category: "카페",
        rating: 1,
        area: "서울 종로구",
        lat: duplicate ? 37.5666 : 37.572,
        lng: duplicate ? 126.978 : 126.985,
        menus: ["커피"],
        menu_items: [{ name: "커피", price: "5,000원" }],
        delivery_apps: [],
        memo: "",
      },
    ],
    photos: withPhoto
      ? [
          {
            id: "initial-photo",
            restaurant_id: restaurantId,
            storage_path: `${restaurantId}/initial.png`,
            created_by: userId,
            sort_order: 0,
          },
        ]
      : [],
    comments: [],
    votes: {},
    searches: [],
    writes: [],
    signed: 0,
  };
  await page.route("https://cdn.jsdelivr.net/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
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
    const path = url.pathname;
    const method = request.method();
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
    else if (path.endsWith("/profiles"))
      body = [{ id: userId, nickname: "테스트회원" }];
    else if (path.endsWith("/catalog_groups")) body = state.groups;
    else if (path.endsWith("/rpc/create_catalog_group")) {
      state.groups.push({
        id: secondGroupId,
        name: payload.p_name,
        color: payload.p_color,
      });
      body = secondGroupId;
    } else if (path.endsWith("/rpc/create_catalog_invite")) body = invitation;
    else if (path.endsWith("/rpc/join_catalog_group")) body = groupId;
    else if (path.endsWith("/rpc/leave_catalog_group")) {
      const leaving = payload.p_group_id;
      state.groups = state.groups.filter((group) => group.id !== leaving);
      state.restaurants = state.restaurants.filter(
        (record) => record.group_id !== leaving,
      );
      body = { left: true, group_deleted: state.groups.length === 0 };
    } else if (
      path.endsWith("/rpc/restaurant_discussion") ||
      path.endsWith("/rpc/cast_restaurant_vote")
    ) {
      const record = state.restaurants.find(
        (item) => item.id === payload.p_restaurant_id,
      );
      if (!record)
        return route.fulfill({
          status: 400,
          json: { message: "restaurant_unavailable", code: "P0001" },
        });
      const votes = (state.votes[record.id] ??= {});
      if (path.endsWith("cast_restaurant_vote")) {
        if (state.voteDelay)
          await new Promise((resolve) => setTimeout(resolve, state.voteDelay));
        if (payload.p_round !== (record.vote_round || 1))
          return route.fulfill({
            status: 400,
            json: { message: "vote_round_changed", code: "P0001" },
          });
        votes[userId] = payload.p_choice;
        body = {
          outcome: "pending",
          rating: record.rating,
          round: record.vote_round || 1,
          restaurant_id: record.id,
        };
      } else {
        const comments = state.comments
          .filter((item) => item.restaurant_id === record.id)
          .sort(
            (a, b) =>
              b.created_at.localeCompare(a.created_at) ||
              b.id.localeCompare(a.id),
          );
        const page = payload.p_before
          ? comments.filter(
              (item) =>
                item.created_at < payload.p_before ||
                (item.created_at === payload.p_before &&
                  item.id < payload.p_before_id),
            )
          : comments;
        body = {
          rating: record.rating,
          round: record.vote_round || 1,
          eligible: 3,
          can_vote: record.created_by !== userId,
          mine: votes[userId] || null,
          votes: Object.fromEntries(
            ["up", "keep", "down"].map((choice) => [
              choice,
              Object.values(votes).filter((value) => value === choice).length,
            ]),
          ),
          comment_count: comments.length,
          comments: page.slice(0, 21),
        };
      }
    } else if (path.endsWith("/restaurant_comments")) {
      const id = url.searchParams.get("id")?.slice(3);
      if (method === "POST") {
        body = {
          ...payload,
          id: `comment-${state.comments.length}`,
          nickname: "테스트회원",
          created_at: new Date().toISOString(),
        };
        state.comments.push(body);
      } else if (method === "PATCH") {
        body = state.comments.find((item) => item.id === id);
        Object.assign(body, payload);
      } else if (method === "DELETE") {
        state.comments = state.comments.filter((item) => item.id !== id);
        body = { id };
      }
    } else if (path.includes("/functions/v1/naver-place-search")) {
      state.searches.push(payload.query);
      body = {
        items: [
          {
            name: "검색된식당",
            category: "음식점>일식",
            roadAddress: "서울 중구 세종대로 1",
            lat: 37.5667,
            lng: 126.9782,
          },
        ],
      };
    } else if (path.endsWith("/restaurants")) {
      const row = state.restaurants.find(
        (item) => `eq.${item.id}` === url.searchParams.get("id"),
      );
      if (method === "POST") {
        body = { ...payload };
        state.restaurants.push(body);
      } else if (method === "PATCH") {
        if (payload.rating !== undefined && payload.rating !== row.rating) {
          row.vote_round = (row.vote_round || 1) + 1;
          state.votes[row.id] = {};
        }
        Object.assign(row, payload);
        body = row;
      } else if (method === "DELETE") {
        state.restaurants = state.restaurants.filter((item) => item !== row);
        body = { id: row.id };
      } else body = noGroups ? [] : state.restaurants;
    } else if (path.endsWith("/restaurant_photos")) {
      if (method === "POST") {
        body = {
          ...payload,
          id: `photo-${state.photos.length}`,
          created_at: new Date().toISOString(),
        };
        state.photos.push(body);
      } else if (method === "DELETE") {
        const id = url.searchParams.get("id").slice(3);
        state.photos = state.photos.filter((item) => item.id !== id);
        body = { id };
      } else if (method === "PATCH") {
        Object.assign(
          state.photos.find(
            (item) => `eq.${item.id}` === url.searchParams.get("id"),
          ),
          payload,
        );
        body = null;
      } else body = state.photos;
    } else if (path.includes("/storage/v1/object/sign/") && method === "POST") {
      state.signed++;
      body = payload.paths.map((path) => ({
        path,
        signedURL: `/object/sign/restaurant-photos/${path}?token=fixture-${state.signed}`,
      }));
    } else if (path.includes("/storage/v1/object/sign")) {
      if (state.imageGate && !url.search.includes("fixture-1"))
        await state.imageGate;
      return route.fulfill({ contentType: "image/png", body: png });
    } else if (path.includes("/storage/")) body = {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body),
    });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(invite ? `/?invite=${invitation}` : "/");
  await expect(page.locator("#resultCount")).toHaveText(
    guest || noGroups ? "0곳" : "2곳",
  );
  await expect
    .poll(() => page.evaluate(() => window.__mapStats?.created))
    .toBe(1);
  return { state, errors };
}

test("leaving removes only that group and the final departure removes the group", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  await page.locator(".restaurant-item").first().click();
  await page.locator("#adminButton").click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "친구들 탈퇴", exact: true }).click();
  expect(state.groups).toHaveLength(2);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "친구들 초대 링크 발급" }).click();
  await expect(
    page.getByRole("textbox", { name: "초대 링크", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "친구들 탈퇴", exact: true }).click();
  await expect(page.locator(".account-group-row")).toHaveCount(1);
  await expect(page.locator("#resultCount")).toHaveText("1곳");
  await expect(page.locator("#selectedCard")).toHaveClass(/hidden/);
  await expect(
    page.getByRole("textbox", { name: "초대 링크", exact: true }),
  ).toHaveCount(0);
  expect(state.restaurants[0].name).toBe("테스트카페");
  await page.getByRole("button", { name: "회사 탈퇴", exact: true }).click();
  await expect(page.locator(".account-group-row")).toHaveCount(0);
  await expect(page.locator("#resultCount")).toHaveText("0곳");
  await expect(page.getByRole("status")).toContainText("마지막 그룹원");
  expect(errors).toEqual([]);
});

test("periodic refresh keeps pins and decoded photos stable during URL renewal", async ({
  page,
}) => {
  await page.clock.install();
  const { state, errors } = await setup(page, { withPhoto: true });
  await page.locator(".restaurant-item").first().click();
  const image = page.locator(".restaurant-photo-button img").first();
  await expect(image).toHaveJSProperty("complete", true);
  const oldSource = await image.getAttribute("src");
  await page.evaluate(() => {
    window.__originalPin = document.querySelector(
      "#map .pin-marker.is-selected",
    );
    window.__beforeRefresh = { ...window.__mapStats };
    window.__lostList = false;
    new MutationObserver(() => {
      if (document.querySelector("#resultCount")?.textContent !== "2곳")
        window.__lostList = true;
    }).observe(document.querySelector("#resultCount"), {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  let release;
  state.imageGate = new Promise((resolve) => {
    release = resolve;
  });
  await page.clock.fastForward(120000);
  await expect.poll(() => state.signed).toBeGreaterThan(1);
  await expect(image).toHaveAttribute("src", oldSource);
  expect(
    await page.evaluate(() => ({
      samePin:
        window.__originalPin ===
        document.querySelector("#map .pin-marker.is-selected"),
      moves: window.__mapStats.markerMoves - window.__beforeRefresh.markerMoves,
      icons: window.__mapStats.iconWrites - window.__beforeRefresh.iconWrites,
      lostList: window.__lostList,
    })),
  ).toEqual({ samePin: true, moves: 0, icons: 0, lostList: false });
  release();
  await expect(image).not.toHaveAttribute("src", oldSource);
  await expect(image).toHaveJSProperty("naturalWidth", 1);
  expect(errors).toEqual([]);
});

test("filter, search, map and smooth centering retain shared state", async ({
  page,
}, testInfo) => {
  const { errors } = await setup(page);
  await expect(page.locator(".user-location-marker")).toBeVisible();
  await page.locator('.dock-filter-button[data-filter="3"]').click();
  await expect(page.locator("#resultCount")).toHaveText("1곳");
  await page.locator(".restaurant-item").click();
  await expect(page.locator("#selectedCard h2")).toHaveText("테스트면옥");
  const layout = await page.evaluate(() => {
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
    return {
      y: pin.top + pin.height / 2,
      center: top / 2,
      overflow: document.documentElement.scrollHeight - innerHeight,
    };
  });
  expect(Math.abs(layout.y - layout.center)).toBeLessThan(2);
  expect(layout.overflow).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("detail.png") });
  await page.locator("#searchToggle").click();
  await expect(page.locator("#selectedCard")).toHaveClass(/hidden/);
  await page.locator("#searchInput").fill("없는식당");
  await expect(page.locator("#resultCount")).toHaveText("0곳");
  await page.locator("#searchInput").fill("냉면");
  await expect(page.locator("#resultCount")).toHaveText("1곳");
  await page.locator("#filterModeButton").click();
  expect(await page.evaluate(() => window.__mapStats.created)).toBe(1);
  expect(errors).toEqual([]);
});

test("drag previews without committing until release", async ({ page }) => {
  await setup(page);
  const a = await page
    .locator('.dock-filter-button[data-filter="all"]')
    .boundingBox();
  const b = await page
    .locator('.dock-filter-button[data-filter="3"]')
    .boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await expect(page.locator(".bottom-dock")).toHaveClass(/is-dragging/);
  await expect(page.locator("#resultCount")).toHaveText("2곳");
  await page.mouse.up();
  await expect(page.locator("#resultCount")).toHaveText("1곳");
});

test("author edits the medal and resets opinions, then deletes", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  state.votes[restaurantId] = { anotherMember: "down" };
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator(".restaurant-item").first().click();
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await expect(page.locator('input[name="rating"]').first()).toBeEnabled();
  await page
    .locator(".rating-field label")
    .filter({ hasText: "은메달" })
    .click();
  await page.locator("#memoInput").fill("수정된 메모");
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator("#selectedCard .memo")).toHaveText("수정된 메모");
  const patch = state.writes.find(
    (item) => item.path.endsWith("/restaurants") && item.method === "PATCH",
  );
  expect(patch.payload.rating).toBe(2);
  expect(state.votes[restaurantId]).toEqual({});
  expect(patch.payload).not.toHaveProperty("created_by");
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.locator("#resultCount")).toHaveText("1곳");
  expect(errors).toEqual([]);
});

test("another member can read but cannot edit another author's record", async ({
  page,
}) => {
  await setup(page);
  await page.locator(".restaurant-item").last().click();
  await expect(page.locator("#selectedCard h2")).toHaveText("테스트카페");
  await expect(
    page
      .locator("#selectedCard")
      .getByRole("button", { name: "수정", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".visit-verification")).toHaveCount(0);
});

test("guest has no private records and login preserves provider and invitation", async ({
  page,
}) => {
  const { state } = await setup(page, { guest: true, invite: true });
  expect(
    state.writes.filter((item) => item.path.includes("join_catalog_group")),
  ).toHaveLength(0);
  await page.locator("#adminButton").click();
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL(/fixture\.supabase\.co\/auth\/v1\/authorize/);
  const url = new URL(page.url());
  expect(url.searchParams.get("provider")).toBe("custom:kakao-test");
  expect(url.searchParams.get("redirect_to")).toBe("http://127.0.0.1:4174/");
});

test("invited member joins once and removes the invitation from the URL", async ({
  page,
}) => {
  const { state } = await setup(page, { invite: true });
  await expect(page).toHaveURL("http://127.0.0.1:4174/");
  expect(
    state.writes.filter((item) => item.path.endsWith("join_catalog_group")),
  ).toHaveLength(1);
  expect(
    await page.evaluate(() => sessionStorage.getItem("ccatalog.pendingInvite")),
  ).toBe(null);
});

test("new member creates a group and generates an invitation", async ({
  page,
}) => {
  const { state } = await setup(page, { noGroups: true });
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#adminButton").click();
  await page.getByRole("textbox", { name: "새 그룹 이름" }).fill("우리 맛집");
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(page.locator(".account-group-row")).toHaveCount(1);
  expect(state.groups[0].name).toBe("우리 맛집");
  await page.getByRole("button", { name: "우리 맛집 초대 링크 발급" }).click();
  await expect(
    page.getByRole("textbox", { name: "초대 링크", exact: true }),
  ).toHaveValue(new RegExp(`invite=${invitation}`));
});

test("groups can be toggled and a shared branch has one pin with separate records", async ({
  page,
}) => {
  await setup(page, { duplicate: true });
  await expect(page.locator("#map .pin-marker")).toHaveCount(1);
  await page.locator(".restaurant-item").first().click();
  await expect(page.locator(".group-records button")).toHaveCount(2);
  await page.locator(".group-records button").last().click();
  await expect(
    page.locator("#selectedCard .card-side .rating-badge"),
  ).toContainText("동메달");
  await page.locator("#adminButton").click();
  await page
    .locator(".account-group-row")
    .first()
    .getByRole("checkbox")
    .uncheck();
  await expect(page.locator("#resultCount")).toHaveText("1곳");
});

test("any member can register a searched place in their group", async ({
  page,
}) => {
  const { state } = await setup(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#addButton").click();
  await page.locator("#nameInput").fill("임의입력");
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator("#placeResultList")).toContainText(
    "장소 검색 결과에서 식당을 선택해주세요",
  );
  await page.locator("#nameInput").press("Enter");
  await page.locator(".place-result").click();
  await page.locator("#menuDraftInput").fill("초밥");
  await page.locator("#menuPriceDraftInput").fill("16000");
  await page.locator("#addMenuButton").click();
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator("#selectedCard h2")).toHaveText("검색된식당");
  const insert = state.writes.find(
    (item) => item.path.endsWith("/restaurants") && item.method === "POST",
  );
  expect(insert.payload.group_id).toBe(groupId);
  expect(insert.payload.created_by).toBe(userId);
});

test("logout clears private records, open details and add permission", async ({
  page,
}) => {
  await setup(page);
  await page.locator(".restaurant-item").first().click();
  await page.locator("#adminButton").click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator("#adminButton")).toHaveAttribute(
    "aria-label",
    "로그인",
  );
  await expect(page.locator("#resultCount")).toHaveText("0곳");
  await expect(page.locator("#map .pin-marker")).toHaveCount(0);
  await expect(page.locator("#selectedCard")).toHaveClass(/hidden/);
});

test("author uploads private photos, reorders, views and deletes them", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator(".restaurant-item").first().click();
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await page.locator("#spotPhotoInput").setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: png },
    { name: "two.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.locator(".form-photo-item")).toHaveCount(2);
  expect(state.photos).toHaveLength(0);
  await page.getByRole("button", { name: "사진 뒤로 이동" }).first().click();
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator(".restaurant-photo-button")).toHaveCount(2);
  expect(state.signed).toBeGreaterThan(0);
  await page.locator(".restaurant-photo-button").first().click();
  await expect(page.locator(".photo-viewer-figure img")).toBeVisible();
  await page.getByRole("button", { name: "사진 닫기", exact: true }).click();
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  const originalOrder = state.photos.map((photo) => photo.id);
  await page.getByRole("button", { name: "사진 뒤로 이동" }).first().click();
  await page.locator("#spotSubmitButton").click();
  await expect
    .poll(() =>
      page.locator(".restaurant-photo-button img").first().getAttribute("src"),
    )
    .toContain(
      state.photos.find((photo) => photo.id === originalOrder[1]).storage_path,
    );
  await page
    .locator("#selectedCard")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await page.getByRole("button", { name: "사진 1 삭제", exact: true }).click();
  await expect(page.locator(".form-photo-item")).toHaveCount(1);
  expect(state.photos).toHaveLength(2);
  await page.locator("#spotSubmitButton").click();
  await expect(page.locator(".restaurant-photo-button")).toHaveCount(1);
  expect(state.photos).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("header uses circular add and profile buttons while the dock stays unchanged", async ({
  page,
}, testInfo) => {
  await setup(page);
  const add = await page.locator("#addButton").boundingBox();
  const profile = await page.locator("#adminButton").boundingBox();
  expect(add.x + add.width).toBeLessThanOrEqual(profile.x);
  expect(profile.width).toBe(profile.height);
  expect(profile.width).toBe(44);
  await expect(page.locator("#adminButton .account-avatar")).toHaveText("테");
  await expect(page.locator(".dock-filter-button")).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("header.png") });
  await page.locator("#addButton").click();
  await page
    .locator("#spotPhotoInput")
    .setInputFiles({ name: "draft.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".form-photo-item")).toHaveCount(1);
  await expect(page.locator("#spotDialog")).toHaveClass(/is-open/);
  await expect(page.locator("#spotSubmitButton")).toBeInViewport();
  await expect(page.locator(".form-photo-item").first()).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("photo-form.png"),
    animations: "disabled",
  });
  await page.locator("#addButton").click();
  await page.locator("#addButton").click();
  await expect(page.locator(".form-photo-item")).toHaveCount(0);
});

test("tutorial explains private groups and completes", async ({ page }) => {
  await setup(page, { tutorial: true });
  await expect(page.locator("#tutorialOverlay")).toHaveClass(/is-open/);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("#tutorialTitle")).toHaveText(
    "우리끼리 나누는 맛집",
  );
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("ccatalog.tutorial.v3")),
  ).toBe("complete");
});

test("comments are readable by members and only their author gets editing controls", async ({
  page,
}, testInfo) => {
  const { state, errors } = await setup(page);
  state.comments.push({
    id: "another",
    restaurant_id: restaurantId,
    user_id: otherId,
    nickname: "친구",
    body: "친구의 의견",
    created_at: "2026-10-01T00:00:00Z",
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator(".restaurant-item").first().click();
  await page.getByRole("button", { name: "의견 · 메달 투표" }).click();
  await expect(page.locator("#discussionDialog")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await expect(page.locator(".discussion-comment")).toHaveCount(1);
  await expect(
    page.locator(".discussion-comment .comment-actions"),
  ).toHaveCount(0);
  await expect(page.locator(".vote-options button").first()).toBeDisabled();
  await page
    .getByRole("textbox", { name: "의견 작성" })
    .fill("<script>내 의견</script>");
  await page
    .locator(".comment-submit")
    .getByRole("button", { name: "등록", exact: true })
    .click();
  await expect(page.locator(".discussion-comment")).toHaveCount(2);
  const mine = page
    .locator(".discussion-comment")
    .filter({ hasText: "<script>내 의견</script>" });
  await mine.getByRole("button", { name: "수정", exact: true }).click();
  await page
    .getByRole("textbox", { name: "의견 수정" })
    .fill("메뉴가 좋았어요");
  await page.getByRole("button", { name: "수정 완료" }).click();
  await expect(page.locator(".discussion-comment").first()).toContainText(
    "메뉴가 좋았어요",
  );
  await page.screenshot({ path: testInfo.outputPath("discussion.png") });
  const layout = await page.locator(".discussion-card").boundingBox();
  expect(layout.x).toBeGreaterThanOrEqual(0);
  expect(layout.y).toBeGreaterThanOrEqual(0);
  await page
    .locator(".discussion-comment")
    .first()
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.locator(".discussion-comment")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("vote replacement only changes opinion counts, even with a majority", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  const record = state.restaurants[1];
  await page.locator(".restaurant-item").last().click();
  await page.getByRole("button", { name: "의견 · 메달 투표" }).click();
  await page.locator(".vote-options button").nth(1).click();
  await expect(page.locator(".vote-options button").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator(".vote-options button").first().click();
  expect(Object.keys(state.votes[record.id])).toHaveLength(1);
  await expect(page.locator(".vote-options button").first()).toContainText("1");
  state.votes[record.id].anotherMember = "up";
  await page.locator(".vote-options button").first().click();
  await expect(page.locator(".vote-summary .rating-badge")).toContainText(
    "동메달",
  );
  await expect(page.locator(".vote-summary small")).toHaveText("응답 2명");
  await expect(page.locator(".vote-options button").first()).toContainText("2");
  await page.getByRole("button", { name: "의견 닫기" }).click();
  await expect(
    page.locator("#selectedCard .card-side .rating-badge"),
  ).toContainText("동메달");
  expect(errors).toEqual([]);
});

test("bronze decline opinions preserve both groups and all records", async ({
  page,
}) => {
  const { state, errors } = await setup(page, { duplicate: true });
  const record = state.restaurants[1];
  state.votes[record.id] = { anotherMember: "down" };
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator(".restaurant-item").last().click();
  await page.getByRole("button", { name: "의견 · 메달 투표" }).click();
  await page.locator(".vote-options button").last().click();
  await expect(page.locator("#discussionDialog")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await expect(page.locator(".vote-options button").last()).toContainText("2");
  await expect(page.locator("#resultCount")).toHaveText("2곳");
  expect(state.restaurants[0].id).toBe(restaurantId);
  expect(state.restaurants).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("stale vote rounds reload without applying a second medal change", async ({
  page,
}) => {
  const { state } = await setup(page);
  const record = state.restaurants[1];
  await page.locator(".restaurant-item").last().click();
  await page.getByRole("button", { name: "의견 · 메달 투표" }).click();
  await expect(page.locator(".vote-summary small")).toHaveText("응답 0명");
  record.rating = 2;
  record.vote_round = 2;
  await page.locator(".vote-options button").first().click();
  await expect(page.locator("#discussionDialog .auth-error")).toContainText(
    "새 투표를 확인",
  );
  await expect(page.locator(".vote-summary .rating-badge")).toContainText(
    "은메달",
  );
  expect(record.rating).toBe(2);
});

test("closing a pending vote still updates the map record when it completes", async ({
  page,
}) => {
  const { state } = await setup(page);
  const record = state.restaurants[1];
  state.votes[record.id] = { anotherMember: "up" };
  state.voteDelay = 500;
  await page.locator(".restaurant-item").last().click();
  await page.getByRole("button", { name: "의견 · 메달 투표" }).click();
  await page.locator(".vote-options button").first().click();
  await page.getByRole("button", { name: "의견 닫기" }).click();
  await expect(
    page.locator("#selectedCard .card-side .rating-badge"),
  ).toContainText("동메달");
});
