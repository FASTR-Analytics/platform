# PLAN: AI chat document attachments — caching + conversation scoping

Ruled 2026-08-28 from the demo-instance slow-chat incident (a ~630k-token PDF
attached in a forgotten per-project store made every session's first turns take
minutes and re-paid the full cache write repeatedly).

## Diagnosis (verified against code 2026-08-28)

- Attached docs ride a user message as Files-API `document` blocks, built by
  `createUserMessage` (`panther/modules/_305_ai/_components/_create_ai_chat.ts`)
  as `[...documentBlocks, textBlock]` — docs first, text last. Only
  not-yet-sent `file_id`s attach (the engine scans history), and each block
  carries `title` = the asset filename.
- The outgoing payload is `shapeCachedPayload(system,
  renderOutgoingMessages(messages))`. `renderOutgoingMessages`
  (`_110_ai_types/turn_logic.ts`) splices ephemeral view-context into the
  latest carrier's FIRST TEXT BLOCK — the block immediately after the doc
  blocks — and renders that carrier bare on any request where an assistant
  message follows it (tool-loop continuations, every later turn).
- `shapeCachedPayload` (`_110_ai_types/request_shaping.ts`) strips history
  breakpoints and places: one on the system prompt (unless consumer-placed
  ones exist) and one on the tail — the LAST user message's last block. Max 4
  per request is an API limit.
- Observed leak 1: the tail entry therefore always ends on the carrier's
  spliced text, which the next request renders bare — a byte mismatch that
  invalidates the entry. With no breakpoint between system and tail, the
  deepest stable boundary is the system prompt, so the doc payload re-writes
  (measured: 684,997 then 632,892 cache-creation tokens back to back).
- Observed leak 2: `cache_control` is bare `{type:"ephemeral"}` (5-minute
  TTL). Any >5-min pause in a human-paced chat re-writes the full prefix.
- Root lifecycle problem: attachments are per-project, per-browser, permanent
  (`ai-documents/${projectId}` in idb-keyval), so docs silently ride every
  future conversation in that project.

## Cache mechanics that drive A1 (API contract)

- Entries are written at each request's breakpoint positions and cover the
  full prefix through the marked block. Reads require a byte-identical
  prefix; each current-request breakpoint walks back at most 20 content
  blocks to find a prior entry (an unmoved breakpoint self-hits at distance
  zero). 5-minute TTL, refreshed on read.
- Consequence of the carrier rule, per turn shape:
  - Turn with a tool loop: the first continuation renders the carrier bare,
    misses the unstable tail entry, and re-pays everything past the deepest
    stable boundary ONCE — but its own tail lands on the tool_result message,
    past the now-bare carrier, creating a stable entry that all later
    requests read.
  - Tool-less turns: the turn's only request IS its first request, so its
    tail entry embeds the splice and is invalidated by the next turn — across
    a run of tool-less turns, every request re-pays everything past the
    deepest stable boundary.
- A breakpoint on the doc blocks (which precede the mutable text) is a stable
  boundary in both regimes: it caps the re-pay at the post-docs conversation
  text, and — because it never moves — it also self-hits when a >20-block
  tool turn strands the next request's tail from the previous entry.

## Decisions locked (Tim, 2026-08-28)

- NO per-message opt-in (inclusion is a one-way door per conversation — a
  toggle would promise control it can't deliver).
- NO attachment-size warning UI (ignorable warnings don't change outcomes).
- YES conversation-scoped attachments + per-project upload registry.
- YES docs cache breakpoint.
- NO TTL change: cache_control stays bare `{type: "ephemeral"}` (5m)
  everywhere. A 1h TTL would pay a 2x write premium on every session for a
  benefit confined to 5–60min idle gaps, add a mixed-TTL ordering invariant
  to the shared library, and distort token-based spend accounting — and
  conversation scoping removes the giant-prefix case that motivated it.

---

## Part A — panther

Edit in the panther repo at
`/Users/timroberton/projects/panther/timroberton-panther` — never edit this
app's synced `panther/` copy. When done: confirm the panther repo typechecks
and its tests pass, stage/commit this app's working-tree changes so the sync
diff stays isolated, then run `./sync` from the panther repo.

### A1. Docs cache breakpoint

`modules/_110_ai_types/request_shaping.ts`:

- Add `withDocumentsBreakpoint(messages: MessageParam[]): MessageParam[]`:
  find the LAST user message whose array-form content contains `document`
  blocks and set `cache_control: EPHEMERAL` on its LAST document block.
  Return the input unchanged (same reference) when there is no such message,
  or when that block already carries a breakpoint (the tail lands there when
  a doc-carrying message has no block after its docs). Pure — copy, never
  mutate, matching the file's existing contract; stored conversation state
  still never carries breakpoints (`createUserMessage` is unchanged).
- LAST, not first: the breakpoint caches the prefix up to it, and docs can
  join mid-conversation (`createUserMessage` attaches new refs on any later
  message). Targeting the last doc-carrying message puts every doc inside the
  stable prefix; everything before it is byte-stable because every non-latest
  carrier renders bare. Pinning an earlier doc message would leave later docs
  in the mutable region — re-paid once per attach in tool-loop turns and once
  per turn across tool-less turns. In the dominant single-attach case the
  last doc-carrying message is the only one.
- In `shapeCachedPayload`, after the existing system/tail placement: compute
  used = `countSystemBreakpoints(shapedSystem)` + the number of
  message-level breakpoints in the tail-shaped messages (0 or 1 — history is
  stripped first). Apply `withDocumentsBreakpoint` only when used < 4.
  Normal case: system 1 + docs 1 + tail 1 = 3 of 4.
- Non-targets by construction: tool_result user messages carry no top-level
  `document` blocks, and documents nested inside tool_result content don't
  match the top-level scan. `withTailBreakpoint`'s string→array conversion
  never produces document blocks.

Effect: the document prefix caches independently of the mutable text block
that follows it (the ephemeral splice), killing the re-pay in both turn
regimes above.

### A2. Tests (extend the permanent suite; no scratch harness)

`tests/ai_request_shaping_test.ts` already covers this surface — add cases
there and run `deno test tests/ai_request_shaping_test.ts`:

- Update the existing exact-count assertions on doc-carrying histories
  (`assertEquals(total, 2)`) to 3 — system + docs + tail is now the
  deterministic placement.
- Two-request flow: stored history msg1 = `[doc, doc, text]` with
  `ephemeralSections`; request 1 = `shapeCachedPayload(system,
  renderOutgoingMessages([msg1]))`, request 2 = the same over
  `[msg1, assistant, msg2]`. Assert request 1 places breakpoints on system,
  msg1's last doc block, and msg1's text (tail), total 3; assert request 2's
  payload is byte-identical to request 1 through the last doc block
  (JSON-stringify the prefix) with the docs breakpoint in the same position.
- Mid-conversation attach: two doc-carrying user messages — the breakpoint
  goes on the LAST one's last doc block only.
- Docs-only tail message (`content: [doc]`, no text): the tail breakpoint
  already sits on the doc block; assert no second marker and total 2.
- Budget: 3 consumer-placed system breakpoints + tail = 4 → docs breakpoint
  skipped; 4 consumer-placed → neither tail nor docs added.
- No-documents history: `withDocumentsBreakpoint` returns its input
  reference; shaped output is unchanged from today (the existing no-doc tests
  pin this).

---

## Part B — app: conversation-scoped attachments

Conversations are per-browser (panther persists them via idb-keyval,
`_305_ai/_core/persistence.ts`) with stable ids generated eagerly at
creation (`use_conversations.ts` — an id exists before any message);
attachment state inherits that scope.

### B1. Storage split (`client/src/state/project/t4_ai_documents.ts`)

Replace the file's contents (key `ai-documents/${projectId}`, type
`ProjectDocument`) with two stores, bare arrays, no wrapper object:

- **Upload registry** — key `ai-uploads/${projectId}` →
  `UploadedDocument[]` where
  `UploadedDocument = { assetFilename: string; anthropicFileId: string }`.
  Which instance-asset PDFs THIS browser has pushed to Anthropic Files;
  re-attaching in a new conversation reuses the `file_id` instead of
  re-uploading. Append-only in normal use: `getUploadsForProject`,
  `addUploadToProject` (no-op when the filename is already present).
- **Pending attachments** — key
  `ai-attachments/${projectId}/${conversationId}` → `string[]` of
  assetFilenames. Docs chosen for THIS conversation that have not yet ridden
  a message: `getPendingAttachments`, `setPendingAttachments`. A new
  conversation has no entry.

Docs that HAVE ridden a message need no store — the conversation history's
`document` blocks are the source of truth (each carries `title` = the asset
filename and a Files-API `file_id`).

No migration and no cleanup for the legacy `ai-documents/${projectId}` keys:
browser cache is disposable, silently detaching old forgotten docs is the
desired outcome, and unread keys are inert. No Anthropic-side deletion
anywhere in the new model — files referenced by the registry or by any
conversation's history must persist; orphans from removals are accepted
residue.

### B2. `useAIDocuments` (`client/src/components/project_ai/ai_documents/`)

The hook stays at the wrapper level (`index.tsx` — `config.getDocumentRefs`
must exist when the config object is built, BEFORE `AIChatProvider` mounts),
but the active conversation is only knowable inside the provider
(`ConversationsContext`). So the hook is late-bound:

- `useAIDocuments({ projectId })` exposes
  `bind(conversationId: Accessor<string>, messages: Accessor<MessageParam[]>)`;
  `ConsolidatedChatPane` (inside the provider, already holding both accessors
  from `createAIChat()`) calls it once in its component body. Sends can only
  originate inside the provider, so binding always precedes the first send.
- State: `registry` (loaded from idb on mount, refreshed after modal save)
  and `pending` (the bound conversation's assetFilenames). An effect on the
  bound `conversationId()` clears `pending` and loads the new conversation's
  list — eagerly, at bind and on every switch.
- `sentDocs()` memo: scan the bound `messages()` for top-level `document`
  blocks → `{ fileId, title }[]` (title = asset filename; skip blocks
  without one).
- Prune effect: whenever a pending filename's registry `file_id` appears in
  `sentDocs()`, rewrite the pending list (signal + idb) without it — write
  only on change. This keeps the store true to "not yet ridden"; a user
  message persisted by a failed turn still counts as ridden, matching the
  engine's own already-sent filter.
- `getDocumentRefs()`: resolve `pending()` through the registry →
  `{ file_id, title: assetFilename }[]` (filter out filenames missing from
  the registry — shouldn't occur, the modal writes the registry first). The
  panther seam is unchanged and synchronous, so no load-settled guarantee is
  possible: a send landing inside the ms-scale idb-load window gets `[]`,
  and the doc rides the NEXT user message via the engine's not-yet-sent
  filter. Accepted soft failure; eager loading makes it humanly unreachable.
- Drop `deleteAnthropicFile` and the legacy load/remove functions.

### B3. Selector modal (`AIDocumentSelectorModal.tsx`)

Props `{ projectId, conversationId, sentFilenames, pendingFilenames }`,
returns `string[] | undefined` (the new pending list; undefined = cancel).
Opened by the hook's `openSelector()`, which passes current derived state and
applies the result to the pending signal.

- Options = instance PDF assets ∪ (sent ∪ pending filenames), so a selected
  filename whose asset was deleted still renders instead of being silently
  dropped by `MultiSelect`'s onChange round-trip. Preselect sent ∪ pending.
- Sent entries cannot be un-sent: mark their options `disabled` if the
  `MultiSelect` option type supports it (see
  `panther/modules/_303_components/list_selection/`); regardless, save
  computes `newPending = selected − sentFilenames`, so sent membership is
  save-invariant and deselecting a sent doc is inert. Starting a new chat is
  the escape hatch.
- Save: for each filename in `newPending` absent from the upload registry,
  POST `/ai/files` (as today) and record `addUploadToProject` on success — a
  registry hit skips the upload entirely. A failed upload aborts the save
  with the error (registry entries recorded before the failure persist,
  harmlessly). Then
  `setPendingAttachments(projectId, conversationId, newPending)` and return
  it.
- Deselecting a pending doc = mere exclusion from `newPending` — no other
  side effects (no Anthropic delete, no registry change).
- Device-upload flow (Uppy → instance asset → auto-select) is unchanged.

### B4. Chip list (`AIDocumentList.tsx`) and pane wiring

- Props become `{ sent: { title: string }[]; pending: string[];
  onRemovePending: (assetFilename: string) => void }`. Sent chips render
  without ×; pending chips keep the removable ×. Show when either list is
  non-empty. Removing a pending doc touches only the pending list.
- `ConsolidatedChatPane`: call `aiDocs.bind(conversationId, messages)`, pass
  the derived lists to `AIDocumentList`. `index.tsx` wiring
  (`useAIDocuments({ projectId })`, `getDocumentRefs` in the config, `aiDocs`
  prop) is otherwise unchanged.

### B5. Dead route removal (`server/routes/project/ai_files.ts`)

With `deleteAnthropicFile` gone, `DELETE /files/:file_id` has zero callers;
`GET /files/:file_id` already has zero. Remove both handlers and their
route-tracker entries; keep `POST /files`. Old deployed clients' best-effort
DELETEs 404 into their existing catch-and-ignore.

### B6. Scope check

`client/src/components/indicator_manager_hfa/ai/` has its own chat pane and
provider — confirmed 2026-08-28 its config wires no `getDocumentRefs`; leave
untouched.

### B7. Verification

`deno task typecheck` green. No manual gate.

---

## Order of work

1. Part A in the panther repo → tests → typecheck → `./sync`
2. Part B in this repo → typecheck
3. Delete this plan when both land (gates green = done)
