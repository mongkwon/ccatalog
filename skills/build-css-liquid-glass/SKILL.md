---
name: build-css-liquid-glass
description: Implement or refine browser-compatible Liquid Glass-style web interfaces using translucent CSS surfaces, backdrop blur, restrained borders, morphing controls, and touch-safe pointer interactions without SVG displacement filters. Use when Codex is asked to build glass docks, floating islands, segmented controls, draggable selection lenses, search/filter morphing controls, or a Safari-friendly liquid-glass fallback in HTML/CSS/JavaScript, React, Vue, or similar web projects.
---

# Build CSS Liquid Glass

Build a convincing glass interface from composition, material, and motion. Do not depend on simulated optical refraction.

## Workflow

1. Inspect the existing design system, stacking contexts, background detail, interaction states, and browser targets.
2. Identify only the controls that benefit from glass. Keep content panels quieter than primary floating controls.
3. Read [references/implementation.md](references/implementation.md) before implementing the material or dock.
4. Establish reusable surface, edge, ink, sizing, and motion tokens before styling individual components.
5. Build the complete static and keyboard-accessible control before adding pointer dragging or morphing.
6. For a draggable segmented control, adapt [scripts/liquid-dock.js](scripts/liquid-dock.js) instead of rebuilding pointer capture and click suppression.
7. Keep indicator growth transform-only. Never change layout dimensions while pressing or dragging.
8. Verify desktop mouse, keyboard, coarse-pointer touch, small viewport, safe-area, reduced-motion, and Safari states.

## Material Rules

- Use a translucent neutral surface over visible page detail. Glass cannot read as glass over a flat matching background.
- Combine `backdrop-filter: blur(...) saturate(...)` with a low-contrast border; provide `-webkit-backdrop-filter` alongside it.
- Keep normal-state shadows extremely restrained. Prefer a one-pixel tonal lift over a floating dark drop shadow.
- Avoid broad white gradients, fake diagonal sheen, glowing outlines, and opaque milky fills.
- Keep text and icons opaque and outside any layer whose opacity is reduced for the glass effect.
- Use one material family with different strengths. Do not give every nested element its own border, fill, blur, and shadow.
- Use neutral gray interaction emphasis unless the product has a meaningful semantic accent.
- Preserve contrast when `backdrop-filter` is unsupported by increasing fallback surface opacity.

## Motion Rules

- Use a smooth 400-550ms morph for container geometry and a faster 140-220ms response for press feedback.
- Move indicators with `translate` and enlarge them with `scale`; keep their DOM dimensions stable.
- Preview selection under the pointer, but commit the value on release unless the product requires continuous updates.
- Use pointer capture so dragging remains stable outside the original button.
- Cancel horizontal selection when the gesture becomes clearly vertical.
- Suppress the synthetic click after a completed pointer gesture.
- Remove nonessential morph and scale animation under `prefers-reduced-motion`.

## Touch And Accessibility

- Apply `touch-action: none` only to the drag surface. Keep unrelated page controls scrollable.
- Disable `-webkit-tap-highlight-color` and touch callouts on the custom control, then provide a deliberate `:focus-visible` ring.
- Restrict hover styles to `@media (hover: hover) and (pointer: fine)` or omit them.
- Clear pressing, dragging, and preview classes on `pointerup`, `pointercancel`, and `lostpointercapture`.
- Include `env(safe-area-inset-bottom, 0px)` in fixed bottom positioning.
- Keep hit targets at least 44px in both dimensions.

## Verification

- Test over a detailed or high-contrast background and confirm the material remains readable.
- Press and drag across every segment, release outside the dock, and interrupt with a vertical gesture.
- Confirm touch leaves no hover, focus, or active residue after release.
- Toggle any morphing search mode repeatedly and ensure the indicator never appears compressed or stale.
- Resize across mobile and desktop widths; realign the indicator after fonts and layout settle.
- Test without `backdrop-filter` and confirm the fallback still looks intentional.
- Check keyboard focus, reduced motion, console errors, and layout shifts.

Keep the material subordinate to the task. If readability or interaction latency worsens, simplify blur and motion before adding more gloss.
