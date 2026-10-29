import { useEffect, useLayoutEffect, useRef } from "react";
import { SearchIcon } from "./common.jsx";

const filters = [
  ["all", "전체"],
  ["1", "동메달"],
  ["2", "은메달"],
  ["3", "금메달"],
];

export default function FilterDock({
  filter,
  query,
  onFilter,
  onQuery,
  searchOpen,
  onSearch,
  onFilterMode,
}) {
  const dock = useRef(null);
  const input = useRef(null);
  const current = useRef({ filter, onFilter, searchOpen });
  current.current = { filter, onFilter, searchOpen };
  const drag = useRef({ pointerId: null, suppressClick: false });
  const previousSearch = useRef(searchOpen);
  const settlingUntil = useRef(0);

  const buttons = () => [
    ...dock.current.querySelectorAll(".dock-filter-button"),
  ];
  const align = (index) => {
    const button = buttons()[index];
    if (!button) return;
    dock.current.style.setProperty(
      "--dock-indicator-x",
      `${button.offsetLeft}px`,
    );
    dock.current.style.setProperty(
      "--dock-indicator-width",
      `${button.offsetWidth}px`,
    );
    dock.current.style.setProperty("--dock-indicator-opacity", "1");
  };

  useLayoutEffect(() => {
    if (previousSearch.current && !searchOpen)
      settlingUntil.current = Date.now() + 530;
    previousSearch.current = searchOpen;
    const update = () => {
      if (current.current.searchOpen) return;
      if (Date.now() < settlingUntil.current) return;
      align(filters.findIndex(([value]) => value === current.current.filter));
    };
    if (searchOpen)
      dock.current.style.setProperty("--dock-indicator-opacity", "0");
    else {
      dock.current.style.setProperty("--dock-indicator-opacity", "0");
    }
    const timer = setTimeout(update, searchOpen ? 0 : 540);
    if (!searchOpen) update();
    const observer = new ResizeObserver(() => {
      if (!current.current.searchOpen) update();
    });
    observer.observe(dock.current);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [filter, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => input.current?.focus(), 340);
    return () => clearTimeout(timer);
  }, [searchOpen]);

  function nearest(clientX) {
    return buttons().reduce(
      (best, button, index) => {
        const rect = button.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - clientX);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: -1, distance: Infinity },
    ).index;
  }
  function preview(index) {
    buttons().forEach((button, i) =>
      button.classList.toggle("is-preview", i === index),
    );
  }
  function finish() {
    const pointerId = drag.current.pointerId;
    drag.current.pointerId = null;
    if (pointerId !== null && dock.current.hasPointerCapture(pointerId))
      dock.current.releasePointerCapture(pointerId);
    dock.current.classList.remove("is-pressing", "is-dragging");
    preview(-1);
  }
  function cancel(event) {
    if (event.pointerId !== drag.current.pointerId) return;
    finish();
    align(filters.findIndex(([value]) => value === filter));
  }
  function pointerDown(event) {
    if (
      searchOpen ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      drag.current.pointerId !== null
    )
      return;
    const index = nearest(event.clientX);
    if (index < 0) return;
    drag.current = {
      ...drag.current,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    preview(index);
    align(index);
    dock.current.classList.add("is-pressing");
    dock.current.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    const state = drag.current;
    if (state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.dragging) {
      if (Math.hypot(dx, dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx) + 4) {
        cancel(event);
        return;
      }
      state.dragging = true;
      dock.current.classList.add("is-dragging");
    }
    event.preventDefault();
    const index = nearest(event.clientX);
    preview(index);
    const items = buttons();
    const width = items[index].offsetWidth;
    const last = items.at(-1);
    const x = Math.max(
      items[0].offsetLeft,
      Math.min(
        last.offsetLeft + last.offsetWidth - width,
        event.clientX - dock.current.getBoundingClientRect().left - width / 2,
      ),
    );
    dock.current.style.setProperty("--dock-indicator-x", `${x}px`);
    dock.current.style.setProperty("--dock-indicator-width", `${width}px`);
  }
  function pointerUp(event) {
    if (event.pointerId !== drag.current.pointerId) return;
    const index = nearest(event.clientX);
    finish();
    event.preventDefault();
    drag.current.suppressClick = true;
    align(index);
    onFilter(filters[index][0]);
  }

  return (
    <div className={`dock-cluster${searchOpen ? " is-search-mode" : ""}`}>
      <nav
        ref={dock}
        className="bottom-dock"
        aria-label="등급 필터"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onClickCapture={(event) => {
          if (drag.current.suppressClick && event.detail !== 0) {
            drag.current.suppressClick = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <span className="dock-indicator" aria-hidden="true" />
        <button
          id="filterModeButton"
          className="dock-mode-button"
          type="button"
          title="필터"
          aria-label="필터 보기"
          aria-controls="restaurantPanel"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onFilterMode}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h7M15 17h5" />
            <path d="M14 5v4M8 10v4M13 15v4" />
          </svg>
        </button>
        {filters.map(([value, label]) => (
          <button
            key={value}
            className={`dock-filter-button${filter === value ? " is-active" : ""}`}
            type="button"
            data-filter={value}
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div
        id="searchPanel"
        className={`search-panel${searchOpen ? " is-open" : ""}`}
        role="search"
        aria-label="맛집 검색"
      >
        <button
          id="searchToggle"
          className="dock-search-button"
          type="button"
          title="검색"
          aria-label="검색"
          aria-controls="searchInput"
          aria-expanded={searchOpen}
          tabIndex={searchOpen ? -1 : 0}
          onClick={onSearch}
        >
          <SearchIcon />
        </button>
        <div
          className="search-row"
          aria-hidden={!searchOpen}
          inert={!searchOpen}
        >
          <SearchIcon />
          <input
            ref={input}
            id="searchInput"
            type="search"
            placeholder="맛집, 동네, 메뉴"
            autoComplete="off"
            tabIndex={searchOpen ? 0 : -1}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
