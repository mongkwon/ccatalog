import { useEffect, useRef, useState } from "react";
import { Modal, SearchIcon } from "./common.jsx";
import PhotoImage from "./PhotoImage.jsx";
import { Camera, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  createId,
  DELIVERY_APPS,
  inferCategoryFromPlace,
  normalizeMenuItems,
  normalizeMenuPrice,
  RATING_META,
  RESTAURANT_PHOTO_LIMIT,
} from "../lib/domain.js";
import {
  fetchPlaceCandidates,
  importSharedPlace,
  isNaverSharedText,
  resolvePlaceCoordinate,
} from "../services/places.js";

export default function RestaurantForm({
  open,
  restaurant,
  groups,
  config,
  onSave,
  onPlace,
}) {
  const [name, setName] = useState("");
  const [place, setPlace] = useState(null);
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [category, setCategory] = useState("한식");
  const [rating, setRating] = useState(1);
  const [menus, setMenus] = useState([]);
  const [menuName, setMenuName] = useState("");
  const [menuPrice, setMenuPrice] = useState("");
  const [delivery, setDelivery] = useState([]);
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState([]);
  const previewUrls = useRef(new Set());
  const photoStrip = useRef(null);
  const [busy, setBusy] = useState(false);
  const nameInput = useRef(null);
  const draftInput = useRef(null);
  const search = useRef(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const [groupId, setGroupId] = useState("");
  useEffect(() => {
    if (open && !restaurant && !groups.some((group) => group.id === groupId))
      setGroupId(groups[0]?.id || "");
  }, [open, restaurant, groups, groupId]);
  useEffect(() => {
    ++generation.current;
    search.current?.abort();
    if (!open) return;
    setName(restaurant?.name ?? "");
    setGroupId(restaurant?.groupId || groups[0]?.id || "");
    setPlace(
      restaurant
        ? {
            name: restaurant.name,
            area: restaurant.area,
            lat: restaurant.lat,
            lng: restaurant.lng,
            sourceLink: "",
          }
        : null,
    );
    setResults([]);
    setMessage("");
    setSearchBusy(false);
    setCategory(restaurant?.category ?? "한식");
    setRating(restaurant?.rating ?? 1);
    setMenus(restaurant?.menuItems ?? []);
    setMenuName("");
    setMenuPrice("");
    setDelivery(restaurant?.deliveryApps ?? []);
    setMemo(restaurant?.memo ?? "");
    setPhotos(restaurant?.photos ?? []);
    const timer = setTimeout(() => nameInput.current?.focus(), 30);
    return () => {
      clearTimeout(timer);
      search.current?.abort();
      ++generation.current;
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    };
  }, [open, restaurant]);

  async function searchPlaces(value = name) {
    const importing = isNaverSharedText(value);
    if (value.trim().length < 2) {
      setMessage("두 글자 이상 입력해주세요");
      return;
    }
    search.current?.abort();
    const controller = new AbortController();
    search.current = controller;
    const revision = ++generation.current;
    setSearchBusy(true);
    setMessage(importing ? "링크의 장소를 확인하고 있습니다" : "검색 중");
    setResults([]);
    if (importing) setPlace(null);
    try {
      const result = importing
        ? await importSharedPlace(value, config, controller.signal)
        : {
            items: await fetchPlaceCandidates(
              value.trim(),
              config,
              controller.signal,
            ),
          };
      const candidates = result.items;
      if (revision !== generation.current) return;
      if (importing && result.verified && candidates.length === 1) {
        selectPlace(candidates[0]);
        return;
      }
      if (importing) setName(result.query || "");
      setResults(candidates);
      setMessage(
        importing
          ? candidates.length
            ? "가져올 식당을 선택해주세요"
            : "링크에서 장소를 확인하지 못했습니다. 식당명으로 검색해주세요."
          : candidates.length
            ? ""
            : "검색 결과가 없습니다",
      );
    } catch (error) {
      if (error.name !== "AbortError" && revision === generation.current)
        setMessage(
          importing
            ? "링크를 확인하지 못했습니다. 식당명으로 검색해주세요."
            : "장소 검색 설정이 필요합니다",
        );
    } finally {
      if (revision === generation.current) setSearchBusy(false);
    }
  }
  function selectPlace(candidate) {
    const coord = resolvePlaceCoordinate(candidate);
    if (!coord) {
      setMessage("좌표를 확인할 수 없습니다. 다른 결과를 선택해주세요");
      return;
    }
    setName(candidate.name);
    setPlace({
      name: candidate.name,
      area: candidate.roadAddress || candidate.address || "",
      ...coord,
      sourceLink: candidate.link || "",
    });
    setCategory(inferCategoryFromPlace(candidate.category));
    setResults([]);
    setMessage("");
    onPlace(coord);
  }
  function addMenu() {
    if (!menuName.trim()) {
      draftInput.current?.focus();
      return;
    }
    const next = normalizeMenuItems([
      ...menus,
      { name: menuName.trim(), price: menuPrice },
    ]);
    setMenus(next);
    setMenuName("");
    setMenuPrice("");
    draftInput.current?.focus();
  }
  async function submit(event) {
    event.preventDefault();
    if (saving.current || !open) return;
    if (!groups.some((group) => group.id === groupId)) return;
    if (!place || name.trim() !== place.name) {
      setMessage("장소 검색 결과에서 식당을 선택해주세요");
      nameInput.current?.focus();
      return;
    }
    const menuItems = normalizeMenuItems(
      menuName.trim()
        ? [...menus, { name: menuName, price: menuPrice }]
        : menus,
    );
    const value = {
      id: restaurant?.id || createId(),
      groupId,
      name: place.name,
      area: place.area,
      lat: place.lat,
      lng: place.lng,
      category,
      rating,
      menuItems,
      deliveryApps: delivery,
      memo: memo.trim(),
    };
    saving.current = true;
    setBusy(true);
    try {
      await onSave(value, { existing: restaurant, place, photos });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const draftEnter = (event) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      addMenu();
    }
  };
  return (
    <Modal id="spotDialog" labelId="spotDialogTitle" open={open}>
      <form id="spotForm" className="modal-card" onSubmit={submit}>
        <div className="modal-header">
          <h2 id="spotDialogTitle">{restaurant ? "맛집 수정" : "맛집 추가"}</h2>
        </div>
        <div className="spot-form-body">
          <div className="form-grid">
            <label className="field span-2">
              <span>그룹</span>
              <select
                aria-label="등록할 그룹"
                value={groupId}
                disabled={Boolean(restaurant)}
                onChange={(event) => setGroupId(event.target.value)}
                required
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field span-2 place-field">
              <label htmlFor="nameInput">이름</label>
              <div className="place-entry">
                <input
                  ref={nameInput}
                  id="nameInput"
                  name="name"
                  type="text"
                  required
                  maxLength={2048}
                  placeholder="식당명 또는 네이버지도 공유 링크"
                  autoComplete="off"
                  enterKeyHint="search"
                  value={name}
                  onPaste={(event) => {
                    const text = event.clipboardData.getData("text/plain");
                    if (!isNaverSharedText(text)) return;
                    event.preventDefault();
                    setName(text.slice(0, 2048));
                    searchPlaces(text);
                  }}
                  onChange={(event) => {
                    search.current?.abort();
                    ++generation.current;
                    setSearchBusy(false);
                    setName(event.target.value);
                    setPlace(null);
                    setResults([]);
                    setMessage("");
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      searchPlaces();
                    }
                  }}
                />
                <button
                  id="placeSearchButton"
                  className="place-search-button"
                  type="button"
                  aria-label="장소 검색"
                  disabled={searchBusy || busy}
                  onClick={() => searchPlaces()}
                >
                  <SearchIcon />
                </button>
              </div>
              <div
                id="placeResultList"
                className={`place-result-list${message || results.length ? "" : " hidden"}`}
                aria-live="polite"
              >
                {message && (
                  <div className="place-result-message">{message}</div>
                )}
                {results.map((candidate, index) => (
                  <button
                    key={`${candidate.name}-${index}`}
                    className="place-result"
                    type="button"
                    onClick={() => selectPlace(candidate)}
                  >
                    <strong>{candidate.name}</strong>
                    <span>
                      {[
                        candidate.category,
                        candidate.roadAddress || candidate.address,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <label className="field span-2">
              <span>분류</span>
              <select
                id="categoryInput"
                name="category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {[
                  "한식",
                  "일식",
                  "중식",
                  "양식",
                  "분식",
                  "카페",
                  "바",
                  "기타",
                ].map((label) => (
                  <option key={label}>{label}</option>
                ))}
              </select>
            </label>
            <fieldset className="rating-field span-2">
              <legend>등급</legend>
              {Object.entries(RATING_META).map(([value, meta]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="rating"
                    aria-label={meta.label}
                    value={value}
                    checked={rating === Number(value)}
                    onChange={() => setRating(Number(value))}
                  />
                  <span
                    className="rating-option-emoji"
                    title={meta.label}
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="menu-field span-2">
              <span>추천메뉴</span>
              <div className="menu-entry">
                <input
                  ref={draftInput}
                  id="menuDraftInput"
                  type="text"
                  maxLength={40}
                  placeholder="메뉴명"
                  autoComplete="off"
                  value={menuName}
                  onChange={(event) => setMenuName(event.target.value)}
                  onKeyDown={draftEnter}
                />
                <input
                  id="menuPriceDraftInput"
                  className="menu-price-draft"
                  type="text"
                  inputMode="numeric"
                  maxLength={18}
                  placeholder="가격"
                  autoComplete="off"
                  value={menuPrice}
                  onChange={(event) => setMenuPrice(event.target.value)}
                  onKeyDown={draftEnter}
                />
                <button
                  id="addMenuButton"
                  className="menu-add-button"
                  type="button"
                  aria-label="메뉴 추가"
                  onClick={addMenu}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              <div
                id="menuInputList"
                className="menu-input-list"
                aria-label="추가된 추천메뉴"
              >
                {menus.map((item) => (
                  <span className="menu-input-chip" key={item.name}>
                    <span>{item.name}</span>
                    <span className="menu-input-price">
                      {normalizeMenuPrice(item.price) || "가격 미입력"}
                    </span>
                    <button
                      type="button"
                      aria-label={`${item.name} 삭제`}
                      onClick={() => {
                        setMenus(
                          menus.filter((menu) => menu.name !== item.name),
                        );
                        draftInput.current?.focus();
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <fieldset className="delivery-field span-2">
              <legend>배달가능여부</legend>
              {DELIVERY_APPS.map((app) => (
                <label key={app.id}>
                  <input
                    type="checkbox"
                    name="deliveryApps"
                    value={app.id}
                    checked={delivery.includes(app.id)}
                    onChange={(event) =>
                      setDelivery(
                        event.target.checked
                          ? [...delivery, app.id]
                          : delivery.filter((id) => id !== app.id),
                      )
                    }
                  />
                  <span>{app.label}</span>
                </label>
              ))}
            </fieldset>
            <label className="field span-2">
              <span>메모</span>
              <textarea
                id="memoInput"
                name="memo"
                rows={2}
                maxLength={180}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </label>
          </div>
          {!!photos.length && (
            <div
              ref={photoStrip}
              className="form-photos"
              aria-label="맛집 사진"
            >
              {photos.map((photo, index) => (
                <div className="form-photo-item" key={photo.id}>
                  <PhotoImage photo={photo} alt={`사진 ${index + 1}`} />
                  <div className="form-photo-actions">
                    <button
                      type="button"
                      title="앞으로"
                      aria-label="사진 앞으로 이동"
                      disabled={busy || index === 0}
                      onClick={() =>
                        setPhotos((current) => {
                          const next = [...current];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          return next;
                        })
                      }
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      title="뒤로"
                      aria-label="사진 뒤로 이동"
                      disabled={busy || index === photos.length - 1}
                      onClick={() =>
                        setPhotos((current) => {
                          const next = [...current];
                          [next[index], next[index + 1]] = [
                            next[index + 1],
                            next[index],
                          ];
                          return next;
                        })
                      }
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      type="button"
                      title="삭제"
                      aria-label={`사진 ${index + 1} 삭제`}
                      disabled={busy}
                      onClick={() => {
                        if (photo.file) {
                          URL.revokeObjectURL(photo.url);
                          previewUrls.current.delete(photo.url);
                        }
                        setPhotos((current) =>
                          current.filter((item) => item.id !== photo.id),
                        );
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <label
            className={`spot-photo-button${photos.length ? " has-selection" : ""}${busy || photos.length >= RESTAURANT_PHOTO_LIMIT ? " is-disabled" : ""}`}
            htmlFor="spotPhotoInput"
          >
            <Camera size={18} />
            <span>
              사진 {photos.length}/{RESTAURANT_PHOTO_LIMIT}
            </span>
          </label>
          <input
            id="spotPhotoInput"
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            disabled={busy || photos.length >= RESTAURANT_PHOTO_LIMIT}
            onChange={(event) => {
              const added = [...event.target.files]
                .slice(0, RESTAURANT_PHOTO_LIMIT - photos.length)
                .map((file) => {
                  const url = URL.createObjectURL(file);
                  previewUrls.current.add(url);
                  return { id: createId(), file, url };
                });
              setPhotos((current) => [...current, ...added]);
              requestAnimationFrame(() =>
                photoStrip.current?.scrollIntoView({ block: "nearest" }),
              );
              event.target.value = "";
            }}
          />
          <button
            id="spotSubmitButton"
            className="primary-button"
            type="submit"
            disabled={busy || searchBusy}
          >
            {busy ? "저장 중" : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
