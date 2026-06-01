# PLAN — Report Edit / View (HTML preview) toggle

Status: **Design, not started.** Net-new scope on top of the reports feature
(see `PLAN_REPORTS.md`). Small, self-contained: one new mode, one new render
path, no data-model or server changes.

---

## 1. What we're building

An **Edit / View toggle** (a `ButtonGroup` in the report editor's top nav) that
switches the main area between:

- **Edit** (current): the CodeMirror markdown editor with live figure/image
  widgets (`ReportEditor`).
- **View**: a read-only **HTML render** of the markdown via panther's
  **`MarkdownPresentationJsx`**, with figures/images resolved through the *same*
  `ReportFigureEmbed` / `<img>` used in the editor — so an embed looks identical
  in both modes.

**Hard requirement: AI is mode-agnostic.** The AI assistant (read/create/rewrite/
insert tools + the accept/reject diff) must behave exactly the same in Edit and
View. Toggling modes never changes what the AI can do or how its edits apply.

Out of scope: WYSIWYG, per-mode styling, printing — those stay in `PLAN_REPORTS.md`'s Phase 7.

---

## 2. Core decision: the CM editor stays mounted (hidden) in View mode

This is the load-bearing decision and it's what makes AI mode-agnostic.

Today the AI accept path applies an edit via the editor's imperative API
(`editorApi.setBody`), and human autosave flows from CM's `onBodyChange`. If View
mode **unmounted** the CM editor, `editorApi` would be gone and AI accept couldn't
apply while viewing.

So: **keep `ReportEditor` mounted in both modes; toggle its visibility.** Exactly
the pattern already used for the diff overlay (the editor is hidden, not
unmounted, while a proposal is reviewed — see `report/index.tsx`).

Consequences (all desirable):
- `body()` stays the single source of truth, updated by CM in Edit and by AI
  `setBody` in View. The preview reads `body()` reactively, so an AI edit accepted
  in View mode updates the preview immediately.
- `editorApi.setBody` / `removeEmbedToken` / `setEmbedCaption` keep working in View.
- The `editing_report` AI context (set in `onMount`, independent of mode) and all
  report AI tools are untouched.

---

## 3. The preview render

`MarkdownPresentationJsx` (panther, `_303_components/content/markdown_presentation_jsx.tsx`):

```tsx
<MarkdownPresentationJsx markdown={body()} renderImage={renderEmbed} />
```

- `renderImage: (src: string, alt: string) => JSX.Element | undefined` — called
  for every `![alt](src)`. We resolve embed tokens here, mirroring the editor
  widgets:

  ```tsx
  function renderEmbed(src: string, alt: string) {
    const fig = /^figure:(.+)$/.exec(src);
    if (fig) {
      const fb = figures()[fig[1]];
      return fb ? <ReportFigureEmbed figure={fb} /> : <MissingEmbed kind="figure" />;
    }
    const img = /^image:(.+)$/.exec(src);
    if (img) {
      const ib = images()[img[1]];
      return ib ? <img class="w-full" src={assetUrl(ib.imgFile)} alt={alt} /> : <MissingEmbed kind="image" />;
    }
    return undefined; // plain markdown image URL → MarkdownPresentationJsx falls back to <img>
  }
  ```

- `ReportFigureEmbed` is the SAME reusable component the editor widget and
  `DraftReportPreview` use (self-hydrates via `createResource`, renders
  `ChartHolder`). `renderImage` is synchronous and returns it directly — the
  component owns its own async hydration, so no await is needed in the callback.
- Result: figures/images render identically in Edit (CM widget) and View (HTML),
  because both funnel through `ReportFigureEmbed` / the same `assetUrl`.

---

## 4. Render logic (three states, two modes)

In `report/index.tsx`, the main area becomes:

```tsx
const [mode, setMode] = createSignal<"edit" | "view">("edit");

<Show when={!isLoading()}>
  {/* CM editor — mounted always; visible only in Edit and not during a proposal */}
  <div class="min-h-0 flex-1" classList={{ hidden: mode() !== "edit" || !!pendingProposal() }}>
    <ReportEditor ... />
  </div>

  {/* HTML preview — View mode, not during a proposal */}
  <Show when={mode() === "view" && !pendingProposal()}>
    <div class="bg-base-100 mx-auto h-full w-full max-w-3xl overflow-auto rounded border ui-pad">
      <MarkdownPresentationJsx markdown={body()} renderImage={renderEmbed} />
    </div>
  </Show>

  {/* Diff overlay — proposals, in either mode (unchanged) */}
  <Show when={pendingProposal()} keyed>{(prop) => <ReportMarkdownDiff ... />}</Show>
</Show>
```

Precedence: a pending AI proposal always shows the diff (hides both editor and
preview); otherwise the active mode decides editor vs preview.

---

## 5. Toolbar toggle

Add a `ButtonGroup<"edit" | "view">` to the existing top-nav `panelChildren`:

```tsx
<ButtonGroup<"edit" | "view">
  items={[
    { id: "edit", label: t3({ en: "Edit", fr: "Édition" }) },
    { id: "view", label: t3({ en: "View", fr: "Aperçu" }) },
  ]}
  value={mode()}
  onChange={(v) => v && setMode(v)}
/>
```

Place it left of the Download button. `ButtonGroup` is the §8.0-sanctioned
primitive for a mode toggle. (Insert figure/image are NOT in the toolbar — they
live in the left panel's empty state; see §6.)

---

## 6. View-mode behavior (decided)

View is a **read-only preview**:

- **Insert figure / Insert image** now live in the ever-present left
  `ReportEmbedEditor` panel's **empty state** (shown when nothing is selected and
  `canConfigure` is true), not the top toolbar — insert and edit are mutually
  exclusive (insert when nothing selected, edit-controls when something is). To
  make View read-only, pass the panel `canConfigure={canConfigure() && mode() === "edit"}`:
  in View it falls back to the muted "Click a figure or image to edit" hint with
  no insert/edit buttons.
- **Figure selection**: figures in the preview are **not** clickable (they render
  via `MarkdownPresentationJsx`, not the CM widget), so nothing gets selected in
  View. Clear `selectedEmbed` on entering View so the panel resets to its
  (button-less, in View) empty state.
- **Download / AI / Back**: unchanged, available in both modes.

Rationale: keep View genuinely read-only and simple; all mutation lives in Edit
(or via AI, which works in both). This avoids the awkward "edit affordances over a
non-editable preview" problem.

---

## 7. Why AI is mode-agnostic (the check that matters)

- AI context `editing_report` is set in `onMount` and never reads `mode`.
- `get_report_editor` reads `getBody()` → `body()` (mode-independent).
- `rewrite_*` / `insert_figure` call `proposeEdit` → `pendingProposal` → diff
  overlay (shown in both modes).
- **Accept** → `editorApi.setBody` (editor is mounted in both modes) → autosave;
  `body()` updates → preview re-renders if in View.
- `insert_figure` accept merges into the `figures` registry + persists, then
  `setBody` — all mode-independent.

No AI code path branches on `mode`. ✔

---

## 8. Implementation steps

All in `client/src/components/report/index.tsx` (one file), plus a tiny helper:

1. Add `const [mode, setMode] = createSignal<"edit" | "view">("edit")`.
2. Add the `renderEmbed(src, alt)` callback (figure/image registry lookups).
3. Import `MarkdownPresentationJsx`, `ButtonGroup` from `panther`.
4. Add the `ButtonGroup` to the toolbar. Pass `canConfigure={canConfigure() && mode() === "edit"}`
   to `ReportEmbedEditor` so its (already-relocated) insert/edit controls disappear in View.
5. Wrap the main area per §4 (CM hidden in View; preview `<Show>` in View; diff unchanged).
6. `createEffect` to clear `selectedEmbed` when leaving Edit (panel resets to its empty state).
7. Typecheck.

No server, lib, data-model, AI-tool, or `ReportFigureEmbed` changes. `ReportEditor`
already exposes everything needed.

**File manifest:** `client/src/components/report/index.tsx` (M). Optionally extract
the preview into `client/src/components/report/ReportPreview.tsx` (N) if `index.tsx`
gets too large — not required.

---

## 9. Open questions

1. **Persist the mode?** Default `"edit"`. Could persist per-report or globally
   (localStorage / `t4_ui`) like other view prefs. *Lean: not persisted in v1 —
   local signal, resets to Edit on open.*
2. **Preview fidelity vs export.** `MarkdownPresentationJsx` is the *screen* HTML
   render; it is NOT the paginated PDF/Word (that's the existing "Download" path,
   `PLAN_REPORTS.md` §5/§11). View ≠ print preview. Keep the Download button as the
   accurate-export route. *Decided: View is the readable HTML preview, not a page
   proof.*
3. **Content width / styling.** Pass `style?` / `contentWidth?` to
   `MarkdownPresentationJsx`? *Lean: defaults for v1; revisit with `ReportConfig`.*

---

## 10. Risks

- **Hidden-then-shown measure.** Switching Edit→View hides CM (fine); View→Edit
  un-hides it — call `editorApi.refresh()` (already exists) on entering Edit so CM
  re-measures, same as the post-diff refresh.
- **Two render paths for embeds.** Figures render via the CM widget in Edit and
  via `renderImage`→`ReportFigureEmbed` in View. Mitigated by funnelling both
  through the one `ReportFigureEmbed`; watch that sizing (`height`/`sizing`) stays
  consistent between the widget and the preview.
- **`MarkdownPresentationJsx` raw-HTML/table parity** with the export renderers is
  already covered by `PLAN_REPORTS.md` (constrained markdown vocabulary, no raw
  HTML); nothing new here.
