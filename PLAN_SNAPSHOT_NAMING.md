# Plan: Snapshot-read naming convention for state getters

## Goal

Make the **read mode** of every state getter visible at the call site. After this change:

- A call like `getInstanceUsers()` becomes `getSnapshotInstanceUsers()` (or similar) — the name carries the warning that this is a non-reactive read.
- A reader scanning code immediately sees which calls subscribe to changes and which don't, without having to mentally cross-reference `DOC_STATE_RULES.md`.

This is a follow-on to the live-read / snapshot-read framework established in `DOC_STATE_RULES.md`.

## Why now? Why later?

**Why we should do it:** Non-reactive getters are easy to misuse. The current names (`getInstanceUsers`, `getIndicatorMappingsVersion`, `getProjectId`) are silent about their read mode. A developer who reads `if (getInstanceUsers().length > 0) ...` inside a `createEffect` has no signal that the effect won't re-run when the user list changes. Renaming makes the mistake visible.

**Why we're deferring:** The change touches many files (~20+ getter definitions, hundreds of call sites across the codebase). It's a sweeping rename that should happen as a focused PR, not bundled with feature work.

## Scope

### In scope

Every exported **non-reactive getter** that reads from a T1 store via `unwrap()` / direct snapshot access. These currently live in:

- `client/src/state/instance/t1_store.ts`
- `client/src/state/project/t1_store.ts`

Examples to rename (non-exhaustive — confirm by reading the files at change time):

| Current name | Proposed name | Location |
|---|---|---|
| `getIndicatorMappingsVersion` | `getSnapshotIndicatorMappingsVersion` | `instance/t1_store.ts` |
| `getInstanceFacilityColumns` | `getSnapshotInstanceFacilityColumns` | `instance/t1_store.ts` |
| `getDatasetVersionHmis` | `getSnapshotDatasetVersionHmis` | `instance/t1_store.ts` |
| `getInstanceMaxAdminArea` | `getSnapshotInstanceMaxAdminArea` | `instance/t1_store.ts` |
| `getInstanceCountryIso3` | `getSnapshotInstanceCountryIso3` | `instance/t1_store.ts` |
| `getInstanceProjects` | `getSnapshotInstanceProjects` | `instance/t1_store.ts` |
| `getInstanceUsers` | `getSnapshotInstanceUsers` | `instance/t1_store.ts` |
| `getInstanceAssets` | `getSnapshotInstanceAssets` | `instance/t1_store.ts` |
| `getHfaCacheHash` | `getSnapshotHfaCacheHash` | `instance/t1_store.ts` |
| `getHfaIndicatorsVersion` | `getSnapshotHfaIndicatorsVersion` | `instance/t1_store.ts` |
| `getCalculatedIndicatorsVersion` | `getSnapshotCalculatedIndicatorsVersion` | `instance/t1_store.ts` |
| `getProjectStateSnapshot` | (keep) — already conforms | `project/t1_store.ts` |
| `getProjectId` | `getSnapshotProjectId` | `project/t1_store.ts` |
| `getModuleIdForMetric` | `getSnapshotModuleIdForMetric` | `project/t1_store.ts` |
| `getModuleIdForResultsObject` | `getSnapshotModuleIdForResultsObject` | `project/t1_store.ts` |
| `getFormatAsForMetric` | `getSnapshotFormatAsForMetric` | `project/t1_store.ts` |

### Out of scope (do NOT rename)

These are NOT snapshot reads of T1 — they belong to other categories. Leave alone:

- **T2 cache fetchers**: `getDashboardDetailFromCacheOrFetch`, `getPODetailFromCacheorFetch`, `getReplicantOptionsFromCacheOrFetch`, etc. These hit the cache and may fetch over network. Already named `*FromCacheOrFetch` which signals their behavior.
- **T2 sync getters**: `getGeoJsonSync(level)` — already named `*Sync` which is a different naming convention worth keeping for cache-only synchronous lookups.
- **Pure derived helpers**: `getDisplayDisaggregationLabel`, `getAdminAreaLabel`, `getFigureInputsFromPresentationObject` — they don't read state; they're pure functions. No rename.
- **T4 readers**: `getDhis2SessionCredentials` — reads from `sessionStorage`, not from T1. Different concern; out of scope for this rename pass.
- **Server-side getters**: anything under `server/` or `lib/`. Not affected.

## Naming convention

Use prefix form: **`getSnapshot{Subject}`**.

Examples:
- `getSnapshotInstanceUsers()`
- `getSnapshotIndicatorMappingsVersion()`
- `getSnapshotModuleIdForMetric(metricId)`

Rejected alternatives:

- `get{Subject}Snapshot()` — suffix form. Loses scannability (you have to read the whole identifier to see the read mode).
- `snapshot{Subject}()` — drops the `get` verb. Inconsistent with rest of the codebase.
- `unwrap{Subject}()` — leaks implementation. The Solid `unwrap` is the mechanism, not the semantic.

The prefix form puts the **read mode immediately visible** when scanning the first half of a line.

## Mechanical steps

1. **Update the getter definitions** in `client/src/state/instance/t1_store.ts` and `client/src/state/project/t1_store.ts`. Rename each function; the body stays unchanged.
2. **Find and replace all call sites.** Use the IDE's symbol-aware rename refactor — NOT plain text find/replace, since some names overlap with other identifiers (e.g. `getInstanceProjects` could conflict with `instanceState.projects` shape).
3. **Update imports** wherever the renamed functions are imported.
4. **Update `DOC_STATE_RULES.md` rule #5** with one sentence: *"Snapshot-read getters are named `getSnapshot*`."* — to enshrine the convention going forward.
5. **Update `DOC_STATE_MGT_INSTANCE.md`** and **`DOC_STATE_MGT_PROJECT.md`** example code to use the new names.
6. **Typecheck** (`deno task typecheck`) to catch any missed call sites.
7. **Smoke test** the app — these getters are called from caches, side effects, and event handlers. A rename oversight would surface as a runtime "function not defined" error, not a typecheck error in some cases (e.g., if any caller uses dynamic property access or string-based references).

## Estimated effort

- Getter definitions: ~15-20 functions
- Call sites: ~80-150 (rough estimate; grep before starting)
- IDE-assisted rename refactor + typecheck loop: ~1-2 hours focused work
- Doc updates: ~15 minutes

Total: half a day. Should land as a single PR, no behavior changes — pure rename.

## Risks

1. **Long identifier names.** `getSnapshotCalculatedIndicatorsVersion()` is a mouthful. Mitigation: this is the cost of explicit naming. Code completion handles it.
2. **Merge conflicts.** A sweeping rename will conflict with any in-flight work that imports the old names. Mitigation: schedule when no other state-touching work is in flight, or merge fast.
3. **Missed call sites.** Some calls might be in less-obvious files (event handlers, lib helpers, AI tool implementations). Mitigation: use IDE refactor + grep audit; run app in dev and exercise major flows.

## Not doing in this PR

- **Renaming the T2 cache fetchers** (`getXFromCacheOrFetch`). Their names already describe behavior; renaming to `getLiveX` or similar adds noise without value.
- **Renaming reactive store fields** (`instanceState.users`, `projectState.dashboards`). The reactivity comes from the read context (JSX, createEffect), not the field name. Renaming would imply otherwise and is misleading.
- **Migration helper / codemod.** ~150 call sites is small enough that IDE rename handles it cleanly without a custom codemod.
