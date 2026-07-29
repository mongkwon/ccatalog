---
name: build-svg-liquid-glass
description: Implement or refine responsive Liquid Glass effects for web controls using element-sized Canvas displacement maps and SVG feDisplacementMap filters. Use when Codex is asked to build liquid glass, refractive glass, lens-like dock indicators, draggable glass sliders, SVG displacement effects, or to replace flat backdrop blur with convincing browser-rendered refraction in HTML/CSS/JavaScript, React, Vue, or similar web projects.
---

# Build SVG Liquid Glass

Implement refraction as a progressive enhancement. Preserve usability and visual hierarchy when the SVG filter is unsupported.

## Workflow

1. Inspect the existing component, interaction states, stacking contexts, and browser targets before editing.
2. Identify the moving glass element. Apply refraction to the indicator or lens itself, not indiscriminately to its opaque parent.
3. Read [references/implementation.md](references/implementation.md) before adding the filter graph or CSS.
4. Reuse or adapt [scripts/liquid-glass-maps.js](scripts/liquid-glass-maps.js) to generate element-sized displacement and specular maps.
5. Add separate normal and active SVG filters. Increase displacement and transparency while pressing or dragging.
6. Rebuild maps when the element's rendered dimensions change. Use `ResizeObserver` when available.
7. Keep a blur/saturation fallback for Safari and unsupported browsers.
8. Verify the idle, pressed, dragged, resized, and fallback states visually.

## Implementation Rules

- Generate the displacement texture from the rendered element dimensions. Do not stretch one generic texture across unrelated aspect ratios.
- Encode horizontal displacement in red, vertical displacement in green, and neutral displacement as `128`.
- Use a rounded-rectangle signed distance field and its numerical gradient to create coherent edge normals.
- Concentrate displacement in a bezel near the perimeter; keep the center comparatively calm and readable.
- Use a separate low-alpha specular map for the highlight. Do not fake refraction with a strong white gradient.
- Regenerate only when rounded width or height changes. Cap render resolution to avoid expensive maps on high-DPI screens.
- Avoid an opaque or filtered ancestor that becomes a new backdrop root and hides the real page pixels from the lens.
- Keep text and icons outside the displaced backdrop layer when refraction reduces legibility.
- Respect `prefers-reduced-motion`; refraction may remain, but remove nonessential spring or scale animation.
- Do not use `feTurbulence` as the primary lens model. It produces irregular distortion rather than a shaped glass surface.

## Browser Strategy

- Treat SVG URL filters in CSS `backdrop-filter` as a Chromium enhancement.
- Use feature queries, but do not assume a positive parse result guarantees identical rendering in every browser.
- Give Safari and unsupported browsers a conventional translucent background with blur, saturation, border, and restrained inset highlight.
- Never make navigation, selection, or drag behavior depend on the visual filter succeeding.

## Verification

- Test over a high-contrast background with lines or text so displacement is visible.
- Capture desktop and mobile screenshots in idle and active drag states.
- Drag across every segment and confirm the indicator remains aligned and does not resize the layout.
- Resize across breakpoints and confirm maps are regenerated without stretching.
- Check the console for invalid filter URLs, missing image references, and Canvas errors.
- Test at least one Safari/WebKit path and confirm the fallback remains readable.

Keep the effect subordinate to interaction. If refraction causes jank, reduce map resolution and filter complexity before reducing touch responsiveness.
