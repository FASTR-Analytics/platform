# PLAN: Protocol conformance catalogue (client)

Status: CATALOGUE ONLY, written 2026-09-06. Nothing here is built. Each item
is a tier-2 hit from `./validate_protocols` that is currently suppressed by
`validate_protocols_baseline.json`, plus one new hit the baseline does not
cover. Every item records what the conforming rewrite would be and what it
would change for the user, so each can be accepted, ruled out, or scheduled
on its own. Delete this file when every item below is either fixed or ruled
as a permanent exception.

The baseline lists accepted exceptions. It is not a record of technical debt.
The validator's tier-2 rules are heuristics: a hit means only "look at this".
Several entries below exist because the custom code does something the
generic pattern does not (partial UI during load, a non-blocking failure
path). Those are candidates for a permanent exception rather than a rewrite.

## Validator state on 2026-09-06

| Check | Result |
|---|---|
| Baseline entries | 18 |
| Still matching code | 16 |
| Stale (code changed, entry left behind) | 2, both in `AIDocumentSelectorModal.tsx` |
| New hit not in baseline | 1, `useAIDocuments.ts:58` |

Housekeeping that carries no risk: run `./validate_protocols --update-baseline`
once to prune the two stale entries and record the new hit. That restores the
"only NEW hits print" contract without changing any component.

## Rule: raw loading or error signals (STATE 9)

Protocol: loading state is a `StateHolder<T>` rendered through
`StateHolderWrapper`. In-flight button or form state goes through
`createButtonAction` or `createFormAction`. Never raw `loading`, `error`,
`data` signals.

### Submit-in-flight flags (three modals)

| File | Signal | Conforming rewrite | What changes |
|---|---|---|---|
| `email_opt_in_modal.tsx` | `loading` | `createButtonAction` taking the opt-in choice as its argument, close on success | A thrown Clerk update currently leaves an unhandled rejection and the modal open. The action would show an error alert instead. Both buttons stay disabled while in flight either way. |
| `organisation_modal.tsx` | `loading` | `createButtonAction`, close on success. The empty-value guard becomes redundant with the disabled button | Same error-alert change. The Save button would show panther's spinner rather than only being disabled. |
| `instance/pending_deletions.tsx` (`ForceDeleteModal`) | `loading` | `createButtonAction` around `forceDeleteProject`, close on success | Today the modal closes whether or not the delete succeeded and never inspects the response. The action would keep the modal open and alert on failure. This is the one entry in this group that is arguably a bug today. |

Decision needed: accept the alert-on-failure behaviour for the three modals,
or rule that a boolean in-flight flag is acceptable for a two-button modal and
make these permanent exceptions.

### Form save with validation

| File | Signals | Conforming rewrite | What changes |
|---|---|---|---|
| `project_ai/ai_prompt_library/SaveToPromptLibraryModal.tsx` | `isSaving`, `error` | `createFormAction` whose function returns `{ success: false, err }` for the two validation failures, and otherwise the create or update response. `StateHolderFormError` renders the error. `p.close({ saved: true })` is the success callback | The Save button shows a spinner instead of switching its label to "Saving...". The error moves from a custom div to the shared form-error component. Error content and timing are otherwise the same. Low risk. |

### Data loading with partial UI (four components)

These are the entries where the custom flag exists for a reason. The
generic `StateHolderWrapper` renders a single loading indicator in place of
its children, so anything the component shows during load today disappears.

| File | Signals | Conforming rewrite | What changes |
|---|---|---|---|
| `instance_geojson/geojson_edit_modal.tsx` | `loading`, `error` (plus `featureGroups`, `adminAreaOptions`) | One `createQuery` returns `{ featureGroups, adminAreaOptions, initialMappings }`. `currentMappings` stays a signal seeded from the ready data. The body renders inside `StateHolderWrapper` | The custom "Loading..." text and error paragraph become panther's indicator and error display. The modal header stays. Closest to a pure refactor of the four. |
| `slide_deck/index.tsx` | `isLoading` (plus `slideIds`, `deckLabel`, `deckConfig`, all set in the one effect driven by the server-sent events (SSE) stream) | One `createSignal<StateHolder<{ slideIds, label, config }>>`. Keep stale data visible on refetch (STATE 11). Set error only when nothing is loaded yet. Render `ProjectAiSlideDeckInner` inside `StateHolderWrapper`, dropping its `isLoading` prop and the pass-through to `slide_list.tsx` | Today the whole inner view mounts immediately with `isLoading` true, so the toolbar and frame are visible while slides load and `slide_list.tsx` handles the empty state itself. The rewrite shows only a loading indicator until the first fetch returns. Visible change. |
| `project_ai/ai_prompt_library/PromptLibraryModal.tsx` | `isLoading` | Two `createQuery`s. The markdown fetch must stay non-failing, wrapping `parseResult` including its own error status, because a GitHub failure must not block the modal. `getCustomPrompts` is re-run with `silentFetch()` after the four mutations. Both render through nested `StateHolderWrapper`s | The single loading indicator becomes two nested ones. Behaviour is the same if the markdown query is written to never fail. If it is written naively, a GitHub outage would block the whole library. That would be a regression. |
| `report/index.tsx` | `isLoading` | `StateHolder` becomes error when `getReportDetail` fails and ready once the collaboration session is bound. `StateHolderWrapper` replaces `<Show when={!isLoading()}>` around the editor row only | Today a failed detail fetch leaves the editor row hidden with no message while the header and status bar render. The rewrite would show an error in the editor area. The header and status bar stay because the wrapper scopes to the row. Low risk, but the file is 1,700 lines and the bind sequence has several branches (a fatal collaboration-session error, a read-only fallback) that must each end in a ready or error state. |

Decision needed per row. The geojson modal and the report editor can be done
without visible regression. The slide deck and prompt library each change what
the user sees during load and should be judged against the current user experience,
independent of the rule.

## Rule: effect opens with a guard before reading all deps (SOLIDJS 3)

Protocol: read every dependency first, then guard, so the tracked set does not
depend on the guard's state.

| File | Effect | Conforming rewrite | What changes |
|---|---|---|---|
| `whats_new_modal.tsx` (three effects) | queue-advance timer; play/pause on `active`; static-frame canvas draw | Hoist `p.canLoad`, `loaded()`, `p.active`, `staticFrame()` into locals above each guard | None observable. Each effect gains re-runs that hit the early return. |
| `instance/index.tsx` | post-login modals | Hoist `searchParams.p`, `currentUserApproved`, `clerk.user` above the guards | None. `clerk` is a plain Clerk instance rather than a Solid store, so reading `clerk.user` earlier tracks nothing new. The once-per-user latch is unchanged. |
| `report/ReportFigureEmbed.tsx` | `onMeasured` call | `const ok = hydrated().ok; if (ok) ...` | None. Satisfies the heuristic only. |

These five are safe mechanical edits and can be done together whenever
someone is in the files.

## Rule: `cond && <JSX>` (SOLIDJS 6)

| File | Site | Conforming rewrite | What changes |
|---|---|---|---|
| `version_history/report_version_preview.tsx` | `old={ch.oldVal && <ReportFigureEmbed .../>}` and the `neu` twin | Ternary to `undefined`, or a `<Show>` with a keyed callback | None. The receiving prop already goes through `<Show when={p.old}>`. |

## New hit: async effect without an out-of-order guard (STATE 12)

| File | Effect | Finding | Conforming rewrite | What changes |
|---|---|---|---|---|
| `project_ai/ai_documents/useAIDocuments.ts:58` | pending-attachments load on conversation switch | The effect does guard, by re-reading `conversationId()` after the await and comparing to the captured id. The heuristic only recognises a request-counter, so it flags this. | Request counter (`++requestId`, compare after await) as in the protocol example | Stricter than the current guard in one race: switch from conversation A to B and back to A while A's first load is still pending. Today the stale first load is accepted. The counter would drop it. End state is identical once the second load lands. |

Decision needed: adopt the counter idiom, or add this entry to the baseline as
an accepted alternative guard. Either is defensible. The counter is what the
protocol text specifies.

## Stale baseline entries

| File | Entry | Why stale |
|---|---|---|
| `project_ai/ai_documents/AIDocumentSelectorModal.tsx` | `guard-before-deps` | The file no longer contains a `createEffect`. |
| `project_ai/ai_documents/AIDocumentSelectorModal.tsx` | `raw-loading-signal` (`isLoading`) | The signal no longer exists. |

Prune with `--update-baseline`.

## Suggested order

1. Prune the two stale entries and record the new hit (no code change).
2. The five effect hoists and the two ternaries, one commit, no behaviour change.
3. The prompt-library save modal, one commit, low risk.
4. Rule on the three submit modals as a group.
5. Rule on the four data-loading components individually. Do the geojson
   modal and report editor first, if either is approved.
