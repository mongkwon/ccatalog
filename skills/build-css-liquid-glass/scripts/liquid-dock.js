/**
 * Pointer-safe controller for a CSS liquid-glass segmented dock.
 * The application owns selection state; this module owns preview and drag state.
 */

export function createLiquidDock(root, options = {}) {
  if (!root) throw new TypeError("A dock root element is required");

  const buttonSelector = options.buttonSelector ?? ".liquid-dock__item";
  const indicatorSelector = options.indicatorSelector ?? ".liquid-dock__indicator";
  const activeClass = options.activeClass ?? "is-active";
  const previewClass = options.previewClass ?? "is-preview";
  const dragThreshold = options.dragThreshold ?? 6;
  const verticalBias = options.verticalBias ?? 4;
  const indicator = root.querySelector(indicatorSelector);

  if (!indicator) throw new Error(`Dock indicator not found: ${indicatorSelector}`);

  const state = {
    activeIndex: normalizeIndex(options.initialIndex ?? findActiveIndex()),
    previewIndex: -1,
    pointerId: null,
    pressIndex: -1,
    startX: 0,
    startY: 0,
    dragging: false,
    suppressClick: false,
    suppressTimer: null,
  };

  function buttons() {
    return [...root.querySelectorAll(buttonSelector)];
  }

  function findActiveIndex() {
    return buttons().findIndex((button) => button.classList.contains(activeClass));
  }

  function normalizeIndex(index) {
    const count = buttons().length;
    if (!count) return -1;
    const numericIndex = Number(index);
    return Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < count ? numericIndex : 0;
  }

  function alignToIndex(index) {
    const button = buttons()[index];
    if (!button) {
      root.style.setProperty("--liquid-dock-opacity", "0");
      return;
    }
    root.style.setProperty("--liquid-dock-x", `${button.offsetLeft}px`);
    root.style.setProperty("--liquid-dock-width", `${button.offsetWidth}px`);
    root.style.setProperty("--liquid-dock-opacity", "1");
  }

  function setPreview(index) {
    if (state.previewIndex === index) return;
    state.previewIndex = index;
    buttons().forEach((button, buttonIndex) => {
      button.classList.toggle(previewClass, buttonIndex === index);
    });
  }

  function setActive(index, { notify = false } = {}) {
    const nextIndex = normalizeIndex(index);
    if (nextIndex < 0) return;
    state.activeIndex = nextIndex;
    const dockButtons = buttons();
    dockButtons.forEach((button, buttonIndex) => {
      const active = buttonIndex === nextIndex;
      button.classList.toggle(activeClass, active);
      button.setAttribute("aria-pressed", String(active));
    });
    alignToIndex(nextIndex);

    if (notify) {
      const button = dockButtons[nextIndex];
      const detail = { index: nextIndex, value: button?.dataset.value, button };
      options.onCommit?.(detail);
      root.dispatchEvent(new CustomEvent("liquidglasschange", { bubbles: true, detail }));
    }
  }

  function nearestIndex(clientX) {
    let result = -1;
    let minimum = Infinity;
    buttons().forEach((button, index) => {
      const rect = button.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - clientX);
      if (distance < minimum) {
        minimum = distance;
        result = index;
      }
    });
    return result;
  }

  function eventIndex(event) {
    const button = event.target.closest?.(buttonSelector);
    if (button && root.contains(button)) return buttons().indexOf(button);
    return nearestIndex(event.clientX);
  }

  function moveIndicator(clientX) {
    const dockButtons = buttons();
    const index = nearestIndex(clientX);
    if (index < 0) return;
    setPreview(index);

    const dockRect = root.getBoundingClientRect();
    const width = dockButtons[index].offsetWidth;
    const firstX = dockButtons[0].offsetLeft;
    const last = dockButtons[dockButtons.length - 1];
    const maximumX = last.offsetLeft + last.offsetWidth - width;
    const nextX = Math.max(firstX, Math.min(maximumX, clientX - dockRect.left - width / 2));
    root.style.setProperty("--liquid-dock-x", `${nextX}px`);
    root.style.setProperty("--liquid-dock-width", `${width}px`);
    root.style.setProperty("--liquid-dock-opacity", "1");
  }

  function finish(event) {
    if (state.pointerId !== null && root.hasPointerCapture?.(state.pointerId)) {
      root.releasePointerCapture(state.pointerId);
    }
    state.pointerId = null;
    state.pressIndex = -1;
    state.dragging = false;
    setPreview(-1);
    root.classList.remove("is-pressing", "is-dragging");
  }

  function cancel(event) {
    if (event?.pointerId != null && event.pointerId !== state.pointerId) return;
    finish(event);
    alignToIndex(state.activeIndex);
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const index = eventIndex(event);
    if (index < 0) return;
    state.pointerId = event.pointerId;
    state.pressIndex = index;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.dragging = false;
    setPreview(index);
    alignToIndex(index);
    root.classList.add("is-pressing");
    root.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (event.pointerId !== state.pointerId) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (!state.dragging) {
      if (Math.hypot(deltaX, deltaY) < dragThreshold) return;
      if (Math.abs(deltaY) > Math.abs(deltaX) + verticalBias) {
        cancel(event);
        return;
      }
      state.dragging = true;
      root.classList.add("is-dragging");
    }
    event.preventDefault();
    moveIndicator(event.clientX);
  }

  function onPointerUp(event) {
    if (event.pointerId !== state.pointerId) return;
    const finalIndex = nearestIndex(event.clientX);
    finish(event);
    if (finalIndex < 0) return;
    event.preventDefault();
    state.suppressClick = true;
    window.clearTimeout(state.suppressTimer);
    state.suppressTimer = window.setTimeout(() => {
      state.suppressClick = false;
    }, 120);
    setActive(finalIndex, { notify: true });
  }

  function onClickCapture(event) {
    if (state.suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.suppressClick = false;
      return;
    }
    const index = eventIndex(event);
    if (index >= 0) setActive(index, { notify: true });
  }

  function realign() {
    alignToIndex(state.activeIndex);
  }

  function destroy() {
    window.clearTimeout(state.suppressTimer);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerUp);
    root.removeEventListener("pointercancel", cancel);
    root.removeEventListener("lostpointercapture", cancel);
    root.removeEventListener("click", onClickCapture, true);
    window.removeEventListener("resize", realign);
    finish();
  }

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", cancel);
  root.addEventListener("lostpointercapture", cancel);
  root.addEventListener("click", onClickCapture, true);
  window.addEventListener("resize", realign, { passive: true });
  setActive(state.activeIndex);

  return { destroy, realign, setActive };
}
