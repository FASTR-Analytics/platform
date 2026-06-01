# Protocol: Sizing

**Scope:** All

How to size figures and pages built with panther. Model and rationale:
`DOC_SIZING_MODEL.md`. Refactor status: `PLAN_SIZING_REFACTOR.md`.

**Two layout modes.** In `zoom`, the frame width is always **1000 DU**, then
scaled to fit the display. In `reflow`, the frame width takes the container's
CSS-pixel width — **1 DU = 1 CSS pixel**. `resolution` is separate: it only sets
how many *device* pixels render that picture (sharpness), and never changes the
DU↔layout mapping.

## Rules

1. **Author in DUs, never pixels** — every size (font, padding, gap, stroke) is
   a design unit; a DU is 1/1000 of the reference frame. In `reflow` the frame is
   the container width (1 DU = 1 CSS px); in `zoom`/export it's the fixed 1000.
2. **Never set `scale`** — there is no size multiplier. Set the real DU number
   you want.
3. **Set sizes once, globally** — define the default type scale in the global
   style. Never re-size per surface.
4. **No per-call-site size hacks** — never multiply or override size for a
   specific screen (no `×2`, `×0.6`, forced `scale:1`, `additionalScale`).
5. **Pick a sizing mode per surface family, not per figure** —
   `sizing: "reflow"` (live/readable surfaces: editor, dashboard, public viewer;
   `reflow` ⇒ 1 DU = 1 CSS px, independent of `resolution`) or `sizing: "zoom"`
   (faithful miniature: thumbnails, grid previews, pages/slides). Same authored
   DU sizes feed both.
6. **`resolution` is sharpness only** — choose it for image quality/cost, never
   to change how big something looks. `1` = native-crisp and right-sized at any
   display size: the backing follows the displayed width, so a thumbnail at `1`
   already allocates a small bitmap — **don't lower it for small surfaces**. Use
   `>1` only for a focal element you want extra-crisp; `<1` only as a deliberate
   sub-native quality trade. (Files take an explicit `outputWidthPx` instead.)
7. **Let shrink-to-fit handle cramped space** — when content is too big for its
   box it scales down automatically to a legibility floor, then reports
   `cramped`. Don't pre-shrink by hand.
8. **Tune defaults against PDF/print width** — it's the only surface with a
   fixed physical size, so it's where "is this readable?" is decided.

## Do / Don't

### Sizing

```ts
// ❌ DON'T — scale as a size knob, per-surface multipliers
style: { scale: 3 }
chartInputs={{ ...fi, style: { ...fi.style, scale: 1 } }}     // force-resize per surface
scale: (config.s.scale ?? DEFAULT) * 2                         // ×2 for a small tile

// ✅ DO — author the real DU sizes, once, in the global style
setGlobalStyle({
  baseText: { fontSize: 14 },                                  // DUs, in the 1000-wide frame
  figure: { text: { caption: { relFontSize: 1.2 } } },
})
// then render the same inputs everywhere, unchanged
```

**Why:** the same authored DU sizes feed every surface (the reference frame is
always 1000 DU), so one authored size is correct everywhere. A `scale` multiplier
(or per-surface override) is the thing that makes the same figure look different
in the editor vs a dashboard vs a slide.

### Resolution vs size

```tsx
// ❌ DON'T — treat output pixels as a size, or lower resolution to "shrink"
writeFigure(path, inputs, 800)        // legacy: 800 was layout width → chunky figure
<ChartHolder chartInputs={fi} sizing="zoom" height="ideal" resolution={0.2} />  // 0.2 just makes it soft

// ✅ DO — pixels choose sharpness only; a small surface is already small at resolution 1
<ChartHolder chartInputs={fi} sizing="zoom" height="ideal" />                   // thumbnail, native-crisp
<ChartHolder chartInputs={fi} height="ideal" />                                 // reflow, native-crisp
writeFigure(path, inputs, { outputWidthPx: 2000 })                             // file: 2000px wide
```

**Why:** resolution changes how crisp the bitmap is and nothing else. The figure
is identical at any resolution.

### Cramped space

```tsx
// ❌ DON'T — hand-shrink to make it fit a small slot
style: { scale: smallSlot ? 0.6 : 1 }

// ✅ DO — give it the space; shrink-to-fit + the cramped signal handle it
<ChartHolder chartInputs={fi} height="flex" />
// surface the `cramped` indicator if you need to flag unreadably small content
```

**Why:** shrink-to-fit reduces everything together down to a legibility floor,
consistently; manual scaling re-introduces per-surface tuning.

## Patterns

### One default type scale

Define it once in the app's global style, sized so a full-frame (1000 DU) figure
is legible at your **PDF/print page width** (the binding surface). Every other
surface inherits it.

```ts
setGlobalStyle({
  baseText: { font: { fontFamily: "Inter", weight: 400 }, fontSize: 14 },
  figure: { text: { base: { fontSize: 13 } } },
  // ...no `scale` anywhere
})
```

### Same figure, many surfaces

```tsx
// readable surfaces (editor / dashboard / public viewer) → reflow (the default)
<ChartHolder chartInputs={fi} height="ideal" />                                 // full quality
<ChartHolder chartInputs={fi} height="flex" />                                  // card (small ⇒ small backing)

// thumbnails / previews / selectors → zoom (faithful miniature)
<ChartHolder chartInputs={fi} sizing="zoom" height="ideal" />                   // thumbnail, native-crisp
```

### Export

```ts
// PNG: outputWidthPx is the file's pixel width (sharpness); layout is always 1000 DU
await writeFigure("out.png", inputs, { outputWidthPx: 4000 })   // a 4000px-wide PNG

// PDF/PPTX: render the 1000-DU frame; the physical size (inches/points) is set
// EXPLICITLY, separate from both the DU width and outputWidthPx (no fudge factor)
```

## Checklist

- [ ] No `scale` in any style options or PO config
- [ ] No per-surface size multipliers (`×2`, `×0.6`, forced `scale:1`,
      `additionalScale`)
- [ ] All authored sizes are DUs in the global/default style, set once
- [ ] `resolution` used only for sharpness/cost, never to change apparent size
- [ ] Sizing mode (`sizing: "reflow" | "zoom"`) chosen per surface family,
      deliberately — never per-PO
- [ ] No `noRescaleWithWidthChange` (use `sizing` instead)
- [ ] No app code passes `responsiveScale` / a raw fit factor
- [ ] Cramped layouts rely on shrink-to-fit (+ `cramped` indicator), not manual
      scaling
- [ ] Default type scale chosen to be legible at PDF/print width
