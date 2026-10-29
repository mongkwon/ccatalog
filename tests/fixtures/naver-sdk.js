(() => {
  const stats = (window.__mapStats = {
    created: 0,
    destroyed: 0,
    pans: [],
    fits: [],
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
      this.center = options.center;
      this.markers = new Set();
      this.host.style.background = "#e7eff0";
    }
    getCenter() {
      return this.center;
    }
    panTo(coord) {
      this.center = coord;
      stats.pans.push({ lat: coord.lat(), lng: coord.lng() });
      this.draw();
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
    }
    getProjection() {
      return {
        fromCoordToOffset: (coord) =>
          new Point(
            this.host.clientWidth / 2 +
              (coord.lng() - this.center.lng()) * 5000,
            this.host.clientHeight / 2 -
              (coord.lat() - this.center.lat()) * 5000,
          ),
        fromOffsetToCoord: (point) =>
          new LatLng(
            this.center.lat() - (point.y - this.host.clientHeight / 2) / 5000,
            this.center.lng() + (point.x - this.host.clientWidth / 2) / 5000,
          ),
        fromCoordToPoint: (coord) =>
          new Point(coord.lng() * 5000, -coord.lat() * 5000),
        fromPointToCoord: (point) =>
          new LatLng(-point.y / 5000, point.x / 5000),
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
      this.setMap(options.map);
    }
    setIcon(icon) {
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
