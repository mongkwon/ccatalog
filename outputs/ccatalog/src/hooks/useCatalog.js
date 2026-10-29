import { useCallback, useEffect, useRef, useState } from "react";
import {
  LocalRestaurantStore,
  SupabaseRestaurantStore,
  hasLocalRestaurantData,
} from "../services/restaurants.js";

const emptyAuth = {
  status: "loading",
  user: null,
  profile: null,
  isAdmin: false,
  visitedRestaurantIds: [],
  visitCount: 0,
  proposals: [],
  adminProposals: [],
  error: "",
};

export function useCatalog() {
  const [config, setConfig] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [auth, setAuth] = useState(emptyAuth);
  const [mode, setMode] = useState("member");
  const [ready, setReady] = useState(false);
  const storeRef = useRef(null);
  const authRevision = useRef(0);

  const syncAuth = useCallback(async (store = storeRef.current) => {
    if (!store?.getMemberContext) return;
    const revision = ++authRevision.current;
    try {
      const context = await store.getMemberContext();
      if (revision !== authRevision.current) return;
      setAuth({ ...context, status: "ready", error: "" });
      setMode((current) =>
        context.isAdmin
          ? current
          : context.profile?.is_catalist
            ? "catalist"
            : "member",
      );
    } catch (error) {
      if (revision !== authRevision.current) return;
      console.warn("member context failed", error);
      setAuth({
        ...emptyAuth,
        status: "unavailable",
        error: "회원 정보를 불러오지 못했습니다",
      });
      setMode("member");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let store;
    const controller = new AbortController();
    async function initialize() {
      let config = {};
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}config.json`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) config = await response.json();
      } catch (error) {
        if (error.name === "AbortError") return;
      }
      if (!alive) return;
      setConfig(config);
      const local = new LocalRestaurantStore();
      if (config.supabaseUrl && config.supabaseAnonKey) {
        try {
          store = new SupabaseRestaurantStore(config);
          await store.init(() => alive && syncAuth(store));
          if (!alive) {
            store.authSubscription?.unsubscribe();
            return;
          }
          storeRef.current = store;
          await syncAuth(store);
          let records = await store.list();
          if (!records.length && hasLocalRestaurantData()) {
            records = [];
            for (const restaurant of local.list())
              records.push(await store.save(restaurant, { isNew: true }));
          }
          if (alive) {
            setRestaurants(records);
            setReady(true);
          }
          return;
        } catch (error) {
          console.warn(
            "supabase init failed; falling back to local storage",
            error,
          );
          store?.authSubscription?.unsubscribe();
        }
      }
      if (!alive) return;
      storeRef.current = local;
      setRestaurants(local.list());
      setAuth({
        ...emptyAuth,
        status: "unavailable",
        error: config.supabaseUrl
          ? "Supabase 연결을 확인해주세요"
          : "Supabase 설정이 필요합니다",
      });
      setReady(true);
    }
    initialize();
    return () => {
      alive = false;
      controller.abort();
      ++authRevision.current;
      store?.authSubscription?.unsubscribe();
    };
  }, [syncAuth]);

  const refreshRestaurants = useCallback(async () => {
    const records = await storeRef.current.list();
    setRestaurants(records);
    return records;
  }, []);
  const updateRestaurant = useCallback(
    (restaurant) =>
      setRestaurants((records) => {
        const existing = records.some((item) => item.id === restaurant.id);
        return existing
          ? records.map((item) =>
              item.id === restaurant.id ? restaurant : item,
            )
          : [restaurant, ...records];
      }),
    [],
  );
  const isMember = Boolean(auth.user && !auth.user.is_anonymous);
  const isAdmin = isMember && auth.isAdmin && mode === "admin";
  const isCatalist =
    isMember &&
    (auth.isAdmin ? mode === "catalist" : Boolean(auth.profile?.is_catalist));
  return {
    config,
    restaurants,
    setRestaurants,
    auth,
    setAuth,
    mode,
    setMode,
    ready,
    storeRef,
    syncAuth,
    refreshRestaurants,
    updateRestaurant,
    isMember,
    isAdmin,
    isCatalist,
  };
}
