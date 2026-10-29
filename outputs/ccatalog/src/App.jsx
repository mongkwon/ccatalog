import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useCatalog } from "./hooks/useCatalog.js";
import { useMap } from "./hooks/useMap.js";
import AccountPanel, {
  memberName,
  MemberAvatar,
} from "./components/AccountPanel.jsx";
import { UserRound, Plus } from "lucide-react";
import FilterDock from "./components/FilterDock.jsx";
import { RestaurantList, RestaurantDetail } from "./components/Restaurants.jsx";
import RestaurantForm from "./components/RestaurantForm.jsx";
import { PhotoViewer } from "./components/PhotoDialogs.jsx";
import Tutorial from "./components/Tutorial.jsx";
import DiscussionDialog from "./components/DiscussionDialog.jsx";
import {
  deliveryLabels,
  normalizeRestaurantPhotos,
  RESTAURANT_PHOTO_LIMIT,
  TUTORIAL_STORAGE_KEY,
  photoErrorMessage,
} from "./lib/domain.js";
import { prepareRestaurantPhoto } from "./lib/photos.js";

export default function App() {
  const catalog = useCatalog();
  const {
    restaurants,
    auth,
    isMember,
    ownsRestaurant,
    hiddenGroups,
    ready,
    config,
    storeRef,
    updateRestaurant,
  } = catalog;
  const canAdd = isMember && auth.groups.length > 0;
  const groupMap = useMemo(
    () => new Map(auth.groups.map((group) => [group.id, group])),
    [auth.groups],
  );
  const groupedRestaurants = useMemo(
    () =>
      restaurants.map((restaurant) => ({
        ...restaurant,
        group: groupMap.get(restaurant.groupId),
      })),
    [restaurants, groupMap],
  );
  const [selectedId, setSelectedId] = useState(null);
  const [selectionMotion, setSelectionMotion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [listOpen, setListOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [dialog, setDialog] = useState({
    type: null,
    open: false,
    restaurant: null,
  });
  const [viewer, setViewer] = useState({ restaurantId: null, index: 0 });
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const applyVoteResult = catalog.applyVoteResult;
  const handleVoteOutcome = useCallback(
    (result) => {
      applyVoteResult(result);
      if (result.outcome === "deleted") {
        setSelectedId((id) => (id === result.restaurant_id ? null : id));
        setDialog((current) =>
          current.restaurant?.id === result.restaurant_id
            ? { type: null, open: false, restaurant: null }
            : current,
        );
        setListOpen(true);
        setNotice("이 그룹에서 삭제된 맛집입니다");
      }
    },
    [applyVoteResult],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const dialogRestaurant =
    groupedRestaurants.find(
      (restaurant) => restaurant.id === dialog.restaurant?.id,
    ) || dialog.restaurant;
  const visibleRestaurants = useMemo(() => {
    const search = query.trim().toLowerCase();
    return groupedRestaurants
      .filter(
        (restaurant) =>
          !hiddenGroups.includes(restaurant.groupId) &&
          (filter === "all" || String(restaurant.rating) === filter) &&
          (!search ||
            [
              restaurant.name,
              restaurant.category,
              restaurant.area,
              restaurant.memo,
              ...restaurant.menus,
              ...restaurant.menuItems.map((item) => item.price),
              ...deliveryLabels(restaurant.deliveryApps),
            ]
              .join(" ")
              .toLowerCase()
              .includes(search)),
      )
      .sort(
        (a, b) => b.rating - a.rating || a.name.localeCompare(b.name, "ko"),
      );
  }, [groupedRestaurants, query, filter, hiddenGroups]);
  const selected =
    visibleRestaurants.find((restaurant) => restaurant.id === selectedId) ||
    null;
  const onSelect = useCallback((id, { closePanel = false } = {}) => {
    setDialog((dialog) => ({ ...dialog, open: false }));
    if (closePanel) {
      setListOpen(false);
      setSearchOpen(false);
    }
    setSelectedId(id);
    setSelectionMotion((value) => value + 1);
  }, []);
  const map = useMap({
    config,
    ready,
    restaurants,
    visibleRestaurants,
    selectedId,
    onSelect,
  });
  useLayoutEffect(() => {
    const classes = {
      "has-add-access": canAdd,
      "is-list-open": listOpen,
      "is-search-open": searchOpen,
      "is-tutorial-open": tutorialOpen,
    };
    Object.entries(classes).forEach(([name, enabled]) =>
      document.body.classList.toggle(name, enabled),
    );
    return () =>
      Object.keys(classes).forEach((name) =>
        document.body.classList.remove(name),
      );
  }, [canAdd, listOpen, searchOpen, tutorialOpen]);

  useLayoutEffect(() => {
    if (!selectedId) return;
    const restaurant = restaurants.find((item) => item.id === selectedId);
    if (restaurant)
      map.adapterRef.current?.panTo(restaurant, { accountForCards: true });
  }, [selectedId, selectionMotion]);

  useEffect(() => {
    if (!ready) return;
    let complete = false;
    try {
      complete = localStorage.getItem(TUTORIAL_STORAGE_KEY) === "complete";
    } catch {
      /* Storage may be blocked. */
    }
    if (
      complete &&
      new URLSearchParams(location.search).get("tutorial") !== "1"
    )
      return;
    const timer = setTimeout(() => {
      setSelectedId(null);
      setSearchOpen(false);
      setListOpen(true);
      setTutorialOpen(true);
    }, 420);
    return () => clearTimeout(timer);
  }, [ready]);

  function closeDialog(restore = true) {
    setDialog((dialog) => ({ ...dialog, open: false }));
    if (restore && !selected) setListOpen(true);
  }
  function closeTutorial() {
    setTutorialOpen(false);
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, "complete");
    } catch {
      /* Closing remains available. */
    }
    document.getElementById("adminButton")?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const outside = (event) => {
      if (!event.target.closest("#authPanel, #adminButton")) setAuthOpen(false);
    };
    const zoom = (event) => {
      if (event.type !== "wheel" || event.ctrlKey) event.preventDefault();
    };
    const keydown = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        ["+", "-", "=", "_", "0"].includes(event.key)
      )
        event.preventDefault();
      if (event.key !== "Escape") return;
      if (tutorialOpen) closeTutorial();
      else if (viewer.restaurantId)
        setViewer((value) => ({ ...value, restaurantId: null }));
      else if (dialog.open) closeDialog();
      else if (searchOpen) setSearchOpen(false);
      else {
        setSelectedId(null);
        setListOpen(true);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keydown);
    for (const event of [
      "gesturestart",
      "gesturechange",
      "gestureend",
      "wheel",
    ])
      document.addEventListener(event, zoom, { passive: false });
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keydown);
      for (const event of [
        "gesturestart",
        "gesturechange",
        "gestureend",
        "wheel",
      ])
        document.removeEventListener(event, zoom);
    };
  }, [tutorialOpen, viewer.restaurantId, dialog.open, searchOpen, selectedId]);

  useEffect(() => {
    if (!canAdd) {
      setDialog({ type: null, open: false, restaurant: null });
      setSelectedId(null);
      setViewer({ restaurantId: null, index: 0 });
    }
  }, [canAdd, auth.user?.id]);

  function openForm(restaurant = null) {
    if (!canAdd || (restaurant && !ownsRestaurant(restaurant))) return;
    setSearchOpen(false);
    setListOpen(false);
    setSelectedId(null);
    setDialog({
      type: "spot",
      open: true,
      restaurant,
    });
  }
  function setActiveFilter(value) {
    closeDialog(false);
    setSelectedId(null);
    setListOpen(true);
    setFilter(value);
  }
  async function saveRestaurant(value, { existing, photos }) {
    if (!canAdd || (existing && !ownsRestaurant(existing))) return;
    try {
      const blobs = new Map();
      for (const photo of photos.slice(0, RESTAURANT_PHOTO_LIMIT))
        if (photo.file)
          blobs.set(photo.id, await prepareRestaurantPhoto(photo.file));
      const saved = await storeRef.current.save(value, {
        isNew: !existing,
        previousRating: existing?.rating,
      });
      saved.photos = normalizeRestaurantPhotos(existing?.photos);
      let failedPhoto = false;
      try {
        const retainedIds = new Set(
          photos.filter((photo) => !photo.file).map((photo) => photo.id),
        );
        for (const photo of saved.photos.filter(
          (photo) => !retainedIds.has(photo.id),
        ))
          await storeRef.current.removeRestaurantPhoto(photo);
        const ordered = [];
        for (const [index, photo] of photos.entries()) {
          ordered.push(
            photo.file
              ? await storeRef.current.addRestaurantPhoto(
                  saved,
                  blobs.get(photo.id),
                  index,
                )
              : photo,
          );
        }
        await storeRef.current.updateRestaurantPhotoOrder(ordered);
        saved.photos = ordered.length
          ? await storeRef.current.restaurantPhotos(saved.id)
          : [];
      } catch {
        failedPhoto = true;
        const records = await storeRef.current.list();
        const fresh = records.find((record) => record.id === saved.id);
        if (!fresh) {
          closeDialog();
          return;
        }
        saved.photos = fresh.photos;
      }
      updateRestaurant(
        {
          ...saved,
          photos: normalizeRestaurantPhotos(saved.photos),
        },
        { isNew: !existing },
      );
      closeDialog(false);
      setListOpen(false);
      setSelectedId(saved.id);
      setSelectionMotion((value) => value + 1);
      if (failedPhoto)
        window.alert(
          "맛집은 저장했지만 일부 사진 변경을 반영하지 못했습니다. 수정 창에서 다시 확인해주세요.",
        );
    } catch (error) {
      console.warn("restaurant save failed", error);
      window.alert(
        error.code === "23505"
          ? "이 그룹에 이미 등록된 맛집입니다"
          : /photo_/.test(error.message)
            ? photoErrorMessage(error)
            : "맛집을 저장하지 못했습니다. 다시 시도해주세요.",
      );
    }
  }
  async function deleteRestaurant(restaurant) {
    if (
      !ownsRestaurant(restaurant) ||
      !window.confirm(`${restaurant.name}을 삭제할까요?`)
    )
      return;
    try {
      await storeRef.current.remove(restaurant.id);
      applyVoteResult({ outcome: "deleted", restaurant_id: restaurant.id });
      setSelectedId(null);
      closeDialog();
      setListOpen(true);
    } catch {
      window.alert("맛집을 삭제하지 못했습니다. Supabase 권한을 확인해주세요.");
    }
  }
  return (
    <>
      <main className="app-shell">
        <section className="map-stage" aria-label="까탈로그 맛집 지도">
          <div
            id="map"
            ref={map.mapHost}
            className="map-host"
            aria-label="지도"
          />
          <div
            id="mockMap"
            ref={map.mockHost}
            className="mock-map hidden"
            aria-label="샘플 지도"
          >
            <div className="river" />
            <div className="road road-a" />
            <div className="road road-b" />
            <div className="road road-c" />
            <div className="road road-d" />
            <div className="road road-e" />
            <div className="district district-1">연남</div>
            <div className="district district-2">성수</div>
            <div className="district district-3">을지로</div>
            <div className="district district-4">논현</div>
            <div id="mockPins" className="mock-pins" ref={map.mockPins} />
          </div>
          <header className="topbar">
            <div className="brand">
              <div className="brand-copy">
                <h1 aria-label="까탈로그">
                  <img
                    className="brand-mark"
                    src={`${import.meta.env.BASE_URL}brand-mark.svg`}
                    alt=""
                  />
                  <span className="brand-wordmark">ccatalog</span>
                </h1>
              </div>
              <div className="brand-actions">
                <button
                  id="addButton"
                  className={`brand-add-button${dialog.open && dialog.type === "spot" ? " is-active" : ""}`}
                  type="button"
                  title="맛집 추가"
                  aria-label="맛집 추가"
                  aria-controls="spotDialog"
                  aria-expanded={dialog.open && dialog.type === "spot"}
                  aria-hidden={!canAdd}
                  tabIndex={canAdd ? 0 : -1}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    dialog.open && dialog.type === "spot"
                      ? closeDialog()
                      : openForm();
                  }}
                >
                  <Plus size={20} aria-hidden="true" />
                </button>
                <button
                  id="adminButton"
                  className={`brand-admin-button${authOpen ? " is-active" : ""}`}
                  type="button"
                  title={isMember ? "내 계정" : "로그인"}
                  aria-label={isMember ? `${memberName(auth)} 계정` : "로그인"}
                  aria-controls="authPanel"
                  aria-expanded={authOpen}
                  onClick={() => {
                    closeDialog();
                    setAuthOpen(!authOpen);
                  }}
                >
                  {isMember ? (
                    <MemberAvatar auth={auth} />
                  ) : (
                    <UserRound size={20} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </header>
          <AccountPanel
            catalog={catalog}
            open={authOpen}
            onClose={() => setAuthOpen(false)}
          />
          <RestaurantList
            restaurants={visibleRestaurants}
            selectedId={selectedId}
            open={listOpen}
            onSelect={onSelect}
            emptyMessage={
              !isMember
                ? "로그인하고 그룹의 맛집을 만나보세요"
                : !auth.groups.length
                  ? "계정에서 그룹을 만들거나 초대 링크로 참여하세요"
                  : undefined
            }
          />
          <FilterDock
            filter={filter}
            query={query}
            searchOpen={searchOpen}
            onFilter={setActiveFilter}
            onQuery={(query) => {
              setQuery(query);
              setSelectedId(null);
              setListOpen(true);
            }}
            onSearch={() => {
              closeDialog(false);
              setSelectedId(null);
              setListOpen(true);
              setSearchOpen(true);
            }}
            onFilterMode={() => {
              closeDialog(false);
              setSelectedId(null);
              setSearchOpen(false);
              setListOpen(true);
            }}
          />
          <RestaurantDetail
            restaurant={
              dialog.type === "discussion" && dialog.open ? null : selected
            }
            catalog={{
              ...catalog,
              onSelectRecord: (id) => {
                setQuery("");
                setFilter("all");
                catalog.setHiddenGroups([]);
                onSelect(id);
              },
            }}
            onEdit={openForm}
            onDelete={deleteRestaurant}
            onDiscussion={(restaurant) => {
              setListOpen(false);
              setSearchOpen(false);
              setAuthOpen(false);
              setDialog({ type: "discussion", open: true, restaurant });
            }}
            onViewPhoto={(restaurantId, index) =>
              setViewer({ restaurantId, index })
            }
          />
        </section>
        {notice && (
          <div className="catalog-notice" role="status">
            {notice}
          </div>
        )}
      </main>
      <RestaurantForm
        open={dialog.type === "spot" && dialog.open}
        restaurant={dialog.type === "spot" ? dialog.restaurant : null}
        groups={auth.groups}
        config={config}
        onSave={saveRestaurant}
        onPlace={(coord) => map.adapterRef.current?.panTo(coord)}
      />
      <DiscussionDialog
        key={`${auth.user?.id}:${dialog.restaurant?.id}`}
        open={dialog.type === "discussion" && dialog.open}
        restaurant={dialog.type === "discussion" ? dialogRestaurant : null}
        userId={auth.user?.id}
        storeRef={storeRef}
        onOutcome={handleVoteOutcome}
        onClose={() => closeDialog()}
      />
      <PhotoViewer
        restaurant={
          restaurants.find((item) => item.id === viewer.restaurantId) ?? null
        }
        index={viewer.index}
        onIndex={(index) => setViewer((value) => ({ ...value, index }))}
        onClose={() => setViewer((value) => ({ ...value, restaurantId: null }))}
      />
      <Tutorial open={tutorialOpen} onClose={closeTutorial} />
    </>
  );
}
