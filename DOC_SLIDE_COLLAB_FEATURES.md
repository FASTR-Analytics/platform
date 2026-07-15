# Slide Deck Collaboration — Feature Catalog

What users get from the real-time collaboration system in the slide deck
editor. The companion doc [DOC_SLIDE_COLLAB.md](DOC_SLIDE_COLLAB.md) explains
how each of these is implemented.

**Reports have the same feature set** (its §13): live character-merged
co-editing of the report body with remote carets/selections and per-user undo,
figures/images syncing live, presence avatars on report cards, autosave
checkpoints with restart survival and reconnect catch-up, read-only mode for
view-only users, and AI edits that merge through the proposing user's live
session.

## Presence — who is where

- **Deck-list presence avatars.** On the project's deck list, each deck
  thumbnail shows the profile pictures (or initials on the user's color) of
  everyone currently inside that deck, bottom-left corner, with a `+N`
  overflow chip past five people.
- **Deck header presence.** Inside a deck, the header bar shows the avatars of
  everyone else currently in the same deck.
- **Per-slide presence.** In the slide list, each slide card shows the avatars
  of users who currently have that slide open in the editor.
- **Join/leave toasts.** A small notice ("Alice joined this deck") appears
  bottom-left when someone enters or leaves the deck, report or visualization
  you are in. Keyed per person (a second tab isn't a "join") with a short grace
  window so refreshes and reconnects stay silent; switching documents yourself
  never announces the people already there.
- **Idle dimming.** Presence tells you who is *actually* there: after a few
  minutes without any mouse or keyboard input, a user's avatar dims (greyed,
  faded) everywhere it appears — list cards, headers, slide cards — with an
  "idle" note in the tooltip. The moment they touch anything it lights back
  up. Someone actively editing is never shown dimmed.
- **"Editing now" pulse on list cards.** On the deck, report and visualization
  lists, a peer who is actively making edits (not just present with the
  document open) gets a small pulsing green badge on their avatar. It appears
  with their first edit and fades a few seconds after they pause, so a glance
  at the list distinguishes "has it open" from "working in it right now".
- **Stable per-user identity color.** Every user gets a deterministic color
  (hashed from their email) used consistently everywhere they appear: avatar
  fallback, editing borders, text carets, and selection highlights. Names and
  colors are stamped server-side from the authenticated user and cannot be
  spoofed; only the avatar image URL is self-reported.

## Live co-editing — everyone sees everything as it happens

- **Real-time slide sync.** All edits to a slide propagate live to everyone on
  that slide: text and titles, figures/visualizations (edit, switch, create,
  remove), layout changes (add/remove/rearrange/resize blocks, divider drags,
  block swaps), styles, and slide-type changes.
- **Character-level text merging.** Two people typing in the *same* text box
  merge per character (CRDT) — neither overwrites the other, and both watch
  each other's characters appear.
- **Remote carets and selections.** In every text field — the text-block body
  editor and all title/header fields (cover title/subtitle/presenter/date,
  section title/subtitle, content header/sub-header/date/footer) — you see
  each collaborator's caret as a colored bar with a hover name tag, and their
  text selections as a translucent highlight in their color — hover either
  the caret or the highlighted text itself to see who it is. Caret positions
  stay anchored to the right characters through concurrent edits, and your own
  caret never jumps when remote edits land.
- **Live cursors (Figma-style).** Each collaborator's mouse pointer appears on
  the slide canvas as a colored arrow with their name tag, moving in real time.
  The name tag fades after a few seconds of stillness (move your own mouse
  over a cursor to reveal its name again); idle cursors disappear;
  a cursor leaves the canvas → it vanishes for everyone. Also works inside the
  visualization editor (chart preview and settings panel), the report editor
  (both the markdown pane and the rendered preview), and on the project tab
  pages themselves (deck/report/visualization/dashboard lists and the other
  tabs — shown only to people on the same tab looking at the same folder
  view).
- **Cursor chat.** Press `/` over any cursor surface — slide canvas,
  visualization editor, report editor, or a project tab page — to type a
  short message in a bubble attached to your live cursor —
  collaborators watch it appear letter by letter. Enter keeps it up for a few
  seconds; Escape discards it. Great for "look at this ↘" moments without
  leaving the canvas.
- **Click ripples.** Every click on a shared surface shows collaborators a
  brief expanding ring in your color at that exact spot — pointing at
  something becomes a deliberate gesture instead of cursor-waving. Works
  everywhere live cursors do.
- **"Who is editing what" borders on the canvas.** The slide canvas outlines
  the content block or title field each collaborator is currently editing, in
  their color with a name tag above it. The report editor does the same for
  figures and images: selecting an embed outlines it on every collaborator's
  screen \u2014 around the embed widget in the markdown pane and around the
  rendered embed in the preview, whichever is visible (with a "\u270e figure"
  tag while its editor modal is open). When several people edit the *same*
  element, their name tags sit side by side and each editor gets a visible
  concentric border. The overlay hides itself while a modal (e.g. the
  visualization editor) covers the canvas.
- **Per-user undo.** Ctrl+Z undoes only your own changes — never a
  collaborator's — even when edits are interleaved in the same field.
- **View-only awareness.** Users with view permission but no configure
  permission see everything live (edits, carets, borders) but their editors
  are read-only.

## Autosave & persistence — no Save button

- **Continuous autosave.** There is no Save button; the editor has only a back
  button. Edits stream to the server as they happen and are checkpointed to
  the database on a short debounce (~1.5s) and, finally, when the last editor
  leaves the slide. Thumbnails and the deck list refresh automatically (SSE).
- **Conflict-free while live.** While collaboration is connected, concurrent
  edits merge via CRDT semantics — there is no "someone else saved first"
  error during normal co-editing.
- **Offline/fallback save.** If the collaboration connection is unavailable,
  the editor gracefully falls back to plain editing; the back button then
  saves explicitly, with a conflict-resolution dialog (overwrite / view theirs
  / save as new / cancel — cancel keeps you in the editor). Exits that bypass
  the back button get a best-effort background save.
- **Restart survival.** The live document state is persisted alongside the
  slide, so a server restart resumes co-editing exactly where it left off —
  including edits that hadn't been checkpointed yet.
- **Reconnect resilience.** Connections retry automatically with backoff and
  never give up; a banner shows "Connection lost — reconnecting…" (with a
  Reload option) so you always know when edits aren't syncing, and flashes
  "Live again" the moment the connection returns — instantly when your network
  or tab comes back. On reconnect the sync is two-way: the server sends what
  the client missed, and the client pushes back anything the server missed —
  so edits made during a network drop are recovered instead of lost.
- **External edits merge live.** A slide save that doesn't come from the
  editor (e.g. an AI deck-level edit) is routed through the live editing
  session when one exists: connected editors see it appear in real time, and
  it cannot silently overwrite (or be overwritten by) in-progress work.

## AI integration — collaboration-aware

- **Busy guard.** The AI refuses to modify or delete a slide that another user
  currently has open in the editor, and tells its user who is editing it and
  why it won't proceed.
- **Race-safe writes.** AI slide edits carry an optimistic version check; if a
  human save lands mid-edit, the AI gets a clear "the slide changed — re-read
  and retry" error instead of silently overwriting.

## Degradation & safety

- **Graceful degradation everywhere.** If the WebSocket can't connect (or
  nginx lacks the upgrade config), everything still works single-user: plain
  text fields, explicit save on exit, no errors.
- **Permission enforcement at every layer.** Presence requires view
  permission; every edit operation is authorized per-message server-side
  (configure permission); read-only users can't type locally either.
