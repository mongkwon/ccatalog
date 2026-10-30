import {
  DEFAULT_CENTER,
  INITIAL_MAP_ZOOM,
  INITIAL_REVEAL_BOUNDS_OPTIONS,
  MOCK_BOUNDS,
  RATING_META,
  escapeHtml,
  isValidCoordinate,
} from "../lib/domain.js";
import {
  RestaurantClusters,
  CLUSTER_MAX_ZOOM,
  clusterFill,
} from "../lib/marker-clusters.js";

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
    this.clusters = new RestaurantClusters();
    this.nodes = new Map();
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
      maxZoom: CLUSTER_MAX_ZOOM,
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
        this.closeClusterMenu();
        this.clickHandler?.(normaliseNaverCoord(event.coord));
      },
    );
    this.clusterListener = window.naver.maps.Event.addListener(
      this.map,
      "idle",
      () => {
        this.closeClusterMenu();
        this.renderMarkers();
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
    this.clusters.update(restaurants);
    this.selectedId = selectedId;
    this.onSelect = onSelect;
    this.renderMarkers();
    this.setUserLocation(userLocation);
  }

  renderMarkers() {
    if (!this.map) return;
    const nodes = this.clusters.nodes(this.map.getZoom());
    this.nodes = new Map(nodes.map((node) => [node.key, node]));
    if (this.clusterMenu && !this.nodes.has(this.clusterMenuKey))
      this.closeClusterMenu();
    const visibleIds = new Set(this.nodes.keys());
    this.markers.forEach((entry, id) => {
      if (visibleIds.has(id)) return;
      window.naver.maps.Event.removeListener(entry.listener);
      entry.marker.setMap(null);
      this.markers.delete(id);
    });
    nodes.forEach((node) => {
      const restaurant = node.restaurant;
      const content = node.cluster
        ? clusterHtml(node, this.selectedId)
        : pinHtml(restaurant, this.selectedId);
      const existing = this.markers.get(node.key);
      if (existing) {
        if (existing.lat !== node.lat || existing.lng !== node.lng) {
          existing.marker.setPosition(
            new window.naver.maps.LatLng(node.lat, node.lng),
          );
          existing.lat = node.lat;
          existing.lng = node.lng;
        }
        if (existing.content !== content) {
          existing.marker.setIcon({
            content,
            anchor: new window.naver.maps.Point(
              node.cluster ? 26 : 22,
              node.cluster ? 26 : 22,
            ),
          });
          existing.content = content;
        }
        return;
      }
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(node.lat, node.lng),
        map: this.map,
        zIndex: node.cluster ? 150 : 100,
        title: node.cluster ? `맛집 ${node.members.length}곳` : restaurant.name,
        icon: {
          content,
          anchor: new window.naver.maps.Point(
            node.cluster ? 26 : 22,
            node.cluster ? 26 : 22,
          ),
        },
      });
      const listener = window.naver.maps.Event.addListener(
        marker,
        "click",
        () => this.selectNode(node.key),
      );
      this.markers.set(node.key, {
        marker,
        listener,
        content,
        lat: node.lat,
        lng: node.lng,
      });
    });
  }

  selectNode(key) {
    const node = this.nodes.get(key);
    if (!node) return;
    if (!node.cluster) {
      this.closeClusterMenu();
      this.onSelect?.(node.restaurant.id);
      return;
    }
    const maximum = Math.min(
      CLUSTER_MAX_ZOOM,
      this.map.getMaxZoom?.() ?? CLUSTER_MAX_ZOOM,
    );
    if (this.map.getZoom() >= maximum) {
      this.openClusterMenu(node);
      return;
    }
    this.closeClusterMenu();
    this.onSelect?.(null);
    this.map.morph(
      new window.naver.maps.LatLng(node.lat, node.lng),
      Math.min(maximum, Math.max(this.map.getZoom() + 1, node.expansionZoom)),
      { duration: 350 },
    );
  }

  closeClusterMenu() {
    this.clusterMenu?.remove();
    this.clusterMenu = null;
    this.clusterMenuKey = null;
  }

  openClusterMenu(node) {
    this.closeClusterMenu();
    const menu = document.createElement("section");
    menu.className = "map-cluster-menu";
    menu.setAttribute("aria-label", "겹친 맛집");
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = `${node.members.length}곳`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "닫기";
    close.addEventListener("click", () => this.closeClusterMenu());
    header.append(title, close);
    menu.append(header);
    for (const restaurant of node.members) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cluster-restaurant";
      button.textContent = `${RATING_META[restaurant.rating].icon} ${restaurant.name}`;
      button.addEventListener("click", () => {
        this.closeClusterMenu();
        this.onSelect?.(restaurant.id);
      });
      menu.append(button);
    }
    for (const event of ["click", "pointerdown"])
      menu.addEventListener(event, (event) => event.stopPropagation());
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.closeClusterMenu();
      }
    });
    this.mapHost.append(menu);
    this.clusterMenu = menu;
    this.clusterMenuKey = node.key;
    const offset = this.map
      .getProjection()
      .fromCoordToOffset(new window.naver.maps.LatLng(node.lat, node.lng));
    const half = menu.offsetWidth / 2;
    menu.style.left = `${Math.max(half + 12, Math.min(this.mapHost.clientWidth - half - 12, offset.x))}px`;
    menu.style.top = `${Math.max(menu.offsetHeight + 12, offset.y - 26)}px`;
    menu.querySelector(".cluster-restaurant")?.focus({ preventScroll: true });
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
    this.closeClusterMenu();
    this.markers.forEach(({ marker, listener }) => {
      window.naver?.maps?.Event.removeListener(listener);
      marker.setMap(null);
    });
    this.markers.clear();
    if (this.clusterListener)
      window.naver?.maps?.Event.removeListener(this.clusterListener);
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

function clusterHtml(node, selectedId) {
  const selected = node.members.some(
    (restaurant) => restaurant.id === selectedId,
  );
  return `<button type="button" class="pin-marker pin-cluster${selected ? " is-selected" : ""}" style="--cluster-fill:${clusterFill(node.members)}" aria-label="맛집 ${node.members.length}곳 모아보기"><span class="pin-head"><span class="pin-count" aria-hidden="true">${node.members.length}</span></span></button>`;
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
