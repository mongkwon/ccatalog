# CSS Liquid Glass Implementation

## Surface tokens

Start with neutral tokens and tune them against the actual background. A glass surface needs visible detail behind it.

```css
:root {
  --lg-ink: #111820;
  --lg-surface: rgb(245 247 250 / 28%);
  --lg-surface-fallback: rgb(245 247 250 / 88%);
  --lg-lens: rgb(234 237 242 / 50%);
  --lg-lens-active: rgb(255 255 255 / 16%);
  --lg-edge: rgb(17 24 32 / 9%);
  --lg-edge-active: rgb(255 255 255 / 62%);
  --lg-lift: 0 1px 0 rgb(17 24 32 / 4%);
  --lg-morph: 520ms cubic-bezier(0.24, 0.58, 0.24, 1);
  --lg-response: 180ms cubic-bezier(0.18, 0.92, 0.22, 1);
}

.glass-surface {
  border: 1px solid var(--lg-edge);
  background: var(--lg-surface-fallback);
  box-shadow: var(--lg-lift);
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-surface {
    background: var(--lg-surface);
    backdrop-filter: blur(28px) saturate(1.7) contrast(1.04);
    -webkit-backdrop-filter: blur(28px) saturate(1.7) contrast(1.04);
  }
}
```

Do not add a white sheen pseudo-element by default. If the background is too flat for the glass to read, improve the background or edge contrast instead of adding a large highlight gradient.

## Segmented dock markup

Keep the indicator separate from labels so blur and transparency never reduce text legibility.

```html
<nav class="liquid-dock glass-surface" aria-label="결과 필터">
  <span class="liquid-dock__indicator" aria-hidden="true"></span>
  <button class="liquid-dock__item is-active" data-value="all" type="button">전체</button>
  <button class="liquid-dock__item" data-value="bronze" type="button">동메달</button>
  <button class="liquid-dock__item" data-value="silver" type="button">은메달</button>
  <button class="liquid-dock__item" data-value="gold" type="button">금메달</button>
</nav>
```

## Segmented dock CSS

```css
.liquid-dock {
  --liquid-dock-x: 7px;
  --liquid-dock-width: 76px;
  --liquid-dock-opacity: 1;
  --liquid-dock-scale-x: 1;
  --liquid-dock-scale-y: 1;
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  min-width: 0;
  padding: 7px;
  overflow: visible;
  border-radius: 999px;
  color: var(--lg-ink);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}

.liquid-dock__indicator {
  position: absolute;
  z-index: 0;
  top: 7px;
  left: 0;
  width: var(--liquid-dock-width);
  height: 48px;
  border: 1px solid var(--lg-edge);
  border-radius: 999px;
  opacity: var(--liquid-dock-opacity);
  pointer-events: none;
  translate: var(--liquid-dock-x) 0;
  scale: var(--liquid-dock-scale-x) var(--liquid-dock-scale-y);
  transform-origin: center;
  background: var(--lg-lens);
  box-shadow: var(--lg-lift);
  transition:
    width 300ms ease,
    translate 300ms ease,
    scale var(--lg-response),
    background 180ms ease,
    border-color 180ms ease,
    opacity 140ms ease;
  backdrop-filter: blur(24px) saturate(1.7) contrast(1.04);
  -webkit-backdrop-filter: blur(24px) saturate(1.7) contrast(1.04);
}

.liquid-dock.is-pressing .liquid-dock__indicator,
.liquid-dock.is-dragging .liquid-dock__indicator {
  --liquid-dock-scale-x: 1.18;
  --liquid-dock-scale-y: 1.72;
  border-color: var(--lg-edge-active);
  background: var(--lg-lens-active);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 64%),
    inset 0 -1px 0 rgb(17 24 32 / 5%),
    var(--lg-lift);
  backdrop-filter: blur(30px) saturate(1.9) contrast(1.08);
  -webkit-backdrop-filter: blur(30px) saturate(1.9) contrast(1.08);
  transition:
    width 80ms linear,
    translate 0ms linear,
    scale 160ms cubic-bezier(0.18, 0.92, 0.22, 1),
    background 140ms ease,
    border-color 140ms ease;
}

.liquid-dock__item {
  position: relative;
  z-index: 1;
  display: grid;
  width: 100%;
  min-width: 0;
  height: 48px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0 10px;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  white-space: nowrap;
  transition: transform 300ms ease;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
}

.liquid-dock__item:focus-visible {
  outline: 2px solid rgb(17 24 32 / 58%);
  outline-offset: -4px;
}

.liquid-dock.is-pressing .liquid-dock__item,
.liquid-dock.is-dragging .liquid-dock__item {
  transform: scale(1.08);
}

.liquid-dock.is-pressing .liquid-dock__item.is-preview {
  z-index: 2;
  transform: scale(1.24);
}

.liquid-dock.is-dragging .liquid-dock__item.is-preview {
  z-index: 2;
  transform: scale(1.32);
}

@media (prefers-reduced-motion: reduce) {
  .liquid-dock,
  .liquid-dock__indicator,
  .liquid-dock__item {
    transition-duration: 1ms !important;
  }
}
```

Use `scripts/liquid-dock.js` to connect this markup and CSS. Call `realign()` after fonts load, a responsive layout change, or a dock morph completes.

## Search and filter morph

Place the dock and search control in one flex container. Change widths on the two sibling surfaces; do not destroy and recreate them.

```css
.glass-control-cluster {
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex;
  width: min(508px, calc(100vw - 32px));
  gap: 8px;
  transform: translateX(-50%);
}

.glass-control-cluster__dock {
  width: calc(100% - 70px);
  flex: 0 0 calc(100% - 70px);
  transition: width var(--lg-morph), flex-basis var(--lg-morph), border-radius var(--lg-morph);
}

.glass-control-cluster__search {
  width: 62px;
  flex: 0 0 62px;
  transition: width var(--lg-morph), flex-basis var(--lg-morph), border-radius var(--lg-morph);
}

.glass-control-cluster.is-search-mode .glass-control-cluster__dock {
  width: 62px;
  flex-basis: 62px;
  border-radius: 50%;
}

.glass-control-cluster.is-search-mode .glass-control-cluster__search {
  width: calc(100% - 70px);
  flex-basis: calc(100% - 70px);
}
```

Keep both outer surfaces mounted. Cross-fade only their inner icon and input content. Realign or hide the dock indicator during the morph, then restore it after the geometry transition finishes.

## Framework integration

- In React, create the controller in `useLayoutEffect`, pass the selected value through `setActive`, and call `destroy` on cleanup.
- In Vue, initialize in `onMounted`, realign after `nextTick`, and destroy in `onBeforeUnmount`.
- If framework state rerenders the buttons, call `realign()` after the DOM update.
- Keep selection state owned by the application. Treat the controller as interaction and presentation plumbing.

## Failure checks

- **Looks opaque:** lower surface opacity only after confirming backdrop blur is supported and detail exists behind the control.
- **Looks like stacked cards:** remove inner borders and fills; keep one parent surface and one moving indicator.
- **Indicator is misaligned:** realign after fonts, resize, visibility changes, and morph completion.
- **Indicator is clipped:** keep the dock `overflow: visible` and check ancestor overflow.
- **Touch leaves a gray or blue mark:** remove unconditional hover rules, clear pointer classes, and disable the WebKit tap highlight.
- **Vertical scrolling is blocked:** scope `touch-action: none` to the dock only and cancel when vertical movement dominates.
- **Drag commits twice:** suppress the synthetic click immediately after pointer release.
- **Safari looks flat:** increase fallback opacity and edge contrast; do not add SVG filters solely to match Chromium.
