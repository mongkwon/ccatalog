import { useCallback, useEffect, useRef, useState } from "react";
import { SupabaseRestaurantStore } from "../services/restaurants.js";
import { reconcileById, reuseValue } from "../lib/reconcile.js";

const emptyAuth = {
  status: "loading",
  user: null,
  profile: null,
  groups: [],
  error: "",
};

export function useCatalog() {
  const [config, setConfig] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [auth, setAuth] = useState(emptyAuth);
  const [ready, setReady] = useState(false);
  const [recordsReady, setRecordsReady] = useState(false);
  const [hiddenGroups, setHiddenGroups] = useState([]);
  const [inviteMessage, setInviteMessage] = useState("");
  const storeRef = useRef(null);
  const revision = useRef(0);
  const dataRevision = useRef(0);
  const loadedUserId = useRef(null);

  const syncAuth = useCallback(async (store = storeRef.current) => {
    if (!store) return;
    const request = ++revision.current;
    try {
      const context = await store.getMemberContext();
      if (request !== revision.current) return;
      if (loadedUserId.current !== (context.user?.id ?? null)) {
        setRestaurants([]);
        setRecordsReady(false);
      }
      loadedUserId.current = context.user?.id ?? null;
      const publishAuth = () =>
        setAuth((current) =>
          reuseValue(current, {
            ...current,
            ...context,
            groups: reconcileById(current.groups, context.groups),
            status: "ready",
            error: "",
          }),
        );
      publishAuth();
      if (!context.user) {
        setRecordsReady(true);
        return;
      }
      const groupIds = new Set(context.groups.map((group) => group.id));
      setRestaurants((current) => {
        const next = current.filter((item) => groupIds.has(item.groupId));
        return next.length === current.length ? current : next;
      });
      const token = sessionStorage.getItem("ccatalog.pendingInvite");
      if (token) {
        try {
          await store.joinGroup(token);
          if (request !== revision.current) return;
          sessionStorage.removeItem("ccatalog.pendingInvite");
          const url = new URL(location.href);
          url.searchParams.delete("invite");
          history.replaceState(null, "", url);
          setInviteMessage("그룹에 참여했습니다");
          context.groups = await store.listGroups();
          publishAuth();
        } catch {
          if (request !== revision.current) return;
          sessionStorage.removeItem("ccatalog.pendingInvite");
          setInviteMessage("유효하지 않은 초대 링크입니다");
        }
      }
      const dataRequest = dataRevision.current;
      const records = await store.list();
      if (
        request === revision.current &&
        dataRequest === dataRevision.current
      ) {
        setRestaurants((current) => reconcileById(current, records));
        setRecordsReady(true);
      }
    } catch (error) {
      if (request !== revision.current) return;
      console.warn("catalog connection failed", error);
      const sameAccount = Boolean(
        store.userId && store.userId === loadedUserId.current,
      );
      if (!sameAccount) setRestaurants([]);
      setAuth((current) => ({
        ...current,
        status: sameAccount ? current.status : "unavailable",
        error: "그룹 정보를 갱신하지 못했습니다. 다시 시도해주세요.",
      }));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let store;
    const controller = new AbortController();
    const invite = new URLSearchParams(location.search).get("invite");
    if (/^[a-f0-9]{48}$/.test(invite ?? "")) {
      sessionStorage.setItem("ccatalog.pendingInvite", invite);
      setInviteMessage("로그인하면 초대받은 그룹에 바로 참여합니다");
    }
    async function initialize() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}config.json`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("config_unavailable");
        const config = await response.json();
        if (!alive) return;
        setConfig(config);
        if (!config.supabaseUrl || !config.supabaseAnonKey)
          throw new Error("config_missing");
        store = new SupabaseRestaurantStore(config);
        await store.init(({ userChanged }) => {
          if (!alive) return;
          ++revision.current;
          if (userChanged || !store.userId) {
            loadedUserId.current = null;
            setRecordsReady(false);
            setRestaurants([]);
            setAuth(emptyAuth);
          }
          syncAuth(store);
        });
        if (!alive) return store.authSubscription?.unsubscribe();
        storeRef.current = store;
        await syncAuth(store);
      } catch (error) {
        if (!alive || error.name === "AbortError") return;
        setAuth({
          ...emptyAuth,
          status: "unavailable",
          error: "연결을 준비하지 못했습니다. 새로고침해주세요.",
        });
      } finally {
        if (alive) setReady(true);
      }
    }
    initialize();
    return () => {
      alive = false;
      controller.abort();
      ++revision.current;
      store?.authSubscription?.unsubscribe();
    };
  }, [syncAuth]);

  const refreshRestaurants = useCallback(async () => {
    const request = revision.current;
    const dataRequest = dataRevision.current;
    const records = await storeRef.current.list();
    if (request === revision.current && dataRequest === dataRevision.current)
      setRestaurants((current) => reconcileById(current, records));
    return records;
  }, []);
  useEffect(() => {
    if (!auth.user) return;
    // Refresh private image URLs before their three-minute expiry.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") syncAuth();
    }, 120000);
    return () => clearInterval(timer);
  }, [auth.user?.id, syncAuth]);
  useEffect(() => {
    const changed = (event) => {
      if (event.key !== "ccatalog.groups.changed") return;
      try {
        if (JSON.parse(event.newValue)?.userId === storeRef.current?.userId)
          syncAuth();
      } catch {
        /* Ignore unrelated storage changes. */
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [syncAuth]);
  const leaveGroup = useCallback(async (groupId) => {
    const actor = storeRef.current.userId;
    const result = await storeRef.current.leaveGroup(groupId);
    if (actor !== storeRef.current.userId) return result;
    ++revision.current;
    ++dataRevision.current;
    setRestaurants((current) =>
      current.filter((item) => item.groupId !== groupId),
    );
    setAuth((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }));
    setHiddenGroups((ids) => ids.filter((id) => id !== groupId));
    try {
      localStorage.setItem(
        "ccatalog.groups.changed",
        JSON.stringify({ userId: actor, at: Date.now() }),
      );
    } catch {
      /* The local departure still completes. */
    }
    return result;
  }, []);
  const updateRestaurant = useCallback((restaurant, { isNew = false } = {}) => {
    ++dataRevision.current;
    setRestaurants((records) => {
      if (storeRef.current?.userId !== restaurant.createdBy) return records;
      const exists = records.some((item) => item.id === restaurant.id);
      return exists
        ? records.map((item) =>
            item.id === restaurant.id
              ? {
                  ...restaurant,
                  rating:
                    item.voteRound > restaurant.voteRound
                      ? item.rating
                      : restaurant.rating,
                  voteRound: Math.max(item.voteRound, restaurant.voteRound),
                }
              : item,
          )
        : isNew
          ? [restaurant, ...records]
          : records;
    });
  }, []);
  const isMember = Boolean(auth.user && !auth.user.is_anonymous);
  const applyVoteResult = useCallback((result) => {
    ++dataRevision.current;
    setRestaurants((records) => {
      if (result.outcome === "deleted")
        return records.filter((record) => record.id !== result.restaurant_id);
      let changed = false;
      const next = records.map((record) => {
        if (
          record.id !== result.restaurant_id ||
          result.round < record.voteRound ||
          (result.rating === record.rating && result.round === record.voteRound)
        )
          return record;
        changed = true;
        return { ...record, rating: result.rating, voteRound: result.round };
      });
      return changed ? next : records;
    });
  }, []);
  const ownsRestaurant = (restaurant) =>
    isMember && restaurant?.createdBy === auth.user.id;
  return {
    config,
    restaurants,
    setRestaurants,
    auth,
    setAuth,
    ready,
    recordsReady,
    storeRef,
    syncAuth,
    refreshRestaurants,
    updateRestaurant,
    applyVoteResult,
    isMember,
    ownsRestaurant,
    leaveGroup,
    hiddenGroups,
    setHiddenGroups,
    inviteMessage,
  };
}
