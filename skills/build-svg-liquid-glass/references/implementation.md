# SVG Liquid Glass Implementation

## Filter graph

Place hidden filter definitions near the start of `<body>`. Use unique IDs when a page has multiple glass components.

```html
<svg width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <filter id="glass" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
      x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
      <feImage id="glass-map" x="0" y="0" width="1" height="1"
        preserveAspectRatio="none" result="map" />
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.16" result="soft" />
      <feDisplacementMap in="soft" in2="map" scale="18"
        xChannelSelector="R" yChannelSelector="G" result="refracted" />
      <feColorMatrix in="refracted" type="saturate" values="1.24" result="color" />
      <feImage id="glass-specular" x="0" y="0" width="1" height="1"
        preserveAspectRatio="none" result="specular" />
      <feBlend in="color" in2="specular" mode="screen" />
    </filter>
  </defs>
</svg>
```

Create a second active filter with a displacement scale around `26` to `32`, slightly stronger saturation, and the active specular map. Tune values against the actual background; larger is not automatically better.

## CSS structure

Start with a complete fallback. Enhance Chromium only after the fallback works.

```css
.glass-lens {
  border: 1px solid rgb(255 255 255 / 48%);
  border-radius: 999px;
  background: rgb(255 255 255 / 20%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 50%);
  backdrop-filter: blur(24px) saturate(1.6);
}

@supports not (-webkit-touch-callout: none) {
  @supports (backdrop-filter: url("#glass")) {
    .glass-parent {
      /* Prevent an ancestor blur from flattening the backdrop sampled by the lens. */
      backdrop-filter: none;
    }

    .glass-lens {
      background: rgb(255 255 255 / 9%);
      backdrop-filter: url("#glass") blur(0.16px) saturate(1.22) contrast(1.06);
    }

    .is-pressing .glass-lens,
    .is-dragging .glass-lens {
      background: rgb(255 255 255 / 6%);
      backdrop-filter: url("#glass-active") blur(0.22px) saturate(1.34) contrast(1.08);
    }
  }
}
```

The WebKit exclusion is a practical fallback gate, not a standards guarantee. Re-test browser behavior when support changes.

## JavaScript integration

Import the helper module, collect the filter nodes, and update both filters when the lens changes size.

```js
import {
  applyLiquidGlassMaps,
  observeLiquidGlassElement,
} from "./liquid-glass-maps.js";

const lens = document.querySelector(".glass-lens");
const nodes = {
  filter: document.querySelector("#glass"),
  activeFilter: document.querySelector("#glass-active"),
  map: document.querySelector("#glass-map"),
  activeMap: document.querySelector("#glass-map-active"),
  specular: document.querySelector("#glass-specular"),
  activeSpecular: document.querySelector("#glass-specular-active"),
};

const stopObserving = observeLiquidGlassElement(
  lens,
  (maps) => applyLiquidGlassMaps(maps, nodes),
  { resolution: 2, bezel: 13 }
);
```

Call `stopObserving()` when a framework component unmounts. In React or Vue, generate the maps in a layout effect or mounted hook after the element has measurable dimensions.

## Interaction

- Set pressing state on `pointerdown` and use pointer capture for dragging.
- Move the visual lens continuously while dragging, but commit the selected value at the product-appropriate time.
- Scale from the center using CSS transforms; do not change layout dimensions during drag.
- Keep icons and labels in a higher layer than the displaced backdrop.
- Clear active state on `pointerup`, `pointercancel`, and lost pointer capture.

## Failure checks

- **No visible refraction:** place lines or detailed imagery behind the lens and ensure no filtered ancestor is acting as the backdrop root.
- **Only white gloss appears:** lower the fill opacity and specular alpha; confirm the displacement map is attached through `href`.
- **Direction looks wrong:** invert the red or green channel sign, not both blindly.
- **Map stretches after resize:** update filter and `<feImage>` dimensions and regenerate the Canvas maps.
- **Text distorts:** separate foreground content from the backdrop-filtered lens layer.
- **Dragging stutters:** cache maps by rounded dimensions and avoid regeneration on every pointer move.
