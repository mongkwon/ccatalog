const STORAGE_KEY = "ccatalog.restaurants.v1";
const SUPABASE_SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SUPABASE_TABLE = "restaurants";
const RESTAURANT_PHOTO_BUCKET = "restaurant-photos";
const RESTAURANT_PHOTO_LIMIT = 8;
const PHOTO_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1600;
const PHOTO_JPEG_QUALITY = 0.84;
const runtimeConfig = {
  naverMapKey: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
};
const DEFAULT_CENTER = { lat: 37.566535, lng: 126.977969 };
const INITIAL_MAP_ZOOM = 13;
const INITIAL_NEARBY_RADIUS_KM = 4;
const INITIAL_REVEAL_RESTAURANT_LIMIT = 4;
const INITIAL_REVEAL_BOUNDS_OPTIONS = {
  top: 116,
  right: 56,
  bottom: 230,
  left: 56,
  maxZoom: INITIAL_MAP_ZOOM,
};
const USER_LOCATION_TIMEOUT_MS = 7000;
const USER_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
const VISIT_LOCATION_TIMEOUT_MS = 12000;
const MOCK_BOUNDS = {
  latMin: 37.47,
  latMax: 37.62,
  lngMin: 126.86,
  lngMax: 127.13,
};

const RATING_META = {
  1: { label: "동메달", icon: "🥉" },
  2: { label: "은메달", icon: "🥈" },
  3: { label: "금메달", icon: "🥇" },
};
const RATING_VALUES = new Set(Object.keys(RATING_META).map(Number));

const DELIVERY_APPS = [
  { id: "baemin", label: "배달의민족", shortLabel: "배민" },
  { id: "coupangEats", label: "쿠팡이츠", shortLabel: "쿠팡이츠" },
  { id: "yogiyo", label: "요기요", shortLabel: "요기요" },
];

const seedRestaurants = [
  {
    id: "seed-1",
    name: "까탈면옥",
    category: "한식",
    rating: 3,
    area: "중구 을지로",
    lat: 37.5669,
    lng: 126.9928,
    menus: ["물냉면", "제육"],
    deliveryApps: ["baemin", "yogiyo"],
    memo: "육향이 또렷하고 마무리가 깔끔한 냉면집.",
  },
  {
    id: "seed-2",
    name: "연남구움",
    category: "카페",
    rating: 1,
    area: "마포구 연남",
    lat: 37.5628,
    lng: 126.9237,
    menus: ["소금빵", "필터커피"],
    deliveryApps: ["coupangEats"],
    memo: "가볍게 들르기 좋은 구움과자와 커피.",
  },
  {
    id: "seed-3",
    name: "성수면가",
    category: "중식",
    rating: 2,
    area: "성동구 성수",
    lat: 37.5447,
    lng: 127.0557,
    menus: ["탄탄면", "가지튀김"],
    deliveryApps: ["baemin", "coupangEats"],
    memo: "매콤한 소스와 식감 좋은 사이드가 강점.",
  },
  {
    id: "seed-4",
    name: "논현초밥",
    category: "일식",
    rating: 1,
    area: "강남구 논현",
    lat: 37.5114,
    lng: 127.0285,
    menus: ["점심 오마카세", "고등어봉초밥"],
    deliveryApps: [],
    memo: "동네 기록에 남길 만한 안정적인 초밥집.",
  },
  {
    id: "seed-5",
    name: "망원국수",
    category: "분식",
    rating: 1,
    area: "마포구 망원",
    lat: 37.5552,
    lng: 126.9051,
    menus: ["비빔국수", "김밥"],
    deliveryApps: ["baemin", "yogiyo"],
    memo: "회전이 빠르고 점심 선택지로 안정적.",
  },
];

const state = {
  restaurants: structuredClone(seedRestaurants).map(normalizeRestaurant).filter(Boolean),
  selectedId: null,
  query: "",
  filter: "all",
  accountMode: "member",
  isAdminMode: false,
  map: null,
  lastMapCoord: DEFAULT_CENTER,
  placeSelection: null,
  spotDialogMode: "restaurant",
  photoDialogRestaurantId: null,
  photoManagerBusy: false,
  photoManagerStatus: "",
  photoManagerError: false,
  photoViewerRestaurantId: null,
  photoViewerIndex: 0,
  proposalReviewBusyId: null,
  proposalReviewStatus: "",
  proposalReviewError: false,
  store: null,
  auth: {
    status: "loading",
    user: null,
    profile: null,
    isAdmin: false,
    visitedRestaurantIds: [],
    visitCount: 0,
    proposals: [],
    adminProposals: [],
    error: "",
  },
};

const els = {};
const dockDragState = {
  pointerId: null,
  startX: 0,
  startY: 0,
  isDragging: false,
  pressIndex: -1,
  previewIndex: -1,
  suppressClick: false,
};
let spotDialogOpenFrame = null;
let dockIndicatorUpdateTimer = null;
let authSyncRevision = 0;

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("gesturestart", preventPageZoom, { passive: false });
document.addEventListener("gesturechange", preventPageZoom, { passive: false });
document.addEventListener("gestureend", preventPageZoom, { passive: false });
document.addEventListener("wheel", preventPageZoom, { passive: false });
document.addEventListener("keydown", preventPageZoomShortcut);

async function init() {
  cacheElements();
  bindEvents();
  setRestaurantPanelOpen(true);
  await loadRuntimeConfig();
  await initializeDataStore();
  await initializeMap();
  render();
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("./config.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const config = await response.json();
    runtimeConfig.naverMapKey = typeof config.naverMapKey === "string" ? config.naverMapKey.trim() : "";
    runtimeConfig.supabaseUrl = typeof config.supabaseUrl === "string" ? config.supabaseUrl.trim() : "";
    runtimeConfig.supabaseAnonKey = typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey.trim() : "";
  } catch {
    runtimeConfig.naverMapKey = "";
    runtimeConfig.supabaseUrl = "";
    runtimeConfig.supabaseAnonKey = "";
  }
}

function cacheElements() {
  els.map = document.getElementById("map");
  els.mockMap = document.getElementById("mockMap");
  els.mockPins = document.getElementById("mockPins");
  els.restaurantPanel = document.getElementById("restaurantPanel");
  els.searchPanel = document.getElementById("searchPanel");
  els.searchRow = document.querySelector(".search-row");
  els.searchInput = document.getElementById("searchInput");
  els.restaurantList = document.getElementById("restaurantList");
  els.resultCount = document.getElementById("resultCount");
  els.selectedCard = document.getElementById("selectedCard");
  els.dockCluster = document.querySelector(".dock-cluster");
  els.bottomDock = document.querySelector(".bottom-dock");
  els.dockIndicator = document.querySelector(".dock-indicator");
  els.filterModeButton = document.getElementById("filterModeButton");
  els.adminButton = document.getElementById("adminButton");
  els.addButton = document.getElementById("addButton");
  els.authPanel = document.getElementById("authPanel");
  els.searchToggle = document.getElementById("searchToggle");
  els.spotDialog = document.getElementById("spotDialog");
  els.spotForm = document.getElementById("spotForm");
  els.spotDialogTitle = document.getElementById("spotDialogTitle");
  els.spotSubmitButton = document.getElementById("spotSubmitButton");
  els.spotPhotoButton = document.getElementById("spotPhotoButton");
  els.spotPhotoInput = document.getElementById("spotPhotoInput");
  els.spotPhotoCount = document.getElementById("spotPhotoCount");
  els.photoDialog = document.getElementById("photoDialog");
  els.photoDialogTitle = document.getElementById("photoDialogTitle");
  els.photoDialogCount = document.getElementById("photoDialogCount");
  els.photoDialogClose = document.getElementById("photoDialogClose");
  els.photoManagerList = document.getElementById("photoManagerList");
  els.photoManagerStatus = document.getElementById("photoManagerStatus");
  els.photoUploadButton = document.getElementById("photoUploadButton");
  els.photoUploadInput = document.getElementById("photoUploadInput");
  els.photoViewer = document.getElementById("photoViewer");
  els.photoViewerClose = document.getElementById("photoViewerClose");
  els.photoViewerPrevious = document.getElementById("photoViewerPrevious");
  els.photoViewerNext = document.getElementById("photoViewerNext");
  els.photoViewerImage = document.getElementById("photoViewerImage");
  els.photoViewerCaption = document.getElementById("photoViewerCaption");
  els.proposalReviewDialog = document.getElementById("proposalReviewDialog");
  els.proposalReviewCount = document.getElementById("proposalReviewCount");
  els.proposalReviewClose = document.getElementById("proposalReviewClose");
  els.proposalReviewList = document.getElementById("proposalReviewList");
  els.proposalReviewStatus = document.getElementById("proposalReviewStatus");
  els.nameInput = document.getElementById("nameInput");
  els.categoryInput = document.getElementById("categoryInput");
  els.areaInput = document.getElementById("areaInput");
  els.latInput = document.getElementById("latInput");
  els.lngInput = document.getElementById("lngInput");
  els.placeSearchButton = document.getElementById("placeSearchButton");
  els.placeResultList = document.getElementById("placeResultList");
  els.menuDraftInput = document.getElementById("menuDraftInput");
  els.menuPriceDraftInput = document.getElementById("menuPriceDraftInput");
  els.addMenuButton = document.getElementById("addMenuButton");
  els.menuInputList = document.getElementById("menuInputList");
  els.filterButtons = [...document.querySelectorAll(".dock-filter-button")];
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    if (state.selectedId) {
      state.selectedId = null;
    }
    setRestaurantPanelOpen(true);
    render();
  });

  els.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setFilter(button.dataset.filter);
    });
  });

  els.adminButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setAuthPanelOpen(!isAuthPanelOpen());
  });

  els.authPanel.addEventListener("click", handleAuthPanelClick);

  document.addEventListener("pointerdown", (event) => {
    if (!isAuthPanelOpen()) return;
    if (els.authPanel.contains(event.target) || els.adminButton.contains(event.target)) return;
    setAuthPanelOpen(false);
  });

  els.addButton.addEventListener("click", (event) => {
    if (!state.isAdminMode && !isCatalist()) return;
    event.currentTarget.blur();

    if (isSpotDialogOpen()) {
      closeSpotDialog();
      return;
    }

    openSpotDialog(null, { mode: state.isAdminMode ? "restaurant" : "proposal" });
  });

  els.searchToggle.addEventListener("click", () => {
    if (isSpotDialogOpen()) {
      closeSpotDialog({ restorePanel: false });
    }
    closeSelectedRestaurant();
    setRestaurantPanelOpen(true);
    setSearchPanelOpen(true);
    window.setTimeout(() => els.searchInput.focus(), 340);
  });

  els.filterModeButton.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  els.filterModeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setSearchPanelOpen(false);
    setRestaurantPanelOpen(true);
  });

  els.bottomDock.addEventListener("click", handleDockClickCapture, true);
  els.bottomDock.addEventListener("pointerdown", handleDockPointerDown);
  els.bottomDock.addEventListener("pointermove", handleDockPointerMove);
  els.bottomDock.addEventListener("pointerup", handleDockPointerUp);
  els.bottomDock.addEventListener("pointercancel", cancelDockDrag);
  window.addEventListener("resize", updateDockIndicator);

  document.addEventListener("keydown", (event) => {
    if (isPhotoViewerOpen() && event.key === "ArrowLeft") {
      movePhotoViewer(-1);
      return;
    }
    if (isPhotoViewerOpen() && event.key === "ArrowRight") {
      movePhotoViewer(1);
      return;
    }
    if (event.key !== "Escape") return;

    if (isPhotoViewerOpen()) {
      closePhotoViewer();
    } else if (isProposalReviewDialogOpen()) {
      closeProposalReviewDialog();
    } else if (isPhotoDialogOpen()) {
      closePhotoDialog();
    } else if (isSpotDialogOpen()) {
      closeSpotDialog();
    } else if (isSearchPanelOpen()) {
      setSearchPanelOpen(false);
    } else if (state.selectedId) {
      closeSelectedRestaurant();
      setRestaurantPanelOpen(true);
    } else {
      setRestaurantPanelOpen(true);
    }
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.closeDialog === "spotDialog") {
        closeSpotDialog();
      }
    });
  });

  els.placeSearchButton.addEventListener("click", searchPlaces);
  els.nameInput.addEventListener("input", handlePlaceNameInput);
  els.nameInput.addEventListener("keydown", handlePlaceNameKeydown);

  els.addMenuButton.addEventListener("click", () => {
    addMenuFromDraft();
  });

  els.menuDraftInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addMenuFromDraft();
  });

  els.menuPriceDraftInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addMenuFromDraft();
  });

  els.spotForm.addEventListener("submit", handleSpotSubmit);
  els.spotPhotoInput.addEventListener("change", updateSpotPhotoSelection);

  els.photoDialogClose.addEventListener("click", closePhotoDialog);
  els.photoUploadInput.addEventListener("change", handlePhotoUpload);
  els.photoManagerList.addEventListener("click", handlePhotoManagerClick);
  els.photoViewerClose.addEventListener("click", closePhotoViewer);
  els.photoViewerPrevious.addEventListener("click", () => movePhotoViewer(-1));
  els.photoViewerNext.addEventListener("click", () => movePhotoViewer(1));
  els.photoViewer.addEventListener("click", (event) => {
    if (event.target === els.photoViewer) closePhotoViewer();
  });
  els.proposalReviewClose.addEventListener("click", closeProposalReviewDialog);
  els.proposalReviewList.addEventListener("click", handleProposalReviewClick);
}

function setRestaurantPanelOpen(isOpen) {
  els.restaurantPanel.classList.toggle("is-open", isOpen);
  els.restaurantPanel.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("is-list-open", isOpen);
}

function setSearchPanelOpen(isOpen) {
  const wasOpen = isSearchPanelOpen();
  els.searchPanel.classList.toggle("is-open", isOpen);
  els.searchPanel.setAttribute("aria-expanded", String(isOpen));
  els.searchRow.setAttribute("aria-hidden", String(!isOpen));
  els.searchInput.tabIndex = isOpen ? 0 : -1;
  els.dockCluster.classList.toggle("is-search-mode", isOpen);
  els.searchToggle.classList.toggle("is-active", isOpen);
  els.searchToggle.setAttribute("aria-expanded", String(isOpen));
  els.filterModeButton.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("is-search-open", isOpen);
  if (!isOpen && document.activeElement === els.searchInput) {
    els.searchInput.blur();
  }
  if (isOpen) {
    updateDockIndicator();
  } else if (wasOpen) {
    els.bottomDock.style.setProperty("--dock-indicator-opacity", "0");
    scheduleDockIndicatorUpdate(540);
  } else {
    updateDockIndicator();
  }
}

function setAccountMode(mode, { rerender = true } = {}) {
  const fallbackMode = state.auth.profile?.is_catalist ? "catalist" : "member";
  const nextMode = state.auth.isAdmin && ["member", "catalist", "admin"].includes(mode) ? mode : fallbackMode;

  if (state.accountMode !== nextMode && isSpotDialogOpen()) {
    closeSpotDialog({ restorePanel: !state.selectedId });
  }
  if (state.accountMode !== nextMode && isPhotoDialogOpen()) {
    closePhotoDialog();
  }
  if (nextMode !== "admin" && isProposalReviewDialogOpen()) {
    closeProposalReviewDialog();
  }

  state.accountMode = nextMode;
  state.isAdminMode = nextMode === "admin";
  document.body.classList.toggle("is-admin-mode", state.isAdminMode);
  updateAddButtonAccess();

  renderAuthPanel();

  if (rerender) {
    render();
  }
}

function isCatalist() {
  if (!isMemberSignedIn()) return false;
  if (state.auth.isAdmin) return state.accountMode === "catalist";
  return Boolean(state.auth.profile?.is_catalist);
}

function accountModeLabel() {
  if (state.accountMode === "admin") return "관리자";
  if (state.accountMode === "catalist") return "까탈리스트";
  return "일반회원";
}

function updateAddButtonAccess() {
  const canOpen = state.isAdminMode || isCatalist();
  const label = state.isAdminMode ? "맛집 추가" : "맛집 건의";
  document.body.classList.toggle("has-add-access", canOpen);
  els.addButton.setAttribute("aria-hidden", String(!canOpen));
  els.addButton.setAttribute("aria-label", label);
  els.addButton.title = label;
  els.addButton.tabIndex = canOpen ? 0 : -1;
}

function isAuthPanelOpen() {
  return els.authPanel.classList.contains("is-open");
}

function setAuthPanelOpen(isOpen) {
  const nextValue = Boolean(isOpen);
  els.authPanel.classList.toggle("is-open", nextValue);
  els.authPanel.setAttribute("aria-hidden", String(!nextValue));
  els.adminButton.classList.toggle("is-active", nextValue);
  els.adminButton.setAttribute("aria-expanded", String(nextValue));
  renderAuthPanel();
}

function isMemberSignedIn() {
  return Boolean(state.auth.user && !state.auth.user.is_anonymous);
}

function memberDisplayName() {
  const metadata = state.auth.user?.user_metadata ?? {};
  return (
    state.auth.profile?.nickname ||
    metadata.nickname ||
    metadata.name ||
    metadata.full_name ||
    "까탈로그 회원"
  );
}

function memberAvatarUrl() {
  const metadata = state.auth.user?.user_metadata ?? {};
  return state.auth.profile?.avatar_url || metadata.avatar_url || metadata.picture || "";
}

function proposalStatusLabel(status) {
  if (status === "approved") return "승인";
  if (status === "rejected") return "반려";
  return "검토 중";
}

function renderMemberProposals() {
  if (!isCatalist()) return "";

  const proposals = state.auth.proposals.slice(0, 3);
  const rows = proposals.length
    ? proposals
        .map(
          (proposal) => `
            <div class="proposal-status-row">
              <span>${escapeHtml(proposal.name)}</span>
              <small data-status="${escapeHtml(proposal.status)}">${proposalStatusLabel(proposal.status)}</small>
            </div>
          `
        )
        .join("")
    : '<p class="proposal-empty">접수된 맛집 건의가 없습니다</p>';

  return `
    <section class="member-proposals" aria-label="내 맛집 건의">
      <strong>내 맛집 건의</strong>
      ${rows}
    </section>
  `;
}

function renderAuthButton() {
  const isMember = isMemberSignedIn();
  const label = !isMember ? "로그인" : state.auth.isAdmin ? accountModeLabel() : state.auth.profile?.is_catalist ? "까탈리스트" : "회원";
  els.adminButton.textContent = label;
  els.adminButton.title = isMember ? "내 계정" : "로그인";
  els.adminButton.setAttribute("aria-label", isMember ? `${memberDisplayName()} 계정` : "로그인");
}

function renderAuthPanel() {
  if (!els.authPanel) return;
  renderAuthButton();

  if (state.auth.status === "loading") {
    els.authPanel.innerHTML = '<p class="auth-status">계정을 확인하고 있습니다</p>';
    return;
  }

  if (state.auth.status === "unavailable") {
    els.authPanel.innerHTML = `
      <div class="auth-panel-copy">
        <strong>로그인을 준비하지 못했습니다</strong>
        <p>${escapeHtml(state.auth.error || "Supabase 연결을 확인해주세요")}</p>
      </div>
    `;
    return;
  }

  if (!isMemberSignedIn()) {
    els.authPanel.innerHTML = `
      <div class="auth-panel-copy">
        <strong>까탈로그 시작하기</strong>
        <p>방문을 인증하고 까탈리스트에 도전하세요</p>
      </div>
      <button class="kakao-login-button" type="button" data-auth-action="kakao">
        <span class="kakao-symbol" aria-hidden="true">●</span>
        <span>카카오로 시작하기</span>
      </button>
      ${state.auth.error ? `<p class="auth-error">${escapeHtml(state.auth.error)}</p>` : ""}
    `;
    return;
  }

  const avatarUrl = memberAvatarUrl();
  const avatar = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
    : `<span aria-hidden="true">${escapeHtml(memberDisplayName().slice(0, 1))}</span>`;
  const roleLabel = state.auth.isAdmin ? `관리자 계정 · ${accountModeLabel()} 모드` : state.auth.profile?.is_catalist ? "까탈리스트" : "회원";
  const pendingProposalCount = state.auth.adminProposals.length;
  const adminControl = state.auth.isAdmin
    ? `
      <div class="account-mode-control" role="group" aria-label="사용 모드">
        ${[
          ["member", "일반회원"],
          ["catalist", "까탈리스트"],
          ["admin", "관리자"],
        ]
          .map(
            ([mode, label]) => `
              <button
                class="account-mode-option${state.accountMode === mode ? " is-active" : ""}"
                type="button"
                data-account-mode="${mode}"
                aria-pressed="${state.accountMode === mode}"
              >${label}</button>
            `
          )
          .join("")}
      </div>
    `
    : "";

  els.authPanel.innerHTML = `
    <div class="member-summary">
      <span class="member-avatar">${avatar}</span>
      <span class="member-copy">
        <strong>${escapeHtml(memberDisplayName())}</strong>
        <small>${roleLabel} · 방문 ${state.auth.visitCount}곳</small>
      </span>
    </div>
    <div class="auth-panel-actions">
      ${adminControl}
      ${
        state.isAdminMode
          ? `<button class="auth-secondary-button review-proposals-button" type="button" data-auth-action="review-proposals">
              <span>맛집 건의 검토</span><strong>${pendingProposalCount}</strong>
            </button>`
          : ""
      }
      <button class="auth-secondary-button" type="button" data-auth-action="logout">로그아웃</button>
    </div>
    ${renderMemberProposals()}
    ${state.auth.error ? `<p class="auth-error">${escapeHtml(state.auth.error)}</p>` : ""}
  `;
}

async function handleAuthPanelClick(event) {
  const modeButton = event.target.closest("[data-account-mode]");
  if (modeButton && !modeButton.disabled) {
    setAccountMode(modeButton.dataset.accountMode);
    return;
  }

  const button = event.target.closest("[data-auth-action]");
  if (!button || button.disabled) return;

  const action = button.dataset.authAction;
  button.disabled = true;
  state.auth.error = "";

  try {
    if (action === "kakao") {
      if (typeof state.store?.signInWithKakao !== "function") {
        throw new Error("auth unavailable");
      }
      await state.store.signInWithKakao();
    } else if (action === "review-proposals") {
      setAuthPanelOpen(false);
      await openProposalReviewDialog();
    } else if (action === "logout") {
      await state.store?.signOut?.();
      setAuthPanelOpen(false);
    }
  } catch (error) {
    console.warn("auth action failed", error);
    state.auth.error = authErrorMessage(error);
    renderAuthPanel();
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

function authErrorMessage(error) {
  const message = String(error?.message || "");
  if (/provider.*disabled/i.test(message)) return "카카오 로그인 설정이 아직 완료되지 않았습니다";
  if (/auth unavailable/i.test(message)) return "회원 연결을 준비하지 못했습니다. 새로고침해주세요";
  return "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요";
}

async function syncAuthState(store) {
  const revision = ++authSyncRevision;
  state.auth.status = "loading";
  state.auth.error = "";
  renderAuthPanel();

  try {
    const memberContext = await store.getMemberContext();
    if (revision !== authSyncRevision) return;

    state.auth.status = "ready";
    state.auth.user = memberContext.user;
    state.auth.profile = memberContext.profile;
    state.auth.isAdmin = memberContext.isAdmin;
    state.auth.visitedRestaurantIds = memberContext.visitedRestaurantIds;
    state.auth.visitCount = memberContext.visitCount;
    state.auth.proposals = memberContext.proposals;
    state.auth.adminProposals = memberContext.adminProposals;
    const nextMode = memberContext.isAdmin
      ? state.accountMode
      : memberContext.profile?.is_catalist
        ? "catalist"
        : "member";
    setAccountMode(nextMode, { rerender: false });
  } catch (error) {
    if (revision !== authSyncRevision) return;
    console.warn("member context failed", error);
    state.auth.status = "unavailable";
    state.auth.user = null;
    state.auth.profile = null;
    state.auth.isAdmin = false;
    state.auth.visitedRestaurantIds = [];
    state.auth.visitCount = 0;
    state.auth.proposals = [];
    state.auth.adminProposals = [];
    state.auth.error = "회원 정보를 불러오지 못했습니다";
    setAccountMode("member", { rerender: false });
  }

  renderAuthPanel();
  render();
}

function isSearchPanelOpen() {
  return els.searchPanel.classList.contains("is-open");
}

function closeFloatingPanels() {
  setRestaurantPanelOpen(false);
  setSearchPanelOpen(false);
}

function setFilter(filter) {
  const nextFilter = filter || "all";
  if (isSpotDialogOpen()) {
    closeSpotDialog({ restorePanel: false });
  }
  if (state.selectedId) {
    state.selectedId = null;
  }
  setRestaurantPanelOpen(true);

  if (state.filter === nextFilter) {
    render();
    updateDockIndicator();
    return;
  }

  state.filter = nextFilter;
  els.filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === nextFilter);
  });
  render();
}

function getDockButtons() {
  return els.filterButtons;
}

function getActiveDockIndex() {
  return getDockButtons().findIndex((button) => button.dataset.filter === state.filter);
}

function updateDockIndicator() {
  if (!els.dockIndicator) return;
  if (isSearchPanelOpen()) {
    els.bottomDock.style.setProperty("--dock-indicator-opacity", "0");
    return;
  }

  const index = getActiveDockIndex();
  if (index < 0) {
    els.bottomDock.style.setProperty("--dock-indicator-opacity", "0");
    return;
  }

  setDockIndicatorToIndex(index);
}

function setDockIndicatorToIndex(index) {
  const button = getDockButtons()[index];
  if (!button) return;
  els.bottomDock.style.setProperty("--dock-indicator-x", `${button.offsetLeft}px`);
  els.bottomDock.style.setProperty("--dock-indicator-width", `${button.offsetWidth}px`);
  els.bottomDock.style.setProperty("--dock-indicator-opacity", "1");
}

function scheduleDockIndicatorUpdate(delay = 0) {
  if (dockIndicatorUpdateTimer) {
    window.clearTimeout(dockIndicatorUpdateTimer);
  }
  dockIndicatorUpdateTimer = window.setTimeout(() => {
    dockIndicatorUpdateTimer = null;
    updateDockIndicator();
  }, delay);
}

function handleDockClickCapture(event) {
  if (!dockDragState.suppressClick) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  dockDragState.suppressClick = false;
}

function handleDockPointerDown(event) {
  if (isSearchPanelOpen()) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const pressIndex = getDockIndexFromEvent(event);
  if (pressIndex < 0) return;
  dockDragState.pointerId = event.pointerId;
  dockDragState.startX = event.clientX;
  dockDragState.startY = event.clientY;
  dockDragState.isDragging = false;
  dockDragState.pressIndex = pressIndex;
  setDockPreviewIndex(pressIndex);
  setDockIndicatorToIndex(pressIndex);
  els.bottomDock.classList.add("is-pressing");
  els.bottomDock.setPointerCapture?.(event.pointerId);
}

function handleDockPointerMove(event) {
  if (isSearchPanelOpen()) return;
  if (event.pointerId !== dockDragState.pointerId) return;

  const deltaX = event.clientX - dockDragState.startX;
  const deltaY = event.clientY - dockDragState.startY;
  const distance = Math.hypot(deltaX, deltaY);

  if (!dockDragState.isDragging) {
    if (distance < 6) return;
    if (Math.abs(deltaY) > Math.abs(deltaX) + 4) {
      cancelDockDrag(event);
      return;
    }
    dockDragState.isDragging = true;
    els.bottomDock.classList.add("is-dragging");
  }

  event.preventDefault();
  moveDockIndicatorToPointer(event.clientX);
}

function handleDockPointerUp(event) {
  if (isSearchPanelOpen()) return;
  if (event.pointerId !== dockDragState.pointerId) return;
  const targetIndex = getNearestDockIndex(event.clientX);
  const finalIndex = targetIndex >= 0 ? targetIndex : dockDragState.pressIndex;
  finishDockDrag(event);

  if (finalIndex < 0) return;
  event.preventDefault();
  dockDragState.suppressClick = true;
  window.setTimeout(() => {
    dockDragState.suppressClick = false;
  }, 120);

  const targetButton = getDockButtons()[finalIndex];
  if (!targetButton?.dataset.filter) return;
  setDockIndicatorToIndex(finalIndex);
  setFilter(targetButton.dataset.filter);
}

function cancelDockDrag(event) {
  if (event?.pointerId && event.pointerId !== dockDragState.pointerId) return;
  finishDockDrag(event);
  updateDockIndicator();
}

function finishDockDrag(event) {
  if (dockDragState.pointerId !== null) {
    els.bottomDock.releasePointerCapture?.(dockDragState.pointerId);
  }
  dockDragState.pointerId = null;
  dockDragState.isDragging = false;
  dockDragState.pressIndex = -1;
  setDockPreviewIndex(-1);
  els.bottomDock.classList.remove("is-pressing");
  els.bottomDock.classList.remove("is-dragging");
}

function preventPageZoom(event) {
  if (event.type === "wheel" && !event.ctrlKey) return;
  event.preventDefault();
}

function preventPageZoomShortcut(event) {
  if (!event.ctrlKey && !event.metaKey) return;
  if (!["+", "-", "=", "_", "0"].includes(event.key)) return;
  event.preventDefault();
}

function moveDockIndicatorToPointer(clientX) {
  const buttons = getDockButtons();
  const nearestIndex = getNearestDockIndex(clientX);
  if (nearestIndex < 0) return;
  setDockPreviewIndex(nearestIndex);

  const dockRect = els.bottomDock.getBoundingClientRect();
  const button = buttons[nearestIndex];
  const width = button.offsetWidth;
  const firstX = buttons[0].offsetLeft;
  const lastButton = buttons[buttons.length - 1];
  const maxX = lastButton.offsetLeft + lastButton.offsetWidth - width;
  const nextX = Math.max(firstX, Math.min(maxX, clientX - dockRect.left - width / 2));

  els.bottomDock.style.setProperty("--dock-indicator-x", `${nextX}px`);
  els.bottomDock.style.setProperty("--dock-indicator-width", `${width}px`);
  els.bottomDock.style.setProperty("--dock-indicator-opacity", "1");
}

function setDockPreviewIndex(index) {
  if (dockDragState.previewIndex === index) return;
  dockDragState.previewIndex = index;
  getDockButtons().forEach((button, buttonIndex) => {
    button.classList.toggle("is-preview", buttonIndex === index);
  });
}

function getDockIndexFromEvent(event) {
  const button = event.target.closest?.(".dock-filter-button");
  if (button && els.bottomDock.contains(button)) {
    return getDockButtons().indexOf(button);
  }
  return getNearestDockIndex(event.clientX);
}

function getNearestDockIndex(clientX) {
  const buttons = getDockButtons();
  let nearestIndex = -1;
  let nearestDistance = Infinity;

  buttons.forEach((button, index) => {
    const rect = button.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const distance = Math.abs(center - clientX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function isSpotDialogOpen() {
  return els.spotDialog.classList.contains("is-open") || els.addButton.classList.contains("is-active");
}

function closeSpotDialog({ restorePanel = true } = {}) {
  if (!isSpotDialogOpen()) return;
  if (spotDialogOpenFrame) {
    window.cancelAnimationFrame(spotDialogOpenFrame);
    spotDialogOpenFrame = null;
  }
  els.spotDialog.classList.remove("is-open");
  els.spotDialog.setAttribute("aria-hidden", "true");
  els.addButton.classList.remove("is-active");
  els.addButton.setAttribute("aria-expanded", "false");
  if (restorePanel && !state.selectedId) {
    setRestaurantPanelOpen(true);
  }
  updateDockIndicator();
}

function openAnimatedSpotDialog() {
  els.spotDialog.setAttribute("aria-hidden", "false");
  els.addButton.classList.add("is-active");
  els.addButton.setAttribute("aria-expanded", "true");
  updateDockIndicator();
  spotDialogOpenFrame = window.requestAnimationFrame(() => {
    spotDialogOpenFrame = null;
    if (!els.addButton.classList.contains("is-active")) return;
    els.spotDialog.classList.add("is-open");
  });
}

function closeSelectedRestaurant() {
  if (!state.selectedId) return;
  state.selectedId = null;
  render();
}

async function searchPlaces() {
  clearPlaceValidation();
  const query = els.nameInput.value.trim();
  if (query.length < 2) {
    renderPlaceMessage("두 글자 이상 입력해주세요");
    return;
  }

  els.placeSearchButton.disabled = true;
  renderPlaceMessage("검색 중");

  try {
    const places = await fetchPlaceCandidates(query);
    renderPlaceResults(places);
  } catch (error) {
    console.warn("place search failed", error);
    renderPlaceMessage("장소 검색 설정이 필요합니다");
  } finally {
    els.placeSearchButton.disabled = false;
  }
}

async function fetchPlaceCandidates(query) {
  if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
    throw new Error("Supabase config is missing");
  }

  const endpoint = `${runtimeConfig.supabaseUrl.replace(/\/$/, "")}/functions/v1/naver-place-search`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: runtimeConfig.supabaseAnonKey,
      Authorization: `Bearer ${runtimeConfig.supabaseAnonKey}`,
    },
    body: JSON.stringify({ query }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Place search request failed");
  }

  return Array.isArray(payload.items) ? payload.items.map(normalizePlaceCandidate).filter((place) => place.name) : [];
}

function normalizePlaceCandidate(item) {
  return {
    name: stripHtml(item.name || item.title || ""),
    category: stripHtml(item.category || ""),
    address: stripHtml(item.address || ""),
    roadAddress: stripHtml(item.roadAddress || ""),
    link: String(item.link || ""),
    lat: toOptionalNumber(item.lat),
    lng: toOptionalNumber(item.lng),
    mapx: toOptionalNumber(item.mapx),
    mapy: toOptionalNumber(item.mapy),
  };
}

function renderPlaceResults(places) {
  els.placeResultList.innerHTML = "";

  if (!places.length) {
    renderPlaceMessage("검색 결과가 없습니다");
    return;
  }

  const fragment = document.createDocumentFragment();
  places.forEach((place) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-result";
    button.addEventListener("click", () => selectPlaceCandidate(place));

    const name = document.createElement("strong");
    name.textContent = place.name;

    const meta = document.createElement("span");
    meta.textContent = [place.category, place.roadAddress || place.address].filter(Boolean).join(" · ");

    button.append(name, meta);
    fragment.append(button);
  });

  els.placeResultList.append(fragment);
  els.placeResultList.classList.remove("hidden");
}

function renderPlaceMessage(message) {
  els.placeResultList.innerHTML = "";
  const item = document.createElement("div");
  item.className = "place-result-message";
  item.textContent = message;
  els.placeResultList.append(item);
  els.placeResultList.classList.remove("hidden");
}

function clearPlaceResults() {
  els.placeResultList.innerHTML = "";
  els.placeResultList.classList.add("hidden");
}

function handlePlaceNameInput() {
  clearPlaceResults();
  clearSelectedPlaceCandidate();
}

function handlePlaceNameKeydown(event) {
  if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  event.stopPropagation();
  if (els.placeSearchButton.disabled) return;
  searchPlaces();
}

function clearSelectedPlaceCandidate() {
  state.placeSelection = null;
  els.areaInput.value = "";
  clearCoordinateInputs();
  clearPlaceValidation();
}

function selectPlaceCandidate(place) {
  const coord = resolvePlaceCoordinate(place);
  if (!coord) {
    renderPlaceMessage("좌표를 확인할 수 없습니다. 다른 결과를 선택해주세요");
    return;
  }

  els.nameInput.value = place.name;
  els.areaInput.value = place.roadAddress || place.address || "";
  setCategoryFromPlace(place.category);
  fillCoordinateInputs(coord);
  setSelectedPlaceCandidate(place, coord);

  state.lastMapCoord = coord;
  state.map?.panTo(coord);

  clearPlaceResults();
}

function setSelectedPlaceCandidate(place, coord) {
  state.placeSelection = {
    name: String(place.name || "").trim(),
    area: String(place.roadAddress || place.address || "").trim(),
    lat: Number(coord.lat),
    lng: Number(coord.lng),
    sourceLink: String(place.link || ""),
  };
  clearPlaceValidation();
}

function setStoredPlaceCandidate(restaurant) {
  const coord = { lat: Number(restaurant.lat), lng: Number(restaurant.lng) };
  if (!restaurant.name || !isValidCoordinate(coord)) {
    state.placeSelection = null;
    return;
  }

  state.placeSelection = {
    name: String(restaurant.name).trim(),
    area: String(restaurant.area || "").trim(),
    lat: coord.lat,
    lng: coord.lng,
    sourceLink: "",
  };
  clearPlaceValidation();
}

function isCurrentPlaceSelectionValid() {
  const selectedPlace = state.placeSelection;
  if (!selectedPlace) return false;

  const lat = Number(els.latInput.value);
  const lng = Number(els.lngInput.value);
  return (
    els.nameInput.value.trim() === selectedPlace.name &&
    isValidCoordinate({ lat, lng }) &&
    Math.abs(lat - selectedPlace.lat) < 0.000001 &&
    Math.abs(lng - selectedPlace.lng) < 0.000001
  );
}

function requireSelectedPlaceCandidate() {
  const message = "장소 검색 결과에서 식당을 선택해주세요";
  renderPlaceMessage(message);
  els.nameInput.setCustomValidity(message);
  els.nameInput.reportValidity();
  els.nameInput.focus();
}

function clearPlaceValidation() {
  els.nameInput.setCustomValidity("");
}

function resolvePlaceCoordinate(place) {
  if (isValidCoordinate(place)) {
    return { lat: place.lat, lng: place.lng };
  }

  const scaledLng = place.mapx / 10000000;
  const scaledLat = place.mapy / 10000000;
  if (isValidCoordinate({ lat: scaledLat, lng: scaledLng })) {
    return { lat: scaledLat, lng: scaledLng };
  }

  if (window.naver?.maps?.TransCoord?.fromTM128ToLatLng && Number.isFinite(place.mapx) && Number.isFinite(place.mapy)) {
    const convertedCoord = normaliseNaverCoord(
      window.naver.maps.TransCoord.fromTM128ToLatLng(new window.naver.maps.Point(place.mapx, place.mapy))
    );
    return isValidCoordinate(convertedCoord) ? convertedCoord : null;
  }

  return null;
}

function isValidCoordinate(coord) {
  return (
    Number.isFinite(coord.lat) &&
    Number.isFinite(coord.lng) &&
    Math.abs(coord.lat) <= 90 &&
    Math.abs(coord.lng) <= 180
  );
}

function getInitialRestaurantRevealCoordinates(origin) {
  const nearbyRestaurants = state.restaurants
    .map((restaurant) => {
      const coord = { lat: Number(restaurant.lat), lng: Number(restaurant.lng) };
      return isValidCoordinate(coord) ? { coord, distanceKm: distanceKmBetween(origin, coord) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (!nearbyRestaurants.length || nearbyRestaurants[0].distanceKm <= INITIAL_NEARBY_RADIUS_KM) {
    return [origin];
  }

  const revealLimitKm = Math.max(INITIAL_NEARBY_RADIUS_KM, nearbyRestaurants[0].distanceKm * 1.35);
  const revealRestaurants = nearbyRestaurants
    .filter((restaurant) => restaurant.distanceKm <= revealLimitKm)
    .slice(0, INITIAL_REVEAL_RESTAURANT_LIMIT);

  return [origin, ...revealRestaurants.map((restaurant) => restaurant.coord)];
}

function distanceKmBetween(start, end) {
  const earthRadiusKm = 6371;
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : NaN;
}

function setCategoryFromPlace(category) {
  const nextCategory = inferCategoryFromPlace(category);
  if (!nextCategory) return;
  const option = [...els.categoryInput.options].find((item) => item.value === nextCategory || item.textContent === nextCategory);
  if (option) {
    els.categoryInput.value = option.value;
  }
}

function inferCategoryFromPlace(category) {
  const text = String(category || "");
  if (text.includes("카페") || text.includes("디저트") || text.includes("베이커리")) return "카페";
  if (text.includes("일식") || text.includes("초밥") || text.includes("라멘") || text.includes("돈가스")) return "일식";
  if (text.includes("중식") || text.includes("중국")) return "중식";
  if (text.includes("양식") || text.includes("이탈리아") || text.includes("프랑스") || text.includes("스테이크")) return "양식";
  if (text.includes("분식") || text.includes("국수") || text.includes("김밥")) return "분식";
  if (text.includes("바") || text.includes("술집") || text.includes("주점") || text.includes("와인")) return "바";
  if (text.includes("한식") || text.includes("고기") || text.includes("국밥") || text.includes("냉면")) return "한식";
  return "기타";
}

function addMenuFromDraft({ refocus = true } = {}) {
  const name = els.menuDraftInput.value.trim();
  const price = normalizeMenuPrice(els.menuPriceDraftInput.value);
  if (!name) {
    if (refocus) {
      els.menuDraftInput.focus();
    }
    return;
  }

  const currentItems = getMenuInputItems();
  if (currentItems.length >= 6 || currentItems.some((item) => item.name === name)) {
    els.menuDraftInput.value = "";
    els.menuPriceDraftInput.value = "";
    if (refocus) {
      els.menuDraftInput.focus();
    }
    return;
  }

  appendMenuInput({ name, price });
  els.menuDraftInput.value = "";
  els.menuPriceDraftInput.value = "";
  if (refocus) {
    els.menuDraftInput.focus();
  }
}

function renderMenuInputs(menuItems, fallbackMenus = []) {
  els.menuInputList.innerHTML = "";
  normalizeMenuItems(menuItems, fallbackMenus).forEach((menuItem) => appendMenuInput(menuItem));
}

function appendMenuInput(menuItem) {
  const normalizedItem = normalizeMenuItem(menuItem);
  if (!normalizedItem) return;

  const chip = document.createElement("span");
  chip.className = "menu-input-chip";

  const label = document.createElement("span");
  label.textContent = normalizedItem.name;

  const priceLabel = document.createElement("span");
  priceLabel.className = "menu-input-price";
  priceLabel.textContent = normalizedItem.price || "가격 미입력";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "menus";
  input.value = normalizedItem.name;

  const itemInput = document.createElement("input");
  itemInput.type = "hidden";
  itemInput.name = "menuItems";
  itemInput.value = JSON.stringify(normalizedItem);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", `${normalizedItem.name} 삭제`);
  removeButton.textContent = "×";
  removeButton.addEventListener("click", () => {
    chip.remove();
    els.menuDraftInput.focus();
  });

  chip.append(label, priceLabel, input, itemInput, removeButton);
  els.menuInputList.append(chip);
}

function getMenuInputValues() {
  return [...els.menuInputList.querySelectorAll('input[name="menus"]')].map((input) => input.value);
}

function getMenuInputItems() {
  return [...els.menuInputList.querySelectorAll('input[name="menuItems"]')]
    .map((input) => {
      try {
        return JSON.parse(input.value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function normalizeMenuValues(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(String).map((menu) => menu.trim()).filter(Boolean))].slice(0, 6);
}

function normalizeMenuItems(menuItems, fallbackMenus = []) {
  const sourceItems = Array.isArray(menuItems) && menuItems.length > 0 ? menuItems : normalizeMenuValues(fallbackMenus);
  const normalizedItems = [];
  const seenNames = new Set();

  sourceItems.forEach((item) => {
    const normalizedItem = normalizeMenuItem(item);
    if (!normalizedItem || seenNames.has(normalizedItem.name)) return;
    seenNames.add(normalizedItem.name);
    normalizedItems.push(normalizedItem);
  });

  return normalizedItems.slice(0, 6);
}

function normalizeMenuItem(item) {
  const name = typeof item === "object" && item !== null ? item.name : item;
  const price = typeof item === "object" && item !== null ? item.price : "";
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return null;
  return {
    name: normalizedName,
    price: normalizeMenuPrice(price),
  };
}

function normalizeMenuPrice(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";

  const numberText = text.replace(/[,\s원]/g, "");
  if (/^\d+$/.test(numberText)) {
    return `${Number(numberText).toLocaleString("ko-KR")}원`;
  }

  return text.slice(0, 18);
}

async function initializeMap() {
  setProviderBadge("네이버지도 연결", "loading");
  state.map?.destroy?.();
  state.map = null;

  try {
    if (!runtimeConfig.naverMapKey) {
      throw new Error("네이버지도 키가 설정되지 않았습니다");
    }

    const adapter = new NaverMapAdapter(els.map, els.mockMap, runtimeConfig.naverMapKey);
    await activateMap(adapter);
    setProviderBadge(adapter.label, adapter.type);
  } catch (error) {
    console.warn("naver map failed", error);
    const fallback = new MockMapAdapter(els.map, els.mockMap, els.mockPins);
    await activateMap(fallback);
    setProviderBadge("네이버지도 실패", "error");
  }
}

async function activateMap(adapter) {
  await adapter.load();
  adapter.setClickHandler((coord) => {
    state.lastMapCoord = coord;
  });
  state.map = adapter;
  state.lastMapCoord = adapter.getCenter();
  centerMapOnUserLocation(adapter);
}

async function centerMapOnUserLocation(adapter) {
  const coord = await getUserLocationCoord().catch(() => null);
  if (!coord || state.map !== adapter || state.selectedId) return;

  state.lastMapCoord = coord;
  const revealCoords = getInitialRestaurantRevealCoordinates(coord);
  if (revealCoords.length > 1 && typeof adapter.fitToCoordinates === "function") {
    adapter.fitToCoordinates(revealCoords);
  } else {
    adapter.panTo(coord);
  }
}

function getUserLocationCoord() {
  if (!navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coord = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
        };
        resolve(isValidCoordinate(coord) ? coord : null);
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        maximumAge: USER_LOCATION_MAX_AGE_MS,
        timeout: USER_LOCATION_TIMEOUT_MS,
      }
    );
  });
}

function render() {
  const visibleRestaurants = getVisibleRestaurants();
  renderList(visibleRestaurants);
  renderMeta(visibleRestaurants);
  renderSelectedCard(visibleRestaurants);
  state.map?.render(visibleRestaurants, state.selectedId, (id) => selectRestaurant(id, { closePanel: true }));
  updateDockIndicator();
}

function getVisibleRestaurants() {
  const query = state.query;
  return state.restaurants
    .filter((restaurant) => {
      const matchesFilter = state.filter === "all" || String(restaurant.rating) === state.filter;
      const haystack = [
        restaurant.name,
        restaurant.category,
        restaurant.area,
        restaurant.memo,
        ...(restaurant.menus ?? []),
        ...(restaurant.menuItems ?? []).map((item) => item.price),
        ...deliveryLabels(restaurant.deliveryApps),
      ]
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    })
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, "ko"));
}

function renderList(restaurants) {
  els.restaurantList.innerHTML = "";

  if (restaurants.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "조건에 맞는 맛집이 없습니다";
    els.restaurantList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  restaurants.forEach((restaurant) => {
    const preview = [menuItemsSummary(restaurant.menuItems, 2), deliverySummary(restaurant.deliveryApps)]
      .filter(Boolean)
      .join(" · ");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `restaurant-item${restaurant.id === state.selectedId ? " is-selected" : ""}`;
    button.innerHTML = `
      <div class="item-head">
        <div>
          <h3>${escapeHtml(restaurant.name)}</h3>
          <p class="item-sub">${escapeHtml([restaurant.category, restaurant.area].filter(Boolean).join(" · "))}</p>
        </div>
        ${ratingBadge(restaurant.rating)}
      </div>
      ${preview ? `<p class="item-menu-preview">${escapeHtml(preview)}</p>` : ""}
    `;
    button.addEventListener("click", () => selectRestaurant(restaurant.id));
    fragment.append(button);
  });

  els.restaurantList.append(fragment);
}

function renderMeta(restaurants) {
  els.resultCount.textContent = `${restaurants.length}곳`;
}

function renderSelectedCard(visibleRestaurants) {
  const visibleIds = new Set(visibleRestaurants.map((restaurant) => restaurant.id));
  const restaurant = state.restaurants.find((item) => item.id === state.selectedId);
  if (!restaurant || !visibleIds.has(restaurant.id)) {
    els.selectedCard.classList.add("hidden");
    els.selectedCard.innerHTML = "";
    return;
  }

  const naverLink = `https://map.naver.com/p/search/${encodeURIComponent(restaurant.name)}`;
  const visitControl = renderVisitControl(restaurant);
  const photoGallery = renderRestaurantPhotoGallery(restaurant);
  const editableActions = state.isAdminMode
    ? `
          <button class="secondary-button" type="button" data-action="photos">사진</button>
          <button class="secondary-button" type="button" data-action="edit">수정</button>
          <button class="secondary-button danger-button" type="button" data-action="delete">삭제</button>
        `
    : "";
  els.selectedCard.innerHTML = `
    ${photoGallery}
    <div class="card-layout">
      <div class="card-main">
        <h2>${escapeHtml(restaurant.name)}</h2>
        <p class="card-sub">${escapeHtml([restaurant.category, restaurant.area].filter(Boolean).join(" · "))}</p>
        ${menuChips(restaurant.menuItems)}
        ${deliveryChips(restaurant.deliveryApps)}
        ${restaurant.memo ? `<p class="memo">${escapeHtml(restaurant.memo)}</p>` : ""}
        ${visitControl}
      </div>
      <div class="card-side">
        ${ratingBadge(restaurant.rating)}
        <div class="card-actions">
          <a class="link-button" href="${naverLink}" target="_blank" rel="noreferrer">네이버지도</a>
          ${editableActions}
        </div>
      </div>
    </div>
  `;

  els.selectedCard.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
    openSpotDialog(restaurant);
  });
  els.selectedCard.querySelector('[data-action="photos"]')?.addEventListener("click", () => {
    openPhotoDialog(restaurant);
  });
  els.selectedCard.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
    deleteRestaurant(restaurant.id);
  });
  els.selectedCard.querySelectorAll("[data-photo-index]").forEach((button) => {
    button.addEventListener("click", () => {
      openPhotoViewer(restaurant, Number(button.dataset.photoIndex));
    });
  });
  els.selectedCard.querySelector('[data-action="visit-login"]')?.addEventListener("click", () => {
    setAuthPanelOpen(true);
  });
  const visitAgreement = els.selectedCard.querySelector("[data-visit-agreement]");
  const visitButton = els.selectedCard.querySelector('[data-action="confirm-visit"]');
  visitAgreement?.addEventListener("change", () => {
    if (visitButton) visitButton.disabled = !visitAgreement.checked;
  });
  visitButton?.addEventListener("click", () => {
    confirmRestaurantVisit(restaurant, visitButton);
  });
  els.selectedCard.classList.remove("hidden");
}

function renderRestaurantPhotoGallery(restaurant) {
  const photos = normalizeRestaurantPhotos(restaurant.photos);
  if (!photos.length) return "";

  return `
    <div class="restaurant-photo-gallery" data-count="${photos.length}" aria-label="${escapeHtml(restaurant.name)} 사진">
      ${photos
        .map(
          (photo, index) => `
            <button class="restaurant-photo-button" type="button" data-photo-index="${index}" aria-label="사진 ${index + 1} 크게 보기">
              <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.altText || restaurant.name)}" loading="lazy" decoding="async" />
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function isPhotoDialogOpen() {
  return els.photoDialog?.classList.contains("is-open");
}

function photoDialogRestaurant() {
  return state.restaurants.find((restaurant) => restaurant.id === state.photoDialogRestaurantId) ?? null;
}

function openPhotoDialog(restaurant) {
  if (!state.isAdminMode || !restaurant) return;
  if (isSpotDialogOpen()) closeSpotDialog({ restorePanel: false });
  closeFloatingPanels();
  setAuthPanelOpen(false);
  state.photoDialogRestaurantId = restaurant.id;
  state.photoManagerBusy = false;
  state.photoManagerStatus = "";
  state.photoManagerError = false;
  els.photoUploadInput.value = "";
  renderPhotoManager();
  els.photoDialog.setAttribute("aria-hidden", "false");
  window.requestAnimationFrame(() => els.photoDialog.classList.add("is-open"));
}

function closePhotoDialog() {
  if (!els.photoDialog) return;
  els.photoDialog.classList.remove("is-open");
  els.photoDialog.setAttribute("aria-hidden", "true");
  state.photoDialogRestaurantId = null;
  state.photoManagerBusy = false;
  state.photoManagerStatus = "";
  state.photoManagerError = false;
  els.photoUploadInput.value = "";
}

function renderPhotoManager() {
  const restaurant = photoDialogRestaurant();
  if (!restaurant) return;

  const photos = normalizeRestaurantPhotos(restaurant.photos);
  els.photoDialogTitle.textContent = `${restaurant.name} 사진`;
  els.photoDialogCount.textContent = `${photos.length} / ${RESTAURANT_PHOTO_LIMIT}`;
  els.photoManagerStatus.textContent = state.photoManagerStatus;
  els.photoManagerStatus.classList.toggle("is-error", state.photoManagerError);
  const uploadDisabled = state.photoManagerBusy || photos.length >= RESTAURANT_PHOTO_LIMIT;
  els.photoUploadInput.disabled = uploadDisabled;
  els.photoUploadButton.classList.toggle("is-disabled", uploadDisabled);

  if (!photos.length) {
    els.photoManagerList.innerHTML = '<div class="photo-manager-empty">등록된 사진이 없습니다</div>';
    return;
  }

  els.photoManagerList.innerHTML = photos
    .map(
      (photo, index) => `
        <article class="photo-manager-item">
          <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.altText || restaurant.name)}" />
          <div class="photo-manager-actions">
            <button type="button" data-photo-action="previous" data-photo-id="${photo.id}" aria-label="사진 앞으로 이동" title="앞으로" ${index === 0 || state.photoManagerBusy ? "disabled" : ""}>‹</button>
            <button type="button" data-photo-action="next" data-photo-id="${photo.id}" aria-label="사진 뒤로 이동" title="뒤로" ${index === photos.length - 1 || state.photoManagerBusy ? "disabled" : ""}>›</button>
            <button class="photo-delete-button" type="button" data-photo-action="delete" data-photo-id="${photo.id}" ${state.photoManagerBusy ? "disabled" : ""}>삭제</button>
          </div>
        </article>
      `
    )
    .join("");
}

async function handlePhotoUpload(event) {
  const restaurant = photoDialogRestaurant();
  const selectedFiles = [...(event.target.files ?? [])];
  if (!restaurant || !state.isAdminMode || state.photoManagerBusy || !selectedFiles.length) return;

  const currentPhotos = normalizeRestaurantPhotos(restaurant.photos);
  const availableSlots = RESTAURANT_PHOTO_LIMIT - currentPhotos.length;
  const files = selectedFiles.slice(0, availableSlots);
  if (!files.length) {
    setPhotoManagerStatus("사진은 음식점마다 최대 8장까지 등록할 수 있습니다", true);
    return;
  }

  state.photoManagerBusy = true;
  state.photoManagerError = false;
  renderPhotoManager();

  const uploadedPhotos = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      setPhotoManagerStatus(`${index + 1} / ${files.length} 사진 처리 중`, false);
      const blob = await prepareRestaurantPhoto(files[index]);
      const photo = await state.store.addRestaurantPhoto(restaurant, blob, currentPhotos.length + uploadedPhotos.length);
      uploadedPhotos.push(photo);
    }

    restaurant.photos = normalizeRestaurantPhotos([...currentPhotos, ...uploadedPhotos]);
    const omittedCount = selectedFiles.length - files.length;
    setPhotoManagerStatus(omittedCount ? `사진을 추가했습니다 · ${omittedCount}장은 제한으로 제외됐습니다` : "사진을 추가했습니다", false);
  } catch (error) {
    console.warn("restaurant photo upload failed", error);
    if (uploadedPhotos.length) {
      restaurant.photos = normalizeRestaurantPhotos([...currentPhotos, ...uploadedPhotos]);
    }
    setPhotoManagerStatus(photoErrorMessage(error), true);
  } finally {
    state.photoManagerBusy = false;
    els.photoUploadInput.value = "";
    renderPhotoManager();
    render();
  }
}

async function handlePhotoManagerClick(event) {
  const button = event.target.closest("[data-photo-action]");
  const restaurant = photoDialogRestaurant();
  if (!button || button.disabled || !restaurant || !state.isAdminMode || state.photoManagerBusy) return;

  const photos = normalizeRestaurantPhotos(restaurant.photos);
  const photoIndex = photos.findIndex((photo) => photo.id === button.dataset.photoId);
  if (photoIndex < 0) return;
  const action = button.dataset.photoAction;

  if (action === "delete") {
    if (!window.confirm("이 사진을 삭제할까요?")) return;
    await deleteRestaurantPhoto(restaurant, photos[photoIndex]);
    return;
  }

  const targetIndex = action === "previous" ? photoIndex - 1 : photoIndex + 1;
  if (targetIndex < 0 || targetIndex >= photos.length) return;
  const reorderedPhotos = [...photos];
  [reorderedPhotos[photoIndex], reorderedPhotos[targetIndex]] = [reorderedPhotos[targetIndex], reorderedPhotos[photoIndex]];
  await saveRestaurantPhotoOrder(restaurant, reorderedPhotos);
}

async function deleteRestaurantPhoto(restaurant, photo) {
  state.photoManagerBusy = true;
  setPhotoManagerStatus("사진 삭제 중", false);
  renderPhotoManager();

  try {
    await state.store.removeRestaurantPhoto(photo);
    restaurant.photos = normalizeRestaurantPhotos(restaurant.photos.filter((item) => item.id !== photo.id));
    await state.store.updateRestaurantPhotoOrder(restaurant.photos);
    restaurant.photos = restaurant.photos.map((item, index) => ({ ...item, sortOrder: index }));
    setPhotoManagerStatus("사진을 삭제했습니다", false);
  } catch (error) {
    console.warn("restaurant photo delete failed", error);
    setPhotoManagerStatus(photoErrorMessage(error), true);
  } finally {
    state.photoManagerBusy = false;
    renderPhotoManager();
    render();
  }
}

async function saveRestaurantPhotoOrder(restaurant, photos) {
  state.photoManagerBusy = true;
  setPhotoManagerStatus("순서 변경 중", false);
  renderPhotoManager();

  try {
    const orderedPhotos = photos.map((photo, index) => ({ ...photo, sortOrder: index }));
    await state.store.updateRestaurantPhotoOrder(orderedPhotos);
    restaurant.photos = orderedPhotos;
    setPhotoManagerStatus("사진 순서를 변경했습니다", false);
  } catch (error) {
    console.warn("restaurant photo reorder failed", error);
    setPhotoManagerStatus(photoErrorMessage(error), true);
  } finally {
    state.photoManagerBusy = false;
    renderPhotoManager();
    render();
  }
}

function setPhotoManagerStatus(message, isError) {
  state.photoManagerStatus = message;
  state.photoManagerError = Boolean(isError);
  if (!els.photoManagerStatus) return;
  els.photoManagerStatus.textContent = message;
  els.photoManagerStatus.classList.toggle("is-error", Boolean(isError));
}

function photoErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("restaurant_photo_limit")) return "사진은 음식점마다 최대 8장까지 등록할 수 있습니다";
  if (message.includes("photo_file_too_large")) return "20MB 이하의 사진을 선택해주세요";
  if (message.includes("photo_type_invalid")) return "이미지 파일만 등록할 수 있습니다";
  if (message.includes("photo_decode_failed")) return "이 사진 형식은 현재 브라우저에서 처리할 수 없습니다";
  return "사진을 처리하지 못했습니다. 잠시 후 다시 시도해주세요";
}

async function prepareRestaurantPhoto(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) throw new Error("photo_type_invalid");
  if (file.size > PHOTO_MAX_SOURCE_BYTES) throw new Error("photo_file_too_large");

  const imageSource = await decodePhotoFile(file);
  const sourceWidth = Number(imageSource.width || imageSource.naturalWidth);
  const sourceHeight = Number(imageSource.height || imageSource.naturalHeight);
  if (!sourceWidth || !sourceHeight) {
    imageSource.close?.();
    throw new Error("photo_decode_failed");
  }

  const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    imageSource.close?.();
    throw new Error("photo_decode_failed");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(imageSource, 0, 0, width, height);
  imageSource.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY));
  if (!blob) throw new Error("photo_decode_failed");
  return blob;
}

async function decodePhotoFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari can decode some camera formats through an image element but not createImageBitmap.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("photo_decode_failed"));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function isPhotoViewerOpen() {
  return els.photoViewer?.classList.contains("is-open");
}

function openPhotoViewer(restaurant, index) {
  const photos = normalizeRestaurantPhotos(restaurant?.photos);
  if (!photos.length) return;
  state.photoViewerRestaurantId = restaurant.id;
  state.photoViewerIndex = Math.max(0, Math.min(photos.length - 1, index));
  renderPhotoViewer();
  els.photoViewer.setAttribute("aria-hidden", "false");
  els.photoViewer.classList.add("is-open");
}

function closePhotoViewer() {
  els.photoViewer.classList.remove("is-open");
  els.photoViewer.setAttribute("aria-hidden", "true");
  els.photoViewerImage.removeAttribute("src");
  state.photoViewerRestaurantId = null;
  state.photoViewerIndex = 0;
}

function movePhotoViewer(direction) {
  const restaurant = state.restaurants.find((item) => item.id === state.photoViewerRestaurantId);
  const photos = normalizeRestaurantPhotos(restaurant?.photos);
  if (!photos.length) return;
  state.photoViewerIndex = Math.max(0, Math.min(photos.length - 1, state.photoViewerIndex + direction));
  renderPhotoViewer();
}

function renderPhotoViewer() {
  const restaurant = state.restaurants.find((item) => item.id === state.photoViewerRestaurantId);
  const photos = normalizeRestaurantPhotos(restaurant?.photos);
  const photo = photos[state.photoViewerIndex];
  if (!restaurant || !photo) return;
  els.photoViewerImage.src = photo.url;
  els.photoViewerImage.alt = photo.altText || restaurant.name;
  els.photoViewerCaption.textContent = `${restaurant.name} · ${state.photoViewerIndex + 1} / ${photos.length}`;
  els.photoViewerPrevious.disabled = state.photoViewerIndex === 0;
  els.photoViewerNext.disabled = state.photoViewerIndex === photos.length - 1;
}

function renderVisitControl(restaurant) {
  if (!isMemberSignedIn()) {
    return `
      <div class="visit-verification">
        <button class="visit-login-button" type="button" data-action="visit-login">로그인 후 방문 인증</button>
      </div>
    `;
  }

  if (state.auth.visitedRestaurantIds.includes(restaurant.id)) {
    return `
      <div class="visit-verification is-confirmed">
        <span class="visit-confirmed-label">방문 확인됨</span>
      </div>
    `;
  }

  const rating = RATING_META[restaurant.rating];
  return `
    <div class="visit-verification">
      <div class="visit-action-row">
        <label class="visit-agreement">
          <input type="checkbox" data-visit-agreement />
          <span>${escapeHtml(`${rating.icon} ${rating.label} 평가에 동의`)}</span>
        </label>
        <button class="visit-confirm-button" type="button" data-action="confirm-visit" disabled>방문 인증</button>
      </div>
      <p class="visit-feedback" aria-live="polite"></p>
    </div>
  `;
}

async function confirmRestaurantVisit(restaurant, button) {
  if (!isMemberSignedIn() || typeof state.store?.confirmRestaurantVisit !== "function") {
    setAuthPanelOpen(true);
    return;
  }

  const container = button.closest(".visit-verification");
  const agreement = container?.querySelector("[data-visit-agreement]");
  const feedback = container?.querySelector(".visit-feedback");
  if (!agreement?.checked || !feedback) return;

  button.disabled = true;
  agreement.disabled = true;
  button.textContent = "위치 확인 중";
  feedback.textContent = "현재 위치를 확인하고 있습니다";
  feedback.classList.remove("is-error");

  try {
    const location = await getVisitVerificationLocation();
    if (location.error) throw new Error(location.error);

    button.textContent = "확인 중";
    feedback.textContent = "음식점과의 거리를 확인하고 있습니다";
    const result = await state.store.confirmRestaurantVisit(restaurant, location.coords);

    state.auth.visitedRestaurantIds = [...state.auth.visitedRestaurantIds, restaurant.id];
    state.auth.visitCount = result.visit_count;
    if (state.auth.profile) {
      state.auth.profile = { ...state.auth.profile, is_catalist: result.is_catalist };
    }
    if (!state.auth.isAdmin && result.is_catalist) {
      setAccountMode("catalist", { rerender: false });
    } else {
      updateAddButtonAccess();
    }
    renderAuthPanel();
    render();
  } catch (error) {
    console.warn("visit confirmation failed", error);
    feedback.textContent = visitErrorMessage(error);
    feedback.classList.add("is-error");
    button.textContent = "방문 인증";
    agreement.disabled = false;
    button.disabled = !agreement.checked;
  }
}

function getVisitVerificationLocation() {
  if (!navigator.geolocation) {
    return Promise.resolve({ error: "location_unsupported" });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          accuracy: Number(position.coords.accuracy),
        };
        if (!isValidCoordinate(coords) || !Number.isFinite(coords.accuracy)) {
          resolve({ error: "invalid_location" });
          return;
        }
        resolve({ coords });
      },
      (error) => {
        const errorCode = error.code === 1 ? "location_denied" : error.code === 3 ? "location_timeout" : "location_unavailable";
        resolve({ error: errorCode });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: VISIT_LOCATION_TIMEOUT_MS,
      }
    );
  });
}

function visitErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("location_denied")) return "위치 권한을 허용해야 방문을 인증할 수 있습니다";
  if (message.includes("location_timeout")) return "위치 확인 시간이 초과됐습니다. 다시 시도해주세요";
  if (message.includes("location_unavailable") || message.includes("location_unsupported")) return "현재 위치를 확인할 수 없습니다";
  if (message.includes("location_inaccurate")) return "위치 정확도가 낮습니다. 창가나 야외에서 다시 시도해주세요";
  if (message.includes("too_far")) return "음식점에서 200m 이내일 때 인증할 수 있습니다";
  if (message.includes("already_confirmed")) return "이미 방문 인증한 음식점입니다";
  if (message.includes("rating_changed")) return "등급이 변경됐습니다. 상세 정보를 다시 확인해주세요";
  if (message.includes("agreement_required")) return "현재 메달 평가에 동의해주세요";
  return "방문을 인증하지 못했습니다. 잠시 후 다시 시도해주세요";
}

function selectRestaurant(id, { closePanel = false } = {}) {
  if (isPhotoDialogOpen()) closePhotoDialog();
  if (isProposalReviewDialogOpen()) closeProposalReviewDialog();
  if (closePanel) {
    closeFloatingPanels();
  }

  state.selectedId = id;
  const restaurant = state.restaurants.find((item) => item.id === id);
  if (restaurant) {
    state.map?.panTo({ lat: restaurant.lat, lng: restaurant.lng });
  }
  render();
}

function openSpotDialog(restaurant = null, { mode = "restaurant" } = {}) {
  const isProposalMode = mode === "proposal";
  if (isProposalMode ? !isCatalist() : !state.isAdminMode) return;

  closeFloatingPanels();
  closeSelectedRestaurant();
  els.spotForm.reset();
  els.spotPhotoInput.value = "";
  updateSpotPhotoSelection();
  clearPlaceResults();
  clearPlaceValidation();
  state.placeSelection = null;
  state.spotDialogMode = isProposalMode ? "proposal" : "restaurant";
  document.getElementById("spotId").value = restaurant?.id ?? "";
  els.spotDialogTitle.textContent = isProposalMode ? "맛집 건의" : restaurant ? "맛집 수정" : "맛집 추가";
  els.spotSubmitButton.textContent = isProposalMode ? "건의하기" : "저장";
  els.spotPhotoButton.classList.toggle("hidden", isProposalMode || Boolean(restaurant));

  if (restaurant) {
    els.nameInput.value = restaurant.name;
    els.categoryInput.value = restaurant.category;
    els.areaInput.value = restaurant.area;
    renderMenuInputs(restaurant.menuItems, restaurant.menus);
    fillCoordinateInputs({ lat: restaurant.lat, lng: restaurant.lng });
    setStoredPlaceCandidate(restaurant);
    document.getElementById("memoInput").value = restaurant.memo;
    const ratingInput = els.spotForm.querySelector(`[name="rating"][value="${restaurant.rating}"]`);
    if (ratingInput) ratingInput.checked = true;
    els.spotForm.querySelectorAll('[name="deliveryApps"]').forEach((input) => {
      input.checked = restaurant.deliveryApps.includes(input.value);
    });
  } else {
    els.areaInput.value = "";
    renderMenuInputs([]);
    clearCoordinateInputs();
  }

  openAnimatedSpotDialog();
  els.nameInput.focus();
}

async function handleSpotSubmit(event) {
  event.preventDefault();
  const isProposalMode = state.spotDialogMode === "proposal";
  if (isProposalMode ? !isCatalist() : !state.isAdminMode) return;

  addMenuFromDraft({ refocus: false });
  const formData = new FormData(els.spotForm);
  const id = String(formData.get("id") || "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const existingRestaurant = isProposalMode ? null : state.restaurants.find((restaurant) => restaurant.id === id);
  const selectedPhotoFiles = !isProposalMode && !existingRestaurant ? [...(els.spotPhotoInput.files ?? [])] : [];

  if (!isCurrentPlaceSelectionValid()) {
    requireSelectedPlaceCandidate();
    return;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    renderPlaceMessage("선택한 장소 좌표를 확인하지 못했습니다");
    return;
  }

  const nextRestaurant = {
    id: id || createId(),
    name: String(formData.get("name") || "").trim(),
    category: String(formData.get("category") || "기타").trim(),
    rating: clampRating(Number(formData.get("rating"))),
    area: String(formData.get("area") || existingRestaurant?.area || "").trim(),
    lat,
    lng,
    menuItems: normalizeMenuItems(getMenuInputItems(), formData.getAll("menus")),
    deliveryApps: normalizeDeliveryApps(formData.getAll("deliveryApps")),
    memo: String(formData.get("memo") || "").trim(),
  };

  if (!nextRestaurant.name) {
    els.nameInput.focus();
    return;
  }

  const submitButton = els.spotForm.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    if (isProposalMode) {
      if (typeof state.store?.submitRestaurantProposal !== "function") {
        throw new Error("proposal_unavailable");
      }
      const proposal = await state.store.submitRestaurantProposal(nextRestaurant, state.placeSelection);
      state.auth.proposals = [
        {
          id: proposal.proposal_id,
          name: nextRestaurant.name,
          status: proposal.proposal_status,
          created_at: proposal.proposal_created_at,
        },
        ...state.auth.proposals,
      ];
      if (state.auth.isAdmin) {
        state.auth.adminProposals = [
          {
            id: proposal.proposal_id,
            status: proposal.proposal_status,
            created_at: proposal.proposal_created_at,
            name: nextRestaurant.name,
            category: nextRestaurant.category,
            suggested_rating: nextRestaurant.rating,
            area: nextRestaurant.area,
            lat: nextRestaurant.lat,
            lng: nextRestaurant.lng,
            menu_items: nextRestaurant.menuItems,
            delivery_apps: nextRestaurant.deliveryApps,
            memo: nextRestaurant.memo,
            source_link: state.placeSelection?.sourceLink || "",
          },
          ...state.auth.adminProposals,
        ];
      }
      closeSpotDialog({ restorePanel: true });
      setAuthPanelOpen(true);
      renderAuthPanel();
      return;
    }

    const preparedPhotos = [];
    for (const file of selectedPhotoFiles.slice(0, RESTAURANT_PHOTO_LIMIT)) {
      preparedPhotos.push(await prepareRestaurantPhoto(file));
    }

    const savedRestaurant = await saveRestaurant(nextRestaurant, { isNew: !existingRestaurant });
    savedRestaurant.photos = normalizeRestaurantPhotos(existingRestaurant?.photos);

    let photoUploadError = null;
    for (const blob of preparedPhotos) {
      try {
        const photo = await state.store.addRestaurantPhoto(savedRestaurant, blob, savedRestaurant.photos.length);
        savedRestaurant.photos.push(photo);
      } catch (error) {
        photoUploadError = error;
        break;
      }
    }
    savedRestaurant.photos = normalizeRestaurantPhotos(savedRestaurant.photos);
    const existingIndex = state.restaurants.findIndex((restaurant) => restaurant.id === savedRestaurant.id);
    if (existingIndex >= 0) {
      state.restaurants.splice(existingIndex, 1, savedRestaurant);
    } else {
      state.restaurants.unshift(savedRestaurant);
    }

    state.selectedId = savedRestaurant.id;
    closeSpotDialog({ restorePanel: false });
    render();
    state.map?.panTo({ lat: savedRestaurant.lat, lng: savedRestaurant.lng });
    if (photoUploadError) {
      console.warn("restaurant saved but photo upload failed", photoUploadError);
      window.alert("맛집은 저장했지만 일부 사진을 올리지 못했습니다. 상세창의 사진 버튼에서 다시 추가해주세요.");
    }
  } catch (error) {
    console.warn(isProposalMode ? "proposal submit failed" : "restaurant save failed", error);
    window.alert(isProposalMode ? proposalErrorMessage(error) : "맛집을 저장하지 못했습니다. Supabase 설정과 권한을 확인해주세요.");
  } finally {
    submitButton.disabled = false;
  }
}

function updateSpotPhotoSelection() {
  const count = Math.min(els.spotPhotoInput?.files?.length ?? 0, RESTAURANT_PHOTO_LIMIT);
  els.spotPhotoCount.textContent = count ? `사진 ${count}장` : "사진";
  els.spotPhotoButton.classList.toggle("has-selection", count > 0);
}

function isProposalReviewDialogOpen() {
  return els.proposalReviewDialog?.classList.contains("is-open");
}

async function openProposalReviewDialog() {
  if (!state.isAdminMode || typeof state.store?.listPendingRestaurantProposals !== "function") return;

  if (isSpotDialogOpen()) closeSpotDialog({ restorePanel: false });
  if (isPhotoDialogOpen()) closePhotoDialog();
  closeSelectedRestaurant();
  closeFloatingPanels();
  state.proposalReviewBusyId = null;
  state.proposalReviewStatus = "불러오는 중";
  state.proposalReviewError = false;
  renderProposalReviewDialog();
  els.proposalReviewDialog.setAttribute("aria-hidden", "false");
  window.requestAnimationFrame(() => els.proposalReviewDialog.classList.add("is-open"));

  try {
    state.auth.adminProposals = await state.store.listPendingRestaurantProposals();
    state.proposalReviewStatus = "";
    renderAuthPanel();
  } catch (error) {
    console.warn("proposal review list failed", error);
    state.proposalReviewStatus = "맛집 건의를 불러오지 못했습니다";
    state.proposalReviewError = true;
  }
  renderProposalReviewDialog();
}

function closeProposalReviewDialog({ restorePanel = true } = {}) {
  if (!els.proposalReviewDialog) return;
  els.proposalReviewDialog.classList.remove("is-open");
  els.proposalReviewDialog.setAttribute("aria-hidden", "true");
  state.proposalReviewBusyId = null;
  state.proposalReviewStatus = "";
  state.proposalReviewError = false;
  if (restorePanel && !state.selectedId) setRestaurantPanelOpen(true);
}

function renderProposalReviewDialog() {
  const proposals = state.auth.adminProposals;
  els.proposalReviewCount.textContent = `${proposals.length}건`;
  els.proposalReviewStatus.textContent = state.proposalReviewStatus;
  els.proposalReviewStatus.classList.toggle("is-error", state.proposalReviewError);

  if (!proposals.length) {
    els.proposalReviewList.innerHTML = '<div class="proposal-review-empty">검토할 맛집 건의가 없습니다</div>';
    return;
  }

  els.proposalReviewList.innerHTML = proposals
    .map((proposal) => {
      const rating = RATING_META[clampRating(proposal.suggested_rating)];
      const menuSummary = menuItemsSummary(normalizeMenuItems(proposal.menu_items), 3);
      const delivery = deliverySummary(proposal.delivery_apps);
      const summary = [menuSummary, delivery].filter(Boolean).join(" · ");
      const isBusy = state.proposalReviewBusyId === proposal.id;
      return `
        <article class="proposal-review-item">
          <div class="proposal-review-item-header">
            <div>
              <h3>${escapeHtml(proposal.name)}</h3>
              <p>${escapeHtml([proposal.category, proposal.area].filter(Boolean).join(" · "))}</p>
            </div>
            <span class="proposal-rating">${rating.icon} ${rating.label}</span>
          </div>
          ${summary ? `<p class="proposal-review-summary">${escapeHtml(summary)}</p>` : ""}
          ${proposal.memo ? `<p class="proposal-review-memo">${escapeHtml(proposal.memo)}</p>` : ""}
          <div class="proposal-review-actions">
            <a href="https://map.naver.com/p/search/${encodeURIComponent(proposal.name)}" target="_blank" rel="noopener noreferrer">네이버지도</a>
            <button type="button" data-review-decision="rejected" data-proposal-id="${proposal.id}" ${isBusy ? "disabled" : ""}>반려</button>
            <button class="approve-proposal-button" type="button" data-review-decision="approved" data-proposal-id="${proposal.id}" ${isBusy ? "disabled" : ""}>승인</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function handleProposalReviewClick(event) {
  const button = event.target.closest("[data-review-decision]");
  if (!button || button.disabled || !state.isAdminMode || state.proposalReviewBusyId) return;

  const proposal = state.auth.adminProposals.find((item) => item.id === button.dataset.proposalId);
  const decision = button.dataset.reviewDecision;
  if (!proposal || !["approved", "rejected"].includes(decision)) return;

  const verb = decision === "approved" ? "승인" : "반려";
  if (!window.confirm(`${proposal.name} 건의를 ${verb}할까요?`)) return;

  state.proposalReviewBusyId = proposal.id;
  state.proposalReviewStatus = `${verb} 처리 중`;
  state.proposalReviewError = false;
  renderProposalReviewDialog();

  try {
    await state.store.reviewRestaurantProposal(proposal.id, decision);
    state.auth.adminProposals = state.auth.adminProposals.filter((item) => item.id !== proposal.id);
    state.auth.proposals = state.auth.proposals.map((item) =>
      item.id === proposal.id ? { ...item, status: decision } : item
    );
    if (decision === "approved") {
      state.restaurants = await state.store.list();
    }
    state.proposalReviewStatus = `${proposal.name} 건의를 ${verb}했습니다`;
    renderAuthPanel();
    render();
  } catch (error) {
    console.warn("proposal review failed", error);
    state.proposalReviewStatus = proposalReviewErrorMessage(error);
    state.proposalReviewError = true;
  } finally {
    state.proposalReviewBusyId = null;
    renderProposalReviewDialog();
  }
}

function proposalReviewErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("proposal_already_reviewed")) return "이미 처리된 맛집 건의입니다";
  if (message.includes("restaurant_already_exists")) return "같은 위치의 음식점이 이미 등록되어 있습니다";
  if (message.includes("proposal_not_approvable")) return "등록 기준에 맞지 않아 승인할 수 없습니다";
  if (message.includes("admin_required")) return "관리자만 맛집 건의를 검토할 수 있습니다";
  return "맛집 건의를 처리하지 못했습니다";
}

function proposalErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("catalist_required")) return "까탈리스트만 맛집을 건의할 수 있습니다.";
  if (message.includes("restaurant_already_exists")) return "이미 까탈로그에 등록된 음식점입니다.";
  if (message.includes("proposal_already_pending")) return "이미 검토 중인 맛집 건의가 있습니다.";
  return "맛집 건의를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

async function deleteRestaurant(id) {
  if (!state.isAdminMode) return;

  const restaurant = state.restaurants.find((item) => item.id === id);
  if (!restaurant) return;
  if (!window.confirm(`${restaurant.name}을 삭제할까요?`)) return;

  try {
    if (state.photoDialogRestaurantId === id) closePhotoDialog();
    await removeRestaurant(id);
    state.restaurants = state.restaurants.filter((item) => item.id !== id);
    if (state.selectedId === id) {
      state.selectedId = null;
    }
    setRestaurantPanelOpen(true);
    render();
  } catch (error) {
    console.warn("restaurant delete failed", error);
    window.alert("맛집을 삭제하지 못했습니다. Supabase 권한을 확인해주세요.");
  }
}

function fillCoordinateInputs(coord) {
  const lat = Number(coord.lat);
  const lng = Number(coord.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  els.latInput.value = lat.toFixed(6);
  els.lngInput.value = lng.toFixed(6);
}

function clearCoordinateInputs() {
  els.latInput.value = "";
  els.lngInput.value = "";
}

function ratingBadge(rating) {
  const meta = RATING_META[rating];
  return `
    <span class="rating-badge" data-rating="${rating}" aria-label="${meta.label}">
      <span aria-hidden="true">${meta.icon}</span>
      <span>${meta.label}</span>
    </span>
  `;
}

function menuChips(menuItems) {
  if (!menuItems.length) return "";
  return `<div class="menu-row">${menuItems.map((item) => `<span class="menu-chip">${escapeHtml(menuItemLabel(item))}</span>`).join("")}</div>`;
}

function menuItemsSummary(menuItems, limit = 2) {
  return menuItems.slice(0, limit).map(menuItemLabel).join(" · ");
}

function menuItemLabel(item) {
  return [item.name, item.price].filter(Boolean).join(" ");
}

function deliveryChips(deliveryApps) {
  const labels = deliveryLabels(deliveryApps);
  if (!labels.length) return "";
  return `<div class="delivery-row">${labels.map((label) => `<span class="delivery-chip">${escapeHtml(label)}</span>`).join("")}</div>`;
}

function deliverySummary(deliveryApps) {
  const labels = deliveryShortLabels(deliveryApps);
  return labels.length ? `배달 ${labels.join(" · ")}` : "";
}

function deliveryLabels(deliveryApps) {
  return normalizeDeliveryApps(deliveryApps).map((id) => DELIVERY_APPS.find((app) => app.id === id)?.label).filter(Boolean);
}

function deliveryShortLabels(deliveryApps) {
  return normalizeDeliveryApps(deliveryApps).map((id) => DELIVERY_APPS.find((app) => app.id === id)?.shortLabel).filter(Boolean);
}

function pinSymbol(rating) {
  return RATING_META[rating].icon;
}

function createPinElement(restaurant, selectedId, onSelect) {
  const { rating } = restaurant;
  const meta = RATING_META[rating];
  const button = document.createElement("button");
  button.type = "button";
  button.className = `pin-marker${restaurant.id === selectedId ? " is-selected" : ""}`;
  button.dataset.rating = String(rating);
  button.setAttribute("aria-label", `${restaurant.name} ${meta.label}`);
  button.innerHTML = `
    <span class="pin-head">
      <span class="pin-level">${pinSymbol(rating)}</span>
    </span>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(restaurant.id);
  });
  return button;
}

function pinHtml(restaurant, selectedId) {
  const selectedClass = restaurant.id === selectedId ? " is-selected" : "";
  const { rating } = restaurant;
  const meta = RATING_META[rating];
  return `
    <button class="pin-marker${selectedClass}" data-rating="${rating}" aria-label="${escapeHtml(restaurant.name)} ${meta.label}">
      <span class="pin-head">
        <span class="pin-level">${pinSymbol(rating)}</span>
      </span>
    </button>
  `;
}

function setProviderBadge() {
  // Map status is intentionally not rendered in the UI.
}

async function initializeDataStore() {
  const localStore = new LocalRestaurantStore();

  if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
    state.store = localStore;
    state.restaurants = localStore.list();
    state.auth.status = "unavailable";
    state.auth.error = "Supabase 설정이 필요합니다";
    renderAuthPanel();
    return;
  }

  try {
    const supabaseStore = new SupabaseRestaurantStore(runtimeConfig);
    await supabaseStore.init(() => syncAuthState(supabaseStore));
    state.store = supabaseStore;
    await syncAuthState(supabaseStore);
    const remoteRestaurants = await supabaseStore.list();
    state.restaurants =
      remoteRestaurants.length === 0 && hasLocalRestaurantData()
        ? await migrateLocalRestaurantsToSupabase(localStore, supabaseStore)
        : remoteRestaurants;
  } catch (error) {
    console.warn("supabase init failed; falling back to local storage", error);
    state.store = localStore;
    state.restaurants = localStore.list();
    state.auth.status = "unavailable";
    state.auth.error = "Supabase 연결을 확인해주세요";
    renderAuthPanel();
  }
}

function saveRestaurant(restaurant, options) {
  return state.store.save(restaurant, options);
}

function removeRestaurant(id) {
  return state.store.remove(id);
}

async function migrateLocalRestaurantsToSupabase(localStore, supabaseStore) {
  const migratedRestaurants = [];
  for (const restaurant of localStore.list()) {
    migratedRestaurants.push(await supabaseStore.save(restaurant, { isNew: true }));
  }
  return migratedRestaurants;
}

class LocalRestaurantStore {
  list() {
    return loadLocalRestaurants();
  }

  async save(restaurant) {
    const nextRestaurant = normalizeRestaurant(restaurant);
    const restaurants = loadLocalRestaurants();
    const existingIndex = restaurants.findIndex((item) => item.id === nextRestaurant.id);
    if (existingIndex >= 0) {
      restaurants.splice(existingIndex, 1, nextRestaurant);
    } else {
      restaurants.unshift(nextRestaurant);
    }
    saveLocalRestaurants(restaurants);
    return nextRestaurant;
  }

  async remove(id) {
    saveLocalRestaurants(loadLocalRestaurants().filter((restaurant) => restaurant.id !== id));
  }
}

class SupabaseRestaurantStore {
  constructor(config) {
    this.url = config.supabaseUrl;
    this.anonKey = config.supabaseAnonKey;
    this.client = null;
    this.userId = null;
    this.session = null;
    this.authSubscription = null;
  }

  async init(onAuthChange) {
    const { createClient } = await import(SUPABASE_SDK_URL);
    this.client = createClient(this.url, this.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: "ccatalog.supabase.auth",
      },
    });

    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw sessionError;

    this.setSession(sessionData.session);

    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      this.setSession(session);
      window.setTimeout(() => onAuthChange?.(session), 0);
    });
    this.authSubscription = data.subscription;
  }

  setSession(session) {
    this.session = session ?? null;
    this.userId = session?.user?.id ?? null;
  }

  async getMemberContext() {
    const user = this.session?.user ?? null;
    if (!user || user.is_anonymous) {
      return { user: null, profile: null, isAdmin: false, visitedRestaurantIds: [], visitCount: 0, proposals: [], adminProposals: [] };
    }

    const [profileResult, adminResult, visitsResult, proposalsResult] = await Promise.all([
      this.client.from("profiles").select("id,nickname,avatar_url,is_catalist,catalist_qualified_at").eq("id", user.id).maybeSingle(),
      this.client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(),
      this.client.from("restaurant_visits").select("restaurant_id").order("agreed_at", { ascending: true }),
      this.client
        .from("restaurant_proposals")
        .select("id,name,status,created_at")
        .eq("proposer_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (profileResult.error) throw profileResult.error;
    if (adminResult.error) throw adminResult.error;
    if (visitsResult.error) throw visitsResult.error;
    if (proposalsResult.error) throw proposalsResult.error;

    const visitedRestaurantIds = (visitsResult.data ?? []).map((visit) => visit.restaurant_id);
    let adminProposals = [];
    if (adminResult.data) {
      adminProposals = await this.listPendingRestaurantProposals();
    }

    return {
      user,
      profile: profileResult.data,
      isAdmin: Boolean(adminResult.data),
      visitedRestaurantIds,
      visitCount: visitedRestaurantIds.length,
      proposals: proposalsResult.data ?? [],
      adminProposals,
    };
  }

  async signInWithKakao() {
    const redirectTo = window.location.href.split(/[?#]/)[0];
    const { error } = await this.client.auth.signInWithOAuth({
      provider: "custom:kakao-test",
      options: {
        redirectTo,
      },
    });
    if (error) throw error;
  }

  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  async confirmRestaurantVisit(restaurant, coords) {
    const { data, error } = await this.client.rpc("confirm_restaurant_visit", {
      p_restaurant_id: restaurant.id,
      p_rating: restaurant.rating,
      p_agrees: true,
      p_lat: coords.lat,
      p_lng: coords.lng,
      p_accuracy: coords.accuracy,
    });
    if (error) throw error;
    if (!data?.[0]) throw new Error("visit_result_missing");
    return data[0];
  }

  async submitRestaurantProposal(restaurant, placeSelection) {
    const { data, error } = await this.client.rpc("submit_restaurant_proposal", {
      p_name: restaurant.name,
      p_category: restaurant.category,
      p_suggested_rating: restaurant.rating,
      p_area: restaurant.area,
      p_lat: restaurant.lat,
      p_lng: restaurant.lng,
      p_menu_items: restaurant.menuItems,
      p_delivery_apps: restaurant.deliveryApps,
      p_memo: restaurant.memo,
      p_source_link: placeSelection?.sourceLink || "",
    });
    if (error) throw error;
    if (!data?.[0]) throw new Error("proposal_result_missing");
    return data[0];
  }

  async listPendingRestaurantProposals() {
    const { data, error } = await this.client
      .from("restaurant_proposals")
      .select("id,status,name,category,suggested_rating,area,lat,lng,menu_items,delivery_apps,memo,source_link,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async reviewRestaurantProposal(proposalId, decision) {
    const { data, error } = await this.client.rpc("review_restaurant_proposal", {
      p_proposal_id: proposalId,
      p_decision: decision,
    });
    if (error) throw error;
    if (!data?.[0]) throw new Error("proposal_review_result_missing");
    return data[0];
  }

  async list() {
    const [restaurantResult, photoResult] = await Promise.all([
      this.client
        .from(SUPABASE_TABLE)
        .select(RESTAURANT_SELECT_COLUMNS)
        .order("rating", { ascending: false })
        .order("name", { ascending: true }),
      this.client
        .from("restaurant_photos")
        .select("id,restaurant_id,storage_path,alt_text,sort_order,created_at")
        .order("restaurant_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (restaurantResult.error) throw restaurantResult.error;
    if (photoResult.error) throw photoResult.error;

    const photosByRestaurant = new Map();
    (photoResult.data ?? []).forEach((row) => {
      const photos = photosByRestaurant.get(row.restaurant_id) ?? [];
      photos.push(photoRowToPhoto(row, this.restaurantPhotoUrl(row.storage_path)));
      photosByRestaurant.set(row.restaurant_id, photos);
    });

    return (restaurantResult.data ?? [])
      .map((row) => rowToRestaurant(row, photosByRestaurant.get(row.id) ?? []))
      .filter(Boolean);
  }

  async save(restaurant, { isNew } = {}) {
    const payload = restaurantToRow(restaurant, { includeId: isNew });
    let query;

    if (isNew) {
      query = this.client.from(SUPABASE_TABLE).insert(payload);
    } else {
      query = this.client.from(SUPABASE_TABLE).update(payload).eq("id", restaurant.id);
    }

    const { data, error } = await query.select(RESTAURANT_SELECT_COLUMNS).single();
    if (error) throw error;
    return rowToRestaurant(data);
  }

  async remove(id) {
    const { data: photos, error: photoQueryError } = await this.client
      .from("restaurant_photos")
      .select("storage_path")
      .eq("restaurant_id", id);
    if (photoQueryError) throw photoQueryError;

    const paths = (photos ?? []).map((photo) => photo.storage_path);
    if (paths.length) {
      const { error: storageError } = await this.client.storage.from(RESTAURANT_PHOTO_BUCKET).remove(paths);
      if (storageError) throw storageError;
    }

    const { error } = await this.client.from(SUPABASE_TABLE).delete().eq("id", id);
    if (error) throw error;
  }

  restaurantPhotoUrl(storagePath) {
    return this.client.storage.from(RESTAURANT_PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  }

  async addRestaurantPhoto(restaurant, blob, sortOrder) {
    if (!this.userId) throw new Error("not_authenticated");
    const storagePath = `${restaurant.id}/${createId()}.jpg`;
    const { error: uploadError } = await this.client.storage.from(RESTAURANT_PHOTO_BUCKET).upload(storagePath, blob, {
      cacheControl: "31536000",
      contentType: "image/jpeg",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data, error } = await this.client
      .from("restaurant_photos")
      .insert({
        restaurant_id: restaurant.id,
        storage_path: storagePath,
        alt_text: restaurant.name,
        sort_order: sortOrder,
        created_by: this.userId,
      })
      .select("id,restaurant_id,storage_path,alt_text,sort_order,created_at")
      .single();

    if (error) {
      await this.client.storage.from(RESTAURANT_PHOTO_BUCKET).remove([storagePath]);
      throw error;
    }

    return photoRowToPhoto(data, this.restaurantPhotoUrl(storagePath));
  }

  async removeRestaurantPhoto(photo) {
    const { error: storageError } = await this.client.storage.from(RESTAURANT_PHOTO_BUCKET).remove([photo.storagePath]);
    if (storageError) throw storageError;

    const { error: rowError } = await this.client.from("restaurant_photos").delete().eq("id", photo.id);
    if (rowError) throw rowError;
  }

  async updateRestaurantPhotoOrder(photos) {
    const results = await Promise.all(
      photos.map((photo, index) => this.client.from("restaurant_photos").update({ sort_order: index }).eq("id", photo.id))
    );
    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) throw failedResult.error;
  }
}

const RESTAURANT_SELECT_COLUMNS = [
  "id",
  "name",
  "category",
  "rating",
  "area",
  "lat",
  "lng",
  "menus",
  "menu_items",
  "delivery_apps",
  "memo",
  "created_at",
  "updated_at",
].join(",");

function rowToRestaurant(row, photos = []) {
  return normalizeRestaurant({
    id: row.id,
    name: row.name,
    category: row.category,
    rating: row.rating,
    area: row.area,
    lat: row.lat,
    lng: row.lng,
    menus: row.menus,
    menuItems: row.menu_items,
    deliveryApps: row.delivery_apps,
    memo: row.memo,
    photos,
  });
}

function photoRowToPhoto(row, url) {
  return normalizeRestaurantPhoto({
    id: row.id,
    restaurantId: row.restaurant_id,
    storagePath: row.storage_path,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    url,
  });
}

function restaurantToRow(restaurant, { includeId = true } = {}) {
  const menuItems = normalizeMenuItems(restaurant.menuItems, restaurant.menus);
  const row = {
    name: restaurant.name,
    category: restaurant.category,
    rating: restaurant.rating,
    area: restaurant.area,
    lat: restaurant.lat,
    lng: restaurant.lng,
    menus: menuItems.map((item) => item.name),
    menu_items: menuItems,
    delivery_apps: normalizeDeliveryApps(restaurant.deliveryApps),
    memo: restaurant.memo,
  };

  if (includeId && isUuid(restaurant.id)) {
    row.id = restaurant.id;
  }

  return row;
}

function hasLocalRestaurantData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function loadLocalRestaurants() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(seedRestaurants).map(normalizeRestaurant).filter(Boolean);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return structuredClone(seedRestaurants).map(normalizeRestaurant).filter(Boolean);
    return parsed.map(normalizeRestaurant).filter(Boolean);
  } catch {
    return structuredClone(seedRestaurants).map(normalizeRestaurant).filter(Boolean);
  }
}

function saveLocalRestaurants(restaurants) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants));
}

function normalizeRestaurant(item) {
  if (!item || typeof item !== "object") return null;
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  const rating = Number(item.rating);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isSupportedRating(rating)) return null;
  const menuItems = normalizeMenuItems(item.menuItems || item.menu_items, item.menus);
  return {
    id: String(item.id || createId()),
    name: String(item.name || "이름 없음"),
    category: String(item.category || "기타"),
    rating,
    area: String(item.area || ""),
    lat,
    lng,
    menus: menuItems.map((menuItem) => menuItem.name),
    menuItems,
    deliveryApps: normalizeDeliveryApps(item.deliveryApps),
    memo: String(item.memo || ""),
    photos: normalizeRestaurantPhotos(item.photos),
  };
}

function normalizeRestaurantPhotos(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeRestaurantPhoto)
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

function normalizeRestaurantPhoto(photo) {
  if (!photo || typeof photo !== "object") return null;
  const id = String(photo.id || "");
  const url = String(photo.url || "");
  const storagePath = String(photo.storagePath || photo.storage_path || "");
  if (!id || !url || !storagePath) return null;
  return {
    id,
    restaurantId: String(photo.restaurantId || photo.restaurant_id || ""),
    storagePath,
    altText: String(photo.altText || photo.alt_text || ""),
    sortOrder: Number.isInteger(Number(photo.sortOrder ?? photo.sort_order)) ? Number(photo.sortOrder ?? photo.sort_order) : 0,
    createdAt: String(photo.createdAt || photo.created_at || ""),
    url,
  };
}

function normalizeDeliveryApps(value) {
  if (!Array.isArray(value)) return [];
  const validIds = new Set(DELIVERY_APPS.map((app) => app.id));
  return [...new Set(value.map(String).filter((id) => validIds.has(id)))];
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `spot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

function clampRating(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(3, Math.round(value)));
}

function isSupportedRating(value) {
  return Number.isInteger(value) && RATING_VALUES.has(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

function stripHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value);
  return (template.content.textContent || "").trim();
}

function loadScript(src, checkReady, timeoutMs = 7000, callbackName = "") {
  return new Promise((resolve, reject) => {
    if (checkReady()) {
      resolve();
      return;
    }

    let settled = false;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      settle(new Error("지도 API 로딩 시간이 초과되었습니다"));
    }, timeoutMs);

    function settle(error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      script.onerror = null;
      script.onload = null;
      if (callbackName) {
        try {
          delete window[callbackName];
        } catch {
          window[callbackName] = undefined;
        }
      }
      if (error) reject(error);
      else resolve();
    }

    if (callbackName) {
      window[callbackName] = () => {
        waitForReady(checkReady, 2500).then(() => settle(), settle);
      };
    }

    script.src = src;
    script.async = true;
    script.onerror = () => settle(new Error("지도 API 스크립트를 불러오지 못했습니다"));
    script.onload = () => {
      if (!callbackName) {
        waitForReady(checkReady, 2500).then(() => settle(), settle);
      }
    };
    document.head.append(script);
  });
}

function waitForReady(checkReady, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function tick() {
      if (checkReady()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("지도 API가 준비되지 않았습니다"));
        return;
      }
      window.setTimeout(tick, 50);
    }

    tick();
  });
}

class MockMapAdapter {
  constructor(mapHost, mockMap, pinsLayer) {
    this.type = "mock";
    this.label = "샘플 지도";
    this.mapHost = mapHost;
    this.mockMap = mockMap;
    this.pinsLayer = pinsLayer;
    this.center = DEFAULT_CENTER;
    this.clickHandler = null;
    this.onMapClick = this.onMapClick.bind(this);
  }

  async load() {
    this.mapHost.classList.add("hidden");
    this.mockMap.classList.remove("hidden");
    this.mockMap.setAttribute("aria-hidden", "false");
    this.mockMap.addEventListener("click", this.onMapClick);
  }

  render(restaurants, selectedId, onSelect) {
    this.pinsLayer.innerHTML = "";
    const fragment = document.createDocumentFragment();
    restaurants.forEach((restaurant) => {
      const pin = createPinElement(restaurant, selectedId, onSelect);
      const position = this.coordToPoint({ lat: restaurant.lat, lng: restaurant.lng });
      pin.style.left = `${position.x}%`;
      pin.style.top = `${position.y}%`;
      fragment.append(pin);
    });
    this.pinsLayer.append(fragment);
  }

  setClickHandler(handler) {
    this.clickHandler = handler;
  }

  getCenter() {
    return this.center;
  }

  panTo(coord) {
    this.center = coord;
  }

  fitToCoordinates(coords) {
    const [firstCoord] = coords.filter(isValidCoordinate);
    if (firstCoord) {
      this.center = firstCoord;
    }
  }

  destroy() {
    this.mockMap.removeEventListener("click", this.onMapClick);
    this.pinsLayer.innerHTML = "";
  }

  onMapClick(event) {
    if (event.target.closest(".pin-marker")) return;
    const rect = this.mockMap.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const coord = this.pointToCoord({ x, y });
    this.center = coord;
    this.clickHandler?.(coord);
  }

  coordToPoint(coord) {
    const x = ((coord.lng - MOCK_BOUNDS.lngMin) / (MOCK_BOUNDS.lngMax - MOCK_BOUNDS.lngMin)) * 100;
    const y = 100 - ((coord.lat - MOCK_BOUNDS.latMin) / (MOCK_BOUNDS.latMax - MOCK_BOUNDS.latMin)) * 100;
    return {
      x: Math.max(4, Math.min(96, x)),
      y: Math.max(8, Math.min(94, y)),
    };
  }

  pointToCoord(point) {
    const lng = MOCK_BOUNDS.lngMin + (point.x / 100) * (MOCK_BOUNDS.lngMax - MOCK_BOUNDS.lngMin);
    const lat = MOCK_BOUNDS.latMax - (point.y / 100) * (MOCK_BOUNDS.latMax - MOCK_BOUNDS.latMin);
    return { lat, lng };
  }
}

class NaverMapAdapter {
  constructor(mapHost, mockMap, key) {
    this.type = "naver";
    this.label = "네이버지도";
    this.mapHost = mapHost;
    this.mockMap = mockMap;
    this.key = key;
    this.map = null;
    this.markers = [];
    this.clickHandler = null;
    this.clickListener = null;
  }

  async load() {
    await this.loadNaverScript();

    this.mapHost.classList.remove("hidden");
    this.mockMap.classList.add("hidden");
    this.mockMap.setAttribute("aria-hidden", "true");
    this.map = new window.naver.maps.Map(this.mapHost, {
      center: new window.naver.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      zoom: INITIAL_MAP_ZOOM,
      scaleControl: false,
      mapDataControl: false,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.TOP_RIGHT,
      },
    });

    this.clickListener = window.naver.maps.Event.addListener(this.map, "click", (event) => {
      this.clickHandler?.(normaliseNaverCoord(event.coord));
    });
  }

  async loadNaverScript() {
    const previousAuthFailure = window.navermap_authFailure;
    const callbackName = `ccatalogNaverReady${Date.now()}`;
    const src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(this.key)}&submodules=geocoder&callback=${callbackName}`;
    try {
      await Promise.race([
        loadScript(src, () => Boolean(window.naver?.maps?.Map && window.naver.maps.LatLng), 8000, callbackName),
        new Promise((_, reject) => {
          window.navermap_authFailure = () => {
            reject(new Error("네이버지도 API 인증에 실패했습니다"));
          };
        }),
      ]);
    } finally {
      window.navermap_authFailure = previousAuthFailure;
    }
  }

  render(restaurants, selectedId, onSelect) {
    this.markers.forEach((marker) => marker.setMap(null));
    this.markers = restaurants.map((restaurant) => {
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(restaurant.lat, restaurant.lng),
        map: this.map,
        title: restaurant.name,
        icon: {
          content: pinHtml(restaurant, selectedId),
          anchor: new window.naver.maps.Point(22, 22),
        },
      });
      window.naver.maps.Event.addListener(marker, "click", () => onSelect(restaurant.id));
      return marker;
    });
  }

  setClickHandler(handler) {
    this.clickHandler = handler;
  }

  getCenter() {
    return normaliseNaverCoord(this.map.getCenter());
  }

  panTo(coord) {
    this.map.panTo(new window.naver.maps.LatLng(coord.lat, coord.lng));
  }

  fitToCoordinates(coords) {
    const points = coords
      .filter(isValidCoordinate)
      .map((coord) => new window.naver.maps.LatLng(coord.lat, coord.lng));
    if (points.length < 2) {
      if (points[0]) {
        this.map.panTo(points[0]);
      }
      return;
    }

    this.map.fitBounds(points, INITIAL_REVEAL_BOUNDS_OPTIONS);
  }

  destroy() {
    this.markers.forEach((marker) => marker.setMap(null));
    this.markers = [];
    if (this.clickListener) {
      window.naver?.maps?.Event?.removeListener(this.clickListener);
    }
    this.map = null;
  }
}

function normaliseNaverCoord(coord) {
  if (!coord) return DEFAULT_CENTER;
  const lat = typeof coord.lat === "function" ? coord.lat() : coord.y ?? coord._lat;
  const lng = typeof coord.lng === "function" ? coord.lng() : coord.x ?? coord._lng;
  return { lat: Number(lat), lng: Number(lng) };
}
