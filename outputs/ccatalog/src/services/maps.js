import {
  DEFAULT_CENTER,
  INITIAL_MAP_ZOOM,
  INITIAL_REVEAL_BOUNDS_OPTIONS,
  MOCK_BOUNDS,
  RATING_META,
  escapeHtml,
  isValidCoordinate,
} from "../lib/domain.js";

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
    script.onerror = () =>
      settle(new Error("지도 API 스크립트를 불러오지 못했습니다"));
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

  render(restaurants, selectedId, onSelect, userLocation) {
    this.pinsLayer.innerHTML = "";
    const fragment = document.createDocumentFragment();
    if (userLocation && isValidCoordinate(userLocation)) {
      const userMarker = document.createElement("div");
      userMarker.className = "user-location-marker";
      userMarker.setAttribute("aria-label", "현재 위치");
      userMarker.innerHTML = '<span aria-hidden="true"></span>';
      const userPosition = this.coordToPoint(userLocation);
      userMarker.style.left = `${userPosition.x}%`;
      userMarker.style.top = `${userPosition.y}%`;
      fragment.append(userMarker);
    }
    restaurants.forEach((restaurant) => {
      const pin = createPinElement(
        restaurant,
        selectedId,
        onSelect,
        userLocation,
      );
      const position = this.coordToPoint({
        lat: restaurant.lat,
        lng: restaurant.lng,
      });
      pin.style.left = `${position.x}%`;
      pin.style.top = `${position.y}%`;
      fragment.append(pin);
    });
    this.pinsLayer.append(fragment);
  }

  setUserLocation() {}

  setClickHandler(handler) {
    this.clickHandler = handler;
  }

  getCenter() {
    return this.center;
  }

  panTo(coord) {
    this.center = coord;
    this.centerListener?.();
  }

  fitToCoordinates(coords) {
    const [firstCoord] = coords.filter(isValidCoordinate);
    if (firstCoord) {
      this.center = firstCoord;
      this.centerListener?.();
    }
  }

  subscribeIdle(handler) {
    this.centerListener = handler;
    return () => {
      this.centerListener = null;
    };
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
    const x =
      ((coord.lng - MOCK_BOUNDS.lngMin) /
        (MOCK_BOUNDS.lngMax - MOCK_BOUNDS.lngMin)) *
      100;
    const y =
      100 -
      ((coord.lat - MOCK_BOUNDS.latMin) /
        (MOCK_BOUNDS.latMax - MOCK_BOUNDS.latMin)) *
        100;
    return {
      x: Math.max(4, Math.min(96, x)),
      y: Math.max(8, Math.min(94, y)),
    };
  }

  pointToCoord(point) {
    const lng =
      MOCK_BOUNDS.lngMin +
      (point.x / 100) * (MOCK_BOUNDS.lngMax - MOCK_BOUNDS.lngMin);
    const lat =
      MOCK_BOUNDS.latMax -
      (point.y / 100) * (MOCK_BOUNDS.latMax - MOCK_BOUNDS.latMin);
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
    this.markers = new Map();
    this.userMarker = null;
    this.clickHandler = null;
    this.clickListener = null;
  }

  async load() {
    await this.loadNaverScript();

    this.mapHost.classList.remove("hidden");
    this.mockMap.classList.add("hidden");
    this.mockMap.setAttribute("aria-hidden", "true");
    this.map = new window.naver.maps.Map(this.mapHost, {
      center: new window.naver.maps.LatLng(
        DEFAULT_CENTER.lat,
        DEFAULT_CENTER.lng,
      ),
      zoom: INITIAL_MAP_ZOOM,
      scaleControl: false,
      mapDataControl: false,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.TOP_RIGHT,
      },
    });

    this.clickListener = window.naver.maps.Event.addListener(
      this.map,
      "click",
      (event) => {
        this.clickHandler?.(normaliseNaverCoord(event.coord));
      },
    );
  }

  async loadNaverScript() {
    const previousAuthFailure = window.navermap_authFailure;
    const callbackName = `ccatalogNaverReady${Date.now()}`;
    const src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(this.key)}&submodules=geocoder&callback=${callbackName}`;
    try {
      await Promise.race([
        loadScript(
          src,
          () => Boolean(window.naver?.maps?.Map && window.naver.maps.LatLng),
          8000,
          callbackName,
        ),
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

  render(restaurants, selectedId, onSelect, userLocation) {
    const visibleIds = new Set(restaurants.map((restaurant) => restaurant.id));
    this.markers.forEach((entry, id) => {
      if (visibleIds.has(id)) return;
      window.naver.maps.Event.removeListener(entry.listener);
      entry.marker.setMap(null);
      this.markers.delete(id);
    });
    this.onSelect = onSelect;
    restaurants.forEach((restaurant) => {
      const content = pinHtml(restaurant, selectedId);
      const existing = this.markers.get(restaurant.id);
      if (existing) {
        if (
          existing.lat !== restaurant.lat ||
          existing.lng !== restaurant.lng
        ) {
          existing.marker.setPosition(
            new window.naver.maps.LatLng(restaurant.lat, restaurant.lng),
          );
          existing.lat = restaurant.lat;
          existing.lng = restaurant.lng;
        }
        if (existing.content !== content) {
          existing.marker.setIcon({
            content,
            anchor: new window.naver.maps.Point(22, 22),
          });
          existing.content = content;
        }
        return;
      }
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(restaurant.lat, restaurant.lng),
        map: this.map,
        title: restaurant.name,
        icon: {
          content,
          anchor: new window.naver.maps.Point(22, 22),
        },
      });
      const listener = window.naver.maps.Event.addListener(
        marker,
        "click",
        () => this.onSelect?.(restaurant.id),
      );
      this.markers.set(restaurant.id, {
        marker,
        listener,
        content,
        lat: restaurant.lat,
        lng: restaurant.lng,
      });
    });
    this.setUserLocation(userLocation);
  }

  setUserLocation(coord) {
    if (!coord || !isValidCoordinate(coord) || !this.map) {
      this.userMarker?.setMap(null);
      this.userMarker = null;
      this.userCoord = null;
      return;
    }

    const position = new window.naver.maps.LatLng(coord.lat, coord.lng);
    if (this.userMarker) {
      if (
        this.userCoord?.lat !== coord.lat ||
        this.userCoord?.lng !== coord.lng
      )
        this.userMarker.setPosition(position);
      this.userCoord = { lat: coord.lat, lng: coord.lng };
      return;
    }

    this.userMarker = new window.naver.maps.Marker({
      position,
      map: this.map,
      zIndex: 120,
      title: "현재 위치",
      icon: {
        content:
          '<div class="user-location-marker" aria-label="현재 위치"><span aria-hidden="true"></span></div>',
        anchor: new window.naver.maps.Point(12, 12),
      },
    });
    this.userCoord = { lat: coord.lat, lng: coord.lng };
  }

  setClickHandler(handler) {
    this.clickHandler = handler;
  }

  getCenter() {
    return normaliseNaverCoord(this.map.getCenter());
  }

  subscribeIdle(handler) {
    const listener = window.naver.maps.Event.addListener(
      this.map,
      "idle",
      handler,
    );
    return () => window.naver.maps.Event.removeListener(listener);
  }

  panTo(coord, { accountForCards = false } = {}) {
    const target = new window.naver.maps.LatLng(coord.lat, coord.lng);
    const adjustedCenter = accountForCards
      ? this.getCardAwareCenter(target)
      : null;
    this.map.panTo(adjustedCenter || target);
  }

  getCardAwareCenter(target) {
    const mapRect = this.mapHost.getBoundingClientRect();
    const cardTop = [
      ...document.querySelectorAll(
        ".restaurant-panel.is-open, .selected-card:not(.hidden)",
      ),
    ]
      .map((card) => card.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .reduce((top, rect) => Math.min(top, rect.top), mapRect.bottom);
    const desiredX = mapRect.width / 2;
    const desiredY =
      (Math.max(mapRect.top, Math.min(mapRect.bottom, cardTop)) - mapRect.top) /
      2;
    const renderedCenter = this.getRenderedCenterPoint(mapRect);
    if (!renderedCenter) return null;
    const projection = this.map.getProjection();
    const targetOffset = projection.fromCoordToOffset(target);
    const adjusted = projection.fromOffsetToCoord(
      new window.naver.maps.Point(
        targetOffset.x + renderedCenter.x - desiredX,
        targetOffset.y + renderedCenter.y - desiredY,
      ),
    );
    return adjusted;
  }

  getRenderedCenterPoint(mapRect) {
    const probe = new window.naver.maps.Marker({
      position: this.map.getCenter(),
      map: this.map,
      clickable: false,
      icon: {
        content: '<i class="map-center-probe" aria-hidden="true"></i>',
        anchor: new window.naver.maps.Point(0, 0),
      },
    });
    const probeRect = this.mapHost
      .querySelector(".map-center-probe")
      ?.getBoundingClientRect();
    probe.setMap(null);
    return probeRect
      ? { x: probeRect.left - mapRect.left, y: probeRect.top - mapRect.top }
      : null;
  }

  fitToCoordinates(
    coords,
    { focusCoord = null, accountForCards = false } = {},
  ) {
    const points = coords
      .filter(isValidCoordinate)
      .map((coord) => new window.naver.maps.LatLng(coord.lat, coord.lng));
    if (points.length < 2) {
      if (points[0]) {
        this.panTo(normaliseNaverCoord(points[0]), { accountForCards });
      }
      return;
    }

    const fitPoints =
      focusCoord && isValidCoordinate(focusCoord)
        ? this.getCoordinatesSymmetricAround(
            points,
            new window.naver.maps.LatLng(focusCoord.lat, focusCoord.lng),
          )
        : points;
    const fitOptions = accountForCards
      ? { ...INITIAL_REVEAL_BOUNDS_OPTIONS, ...this.getCardFitBoundsOptions() }
      : INITIAL_REVEAL_BOUNDS_OPTIONS;
    this.map.fitBounds(fitPoints, fitOptions);
  }

  getCoordinatesSymmetricAround(points, focus) {
    const projection = this.map.getProjection();
    const focusPoint = projection.fromCoordToPoint(focus);
    return points.flatMap((point) => {
      const worldPoint = projection.fromCoordToPoint(point);
      const mirroredPoint = new window.naver.maps.Point(
        focusPoint.x * 2 - worldPoint.x,
        focusPoint.y * 2 - worldPoint.y,
      );
      return [point, projection.fromPointToCoord(mirroredPoint)];
    });
  }

  getCardFitBoundsOptions() {
    const mapRect = this.mapHost.getBoundingClientRect();
    const cardTop = [
      ...document.querySelectorAll(
        ".restaurant-panel.is-open, .selected-card:not(.hidden)",
      ),
    ]
      .map((card) => card.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .reduce((top, rect) => Math.min(top, rect.top), mapRect.bottom);
    return {
      top: 0,
      right: INITIAL_REVEAL_BOUNDS_OPTIONS.right,
      bottom: Math.max(0, Math.min(mapRect.height, mapRect.bottom - cardTop)),
      left: INITIAL_REVEAL_BOUNDS_OPTIONS.left,
      maxZoom: INITIAL_REVEAL_BOUNDS_OPTIONS.maxZoom,
    };
  }

  destroy() {
    this.markers.forEach(({ marker, listener }) => {
      window.naver?.maps?.Event.removeListener(listener);
      marker.setMap(null);
    });
    this.markers.clear();
    this.userMarker?.setMap(null);
    this.userMarker = null;
    if (this.clickListener) {
      window.naver?.maps?.Event?.removeListener(this.clickListener);
    }
    this.map = null;
  }
}

function normaliseNaverCoord(coord) {
  if (!coord) return DEFAULT_CENTER;
  const lat =
    typeof coord.lat === "function" ? coord.lat() : (coord.y ?? coord._lat);
  const lng =
    typeof coord.lng === "function" ? coord.lng() : (coord.x ?? coord._lng);
  return { lat: Number(lat), lng: Number(lng) };
}

export { MockMapAdapter, NaverMapAdapter, normaliseNaverCoord };

function pinHtml(restaurant, selectedId) {
  const meta = RATING_META[restaurant.rating];
  const colors = (restaurant.pinColors || []).filter((color) =>
    /^#[0-9a-f]{6}$/i.test(color),
  );
  const stripe = colors.length
    ? `<span class="pin-groups">${colors.map((color) => `<i style="background-color:${color}"></i>`).join("")}</span>`
    : "";
  return `<button type="button" class="pin-marker${restaurant.id === selectedId ? " is-selected" : ""}" data-rating="${restaurant.rating}" aria-label="${escapeHtml(restaurant.name)} ${meta.label}"><span class="pin-head"><span class="pin-level">${meta.icon}</span>${stripe}</span></button>`;
}

function createPinElement(restaurant, selectedId, onSelect, userLocation) {
  const template = document.createElement("template");
  template.innerHTML = pinHtml(restaurant, selectedId);
  const button = template.content.firstElementChild;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(restaurant.id);
  });
  return button;
}
