# Plan: Fix Solid Reactivity Issues (client)

**Date:** 2026-07-16
**Scope:** `client/src` (all tsx/ts) and the panther browser modules `_303_components`, `_305_ai`, `_306_text_editor`, `_307_vizgraph_view` (reviewed in the panther source repo).
**Method:** 7 chunked pattern-finders + 2 free-exploring reviewers, then one independent adversarial verifier per finding (instructed to refute by default; 42 agents total). 39 raw findings → 33 after dedup → 23 confirmed, 7 convention-only, 3 refuted.
**Status:** report only — no fixes applied. The panther findings (3 confirmed + 6 latent) live in `PLAN_FIX_SOLID_ISSUES.md` in the panther source repo; this doc holds the wb-fastr client findings (**20 confirmed, 1 convention-only**) and the refuted records.

This review supersedes `PLAN_SWEEP_CLIENT_FOR_SOLID_REACTIVITY_ISSUES.md` (deleted). That plan's headline pattern — IIFEs in JSX — was a false premise: JSX expression positions compile to reactive inserts, so IIFEs re-run (verified via babel output 2026-06-10; all 14 hits triaged clean then). Its "reactive reads after early returns" pattern was refined to the real criterion (a run that completes with the relevant dependency untracked AND nothing else to wake it); destructured props and `createResource` had zero hits in both codebases; "derived values as props" is a non-issue (JSX attributes compile to getters).

Note on citations: `DOC_STATE_RULES.md` was consolidated into `PROTOCOL_APP_STATE.md` while this sweep ran; rule references below use the new doc.

---

## Confirmed — wb-fastr client (20)

### A. Frozen branch inside a `<For>` row callback (2)

`<For>`'s row callback (mapArray mapFn) runs once per item reference, untracked. Top-level logic in the callback is frozen for the row's lifetime; only JSX expression positions inside the returned tree stay reactive. Fix shape: move the condition into `<Show>`/JSX inside the returned tree.

1. **client/src/components/project/add_visualization/step_3_configure.tsx:96** — MEDIUM. `const isChecked = isRequired || p.selectedDisaggregations.includes(...)` computed once per row and passed to `Checkbox` as a static prop. Switching viz type resets `selectedDisaggregations` to `[]` but the same `disOpt` references survive re-filtering, so `<For>` reuses rows: the checkbox stays visibly checked while the actual selection is empty. Clicking Create silently builds the viz **without** the disaggregation shown as checked.
2. **client/src/components/instance/instance_projects.tsx:188** — MEDIUM. `if (project.status !== "ready")` in the row callback freezes the "Copying..." branch. `reconcile` (keyed by id) preserves item identity, so when a duplicated project flips to `ready` via SSE, the card stays a grayed, unclickable "Copying..." forever until reload.

### B. Mount-time snapshot of `currentUserIsGlobalAdmin` / permissions (6)

These T1 store fields change live (SSE `users_updated` → `updateCurrentUser` → `t1_store.ts:207`), but each site captures them once in the component body and bakes them into `columns`/`bulkActions` arrays or `<Show when={isAdmin}>` gates. Sibling JSX in the same files reads the flag reactively, so the UI goes split-brain on a mid-session role change. All LOW: mutations are server-guarded, staleness is UI-only and heals on remount. Systemic — fix once as a pattern (read the store in JSX/memos, or build columns in a memo).

3. **client/src/components/instance/instance_users.tsx:391** — `canConfigureUsers` const gates admin bulk actions; tab stays mounted on `can_view_users`, so revoked/granted configure permission doesn't update actions.
4. **client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx:780** (+ bulkActions at 809) — actions column frozen; header buttons at 831/854 are reactive.
5. **client/src/components/indicator_manager_hmis/indicators_manager.tsx:405** (+ 433, 606, 636) — same in both child tables; header buttons at 451/658 reactive.
6. **client/src/components/indicator_manager_hmis/calculated_indicators_table.tsx:177** (+ 213) — same; header at 230 reactive.
7. **client/src/components/indicator_manager_hfa/hfa_categories_manager.tsx:85** (+ 247) — `const isAdmin` freezes four `<Show>` gates (read-only list vs editable SortableList).
8. **client/src/components/indicator_manager_hfa/hfa_service_categories_manager.tsx:19** — same pattern, two `<Show>` gates.

### C. Unguarded async-effect races — last response wins (6)

Async effects that read tracked keys correctly at the top but commit their awaited result unconditionally. Two triggers within one fetch's flight time → older response can land last and stick. The repo already has the canonical guard three times (`indicatorsRequestId` in indicators_manager.tsx, `itemsFetchRunId` in visualization_editor_inner.tsx, `fetchRunId` in PresentationObjectMiniDisplay.tsx); these sites lack it. Note: `PROTOCOL_APP_STATE.md` mandates the guard only for Variant B — the recipe gap for Variant A shapes is itself worth a ruling.

9. **client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx:117** (six effects, 117–157) — MEDIUM. Two quick `hfaIndicatorsVersion` bumps (e.g. two drag-reorders) → stale category order overwrites the newer one; CategoriesPane reconciles its optimistic list back to the stale order, so the user's second reorder visibly reverts.
10. **client/src/components/slide_deck/slide_card.tsx:32** — MEDIUM. Slide mutations notify both `slides` and `slide_decks`; the deck refetch produces a fresh `deckConfig` object, so every card runs the effect twice per mutation with overlapping `convertSlideToPageInputs` calls. Rapid saves/AI edit bursts or a second viewer can leave a stale thumbnail.
11. **client/src/components/slide_deck/slide_deck_thumbnail.tsx:24** — MEDIUM. A single deck-config save fires `last_updated` then `slide_decks_updated`; run A (old config, loads now-removed overlay/logo images) can resolve after run B (new config) — deck-list thumbnail keeps showing removed logos/overlay.
12. **client/src/components/slide_deck/slide_editor/index.tsx:140** — MEDIUM. The 100ms debounce only cancels unfired timeouts. While an uncached image fetch is in flight, removing/converting that block resolves instantly and is then overwritten by the older image-bearing render: the editor preview shows stale content until the next edit. Preview-only (save uses `unwrap(tempSlide)`).
13. **client/src/components/instance_dataset_hfa/dataset_items_holder.tsx:47** — LOW. `hfaCacheHash` edit→revert while a cold fetch is in flight → table shows the un-reverted state. (ICEH sibling has the guard; HMIS sibling's equivalent claim was refuted — see below — because its toggle unmounts during load.)
14. **client/src/components/structure/with_csv.tsx:43** — LOW. Unkeyed server fetch of the full facility list; concurrent structure mutations (multi-user/multi-tab SSE) can commit stale rows into the table and the `onCsvReady` download snapshot.

### D. Other confirmed (6)

15. **client/src/components/slide_deck/slide_deck_settings.tsx:88** — MEDIUM. Unwrapped-store mutation: `unwrap(tempConfig)` then `newConfig.logos.availableCustom = ...filter(Boolean)` bypasses the setter. If `saveConfig` fails (modal stays open), raw data and UI diverge: a subsequent logo pick writes to the wrong index / a fresh array with no subscribers — silent, persistable corruption on retry. Sibling `dashboard_settings.tsx:105` does the same cleanup correctly via a fresh spread.
16. **client/src/components/slide_deck/style_editor/StylePreview.tsx:133** (+ 146, 159) — LOW. Logo effects track array references only; the per-index write `setTempConfig("logos","availableCustom", i, v)` fires no tracked signal, so the preview keeps rendering the old custom logo until an array-reference change or reopen.
17. **client/src/state/instance/t2_geojson.ts:17** — LOW. Module-level `Map`, non-reactive by design (documented for the initial-load race), but the undocumented consequence: a mounted map viz showing "Map files not yet uploaded" never recovers after the admin uploads the geojson — no figure path tracks geojson availability. Deterministic, heals on remount.
18. **client/src/components/PresentationObjectMiniDisplay.tsx:46** — LOW. Effect tracks `lastUpdated.presentation_objects[poId]` but the caches it renders through version on `moduleDataVersionKey` (`t1_store.ts:209` documents the required tracked read; the editor and ReplicateByOptions do it). Dataset re-integration with `skipModuleRerun` leaves mounted thumbnails on pre-integration indicatorMetadata.
19. **client/src/components/slide_deck/slide_list.tsx:331** — LOW. `handleReorder` applies the drag optimistically and discards the `moveSlides` result (siblings check `res.success`). On failure the server notifies nothing, so no rollback: UI shows the new order, server keeps the old, silent revert on reload.
20. **client/src/components/instance_assets.tsx:64** (+ 88, 288) — LOW. Component-initiated T1 writes + manual refetch after mutations duplicate the SSE path (`PROTOCOL_APP_STATE.md` "Write path — SSE only"), with a real multi-user response-ordering window (the projects refetch in t1_sse.tsx carries the abort guard; these don't).

## Convention-only / latent API traps (1)

No reachable failure today; would break silently under plausible future use.

- **client/src/components/slide_deck/slide_card.tsx:43** — `p.index` read after `await` (untracked). Inert only because `convertSlideToPageInputs`'s `slideIndex` param is declared but unused; wiring `showPageNumbers` through it would create stale thumbnail page numbers after drag-reorder.

## Refuted (3) — recorded so future sweeps don't re-flag

- **client/src/components/instance_dataset_hmis/dataset_items_holder.tsx:82** — claimed Raw/Common tab race is unreachable: `attemptGetDatatable` sets `loading` synchronously, which unmounts the toggle via the keyed StateHolderWrapper before the click unwinds; tab-driven fetches are strictly serialized.
- **client/src/components/structure/hfa_weights.tsx:135** — matches the documented Variant A recipe exactly (guard is mandatory for Variant B only); producers are heavyweight single-bump admin mutations, no plausible two-bump window.
- **modules/_306_text_editor/text_editor.tsx:52** — mount-frozen CodeMirror config (language/readonly/lineWrapping) is the standard imperative-wrapper pattern; sole consumer passes static literals; violates no house rule.
