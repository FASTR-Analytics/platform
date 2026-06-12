# PLAN_STATE_MGT_FIXES — punch list from the 2026-06-12 state-management review

Origin: comprehensive review of DOC_SSE_REALTIME / DOC_STATE_MGT_INSTANCE /
DOC_STATE_MGT_PROJECT / DOC_STATE_MGT_TIERS / DOC_STATE_RULES against live code.
All file/line claims re-verified against live code 2026-06-12; tier/auth calls
ruled by Tim same day — every item below is unblocked and concrete.

Working doc: check off / prune items as they land; delete the file when empty.
Contract changes are made in the DOC_* files themselves — this plan only tracks
the work (one authoritative doc per contract; this file restates nothing
normative).

---

## 0. Verified clean — do not re-investigate

- No component writes to T1 stores anywhere (only `resetProjectState` via t1_sse).
- No Variant B loading-flash violations found in consumers.
- Notify catalog complete, typed, matches DOC_SSE_REALTIME's wrapper list.
- All `silentFetch` uses are T3 upload-workflow polling or backups — legitimate.
- Removed project users DO get permissions downgraded correctly:
  `getProjectDetail` lists every instance user with no-access defaults, so the
  client's `find()` in `project_users_updated` always succeeds.

---

## 0b. Deviation disposition — every doc-vs-code deviation resolves one way

Code-direction = change code to match docs. Doc-direction = the implementation
is the better design; update docs to describe it.

| Deviation | Direction | Item |
| --- | --- | --- |
| aiContext in T1 with no update event (docs say T3) | code — keep T1, add event | F4 + §3 |
| "Slide deck meta" T2 cache doesn't exist (raw refetch) | code — build the cache | F11 + §3 |
| ICEH display uncached despite `icehCacheHash` in T1 | code — build the cache | F10 + §3 |
| T1/T2 field inventories stale (both MGT docs) | doc | §3 |
| `notify_project_updated.ts` → actual `notify_project_v2.ts` | doc | §3 |
| `addLastUpdatedListener`/`addRScriptListener` undocumented | doc — sanction it | §3 |
| Viz/report editors violate rule 6 (deliberate draft semantics) | doc — name "edit draft" mode | §3 |
| `moduleLatestCommits` = server data in T4 signal | doc — carve out or reclassify | §3 |
| CLAUDE.md describes deleted provider/hooks system | doc | §3 |
| `getProjectStateSnapshot`/`getProjectId` not unwrap-based | code | F12 |
| `createResource` used despite rule 9 ban | code | F7 |
| ReplicateByOptions createQuery+`.fetch()` hybrid | code | F13 |
| `currentUserEmail` prop-threaded into Project | code | F13 |

---

## 1. Production-impact server fixes — do first

- [x] **F1 — SSE connection leak on client disconnect. DONE 2026-06-12.**
      Both endpoints now register `stream.onAbort()` — project: wakes the
      parked `notifyNewMessage` promise; instance: closes the ReadableStream
      controller so `reader.read()` returns done — and check `stream.aborted`
      after the build and at the top of the forward loop. The loop-top check is
      load-bearing: it covers abort windows where the promise/controller does
      not exist yet (during the build or the `starting` write), in which case
      the onAbort callback has nothing to wake. The instance broadcast listener
      also early-returns when aborted so it can never enqueue into a closed
      controller.
      Verified empirically against locked hono 4.6.12 with a throwaway harness
      (was `/tmp/sse_abort_check.ts`; recreate if needed) replicating all three
      loop shapes: the OLD shape provably leaks (cleanup never runs after
      abort, even with post-abort broadcasts — confirms `write()` swallows
      errors on this version); both FIXED shapes forward messages normally,
      then clean up promptly on abort with zero further traffic. `deno task
      check` green. Not yet exercised in the running app (needs a server
      restart — no --watch). The shared-connection-helper factoring stays a
      DOC_SSE_REALTIME enforcement item, not done here.

- [ ] **F2 — project SSE auth: hard-deny unauthenticated connections.**
      `/project_sse_v2/:project_id` currently streams the full `starting`
      state (incl. `projectUsers` = every instance user's
      email/name/permissions) to unauthenticated clients: `authMiddleware` is
      bare `clerkMiddleware()` (never rejects), `getProjectUserForSSE`
      soft-fails to `undefined`, `getProjectDetail` proceeds without a user.
      Fix: hard-deny like the instance endpoint — mirror
      `requireGlobalPermission` with a project-level check;
      `getProjectUserForSSE` stops soft-failing to `undefined`. Open-access
      mode does NOT get anonymous SSE.

---

## 2. Client fixes

- [ ] **F3 — facilityColumns hash = count of trues.**
      `client/src/state/instance/t2_datasets.ts:37` and
      `client/src/components/structure/with_csv.tsx:43` use
      `Object.values(facilityColumns).sort().join("_")` — any two configs with
      the same number of enabled columns collide → stale display for wrong
      columns. Use lib `hashFacilityColumnsConfig` (already used by
      `staleness_checks.ts`) at both sites.

- [ ] **F4 — aiContext staleness: keep in T1, add the missing update event.**
      `aiContext` lives in T1 but is set only by `starting` — stale after
      every edit. Fix: add `aiContext` to the `project_config_updated` payload
      (producer: `server/routes/project/project.ts` `updateProject` route,
      which already calls `notifyProjectConfigUpdated`) + the client handler in
      `t1_store.ts`. Sync access in `build_system_prompt` keeps working.
      Consumers that must see updates: `project_settings.tsx:258` (display),
      `project_ai/build_system_prompt.ts:212` (AI system prompt). Optionally
      cap length server-side (the docs' old "unbounded content" concern).

- [ ] **F5 — cross-project SSE leak on direct A→B URL change.**
      `client/src/components/instance/index.tsx:191`: non-keyed
      `<Match when={getFirstString(searchParams.p)}>` + connect-in-onMount
      boundary. Add `keyed` to the Match (or make `ProjectSSEBoundary` track
      `props.projectId` in an effect and reconnect on change).

- [ ] **F6 — reactive_cache sentinel + prefix fixes.**
      `client/src/state/_infra/reactive_cache.ts`:
      - Never cache under `version === "pds_not_ready"`: have `get()` flag it /
        have `setPromise` refuse it, so not-ready-window fetches aren't
        persisted to IndexedDB and replayed later.
      - `clearEntriesWithPrefix` (line ~289): append a separator boundary so
        prefix `p1` cannot match `p10|…` (`clearEntry` already has `::`).
      - Fix the lying comment: `pdsNotRequired` does NOT build a "dummy PDS";
        it passes `pds!`, which is either the live not-ready store or literally
        `undefined` (no project open) — so `config.versionKey(params, pds!)`
        can receive `undefined`. Corrected comment must cover both cases.

- [ ] **F7 — remove `createResource` (rule 9).**
      `components/slide_deck/style_editor/StylePreview.tsx:109-126` (4 calls,
      user-facing, sits under the root `<Suspense>` in app.tsx — the exact
      full-page-flash topology the rule bans) → `createEffect` +
      `createSignal<StateHolder<T>>` (inputs are reactive, so not createQuery).
      `components/project/project_cache.tsx:20` (dev tab) → same or createQuery.

- [ ] **F8 — smaller robustness items** (batch, ~1 line each):
      - `preloadGeoJson` fire-and-forget from t1_sse: catch per-level failures
        (one rejecting level currently rejects the whole `Promise.all` →
        unhandled rejection); note `getGeoJsonSync` is non-reactive — map
        figures rendered before preload finish silently lack boundaries.
      - `ProjectSSEBoundary` 100ms `setInterval` polling of
        `connectionAttempts` → make attempts a signal.
      - `visualization_settings.tsx` `silentFetchPoDetail` no-op vestige —
        remove prop and the `async () => {}` in visualization_editor_inner.
      - `t2_images.ts` dead exports (`clearImageCache` etc. never called) —
        delete or wire; if kept, fix `TimCacheD.clearEntry` to also delete the
        IndexedDB entry.

- [ ] **F9 — Variant B stale-response guard.** Canonical pattern has a
      last-resolve-wins race on rapid SSE bumps (two version flips → two
      in-flight fetches → older can land last). Adopt the
      AbortController/onCleanup idiom already used by `InstanceSSEBoundary`'s
      projects refetch: apply to `dashboards/dashboard_editor.tsx:136`,
      `slide_deck/index.tsx:77` deck-detail effect (guard still needed there
      even once F11 gives it a cache), and write it into the canonical
      snippet (§3).

- [ ] **F10 — ICEH display: wire the T2 cache.** `icehCacheHash` sits in T1 as
      a version key, but ICEH display is uncached `createQuery` (no
      reactivity, silently stale on re-import). Build a reactive T2 cache
      keyed on `icehCacheHash`, same shape as HMIS/HFA.

- [ ] **F11 — deck detail: wire the T2 cache.** Heavy entity detail gets a
      reactive T2 cache everywhere — no "T2-without-cache" variant. Deck
      detail in `slide_deck/index.tsx` (raw uncached refetch on version flip)
      is the one outlier; give it a t2 cache like dashboards/slides/POs.

- [ ] **F12 — snapshot getters: make them actual snapshots (audit first).**
      `client/src/state/project/t1_store.ts`: `getProjectStateSnapshot()`
      returns the raw store proxy and `getProjectId()` is a reactive read;
      DOC_STATE_RULES defines snapshot reads as unwrap-based, and
      reactive_cache's "non-reactive snapshot" comment is currently false.
      ORDER MATTERS: the proxy's synchronous-prefix reads inside `cache.get()`
      give effects *implicit* tracking of the version key — which may be
      masking consumers that forgot the explicit `const _v =` read. Unwrapping
      first would un-mask those as silently-stale views.
      1. Audit every `*FromCacheOrFetch` call site inside a `createEffect`
         (grep `FromCacheOrFetch` across components/) and confirm each has an
         explicit tracked version-key read before the first await; add where
         missing.
      2. Then `unwrap()` in both getters.
      (If the audit turns up many implicit-tracking dependents, the fallback is
      doc-direction: rename/describe the proxy-snapshot semantics honestly —
      but prefer the unwrap.)

- [ ] **F13 — conformance batch (small, no behavior change).**
      - `components/ReplicateByOptions.tsx:68,148`: createQuery + effect calling
        `.fetch()` on tracked input changes → convert to the canonical
        `createEffect` + `createSignal<StateHolder<T>>` shape (rule 6's own
        "convert it" remedy). Watch for the current double-fetch on mount
        (createQuery auto-run + effect run) disappearing — that's expected.
      - `components/instance/index.tsx:194` / `components/project/index.tsx`:
        stop prop-threading `currentUserEmail` into Project; read
        `instanceState.currentUserEmail` directly in ProjectInner
        (`_DEV_USERS` check).

---

## 3. Doc sweep — LAST, after fixes land, so docs describe reality

One pass over the five DOC files + CLAUDE.md.

- [ ] **CLAUDE.md** — replace the stale "State Management" section (describes
      deleted provider.tsx / useProjectDetail / hooks world) with a pointer to
      the DOC_STATE_* docs.
- [ ] **DOC_STATE_MGT_PROJECT.md** — architecture table file name
      (`notify_project_updated.ts` → `notify_project_v2.ts`); T1 table: add
      reports, reportFolders, dashboards, icehIndicators, hfaTaxonomy,
      isCentralReporting, currentUserEmail, projectLastUpdated; lastUpdated
      table names: add dashboards, dashboard_items, reports; T2 table:
      re-point the "Slide deck meta" row at the real deck-detail cache (F11);
      aiContext is T1, updated via `project_config_updated` (F4) — fix the
      "always T3" rows.
- [ ] **DOC_STATE_MGT_INSTANCE.md** — T1 table: add adminAreaLabels, hfaWeights,
      icehCacheHash, calculatedIndicatorsVersion; T2 table: add
      calculated-indicators cache, ICEH cache keyed on `icehCacheHash` (F10),
      HMIS version key also includes maxAdminArea.
- [ ] **DOC_STATE_MGT_TIERS.md / DOC_STATE_RULES.md** —
      - Name the third read mode: **edit draft** (snapshot-at-open, explicit
        save or autosave + optimistic concurrency via lastUpdated round-trip,
        never live-merge SSE into a draft). Cite viz editor + report editor as
        canonical. Rule 6 currently outlaws what they correctly do.
      - Add the stale-response (AbortController) idiom to the canonical
        Variant B snippet (F9).
      - Document the reactive_cache sentinel versions ("pds_not_ready",
        "unknown") and the never-cache-under-sentinel rule (F6).
      - Document the imperative listener side-channel
        (`addLastUpdatedListener` / `addRScriptListener`) as the sanctioned
        ephemeral-events path (R-script logs, AI invalidation) outside the
        store model.
      - T4 definition vs `moduleLatestCommits` (server data in a T4 signal):
        either carve out "session-cached server data" or reclassify.
      - Heavy-entity-detail rule: always a reactive T2 cache, no uncached
        variant (F10/F11).
- [ ] **DOC_SSE_REALTIME.md** — add abort handling as step 6 of the connection
      lifecycle (post-F1, the "cleanup in finally" claim is true again but only
      because of onAbort); replace the soft-auth gotcha with the rule:
      project SSE hard-denies unauthenticated clients, including in
      open-access mode (F2); note `projectsLastUpdated` is
      server-stamped `new Date()` in `starting` → every reconnect triggers a
      redundant `/my_projects` refetch (fix or document).
- [ ] **Consumer-divergence alignment** (already a DOC gotcha, still true):
      retry counts (5 vs 3), parse strategy, failure UI, boundary
      implementation — align the two t1_sse consumers behind one contract.

---

## Suggested order

1. F2 (SSE auth) — security.
2. F4 (aiContext) — user-visible bug.
3. F3, F5, F6, F7 — small client bugs, independent.
4. F8, F9 — robustness batch.
5. F10, F11 — the two new t2 caches.
6. F12, F13 — conformance (F12's audit step before its unwrap).
7. §3 doc sweep last.
