(() => {
  const stats = (window.__mapStats = {
    created: 0,
    destroyed: 0,
    markerMoves: 0,
    iconWrites: 0,
    pans: [],
    fits: [],
    morphs: [],
  });
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }
  class LatLng {
    constructor(lat, lng) {
      this.latitude = lat;
      this.longitude = lng;
    }
    lat() {
      return this.latitude;
    }
    lng() {
      return this.longitude;
    }
  }
  class NaverMap {
    constructor(host, options) {
      stats.created++;
      this.host = host;
      window.__testMap = this;
      this.center = options.center;
      this.zoom = options.zoom;
      this.markers = new Set();
      this.host.style.background = "#e7eff0";
    }
    getCenter() {
      return this.center;
    }
    getZoom() {
      return this.zoom;
    }
    getMaxZoom() {
      return 21;
    }
    setZoom(zoom) {
      this.zoom = zoom;
      this.draw();
      this.emitIdle();
    }
    morph(coord, zoom) {
      this.center = coord;
      this.zoom = zoom;
      stats.morphs.push({ lat: coord.lat(), lng: coord.lng(), zoom });
      this.draw();
      this.emitIdle();
    }
    panTo(coord) {
      this.center = coord;
      stats.pans.push({ lat: coord.lat(), lng: coord.lng() });
      this.draw();
      this.emitIdle();
    }
    fitBounds(points, options) {
      stats.fits.push({
        points: points.map((p) => ({ lat: p.lat(), lng: p.lng() })),
        options,
      });
      this.center = new LatLng(
        points.reduce((sum, p) => sum + p.lat(), 0) / points.length,
        points.reduce((sum, p) => sum + p.lng(), 0) / points.length,
      );
      this.draw();
      this.emitIdle();
    }
    emitIdle() {
      (this.listeners || [])
        .filter((listener) => listener.name === "idle")
        .forEach((listener) => listener.callback());
    }
    getProjection() {
      const scale = 5000 * 2 ** (this.zoom - 13);
      return {
        fromCoordToOffset: (coord) =>
          new Point(
            this.host.clientWidth / 2 +
              (coord.lng() - this.center.lng()) * scale,
            this.host.clientHeight / 2 -
              (coord.lat() - this.center.lat()) * scale,
          ),
        fromOffsetToCoord: (point) =>
          new LatLng(
            this.center.lat() - (point.y - this.host.clientHeight / 2) / scale,
            this.center.lng() + (point.x - this.host.clientWidth / 2) / scale,
          ),
        fromCoordToPoint: (coord) =>
          new Point(coord.lng() * scale, -coord.lat() * scale),
        fromPointToCoord: (point) =>
          new LatLng(-point.y / scale, point.x / scale),
      };
    }
    draw() {
      this.markers.forEach((marker) => marker.draw());
    }
  }
  class Marker {
    constructor(options) {
      this.position = options.position;
      this.listeners = [];
      this.setIcon(options.icon);
      this.element.style.zIndex = String(options.zIndex ?? 100);
      this.setMap(options.map);
    }
    setIcon(icon) {
      stats.iconWrites++;
      this.icon = icon;
      if (!this.element) {
        this.element = document.createElement("div");
        this.element.style.cssText = "position:absolute;pointer-events:auto;";
        this.element.addEventListener("click", (event) => {
          event.stopPropagation();
          this.listeners
            .filter((item) => item.name === "click")
            .forEach((item) => item.callback());
        });
      }
      this.element.innerHTML = icon.content;
      this.draw();
    }
    setMap(map) {
      this.map?.markers.delete(this);
      this.element.remove();
      this.map = map;
      if (map) {
        map.markers.add(this);
        map.host.append(this.element);
        this.draw();
      }
    }
    setPosition(coord) {
      stats.markerMoves++;
      this.position = coord;
      this.draw();
    }
    draw() {
      if (!this.map) return;
      const offset = this.map.getProjection().fromCoordToOffset(this.position);
      this.element.style.left = `${offset.x - this.icon.anchor.x}px`;
      this.element.style.top = `${offset.y - this.icon.anchor.y}px`;
    }
  }
  window.naver = {
    maps: {
      Map: NaverMap,
      Marker,
      LatLng,
      Point,
      Position: { TOP_RIGHT: 1 },
      Event: {
        addListener(target, name, callback) {
          const listener = { target, name, callback };
          (target.listeners ||= []).push(listener);
          return listener;
        },
        removeListener(listener) {
          listener.target.listeners = listener.target.listeners.filter(
            (entry) => entry !== listener,
          );
        },
      },
    },
  };
  const url = new URL(document.currentScript.src);
  window[url.searchParams.get("callback")]?.();
})();
