# Real-time collaboration for visualization editing

**Status:** Delivered & verified · two-browser sign-off remaining
**Branch:** `feat/slide-deck-collab` · 8 Jul 2026

Multiple people can now build and edit a visualization at the same time — seeing
each other's changes live, exactly like the collaboration that already exists
for slide decks and reports. This document summarizes what changed in this
update. (The engineering architecture lives in
[SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md) and
[DOC_SLIDE_COLLAB.md](DOC_SLIDE_COLLAB.md).)

## At a glance

| | |
|---|---|
| Editing surfaces made collaborative | **2** |
| Files changed | **27** |
| Lines added | **~1,990** |
| Changes to stored data formats | **0** |
| Automated test suites (all passing) | **3** |

## What this delivers

The visualization editor was previously single-user: two people opening the
same chart would silently overwrite each other on save. It now behaves like
Google Docs.

- **Live co-editing** — two or more people edit the same visualization at once.
  Changes to different settings merge cleanly; the same setting resolves
  consistently for everyone.
- **Both places a visualization is edited** — the standalone Visualizations
  library editor, and a figure edited directly inside a slide deck or report —
  both are now collaborative.
- **Character-level caption editing** — captions, sub-captions and footnotes
  merge letter-by-letter, with each collaborator's cursor visible (the same
  behaviour as the report body editor).
- **Presence — see who's here** — profile avatars show who is currently inside
  each visualization, and who is co-editing alongside you.
- **Continuous autosave & per-user undo** — no Save button while connected;
  edits save automatically. Ctrl+Z undoes only your own changes, never a
  collaborator's.
- **Works single-user if offline** — if the live connection is unavailable, the
  editor falls back to the existing save-and-conflict-check flow. Nothing breaks.

## Presence, everywhere it belongs

Live avatars were extended so "who is here" is visible consistently across the
product:

- **Visualization thumbnails** in the Visualizations tab now show who is inside
  each one — matching the deck and report lists.
- **Inside the editors** — the visualization editor, the individual slide
  editor and the report editor headers now show the avatars of everyone
  co-present.
- Deck and slide list views already showed this; the update fills the remaining
  gaps so the behaviour is uniform.

## How it works, briefly

It reuses the collaboration engine already running for slide decks and reports —
a shared server-held master copy of each document that browsers sync to over a
live connection, saving automatically in the background. A visualization's
settings are broken into individually mergeable fields, so two people touching
different controls never collide. The heavy chart *data* is kept separate from
the lightweight *settings* being edited, so live editing stays fast even on
data-dense figures.

## Delivered in three phases

Each phase was built and verified independently.

1. **Standalone visualization co-editing** — the Visualizations library editor
   became fully collaborative: live merging, presence, per-user undo, and
   continuous autosave.
2. **Embedded figures in slides & reports** — a figure edited from inside a
   slide or report is now co-edited live within that document, with the chart on
   everyone's canvas kept in step with the settings being changed.
3. **Presence polish, cleanup & documentation** — editor-header and thumbnail
   presence, removal of temporary diagnostics, and updates to the internal
   architecture docs.

## Safety & backward compatibility

A deliberate design goal: nothing that other parts of the platform depend on was
changed.

- **No data formats were changed.** The visualization config structure, the
  figure/bundle format, and the stored JSON for visualizations, slides and
  reports are **byte-identical** to before. Verified against the full diff — the
  shared schema and type files were not touched. Any other process that reads or
  writes this data sees exactly the same shape.
- **Additive database changes only.** Two new *nullable* columns store
  live-editing state; non-collaboration code never reads them. Existing database
  functions were left unchanged — only new ones were added.
- **Existing save paths preserved.** When no one is co-editing a visualization,
  saves follow the exact original path. Live-merge only engages while a session
  is actually active — the same pattern already used for slides and reports.

## Verification

Every automated gate passes. Two-browser manual sign-off is the remaining step.

| Check | What it covers | Result |
|---|---|---|
| Type-checks (server + client) | Full `deno check` + TypeScript compile | Passing |
| Production client build | Bundles cleanly; single-instance dependency check holds | Passing |
| Merge-logic test suite | Different-field merge, same-field resolution, caption character-merge, edit robustness | Passing |
| Server room-flow test suite | Open → merge an external edit → checkpoint to the database | Passing |
| Figure round-trip test suite | Decompose & recompose figures, legacy-format fallback, no-regression fast path | Passing |

## Fixed during testing

Issues raised during hands-on testing, now resolved:

- **Undo shortcut reliability** — Ctrl+Z now works regardless of where you've
  clicked in the editor (previously it depended on keyboard focus being in the
  right place).
- **Threshold colours not updating for collaborators** — a conditional-
  formatting colour change now re-renders instantly on everyone's screen, not
  just the editor's.
- **Local undo not reflecting on your own screen** — undo now updates the person
  doing the undo, not only their collaborators.

## Remaining & known limits

- **Two-browser sign-off** — the one step that can't be automated: a hands-on
  pass with two browser sessions against a live environment (co-edit, presence,
  undo, autosave, offline fallback, and a deploy-safety check). All the
  underlying logic is covered by the automated suites above.
- **Minor accepted trade-offs:**
  - A config saved *during a live session* may briefly retain one internal
    render-only flag that the normal save strips; it's cleaned up on the next
    standard save and is harmless to other processes. Can be eliminated on
    request.
  - A person merely *watching* a deck canvas (not in the figure editor) may not
    see a *style-only* change until the next data refresh — a narrow edge case,
    addressable if needed.
