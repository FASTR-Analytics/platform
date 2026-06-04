# PLAN — Report editor ↔ preview scroll sync

Status: **Design, reviewed (two adversarial passes).** Builds on the
Edit/Split/View toggle (`PLAN_REPORT_PREVIEW_TOGGLE.md`) and the panther
`data-line` source-map tags (in `_105_markdown` + `markdown_presentation_jsx`).

> **Decisions locked (§12):**
> 1. **No persistence** — the editor stays mounted (hidden in View, as today); the
>    **preview unmounts in Edit** and mounts on entering View/Split.
> 2. **Bidirectional in Split** — scrolling either pane scrolls the other, via a
>    single guard flag.
> 3. Figure settle is a **ResizeObserver** armed by `onMeasured`, user-scroll
>    suppressed, hard-capped.
> 4. State is **in-memory** only.

---

## 1. Goal & scope

Keep the **same content in view** as the user moves between, and within, modes:

- **Switch preservation** — scroll in one pane, switch modes, the other opens at
  the same content. Both directions.
- **Live Split sync** — in Split, scrolling **either** pane scrolls the other in
  real time (bidirectional).

Out of scope: syncing the diff overlay; syncing to the paginated PDF/Word export.

---

## 2. Empirical foundation (verified in code)

- **Figures don't fetch.** `hydrateFigureInputsForRendering` is a pure sync
  transform; data is baked into `FigureBlock.figureInputs`.
- **No Suspense boundary.** `ReportFigureEmbed` derives via `createMemo` (we
  removed `createResource`); the preview subtree can't re-suspend/blank mid-sync —
  its `[data-line]` anchors are stable DOM for the lifetime of a mount.
- **Figure-height settling is bounded** (layout, not the panther sizing mode —
  the embed renders `height="ideal" sizing="zoom"`). Only movement: `ChartHolder`
  measures the `"ideal"` height after one `rAF` (+ one-time font load), and
  re-measures on **width** change. Finite and observable.
- **`onMeasured` ≠ settled.** It fires on *hydration*, before the canvas measure —
  so it's an *armer* for §7, not a settle detector.

---

## 3. Core principle

> **The source line is the canonical coordinate. The preview pixel position is a
> derived projection, recomputed live from the DOM, never cached.**

The preview is **remounted** on each View/Split entry, so any pixel cache would
rebuild anyway — read the DOM fresh, it's the cheapest store.

**Honest limit:** a source line is not a pixel. CM wraps a line across N visual
rows; the prose preview wraps it across a different N. So "line L" is a slightly
different fraction in each pane. Sync is **exact at `[data-line]` anchors and
monotonic-but-approximate between them**. We carry a *fractional* line (§4) to keep
it continuous (no freeze-then-jump); we do not claim pixel-perfect smoothness
inside a block.

---

## 4. Coordinate primitives

### Editor (CodeMirror) — added to `ReportEditorApi`

- `getTopLine(): number | undefined` — **fractional** 0-based source line at the
  viewport top.
  - **Coordinate spaces must not be mixed** (the easy bug): `BlockInfo.top` is in
    *document* space ("relative to the top of the document"), while
    `scrollerRect.top` and `posAtCoords` work in *screen* space. `view.documentTop`
    is the bridge ("the top of the first line in screen coords"). So compute the
    block top in screen space: `blockTopClient = view.documentTop + block.top`.
  - `const topY = view.scrollDOM.getBoundingClientRect().top` (the true viewport
    top); `pos = posAtCoords({ x: topY+1 ... }, false)`. **Use the `false`
    (estimated) overload** — the default `posAtCoords` returns `null` when `x`
    lands on the line-number gutter (basicSetup adds `lineNumbers`), and a 1px-from-
    left `x` is over that gutter; `false` never returns `null` and side-steps the
    gutter entirely.
  - `block = view.lineBlockAt(pos)`. **Take the line from `doc.lineAt(block.from)`,
    not `doc.lineAt(pos)`** — over a tall figure block widget the caret can snap
    `pos` to the next line; the block's own `from` is stable.
  - `frac = clamp((topY − (view.documentTop + block.top)) / block.height, 0, 1)`;
    return `(doc.lineAt(block.from).number − 1) + frac`. (Both terms of the
    subtraction are screen-space — the earlier `S − block.top` mixed spaces and
    collapsed `frac` to 0 once scrolled, silently defeating §3/§11.)
  - Return **`undefined`** only if the editor has **zero height** (with `false`,
    `posAtCoords` won't be null) — callers keep the previous `targetLine`.
- `scrollToLine(line: number): void` — fractional, 0-based. Set
  **`view.scrollDOM.scrollTop`** so line `line`'s top lands at the viewport top,
  via `block = view.lineBlockAt(doc.line(floor(line)+1).from)` and a `frac`
  fraction of `block.height`. Do **NOT** use `EditorView.scrollIntoView` — it
  scrolls every scrollable ancestor (the report's outer `overflow-auto` wrappers)
  and adds a 5px margin.
  - **Must round-trip with `getTopLine`** (the exact `scrollTop`↔`block.top`
    padding offset — whether `scrollTop = block.top` or `+ documentPadding.top` —
    is verified at implementation so `scrollToLine(getTopLine())` is a no-op).
- `onScroll` prop — `rAF`-throttled callback on `view.scrollDOM`.

> 0-based source lines everywhere (markdown-it `token.map[0]`); convert to CM's
> 1-based only at the `doc.line()` edge.

### Preview — pure helpers in `report/scroll_sync.ts`

Scroll container = the **outer** `overflow-auto` column div; `[data-line]`
elements live in the inner `max-w-4xl … px-6 py-10` wrapper (its padding is part
of the scrolled content — correct).

- `previewAnchors(container)` → sorted `{ line, top }[]`,
  `top = el.getBoundingClientRect().top − container.getBoundingClientRect().top +
  container.scrollTop`. **Filter** non-finite `data-line` values.
- `lineToPreviewTop(container, line)` → scrollTop for a fractional line,
  interpolating between bracketing anchors. **Guards:** 0 anchors → `0`; 1 anchor
  or out of range → clamp.
- `previewTopToLine(container)` → inverse. Same guards.

(IntersectionObserver rejected: async/coalesced, no sub-block offset.)

---

## 5. State model

```ts
let targetLine = 0;   // fractional, 0-based — the line we're synced to
```

Updated from whichever pane the user actually scrolls: the editor when visible
(Edit & Split) via `getTopLine()`; the preview when visible (View & Split) via
`previewTopToLine()`. Position is always a line; pixels are computed only at
apply-time.

---

## 6. Drive model — bidirectional in Split, one guard flag

Both panes drive in Split. A single guard flag breaks the echo loop (programmatic
scroll on pane B fires B's scroll event, which must not re-drive A):

```ts
let syncing = false;

function onEditorScroll() {            // fires in Edit + Split
  if (syncing) return;                 // our own sync echo — ignore
  const line = editorApi.getTopLine();
  if (line === undefined) return;
  targetLine = line;
  if (mode() === "split") {
    syncing = true;
    previewEl.scrollTop = lineToPreviewTop(previewEl, line);
    requestAnimationFrame(() => (syncing = false));   // clear AFTER the echo
  }
}

function onPreviewScroll() {           // fires in View + Split
  if (syncing) return;
  targetLine = previewTopToLine(previewEl);
  if (mode() === "split") {
    syncing = true;
    editorApi.scrollToLine(targetLine);
    requestAnimationFrame(() => (syncing = false));
  }
}
```

Why this is clean: the user can physically scroll only **one** pane at a time, so
the other is always either idle or being driven — the guard only ever swallows a
*driven echo*, never a genuine user scroll. The single load-bearing detail is
**clearing the flag on the next `rAF`, not synchronously**: programmatic
`scrollTop` writes dispatch their scroll event asynchronously, so the guard must
outlive it.

Rejected alternative: **pointer-ownership** (driver = pane under the cursor). Its
failure surface is open-ended — trackpad inertia after the pointer leaves,
keyboard/PgDn scroll while hovering the other pane, touch with no hover. The guard
flag is one closed, testable window; prefer it.

---

## 7. Figure-settle convergence

A one-shot align after a switch can be computed before a figure finishes its first
`rAF` measure. Re-project the stored `targetLine` as heights settle:

- A **ResizeObserver** on the preview's scroll-content detects height changes.
  **`onMeasured`** (wired through `renderEmbed`) *arms* the settle window slightly
  earlier — but it's largely redundant (the RO catches every height change,
  including the ones `onMeasured` predates), so arming on mount + the RO would also
  work; keep it only as a cheap early arm.
- While armed **and the user hasn't scrolled the preview since the switch**,
  re-apply `previewEl.scrollTop = lineToPreviewTop(previewEl, targetLine)` — only
  if it differs (skip no-ops, so it can't masquerade as user input). **Wrap this
  write in the §6 `syncing` guard** (`syncing = true; …; rAF → false`): otherwise,
  in Split, the settle write fires `onPreviewScroll`, which re-drives the editor on
  every settle tick. (It's self-consistent — `previewTopToLine` ≈ inverse of
  `lineToPreviewTop`, and the latch disarms on `wheel`/`pointerdown`, not `scroll`,
  so it wouldn't loop — but guarding it removes the surprise.)
- **Disarm** on the first genuine user `wheel`/`pointerdown` (a one-shot
  "untouched" latch), OR ~250 ms with no height change, OR a hard ~2 s ceiling —
  whichever first.

Because the preview unmounts/remounts, the observer + the `onScroll` listener +
the container ref are **(re)established on each preview mount and torn down on
unmount** (a small `ReportPreviewPane` owning `onMount`/`onCleanup`, or an effect
scoped to the `<Show>`). Suspense was rejected — it gates on data-ready, not
canvas-settle.

---

## 8. Per-mode behaviour

| From → To | Action |
|---|---|
| Edit → View | preview mounts → after layout, align preview to `targetLine`; arm §7 |
| Edit → Split | preview mounts → align preview to `targetLine`; arm §7 |
| View → Edit | `editor.refresh()` + `editor.scrollToLine(targetLine)`; preview unmounts |
| View → Split | `editor.refresh()` + `editor.scrollToLine(targetLine)`; preview stays |
| Split → Edit | editor keeps position; preview unmounts |
| Split → View | editor hides; preview keeps position |

(`editor.refresh()` re-measures the CM that was `display:none` in View.) **Fold
this into the existing mode `createEffect` (`index.tsx:134-137`) rather than adding
a second effect** — two effects on `mode()` race, and `scrollToLine` must run
**after** `refresh()` (a separate later effect could `scrollToLine` against stale
CM measurements). Within that one effect: read `mode()`, `refresh()` if the editor
is shown, then schedule the align. Capture the mode at schedule time and bail if it
changed or a ref is null (rapid toggling). Mode-enter align runs after
`queueMicrotask` + `rAF` so the new pane has laid out.

---

## 9. Implementation steps

1. **panther (source + re-sync):** make figures anchorable. The `line` must be
   threaded one more hop than it looks — `DocElementRenderer` renders
   `<ImageElementRenderer>` *without* `line` today. So:
   - extend `MarkdownImageRenderer` to `(src, alt, line?) => JSX`;
   - add `line?: number` to `ImageElementRendererProps` and pass
     `line={imageElement().line}` from `DocElementRenderer`;
   - in `ImageElementRenderer`, forward it as `p.renderImage(p.src, p.alt, p.line)`
     **and** stamp `data-line={p.line}` on **both** `<img>` paths (the fallback and
     the `imageFromMap` one).

   Edit the **timroberton-panther source**, then sync. (Without this, sync
   freezes/jumps through every chart — figures are the dominant height.)
2. **`index.tsx` — renderEmbed:** accept the `line` arg → `data-line` on the
   figure/image wrapper; pass `onMeasured` (arms §7).
3. **`report_editor.tsx`:** add `getTopLine` (fractional, padding-corrected,
   `undefined` on fail), `scrollToLine` (direct `scrollDOM.scrollTop`, fractional),
   `onScroll` prop (`rAF`-throttled, cleaned on destroy).
4. **`report/scroll_sync.ts`** (new, pure): `previewAnchors` (finite-int filter),
   `lineToPreviewTop`, `previewTopToLine` (0/1-anchor guards).
5. **`index.tsx` — wiring:** `let targetLine = 0; let syncing = false`; the preview
   pane (re)establishes its scroll-container ref + `onScroll` + ResizeObserver on
   mount and tears them down on unmount; editor `onScroll`; the §6 guard; **fold
   the §8 transitions into the existing mode `createEffect` (`:134-137`)** —
   `refresh()` before `scrollToLine()`, no second effect; the §7 arm/disarm latch.
6. Typecheck (client); verify the panther sync landed.

**File manifest:** panther `markdown_presentation_jsx.tsx` (M, **source + sync**),
`report_editor.tsx` (M), `report/scroll_sync.ts` (N), `index.tsx` (M)
(possibly a small `ReportPreviewPane.tsx` for the preview lifecycle). No lib,
server, or data-model changes.

---

## 10. Why it stays maintainable

- **One coordinate** (fractional line), **one state var** (`targetLine`), **one
  guard** (`syncing`), **one** settle observer.
- **Pure mapping fns** in `scroll_sync.ts`, decoupled from Solid/CM —
  unit-testable with a fake container.
- The editor exposes a tiny intention-revealing API
  (`getTopLine`/`scrollToLine`/`onScroll`); `index.tsx` orchestrates and owns no
  DOM math beyond reading two refs.
- Figure-height settling handled by one observer with one rule ("re-project the
  stored line; stop when the user takes over"), bounded by a hard cap.

---

## 11. Risks / edge cases (and handling)

- **Line-wrapping / multi-line blocks** — exact at anchors, approximate between
  (§3); fractional line keeps it continuous (no freeze-then-jump).
- **Figures** — now tagged (§9.1) ⇒ exact anchors, not interpolation voids. This
  was the top viability risk.
- **Empty/new report (0 anchors), sub-viewport (1 anchor)** — explicit guards
  (§4); new reports open empty, must not throw.
- **Echo loop in Split** — the §6 guard; clear on next `rAF` (the one detail).
- **Fast fling** — follower lags ~one throttled frame (cosmetic; equally true of a
  unidirectional design); no divergence.
- **Heading top-margins** — anchors are border-box tops (collapsed margin
  excluded) ⇒ heading alignment margin-box-approximate; documented.
- **`py-10` lead** — first anchor sits ~40px down; clamp-to-first targets that.
- **Rapid mode toggling** — deferred align bails on mode-change/null ref (§8);
  per-mount observer setup avoids leaks.
- **`getBoundingClientRect` per anchor per sync** — `rAF`-throttled to once/frame;
  fine for report-sized docs; cache + RO-invalidate only if pathological.

---

## 12. Decisions (locked)

1. **No persistence** — preview unmounts in Edit; editor stays mounted (hidden in
   View, as today).
2. **Bidirectional** Split sync via one shared `syncing` guard flag (cleared next
   `rAF`); pointer-ownership rejected.
3. **ResizeObserver settle**, armed by `onMeasured`, user-scroll one-shot latch,
   ~250 ms-quiet disarm with ~2 s cap, no-op-skip; (re)attached per preview mount.
4. **In-memory** state (`targetLine` resets on reopen).

Residual (tune at implementation, non-blocking): exact quiet/ceiling constants.
