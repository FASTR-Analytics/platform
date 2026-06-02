# Protocol: Sizing

**Scope:** All

How to size figures and pages built with panther. Model and rationale:
`DOC_SIZING_MODEL.md`. Refactor status: `PLAN_SIZING_REFACTOR.md`.

**Two layout modes.** In `zoom`, the frame width is a **fixed DU width** — a
figure's is **1000 DU** (`REFERENCE_WIDTH_DU`); a page's is the width you set it
(`pageWidthDu`) — then scaled to fit the display. In `reflow`, the frame width
takes the container's CSS-pixel width — **1 DU = 1 CSS pixel**. `resolution` is
separate: it only sets how many _device_ pixels render that picture (sharpness),
and never changes the DU↔layout mapping.

## Rules

1. **Author in DUs, never pixels** — every size (font, padding, gap, stroke) is
   a design unit; a DU is 1/1000 of the reference frame. In `reflow` the frame
   is the container width (1 DU = 1 CSS px); in `zoom`/export it's a fixed DU
   frame — 1000 for a figure, the page's own `pageWidthDu` for a page.
2. **Never set `scale`** — there is no size multiplier. Set the real DU number
   you want.
3. **Set sizes once, globally** — define the default type scale in the global
   style, and never re-size it per surface. (Setting a page's frame —
   `pageWidthDu` / `pageHeightDu` — is _not_ a per-surface size knob: it sizes
   the page, like its height, and leaves the type scale untouched. See _Choosing
   a page width_ below.)
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

**Why:** the same authored DU sizes feed every surface (a figure's reference
frame is always 1000 DU), so one authored size is correct everywhere. A `scale`
multiplier (or per-surface override) is the thing that makes the same figure
look different in the editor vs a dashboard vs a slide.

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
style: {
  scale: smallSlot ? 0.6 : 1;
}

// ✅ DO — give it the space; shrink-to-fit + the cramped signal handle it
<ChartHolder chartInputs={fi} height="flex" />;
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
});
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
// PNG figure: outputWidthPx is the file's pixel width (sharpness); a figure's
// layout is always the 1000-DU frame
await writeFigure("out.png", inputs, { outputWidthPx: 4000 }); // a 4000px-wide PNG

// PNG slide: a page sets its own frame — pass the same (pageWidthDu, pageHeightDu)
// you give PageHolder. outputWidthPx is the pixel width; the height follows aspect
await writeSlide("slide.png", page, {
  outputWidthPx: 4000,
  pageWidthDu: 1500,
  pageHeightDu: 844,
});

// PDF/PPTX: render the page's DU frame; the physical size (inches/points) is set
// EXPLICITLY, separate from both the DU width and outputWidthPx (no fudge factor)
```

## Choosing a page width

A page's frame is a value you **set**, not a per-surface override of a default.
`pageWidthDu` and `pageHeightDu` are **both required** and define the frame —
exactly like setting a page's height. `REFERENCE_WIDTH` (1000) is not a page
default; it is the legibility reference. Rules 2–4 ban per-surface _size_ knobs;
setting a page's frame is not one of those — it sizes the page and leaves the
type scale untouched.

- **What it does.** A page is always `zoom` — a fixed DU frame, scaled to fit.
  Pass `REFERENCE_WIDTH` (1000) for the canonical frame, or a wider width (e.g.
  1500) for more room. Authored DU sizes are untouched; the page is just bigger,
  so each size is _relatively_ smaller — more room for content, no style
  retuning. Set width and height as a matched aspect pair (e.g. 16:9).

  ```tsx
  <PageHolder pageInputs={page} pageWidthDu={REFERENCE_WIDTH} pageHeightDu={563} />  // canonical 1000-DU frame
  <PageHolder pageInputs={page} pageWidthDu={1500} pageHeightDu={844} />             // roomier canvas
  ```

- **The consequence you own.** Because authored DU sizes don't change with the
  width, a wider page has _relatively smaller_ text: a 14-DU font is a different
  relative size on a 1500-wide page than a 1000-wide one, so cross-page text
  consistency is not automatic. And the legibility floor (`MIN_FONT_SIZE_DU`, an
  absolute DU) is relatively smaller on a wider frame, so **print legibility
  becomes your responsibility** — check it at your PDF/print page width. This is
  a plain property of choosing a width, not a sanctioned rule-break — and it is
  _not_ a way to make one surface's text bigger/smaller for emphasis (that is
  the per-surface multiplier Rules 2–4 ban).

- **One frame, screen + export.** A page's DU frame has one public pair,
  `(pageWidthDu, pageHeightDu)`, everywhere it's page-facing. Pass the _same_
  pair to the on-screen `PageHolder` and to every page export (`writeSlide`,
  `pagesToPdf`, `pagesToPptx`) so screen and file stay in lockstep. Never give a
  page a different frame on screen than in export.

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
- [ ] A page's `(pageWidthDu, pageHeightDu)` is the same pair on screen and in
      every export, and is not standing in for a per-surface text-size tweak
- [ ] Default type scale chosen to be legible at PDF/print width
