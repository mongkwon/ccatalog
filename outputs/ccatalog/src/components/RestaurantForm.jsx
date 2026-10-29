import { useEffect, useRef, useState } from "react";
import { Modal, SearchIcon } from "./common.jsx";
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
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const nameInput = useRef(null);
  const draftInput = useRef(null);
  const search = useRef(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const [groupId, setGroupId] = useState("");
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
    setFiles([]);
    const timer = setTimeout(() => nameInput.current?.focus(), 30);
    return () => {
      clearTimeout(timer);
      search.current?.abort();
      ++generation.current;
    };
  }, [open, restaurant]);

  async function searchPlaces() {
    if (name.trim().length < 2) {
      setMessage("두 글자 이상 입력해주세요");
      return;
    }
    search.current?.abort();
    const controller = new AbortController();
    search.current = controller;
    const revision = ++generation.current;
    setSearchBusy(true);
    setMessage("검색 중");
    setResults([]);
    try {
      const candidates = await fetchPlaceCandidates(
        name.trim(),
        config,
        controller.signal,
      );
      if (revision !== generation.current) return;
      setResults(candidates);
      setMessage(candidates.length ? "" : "검색 결과가 없습니다");
    } catch (error) {
      if (error.name !== "AbortError" && revision === generation.current)
        setMessage("장소 검색 설정이 필요합니다");
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
      await onSave(value, { existing: restaurant, place, files });
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
                maxLength={40}
                autoComplete="off"
                enterKeyHint="search"
                value={name}
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
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
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
                onClick={searchPlaces}
              >
                <SearchIcon />
              </button>
            </div>
            <div
              id="placeResultList"
              className={`place-result-list${message || results.length ? "" : " hidden"}`}
              aria-live="polite"
            >
              {message && <div className="place-result-message">{message}</div>}
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
          <fieldset
            className="rating-field span-2"
            disabled={Boolean(restaurant)}
          >
            <legend>등급</legend>
            {Object.entries(RATING_META).map(([value, meta]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={rating === Number(value)}
                  onChange={() => setRating(Number(value))}
                />
                <span>{meta.label}</span>
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
                      setMenus(menus.filter((menu) => menu.name !== item.name));
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
        <div className="modal-actions">
          {!restaurant && (
            <>
              <label
                className={`spot-photo-button${files.length ? " has-selection" : ""}`}
                htmlFor="spotPhotoInput"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2h5Z" />
                  <circle cx="12" cy="12.5" r="3.5" />
                </svg>
                <span>{files.length ? `사진 ${files.length}장` : "사진"}</span>
              </label>
              <input
                id="spotPhotoInput"
                className="visually-hidden"
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                onChange={(event) =>
                  setFiles(
                    [...event.target.files].slice(0, RESTAURANT_PHOTO_LIMIT),
                  )
                }
              />
            </>
          )}
          <button
            id="spotSubmitButton"
            className="primary-button"
            type="submit"
            disabled={busy}
          >
            {busy ? "저장 중" : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
