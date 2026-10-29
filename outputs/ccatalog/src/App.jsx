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
  modeLabel,
} from "./components/AccountPanel.jsx";
import FilterDock from "./components/FilterDock.jsx";
import { RestaurantList, RestaurantDetail } from "./components/Restaurants.jsx";
import RestaurantForm from "./components/RestaurantForm.jsx";
import { PhotoManager, PhotoViewer } from "./components/PhotoDialogs.jsx";
import ProposalReview from "./components/ProposalReview.jsx";
import Tutorial from "./components/Tutorial.jsx";
import {
  deliveryLabels,
  normalizeRestaurantPhotos,
  proposalErrorMessage,
  RESTAURANT_PHOTO_LIMIT,
  TUTORIAL_STORAGE_KEY,
} from "./lib/domain.js";
import { prepareRestaurantPhoto } from "./lib/photos.js";

export default function App() {
  const catalog = useCatalog();
  const {
    restaurants,
    setRestaurants,
    auth,
    mode,
    setMode,
    isMember,
    isAdmin,
    isCatalist,
    ready,
    config,
    storeRef,
    syncAuth,
    updateRestaurant,
  } = catalog;
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
  const dialogRestaurant =
    restaurants.find((restaurant) => restaurant.id === dialog.restaurant?.id) ||
    dialog.restaurant;
  const visibleRestaurants = useMemo(() => {
    const search = query.trim().toLowerCase();
    return restaurants
      .filter(
        (restaurant) =>
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
  }, [restaurants, query, filter]);
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
    visitedIds: auth.visitedRestaurantIds,
    onSelect,
  });
  useLayoutEffect(() => {
    const classes = {
      "has-add-access": isAdmin || isCatalist,
      "is-admin-mode": isAdmin,
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
  }, [isAdmin, isCatalist, listOpen, searchOpen, tutorialOpen]);

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
    if (restore && !selectedId) setListOpen(true);
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
    if (!isAdmin && !isCatalist) closeDialog();
    else if (!isAdmin && ["photos", "review"].includes(dialog.type))
      closeDialog();
  }, [isAdmin, isCatalist]);

  function openForm(restaurant = null) {
    if (!isAdmin && !isCatalist) return;
    setSearchOpen(false);
    setListOpen(false);
    setSelectedId(null);
    setDialog({
      type: "spot",
      open: true,
      restaurant,
      mode: isAdmin ? "restaurant" : "proposal",
    });
  }
  function setAccountMode(value) {
    if (auth.isAdmin) {
      closeDialog();
      setMode(value);
    }
  }
  function setActiveFilter(value) {
    closeDialog(false);
    setSelectedId(null);
    setListOpen(true);
    setFilter(value);
  }
  async function saveRestaurant(value, { existing, mode, place, files }) {
    const proposal = mode === "proposal";
    if (proposal ? !isCatalist : !isAdmin) return;
    try {
      if (proposal) {
        await storeRef.current.submitRestaurantProposal(value, place);
        await syncAuth();
        closeDialog();
        setAuthOpen(true);
        return;
      }
      const blobs = [];
      for (const file of files.slice(0, RESTAURANT_PHOTO_LIMIT))
        blobs.push(await prepareRestaurantPhoto(file));
      const saved = await storeRef.current.save(value, { isNew: !existing });
      saved.photos = normalizeRestaurantPhotos(existing?.photos);
      let failedPhoto = false;
      for (const blob of blobs) {
        try {
          saved.photos.push(
            await storeRef.current.addRestaurantPhoto(
              saved,
              blob,
              saved.photos.length,
            ),
          );
        } catch {
          failedPhoto = true;
          break;
        }
      }
      updateRestaurant({
        ...saved,
        photos: normalizeRestaurantPhotos(saved.photos),
      });
      closeDialog(false);
      setListOpen(false);
      setSelectedId(saved.id);
      setSelectionMotion((value) => value + 1);
      if (failedPhoto)
        window.alert(
          "맛집은 저장했지만 일부 사진을 올리지 못했습니다. 상세창의 사진 버튼에서 다시 추가해주세요.",
        );
    } catch (error) {
      console.warn("restaurant save failed", error);
      window.alert(
        proposal
          ? proposalErrorMessage(error)
          : "맛집을 저장하지 못했습니다. Supabase 설정과 권한을 확인해주세요.",
      );
    }
  }
  async function deleteRestaurant(restaurant) {
    if (!isAdmin || !window.confirm(`${restaurant.name}을 삭제할까요?`)) return;
    try {
      await storeRef.current.remove(restaurant.id);
      setRestaurants((records) =>
        records.filter((item) => item.id !== restaurant.id),
      );
      setSelectedId(null);
      closeDialog();
      setListOpen(true);
    } catch {
      window.alert("맛집을 삭제하지 못했습니다. Supabase 권한을 확인해주세요.");
    }
  }
  const label = !isMember
    ? "로그인"
    : auth.isAdmin
      ? modeLabel(mode)
      : auth.profile?.is_catalist
        ? "까탈리스트"
        : "회원";
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
                  id="adminButton"
                  className={`brand-admin-button${authOpen ? " is-active" : ""}`}
                  type="button"
                  title={isMember ? "내 계정" : "로그인"}
                  aria-label={isMember ? `${memberName(auth)} 계정` : "로그인"}
                  aria-controls="authPanel"
                  aria-expanded={authOpen}
                  onClick={() => setAuthOpen(!authOpen)}
                >
                  {label}
                </button>
                <button
                  id="addButton"
                  className={`brand-add-button${dialog.open && dialog.type === "spot" ? " is-active" : ""}`}
                  type="button"
                  title={isAdmin ? "맛집 추가" : "맛집 건의"}
                  aria-label={isAdmin ? "맛집 추가" : "맛집 건의"}
                  aria-controls="spotDialog"
                  aria-expanded={dialog.open && dialog.type === "spot"}
                  aria-hidden={!(isAdmin || isCatalist)}
                  tabIndex={isAdmin || isCatalist ? 0 : -1}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    dialog.open && dialog.type === "spot"
                      ? closeDialog()
                      : openForm();
                  }}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
            </div>
          </header>
          <AccountPanel
            catalog={catalog}
            open={authOpen}
            onClose={() => setAuthOpen(false)}
            onMode={setAccountMode}
            onReview={() => {
              setAuthOpen(false);
              setSearchOpen(false);
              setListOpen(false);
              setDialog({ type: "review", open: true });
            }}
          />
          <RestaurantList
            restaurants={visibleRestaurants}
            selectedId={selectedId}
            open={listOpen}
            onSelect={onSelect}
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
            restaurant={selected}
            catalog={catalog}
            userLocation={map.userLocation}
            onLocation={map.setUserLocation}
            onLogin={() => setAuthOpen(true)}
            onEdit={openForm}
            onDelete={deleteRestaurant}
            onPhotos={(restaurant) => {
              setSearchOpen(false);
              setListOpen(false);
              setAuthOpen(false);
              setDialog({ type: "photos", open: true, restaurant });
            }}
            onViewPhoto={(restaurantId, index) =>
              setViewer({ restaurantId, index })
            }
          />
        </section>
      </main>
      <RestaurantForm
        open={dialog.type === "spot" && dialog.open}
        restaurant={dialog.type === "spot" ? dialog.restaurant : null}
        mode={dialog.mode}
        config={config}
        onSave={saveRestaurant}
        onPlace={(coord) => map.adapterRef.current?.panTo(coord)}
      />
      <PhotoManager
        open={dialog.type === "photos" && dialog.open}
        restaurant={dialog.type === "photos" ? dialogRestaurant : null}
        storeRef={storeRef}
        onUpdate={updateRestaurant}
        onClose={() => closeDialog()}
        canEdit={isAdmin}
      />
      <PhotoViewer
        restaurant={
          restaurants.find((item) => item.id === viewer.restaurantId) ?? null
        }
        index={viewer.index}
        onIndex={(index) => setViewer((value) => ({ ...value, index }))}
        onClose={() => setViewer((value) => ({ ...value, restaurantId: null }))}
      />
      <ProposalReview
        open={dialog.type === "review" && dialog.open}
        catalog={catalog}
        onClose={() => closeDialog()}
      />
      <Tutorial open={tutorialOpen} onClose={closeTutorial} />
    </>
  );
}
