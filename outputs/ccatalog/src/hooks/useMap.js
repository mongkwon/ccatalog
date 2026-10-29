import { useEffect, useRef, useState } from "react";
import { NaverMapAdapter, MockMapAdapter } from "../services/maps.js";
import {
  isValidCoordinate,
  distanceKmBetween,
  INITIAL_NEARBY_RADIUS_KM,
  INITIAL_REVEAL_RESTAURANT_LIMIT,
  USER_LOCATION_TIMEOUT_MS,
  USER_LOCATION_MAX_AGE_MS,
  VISIT_LOCATION_TIMEOUT_MS,
} from "../lib/domain.js";

export function useMap({
  config,
  ready,
  restaurants,
  visibleRestaurants,
  selectedId,
  visitedIds,
  onSelect,
}) {
  const mapHost = useRef(null);
  const mockHost = useRef(null);
  const mockPins = useRef(null);
  const adapterRef = useRef(null);
  const [adapter, setAdapter] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const current = useRef({
    restaurants,
    visibleRestaurants,
    selectedId,
    visitedIds,
    onSelect,
  });
  current.current = {
    restaurants,
    visibleRestaurants,
    selectedId,
    visitedIds,
    onSelect,
  };

  useEffect(() => {
    if (!ready || !config) return;
    let alive = true;
    let active;
    let watchId;
    function locationChanged(position, center = false) {
      if (!alive) return;
      const coord = {
        lat: Number(position.coords.latitude),
        lng: Number(position.coords.longitude),
        accuracy: Number(position.coords.accuracy),
      };
      if (!isValidCoordinate(coord)) return;
      setUserLocation(coord);
      active?.setUserLocation(coord);
      if (!center || current.current.selectedId) return;
      const nearby = current.current.restaurants
        .map((restaurant) => ({
          restaurant,
          distance: distanceKmBetween(coord, restaurant),
        }))
        .sort((a, b) => a.distance - b.distance);
      if (nearby.length && nearby[0].distance > INITIAL_NEARBY_RADIUS_KM) {
        const limit = Math.max(
          INITIAL_NEARBY_RADIUS_KM,
          nearby[0].distance * 1.35,
        );
        active.fitToCoordinates(
          [
            coord,
            ...nearby
              .filter((item) => item.distance <= limit)
              .slice(0, INITIAL_REVEAL_RESTAURANT_LIMIT)
              .map((item) => item.restaurant),
          ],
          { focusCoord: coord, accountForCards: true },
        );
      } else active.panTo(coord, { accountForCards: true });
    }
    async function initialize() {
      try {
        if (!config.naverMapKey)
          throw new Error("네이버지도 키가 설정되지 않았습니다");
        active = new NaverMapAdapter(
          mapHost.current,
          mockHost.current,
          config.naverMapKey,
        );
        await active.load();
      } catch (error) {
        if (!alive) return;
        console.warn("naver map failed", error);
        active?.destroy?.();
        active = new MockMapAdapter(
          mapHost.current,
          mockHost.current,
          mockPins.current,
        );
        await active.load();
      }
      if (!alive) {
        active.destroy();
        return;
      }
      adapterRef.current = active;
      setAdapter(active);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => locationChanged(position, true),
          () => {},
          {
            enableHighAccuracy: false,
            timeout: USER_LOCATION_TIMEOUT_MS,
            maximumAge: USER_LOCATION_MAX_AGE_MS,
          },
        );
        watchId = navigator.geolocation.watchPosition(
          (position) => locationChanged(position),
          () => {},
          {
            enableHighAccuracy: true,
            timeout: VISIT_LOCATION_TIMEOUT_MS,
            maximumAge: 15000,
          },
        );
      }
    }
    initialize();
    const stopWatch = () => {
      if (watchId !== undefined) {
        navigator.geolocation?.clearWatch(watchId);
        watchId = undefined;
      }
    };
    window.addEventListener("pagehide", stopWatch);
    return () => {
      alive = false;
      stopWatch();
      window.removeEventListener("pagehide", stopWatch);
      active?.destroy();
      adapterRef.current = null;
    };
  }, [config, ready]);

  useEffect(() => {
    adapter?.render(
      visibleRestaurants,
      selectedId,
      (id) => current.current.onSelect(id, { closePanel: true }),
      userLocation,
      visitedIds,
    );
  }, [adapter, visibleRestaurants, selectedId, userLocation, visitedIds]);

  return {
    mapHost,
    mockHost,
    mockPins,
    adapterRef,
    userLocation,
    setUserLocation,
  };
}
