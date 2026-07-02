# PLAN — Unified undo/redo for the report editor

One undo stack covering body text AND the figure/image registries, with AI
parity. Session-scoped (autosave means the server only ever holds the latest
state; that stays true).

## Current state (what this builds on)

- Body-text undo already works: the CM editor uses `basicSetup`
  ([report_editor.tsx:144](client/src/components/report/report_editor.tsx#L144)),
  which includes the history extension — Ctrl+Z/Ctrl+Shift+Z work, and an
  AI-accepted `setBody` is one transaction, so it's already a single undo step.
- Registry mutations bypass history entirely: `setFigures`/`setImages` +
  `persistFigures`/`persistImages` in
  [report/index.tsx](client/src/components/report/index.tsx). Registry-only
  edits (`update_report_figure`, sidebar Edit/Switch, image-file change) are
  not undoable at all.
- `handleDelete` is already token-only (registry entry kept for the session;
  orphans pruned at load), so undoing a delete already restores a working
  embed. This plan makes the remaining registry writes undoable too.

## Design

Registry changes travel INSIDE CodeMirror transactions as `StateEffect`s, so
CM's own history undoes "doc change + registry change" atomically.

**New file `client/src/components/report/report_history.ts`:**

```ts
// One effect per registry write; `prev` is what invertedEffects swaps back.
export const figureEffect = StateEffect.define<{
  id: string; block: FigureBlock | undefined; prev: FigureBlock | undefined;
}>();
export const imageEffect = StateEffect.define<{
  id: string; block: ImageBlock | undefined; prev: ImageBlock | undefined;
}>();

export const registryHistory = invertedEffects.of((tr) =>
  tr.effects.flatMap((e) => {
    if (e.is(figureEffect)) return [figureEffect.of({ ...e.value, block: e.value.prev, prev: e.value.block })];
    if (e.is(imageEffect)) return [imageEffect.of({ ...e.value, block: e.value.prev, prev: e.value.block })];
    return [];
  })
);
```

**`report_editor.tsx`:**

- Add `registryHistory` to the extensions.
- In the update listener, alongside the existing `docChanged → onBodyChange`,
  scan `update.transactions` for `figureEffect`/`imageEffect` and call new
  props `onFigureEffect(id, block | undefined)` / `onImageEffect(...)` —
  fired for undo/redo replays too, which is the point.
- Extend `ReportEditorApi`:
  - `dispatchEmbed(opts: { insertToken?: string; effects: StateEffect<unknown>[] })`
    — one transaction combining an optional token insertion with registry
    effects (effect-only when no token).
  - `undo()` / `redo()` / `canUndo()` / `canRedo()` (wrap the commands +
    `undoDepth`/`redoDepth`).

**`report/index.tsx`:**

- `onFigureEffect`/`onImageEffect` become the ONLY writers of the
  `figures()`/`images()` signals (post-load), and debounce-persist
  `persistFigures`/`persistImages` (same `AUTOSAVE_MS` pattern as the body) —
  so undo/redo persists too.
- Reroute every mutation site through `dispatchEmbed` instead of calling
  `setFigures`/`setImages` + persist directly:
  - `insertFigure` / `insertImage` — token + effect in one transaction (one
    undo step; replaces `updateFigure` + `insertEmbedOnNewLine` pair).
  - `handleSwitch` / `handleEdit` / `handleCreate` / `handleChangeImageFile` /
    `applyFigureUpdate` (AI `update_report_figure`) — effect-only transaction.
  - `applyProposal` — replace `editorApi.setBody` + figure pre-persist with
    one transaction: whole-doc change + one `figureEffect` per `addFigures`
    entry. Persist failure handling moves into the debounced persist (save
    indicator + conflict banner already cover surfacing).
  - `handleDelete` — token removal + effect clearing the entry (now cleanly
    undoable, so no need to keep orphans mid-session).
- `updateFigure` (the direct-write helper) disappears; `persistFigures` stays
  as the debounced sink.

**Toolbar:** undo/redo icon buttons in the report `HeadingBar` (next to the
save indicator), disabled via `canUndo()`/`canRedo()`; hidden in View mode.

**AI tools (`report_editor.ts`):** `undo` and `redo` tools — mode-guarded,
call `ctx.undo()`/`ctx.redo()` (new `AIContextEditingReport` methods →
`editorApi`), return what was undone is not knowable — return a generic
"Undid/Redid one step; call get_report_editor to see the current state."
This gives a reversal path for the no-modal `update_report_figure`.

## Risks / verify empirically first

- **Effect-only transactions must be recorded by CM history.** They should be
  (history events are created for transactions carrying inverted effects),
  but PROVE it with a scratch test before rerouting everything; if not,
  attach a no-op annotation/changeless workaround or fall back to pairing
  each registry effect with its token edit.
- The figure widgets re-render from the registries via reactive props — the
  signal writes moving into the update listener must not skip the
  `applyingProgrammaticEdit` guard logic for `notifyAI`.
- Conflict banner: undo persists like typing; no new interaction.

## Verify

1. `deno task typecheck`.
2. Browser: type → undo/redo; insert figure → one undo removes token AND
   resolves clean redo; AI accept → one undo step; `update_report_figure` →
   undoable (effect-only); delete embed → undo restores working embed; AI
   `undo` tool reverses its own figure edit; reload → latest state persisted,
   history gone.
