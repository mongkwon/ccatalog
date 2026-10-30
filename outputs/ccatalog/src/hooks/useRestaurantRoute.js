import { useCallback, useEffect, useRef, useState } from "react";
import { restaurantHash, restaurantIdFromHash } from "../lib/routes.js";

export function useRestaurantRoute() {
  const [restaurantId, setRestaurantId] = useState(() =>
    restaurantIdFromHash(location.hash),
  );
  const current = useRef(restaurantId);
  const lastUrl = useRef(location.href);
  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => {
    const changed = () => {
      if (lastUrl.current === location.href) return;
      lastUrl.current = location.href;
      current.current = restaurantIdFromHash(location.hash);
      setRestaurantId(current.current);
      setHistoryVersion((version) => version + 1);
    };
    window.addEventListener("hashchange", changed);
    window.addEventListener("popstate", changed);
    return () => {
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("popstate", changed);
    };
  }, []);
  const navigate = useCallback((value, { replace = false } = {}) => {
    const next = typeof value === "function" ? value(current.current) : value;
    if (next === current.current) return;
    const url = new URL(location.href);
    url.hash = restaurantHash(next);
    history[replace ? "replaceState" : "pushState"](history.state, "", url);
    lastUrl.current = url.href;
    current.current = restaurantIdFromHash(url.hash);
    setRestaurantId(current.current);
  }, []);
  return { restaurantId, navigate, historyVersion };
}
