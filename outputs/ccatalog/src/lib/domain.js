const STORAGE_KEY = "ccatalog.restaurants.v1";
const TUTORIAL_STORAGE_KEY = "ccatalog.tutorial.v2";
const SUPABASE_TABLE = "restaurants";
const RESTAURANT_PHOTO_BUCKET = "restaurant-photos";
const RESTAURANT_PHOTO_LIMIT = 8;
const PHOTO_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1600;
const PHOTO_JPEG_QUALITY = 0.84;
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
const VISIT_RADIUS_METERS = 500;
const VISIT_MAX_ACCURACY_METERS = 200;
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

const TUTORIAL_STEPS = [
  {
    target: "restaurantPanel",
    placement: "top",
    visual: "purpose",
    title: "까탈스러운 맛집 로그",
    description:
      "엄격한 취향으로 고른 음식점과 추천 메뉴를 기록하는 지도입니다.",
  },
  {
    target: "bottomDock",
    placement: "top",
    visual: "ratings",
    title: "메달은 추천의 강도예요",
    description:
      "동메달부터 금메달까지, 추천하는 정도에 따라 구분했습니다. 하단 필터로 원하는 메달만 볼 수 있습니다.",
  },
  {
    target: "adminButton",
    placement: "bottom",
    visual: "catalist",
    title: "세 번의 동의로 까탈리스트",
    description:
      "현장에서 위치를 인증하고 현재 메달에 동의한 방문이 3곳이면, 새로운 음식점 등록을 건의할 수 있습니다.",
  },
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

function normalizeMenuValues(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map(String)
        .map((menu) => menu.trim())
        .filter(Boolean),
    ),
  ].slice(0, 6);
}

function normalizeMenuItems(menuItems, fallbackMenus = []) {
  const sourceItems =
    Array.isArray(menuItems) && menuItems.length > 0
      ? menuItems
      : normalizeMenuValues(fallbackMenus);
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
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return "";

  const numberText = text.replace(/[,\s원]/g, "");
  if (/^\d+$/.test(numberText)) {
    return `${Number(numberText).toLocaleString("ko-KR")}원`;
  }

  return text.slice(0, 18);
}

function isValidCoordinate(coord) {
  return (
    Number.isFinite(coord.lat) &&
    Number.isFinite(coord.lng) &&
    Math.abs(coord.lat) <= 90 &&
    Math.abs(coord.lng) <= 180
  );
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

function inferCategoryFromPlace(category) {
  const text = String(category || "");
  if (
    text.includes("카페") ||
    text.includes("디저트") ||
    text.includes("베이커리")
  )
    return "카페";
  if (
    text.includes("일식") ||
    text.includes("초밥") ||
    text.includes("라멘") ||
    text.includes("돈가스")
  )
    return "일식";
  if (text.includes("중식") || text.includes("중국")) return "중식";
  if (
    text.includes("양식") ||
    text.includes("이탈리아") ||
    text.includes("프랑스") ||
    text.includes("스테이크")
  )
    return "양식";
  if (text.includes("분식") || text.includes("국수") || text.includes("김밥"))
    return "분식";
  if (
    text.includes("바") ||
    text.includes("술집") ||
    text.includes("주점") ||
    text.includes("와인")
  )
    return "바";
  if (
    text.includes("한식") ||
    text.includes("고기") ||
    text.includes("국밥") ||
    text.includes("냉면")
  )
    return "한식";
  return "기타";
}

function normalizeRestaurant(item) {
  if (!item || typeof item !== "object") return null;
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  const rating = Number(item.rating);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isSupportedRating(rating)) return null;
  const menuItems = normalizeMenuItems(
    item.menuItems || item.menu_items,
    item.menus,
  );
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
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
    );
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
    sortOrder: Number.isInteger(Number(photo.sortOrder ?? photo.sort_order))
      ? Number(photo.sortOrder ?? photo.sort_order)
      : 0,
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value),
  );
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

export function proposalReviewErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("proposal_already_reviewed"))
    return "이미 처리된 맛집 건의입니다";
  if (message.includes("restaurant_already_exists"))
    return "같은 위치의 음식점이 이미 등록되어 있습니다";
  if (message.includes("proposal_not_approvable"))
    return "등록 기준에 맞지 않아 승인할 수 없습니다";
  if (message.includes("admin_required"))
    return "관리자만 맛집 건의를 검토할 수 있습니다";
  return "맛집 건의를 처리하지 못했습니다";
}

export function proposalErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("catalist_required"))
    return "까탈리스트만 맛집을 건의할 수 있습니다.";
  if (message.includes("restaurant_already_exists"))
    return "이미 까탈로그에 등록된 음식점입니다.";
  if (message.includes("proposal_already_pending"))
    return "이미 검토 중인 맛집 건의가 있습니다.";
  return "맛집 건의를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function menuItemsSummary(menuItems, limit = 2) {
  return menuItems.slice(0, limit).map(menuItemLabel).join(" · ");
}

function menuItemLabel(item) {
  return [item.name, item.price].filter(Boolean).join(" ");
}

function deliverySummary(deliveryApps) {
  const labels = deliveryShortLabels(deliveryApps);
  return labels.length ? `배달 ${labels.join(" · ")}` : "";
}

function deliveryLabels(deliveryApps) {
  return normalizeDeliveryApps(deliveryApps)
    .map((id) => DELIVERY_APPS.find((app) => app.id === id)?.label)
    .filter(Boolean);
}

function deliveryShortLabels(deliveryApps) {
  return normalizeDeliveryApps(deliveryApps)
    .map((id) => DELIVERY_APPS.find((app) => app.id === id)?.shortLabel)
    .filter(Boolean);
}

function authErrorMessage(error) {
  const message = String(error?.message || "");
  if (/provider.*disabled/i.test(message))
    return "카카오 로그인 설정이 아직 완료되지 않았습니다";
  if (/auth unavailable/i.test(message))
    return "회원 연결을 준비하지 못했습니다. 새로고침해주세요";
  return "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요";
}

function photoErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("restaurant_photo_limit"))
    return "사진은 음식점마다 최대 8장까지 등록할 수 있습니다";
  if (message.includes("photo_file_too_large"))
    return "20MB 이하의 사진을 선택해주세요";
  if (message.includes("photo_type_invalid"))
    return "이미지 파일만 등록할 수 있습니다";
  if (message.includes("photo_decode_failed"))
    return "이 사진 형식은 현재 브라우저에서 처리할 수 없습니다";
  return "사진을 처리하지 못했습니다. 잠시 후 다시 시도해주세요";
}

function visitErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("location_denied"))
    return "위치 권한을 허용해야 방문을 인증할 수 있습니다";
  if (message.includes("location_timeout"))
    return "위치 확인 시간이 초과됐습니다. 다시 시도해주세요";
  if (
    message.includes("location_unavailable") ||
    message.includes("location_unsupported")
  )
    return "현재 위치를 확인할 수 없습니다";
  if (message.includes("location_inaccurate"))
    return "위치 정확도가 낮습니다. 창가나 야외에서 다시 시도해주세요";
  if (message.includes("too_far"))
    return "음식점에서 500m 이내일 때 인증할 수 있습니다";
  if (message.includes("already_confirmed"))
    return "이미 방문 인증한 음식점입니다";
  if (message.includes("rating_changed"))
    return "등급이 변경됐습니다. 상세 정보를 다시 확인해주세요";
  if (message.includes("agreement_required"))
    return "현재 메달 평가에 동의해주세요";
  return "방문을 인증하지 못했습니다. 잠시 후 다시 시도해주세요";
}

export {
  STORAGE_KEY,
  TUTORIAL_STORAGE_KEY,
  SUPABASE_TABLE,
  RESTAURANT_PHOTO_BUCKET,
  RESTAURANT_PHOTO_LIMIT,
  PHOTO_MAX_SOURCE_BYTES,
  PHOTO_MAX_DIMENSION,
  PHOTO_JPEG_QUALITY,
  DEFAULT_CENTER,
  INITIAL_MAP_ZOOM,
  INITIAL_NEARBY_RADIUS_KM,
  INITIAL_REVEAL_RESTAURANT_LIMIT,
  INITIAL_REVEAL_BOUNDS_OPTIONS,
  USER_LOCATION_TIMEOUT_MS,
  USER_LOCATION_MAX_AGE_MS,
  VISIT_LOCATION_TIMEOUT_MS,
  VISIT_RADIUS_METERS,
  VISIT_MAX_ACCURACY_METERS,
  MOCK_BOUNDS,
  RATING_META,
  RATING_VALUES,
  DELIVERY_APPS,
  TUTORIAL_STEPS,
  seedRestaurants,
  normalizeMenuValues,
  normalizeMenuItems,
  normalizeMenuItem,
  normalizeMenuPrice,
  isValidCoordinate,
  distanceKmBetween,
  toRadians,
  toOptionalNumber,
  inferCategoryFromPlace,
  normalizeRestaurant,
  normalizeRestaurantPhotos,
  normalizeRestaurantPhoto,
  normalizeDeliveryApps,
  createId,
  isUuid,
  clampRating,
  isSupportedRating,
  escapeHtml,
  stripHtml,
  menuItemsSummary,
  menuItemLabel,
  deliverySummary,
  deliveryLabels,
  deliveryShortLabels,
  authErrorMessage,
  photoErrorMessage,
  visitErrorMessage,
};
