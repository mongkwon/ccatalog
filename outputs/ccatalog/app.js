const STORAGE_KEY = "ccatalog.restaurants.v1";
const SUPABASE_SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SUPABASE_TABLE = "restaurants";
const runtimeConfig = {
  naverMapKey: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
};
const DEFAULT_CENTER = { lat: 37.566535, lng: 126.977969 };
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
  restaurants: structuredClone(seedRestaurants),
  selectedId: null,
  query: "",
  filter: "all",
  map: null,
  lastMapCoord: DEFAULT_CENTER,
  placeSelection: null,
  store: null,
};

const els = {};
const dockDragState = {
  pointerId: null,
  startX: 0,
  startY: 0,
  isDragging: false,
  suppressClick: false,
};
let spotDialogOpenFrame = null;
let dockIndicatorBloomTimer = null;

document.addEventListener("DOMContentLoaded", init);

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
  els.ratingSummary = document.getElementById("ratingSummary");
  els.selectedCard = document.getElementById("selectedCard");
  els.dockCluster = document.querySelector(".dock-cluster");
  els.bottomDock = document.querySelector(".bottom-dock");
  els.dockIndicator = document.querySelector(".dock-indicator");
  els.filterModeButton = document.getElementById("filterModeButton");
  els.addButton = document.getElementById("addButton");
  els.searchToggle = document.getElementById("searchToggle");
  els.spotDialog = document.getElementById("spotDialog");
  els.spotForm = document.getElementById("spotForm");
  els.spotDialogTitle = document.getElementById("spotDialogTitle");
  els.nameInput = document.getElementById("nameInput");
  els.categoryInput = document.getElementById("categoryInput");
  els.areaInput = document.getElementById("areaInput");
  els.latInput = document.getElementById("latInput");
  els.lngInput = document.getElementById("lngInput");
  els.placeSearchButton = document.getElementById("placeSearchButton");
  els.placeResultList = document.getElementById("placeResultList");
  els.menuDraftInput = document.getElementById("menuDraftInput");
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

  els.addButton.addEventListener("click", () => {
    if (isSpotDialogOpen()) {
      closeSpotDialog();
      return;
    }

    openSpotDialog();
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
    if (event.key !== "Escape") return;

    if (isSpotDialogOpen()) {
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

  els.spotForm.addEventListener("submit", handleSpotSubmit);
}

function setRestaurantPanelOpen(isOpen) {
  els.restaurantPanel.classList.toggle("is-open", isOpen);
  els.restaurantPanel.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("is-list-open", isOpen);
}

function setSearchPanelOpen(isOpen) {
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
    stopDockIndicatorBloom();
  }
  updateDockIndicator();
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
    animateDockIndicator();
    return;
  }

  state.filter = nextFilter;
  els.filterButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === nextFilter);
  });
  render();
  animateDockIndicator();
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

function animateDockIndicator() {
  if (isSearchPanelOpen() || dockDragState.isDragging) return;
  stopDockIndicatorBloom();
  // Force a style flush so repeated taps replay the bloom animation.
  void els.bottomDock.offsetWidth;
  els.bottomDock.classList.add("is-indicator-bloom");
  dockIndicatorBloomTimer = window.setTimeout(stopDockIndicatorBloom, 760);
}

function stopDockIndicatorBloom() {
  if (dockIndicatorBloomTimer) {
    window.clearTimeout(dockIndicatorBloomTimer);
    dockIndicatorBloomTimer = null;
  }
  els.bottomDock?.classList.remove("is-indicator-bloom");
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
  dockDragState.pointerId = event.pointerId;
  dockDragState.startX = event.clientX;
  dockDragState.startY = event.clientY;
  dockDragState.isDragging = false;
  els.bottomDock.setPointerCapture?.(event.pointerId);
  animateDockIndicator();
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
  finishDockDrag(event);

  if (targetIndex < 0) return;
  event.preventDefault();
  dockDragState.suppressClick = true;
  window.setTimeout(() => {
    dockDragState.suppressClick = false;
  }, 120);

  const targetButton = getDockButtons()[targetIndex];
  if (!targetButton?.dataset.filter) return;
  setDockIndicatorToIndex(targetIndex);
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
  els.bottomDock.classList.remove("is-dragging");
}

function moveDockIndicatorToPointer(clientX) {
  const buttons = getDockButtons();
  const nearestIndex = getNearestDockIndex(clientX);
  if (nearestIndex < 0) return;

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
  const menu = els.menuDraftInput.value.trim();
  if (!menu) {
    if (refocus) {
      els.menuDraftInput.focus();
    }
    return;
  }

  const currentMenus = getMenuInputValues();
  if (currentMenus.length >= 6 || currentMenus.includes(menu)) {
    els.menuDraftInput.value = "";
    if (refocus) {
      els.menuDraftInput.focus();
    }
    return;
  }

  appendMenuInput(menu);
  els.menuDraftInput.value = "";
  if (refocus) {
    els.menuDraftInput.focus();
  }
}

function renderMenuInputs(menus) {
  els.menuInputList.innerHTML = "";
  normalizeMenuValues(menus).forEach((menu) => appendMenuInput(menu));
}

function appendMenuInput(menu) {
  const chip = document.createElement("span");
  chip.className = "menu-input-chip";

  const label = document.createElement("span");
  label.textContent = menu;

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "menus";
  input.value = menu;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", `${menu} 삭제`);
  removeButton.textContent = "×";
  removeButton.addEventListener("click", () => {
    chip.remove();
    els.menuDraftInput.focus();
  });

  chip.append(label, input, removeButton);
  els.menuInputList.append(chip);
}

function getMenuInputValues() {
  return [...els.menuInputList.querySelectorAll('input[name="menus"]')].map((input) => input.value);
}

function normalizeMenuValues(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(String).map((menu) => menu.trim()).filter(Boolean))].slice(0, 6);
}

async function initializeMap() {
  setProviderBadge("네이버 연결", "loading");
  state.map?.destroy?.();
  state.map = null;

  try {
    if (!runtimeConfig.naverMapKey) {
      throw new Error("네이버 지도 키가 설정되지 않았습니다");
    }

    const adapter = new NaverMapAdapter(els.map, els.mockMap, runtimeConfig.naverMapKey);
    await activateMap(adapter);
    setProviderBadge(adapter.label, adapter.type);
  } catch (error) {
    console.warn("naver map failed", error);
    const fallback = new MockMapAdapter(els.map, els.mockMap, els.mockPins);
    await activateMap(fallback);
    setProviderBadge("네이버 실패", "error");
  }
}

async function activateMap(adapter) {
  await adapter.load();
  adapter.setClickHandler((coord) => {
    state.lastMapCoord = coord;
  });
  state.map = adapter;
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
        ...restaurant.menus,
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
    const preview = [restaurant.menus.slice(0, 2).join(" · "), deliverySummary(restaurant.deliveryApps)]
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
  const counts = { 1: 0, 2: 0, 3: 0 };
  restaurants.forEach((restaurant) => {
    counts[restaurant.rating] += 1;
  });
  els.resultCount.textContent = `${restaurants.length}곳`;
  els.ratingSummary.textContent = `동메달 ${counts[1]} · 은메달 ${counts[2]} · 금메달 ${counts[3]}`;
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
  const editableActions = restaurant.canEdit
    ? `
          <button class="secondary-button" type="button" data-action="edit">수정</button>
          <button class="secondary-button danger-button" type="button" data-action="delete">삭제</button>
        `
    : "";
  els.selectedCard.innerHTML = `
    <div class="card-layout">
      <div class="card-main">
        <h2>${escapeHtml(restaurant.name)}</h2>
        <p class="card-sub">${escapeHtml([restaurant.category, restaurant.area].filter(Boolean).join(" · "))}</p>
        ${menuChips(restaurant.menus)}
        ${deliveryChips(restaurant.deliveryApps)}
        ${restaurant.memo ? `<p class="memo">${escapeHtml(restaurant.memo)}</p>` : ""}
      </div>
      <div class="card-side">
        ${ratingBadge(restaurant.rating)}
        <div class="card-actions">
          <a class="link-button" href="${naverLink}" target="_blank" rel="noreferrer">네이버</a>
          ${editableActions}
        </div>
      </div>
    </div>
  `;

  els.selectedCard.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
    openSpotDialog(restaurant);
  });
  els.selectedCard.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
    deleteRestaurant(restaurant.id);
  });
  els.selectedCard.classList.remove("hidden");
}

function selectRestaurant(id, { closePanel = false } = {}) {
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

function openSpotDialog(restaurant = null) {
  closeFloatingPanels();
  closeSelectedRestaurant();
  els.spotForm.reset();
  clearPlaceResults();
  clearPlaceValidation();
  state.placeSelection = null;
  document.getElementById("spotId").value = restaurant?.id ?? "";
  els.spotDialogTitle.textContent = restaurant ? "맛집 수정" : "맛집 추가";

  if (restaurant) {
    els.nameInput.value = restaurant.name;
    els.categoryInput.value = restaurant.category;
    els.areaInput.value = restaurant.area;
    renderMenuInputs(restaurant.menus);
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
  addMenuFromDraft({ refocus: false });
  const formData = new FormData(els.spotForm);
  const id = String(formData.get("id") || "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const existingRestaurant = state.restaurants.find((restaurant) => restaurant.id === id);

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
    menus: normalizeMenuValues(formData.getAll("menus")),
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
    const savedRestaurant = await saveRestaurant(nextRestaurant, { isNew: !existingRestaurant });
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
  } catch (error) {
    console.warn("restaurant save failed", error);
    window.alert("맛집을 저장하지 못했습니다. Supabase 설정과 권한을 확인해주세요.");
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteRestaurant(id) {
  const restaurant = state.restaurants.find((item) => item.id === id);
  if (!restaurant) return;
  if (!window.confirm(`${restaurant.name}을 삭제할까요?`)) return;

  try {
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

function menuChips(menus) {
  if (!menus.length) return "";
  return `<div class="menu-row">${menus.map((menu) => `<span class="menu-chip">${escapeHtml(menu)}</span>`).join("")}</div>`;
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
    return;
  }

  try {
    const supabaseStore = new SupabaseRestaurantStore(runtimeConfig);
    await supabaseStore.init();
    state.store = supabaseStore;
    const remoteRestaurants = await supabaseStore.list();
    state.restaurants =
      remoteRestaurants.length === 0 && hasLocalRestaurantData()
        ? await migrateLocalRestaurantsToSupabase(localStore, supabaseStore)
        : remoteRestaurants;
  } catch (error) {
    console.warn("supabase init failed; falling back to local storage", error);
    state.store = localStore;
    state.restaurants = localStore.list();
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
    const nextRestaurant = normalizeRestaurant({ ...restaurant, canEdit: true });
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
  }

  async init() {
    const { createClient } = await import(SUPABASE_SDK_URL);
    this.client = createClient(this.url, this.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storageKey: "ccatalog.supabase.auth",
      },
    });

    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw sessionError;

    let session = sessionData.session;
    if (!session) {
      const { data, error } = await this.client.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }

    this.userId = session?.user?.id ?? null;
    if (!this.userId) {
      throw new Error("Supabase anonymous session was not created");
    }
  }

  async list() {
    const { data, error } = await this.client
      .from(SUPABASE_TABLE)
      .select(RESTAURANT_SELECT_COLUMNS)
      .order("rating", { ascending: false })
      .order("name", { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row) => rowToRestaurant(row, this.userId)).filter(Boolean);
  }

  async save(restaurant, { isNew } = {}) {
    const payload = restaurantToRow(restaurant, { includeId: isNew });
    let query;

    if (isNew) {
      query = this.client.from(SUPABASE_TABLE).insert({ ...payload, owner_id: this.userId });
    } else {
      query = this.client.from(SUPABASE_TABLE).update(payload).eq("id", restaurant.id);
    }

    const { data, error } = await query.select(RESTAURANT_SELECT_COLUMNS).single();
    if (error) throw error;
    return rowToRestaurant(data, this.userId);
  }

  async remove(id) {
    const { error } = await this.client.from(SUPABASE_TABLE).delete().eq("id", id);
    if (error) throw error;
  }
}

const RESTAURANT_SELECT_COLUMNS = [
  "id",
  "owner_id",
  "name",
  "category",
  "rating",
  "area",
  "lat",
  "lng",
  "menus",
  "delivery_apps",
  "memo",
  "created_at",
  "updated_at",
].join(",");

function rowToRestaurant(row, userId) {
  return normalizeRestaurant({
    id: row.id,
    name: row.name,
    category: row.category,
    rating: row.rating,
    area: row.area,
    lat: row.lat,
    lng: row.lng,
    menus: row.menus,
    deliveryApps: row.delivery_apps,
    memo: row.memo,
    canEdit: row.owner_id === userId,
  });
}

function restaurantToRow(restaurant, { includeId = true } = {}) {
  const row = {
    name: restaurant.name,
    category: restaurant.category,
    rating: restaurant.rating,
    area: restaurant.area,
    lat: restaurant.lat,
    lng: restaurant.lng,
    menus: normalizeMenuValues(restaurant.menus),
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
  return {
    id: String(item.id || createId()),
    name: String(item.name || "이름 없음"),
    category: String(item.category || "기타"),
    rating,
    area: String(item.area || ""),
    lat,
    lng,
    menus: Array.isArray(item.menus) ? item.menus.map(String).filter(Boolean).slice(0, 6) : [],
    deliveryApps: normalizeDeliveryApps(item.deliveryApps),
    memo: String(item.memo || ""),
    canEdit: item.canEdit !== false,
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
    this.label = "네이버 지도";
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
      zoom: 13,
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
            reject(new Error("네이버 지도 API 인증에 실패했습니다"));
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
          anchor: new window.naver.maps.Point(24, 58),
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
