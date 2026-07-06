# PLAN: GeoJSON — Near-Term Fixes (ship now, independent of the snapshot architecture)

Status: PARTIALLY IMPLEMENTED as of 2026-06-23; **fully re-verified against code + live DHIS2 2026-07-06**. Per-workstream status is marked inline below; remaining work is report-only until per-step go-ahead.

## Re-verification 2026-07-06 (code + live Cameroon/DRC APIs)

The §9 API gate was executed against both live instances (creds from Angelica's
May emails; both run DHIS2 **2.40.11.1**). Verdicts that CHANGE this plan:

- **(a) `featureType` — REFUTED.** It is absent from the `.json` fields
  projection for every org unit on both instances. The WS1 metadata-analyze
  design below is amended: geometry presence/counts come from
  `filter=level:eq:N&filter=geometry:!null&fields=id&pageSize=1` →
  `pager.total` (verified exact on both: Cameroon L3 200-with-geometry / 224
  total; DRC L3 519/519; ~1 KB, no coordinates downloaded).
- **(b) `name` — VERIFIED** present and non-empty in both the `.json` and
  `.geojson` property sets, both instances, both levels tested (L2/L3).
  Caveat: Cameroon L3 has **no `code` values at all** (224/224 empty in
  `.json`) — `name` is the only viable match key there. The geojson property
  set is exactly `[code, groups, level, name, parent, parentGraph]`.
- **(c) `parent` shape — VERIFIED** as predicted: `.json` returns an object,
  `.geojson` a uid string; normalization required. Bonus (verified): the
  `.json` fetch supports `parent[id,name]` inline, which makes the analyze
  path's separate `fetchParentNames` batching unnecessary.
- **New fact: the `.geojson` endpoint OMITS boundary-less units** rather than
  returning them with null geometry (Cameroon L3: 224 units in `.json`, 200
  features in `.geojson`, `nullGeometryCount` = 0). Today's
  `nullGeometryCount` is therefore always 0 on 2.40 and meaningless; the
  per-unit accounting must come from the metadata-vs-geojson set difference
  (WS2 coverage should report "24 units have no boundary in DHIS2").
- **Fresh timings:** Cameroon L3 geojson 19.5 MB in 13 s on a good day (the
  original 43 s measurement stands as the bad-day case — latency is
  variable); Cameroon L2 2.2 MB / 2.2 s. **DRC is snappy** (L3 5.4 MB /
  3.8 s) — DRC AA3 likely only freezes on slow days. **DRC AA4 = 10,325
  aires** (Cameroon L4 = 2,219) — confirms AA4 (payload + `step_3` render)
  is Plan 2 territory.
- **Code corrections found in the re-verify** (marked inline below): the dead
  `dhis2DetectLevelMapping` route was already deleted (S5 cruft, `ffd83907`);
  the wizard already shows client-side "N/M mapped" coverage (steps 3–4 and
  the edit modal) — WS2's "nothing counts coverage" premise is now wrong on
  the client side, right on the server/render side; step 4's wording says
  "kept unmapped (they can be mapped later)", which is accurate — the
  '"excluded" claim' is stale; the sessionStorage password store is opt-in
  (unchecked by default), not automatic. WS3 claims: all verified against
  current code. Angelica's DRC email also believes the import "grabs all
  levels at once" — it doesn't (one level per run); the comms note should
  gently clarify.

## Implementation status (2026-06-23, verified against code)

| WS | Scope | Status |
|----|-------|--------|
| WS1 | Import-freeze fix (metadata/geometry split + save-time guards) | **DONE 2026-07-06** (commit `805f6b15`) — metadata-only analyze (1–2 s vs 13–43 s), heavy fetch at save (180 s cap, maxAttempts 1), split caches with SHA-256 keys, empty-map + match-prop guards on BOTH save paths, per-uid name/code equality verified live on Cameroon + DRC. AA3 closed; AA4 stays in Plan 2 |
| WS2 | Match observability (coverage counting + typed sentinel) | **PARTIAL** — save-side counting DONE (`805f6b15` + `e3cac93d`: save routes return featureCount/matched/unmatched, wizard shows a completion panel). REMAINING: render-side coverage ("N of M data areas have a boundary"), Half B `area_id` validity join, the typed sentinel replacing `[INFO]` strings |
| WS3 | Export-resilience | **DONE** — split across commit `d3743456` (report/slide-deck/dashboard-render degradation, deployed in 1.52.0) **plus** the dashboard model-build gap (committed `a36121e2`). Re-verified 2026-07-06 |
| WS7 | Upload-edge hardening | **PARTIAL** — P1 filename-sanitization DONE (`a36121e2`); 32-bit plaintext cache-key hash replaced with SHA-256 (`805f6b15`); geojson 100 MB parse guard DONE (`14790e39`). REMAINING (need policy calls): global upload size/type caps (shared Uppy/TUS primitives serve datasets too — a cap needs a per-file-type policy), deeper geometry validation, the opt-in sessionStorage password store, TUS temp-file sweep |

The done work (WS7 P1 in `server/routes/instance/upload.ts`; the WS3 gap in the dashboard export files) has since been committed (`a36121e2`).

This is **one of two geojson plans**. This one covers the **near-term, layer-1 / orthogonal** work that can ship immediately and closes the reported production bug. The **bigger architectural work** (making geojson a portable project snapshot) is the companion doc **PLAN_GEOJSON_SNAPSHOT.md**. Read order: this plan first, then PLAN_GEOJSON_SNAPSHOT.md.

A cold reviewer needs no other docs to understand this plan, though PLAN_GEOJSON_SNAPSHOT.md explains why one item here (WS2) is built the way it is.

---

## 0. Context: the bug that started this

A user (Angelica, R4D) reported: *"the platform freezes with the direct import of GeoJSON files at the admin-3 level"* for the **Cameroon** and **DRC** DHIS2 instances; *"we have 100% match in all levels AA2–AA4, but the platform can't pull this much data at once."* She flagged it **not urgent**. Credentials were provided to test.

**Root cause, measured against the live Cameroon DHIS2 (dhis2 level 3 = AA3):**
- **200** district features (not thousands) — so it is *not* a feature-count problem and *not* (at this level) a client-render problem.
- **20.4 MB** payload for those 200 polygons (~100 KB each — full-resolution boundaries).
- **~43 seconds** just to fetch from DHIS2.

The server fetches that 20 MB inside a **60 s** budget ([server/dhis2/goal4_geojson/fetch_geojson.ts:5](server/dhis2/goal4_geojson/fetch_geojson.ts#L5)) and then, *in the same request*, parses it and runs `buildDhis2Context` (more DHIS2 calls). Total exceeds the budget → timeout/freeze. AA4 (more units) is worse; DHIS2 latency is variable. **It is a geometry-payload cliff in the analyze step.**

**Key insight that drives WS1:** the analyze/matching step needs only feature **properties** (names), never the polygon geometry. Geometry is only needed at **save**.

---

## 1. How the import works today (so the fixes make sense)

A 5-step SolidJS wizard ([client/src/components/instance_geojson/geojson_upload_wizard/](client/src/components/instance_geojson/geojson_upload_wizard/)), two source paths (file upload, DHIS2 direct):

- **Step 2** (`step_2.tsx`): pick admin level + dhis2 level → **"Fetch & analyze"** calls `dhis2AnalyzeGeoJson`. ← the freeze. The server fetches the full geojson, builds parent-name context, caches the whole FeatureCollection ([session_cache.ts](server/dhis2/goal4_geojson/session_cache.ts), keyed `url|user|password|level`, 15-min TTL, 10 entries), derives `properties`/`sampleValues` from feature properties, returns `{ properties, sampleValues, featureCount, nullGeometryCount, dhis2Features }`.
- **Step 3** (`step_3.tsx`): a per-value `<Select>` row maps each geojson property value → an admin area (un-virtualized `For` in a fixed-height box).
- **Step 4** (`step_4.tsx`): **"Save"** calls `dhis2SaveGeoJsonMap` → reuses the cached FeatureCollection (or re-fetches on expiry) → `processGeoJsonFromDhis2` strips each feature to `{ geometry, properties: { area_id, source_name } }` → upserts one TEXT row per admin level into `geojson_maps`.

Server routes live in [server/routes/instance/geojson_maps.ts](server/routes/instance/geojson_maps.ts); processing in [server/geojson/process_geojson.ts](server/geojson/process_geojson.ts); the contract in [lib/api-routes/instance/geojson_maps.ts](lib/api-routes/instance/geojson_maps.ts). `buildDhis2Context` ([build_dhis2_context.ts](server/dhis2/goal4_geojson/build_dhis2_context.ts)) reads only `uid/name/code/parent` from properties — never geometry.

---

## 2. Scope

**In this plan (all layer-1 / orthogonal; none depends on the snapshot architecture):**
- **WS1 — Import-freeze fix** (the bug). — **NOT STARTED**
- **WS2 — Match observability** (trust layer; built key-model-agnostic so it survives the Plan 2 key change). — **NOT STARTED**
- **WS3 — Export-resilience gap verification** (mostly already shipped). — **DONE** (remaining gap closed in working tree)
- **WS7 — Upload-edge hardening** (security/robustness). — **PARTIAL** (P1 filename-sanitization done; P2 not started)

**Deliberately NOT here → PLAN_GEOJSON_SNAPSHOT.md:** the project-level geojson snapshot, the snapshot-local match-key model (the real cure for silently-wrong maps), dedup of the duplicated processors/matchers/types, lifecycle/versioning/drift-repair, and snapshot-store efficiency/simplification.

---

## 3. WS1 — Import-freeze fix  ·  priority P0  ·  effort M  ·  STATUS: DONE 2026-07-06 (commit `805f6b15`; design below implemented as amended, all hardening items 1–8 in; item 9/AA4 deferred to Plan 2 as decided)

**Goal:** the matching UI is instant at any level/country, and **AA3** import completes instead of freezing.

**Scope correction (after review):** Angelica's email covered AA2–AA4. WS1 fully fixes **AA3** (the ~200-row case — server payload *and* client render are both fine). **AA4 is NOT closed by WS1 alone** — it strains on two axes: the save payload (facility boundaries can far exceed 20 MB → background worker, Plan 2) and the client render (thousands of `step_3` rows → virtualization, item 9). So WS1's definition of done = **AA3 works end-to-end**, and the comms note to Angelica **must** state that AA4 follows in Plan 2. Do not let "closes the bug" gloss the AA4 gap.

### Core change: split metadata-analyze from geometry-save
- **Analyze** (`dhis2AnalyzeGeoJson`): replace the 20 MB geojson fetch with a geometry-less metadata fetch: `GET /api/organisationUnits.json?level=N&fields=id,name,code,parent[id,name]&paging=false` (**amended 2026-07-06**: `featureType` is dead on 2.40 — drop it; `parent[id,name]` inline makes the separate `fetchParentNames` batching unnecessary). Geometry counts come from the verified probe `GET /api/organisationUnits.json?filter=level:eq:N&filter=geometry:!null&fields=id&pageSize=1` → `pager.total` (~1 KB; `level` MUST be expressed as a filter — a bare `level=` param is ignored when `filter=` is present). `featureCount` = with-geometry count; "units without boundaries" = total − with-geometry. Offer as match properties only keys guaranteed present in the `.geojson` (`name`, and `code` only when non-empty in metadata — Cameroon L3 has no codes). Build `sampleValues` from ALL units (including boundary-less ones — WS2's counting reports those; the save-side guards below protect correctness). Cache the **light** result (drop the ~20 MB-per-entry heavy cache). The analyze **response shape stays identical**, so `step_2/3/4` need no changes to consume it.
- **Save** (`dhis2SaveGeoJsonMap`): move the full `/organisationUnits.geojson?level=N` fetch here, with a generous timeout and a progress message. `processGeoJsonFromDhis2` → store, unchanged.

### Hardening the split must include (from adversarial review — these are required, not optional):
1. **Do not let `withRetry` wrap the heavy save fetch.** `fetchFromDHIS2` ([base_fetcher.ts:138](server/dhis2/common/base_fetcher.ts#L138)) always applies `withRetry` (default `maxAttempts: 5`), and `fetchOrgUnitsGeoJsonForLevel` ([fetch_geojson.ts:7](server/dhis2/goal4_geojson/fetch_geojson.ts#L7)) passes no retry options — so a transient failure re-downloads 20 MB up to 5×. Concrete fix: add a `retryOptions` param to `fetchOrgUnitsGeoJsonForLevel` and pass `{ maxAttempts: 1 }` from the save route.
2. ~~**Guard or delete the dead `dhis2DetectLevelMapping` route.**~~ **ALREADY DONE** (verified 2026-07-06): the route was deleted in the S5 cruft commit `ffd83907`; it no longer exists in `geojson_maps.ts`.
3. **Match-property existence check at save (silent-data-loss guard).** The match prop is chosen at analyze from the `.json` fields but applied at save against the `.geojson` `feature.properties`. `processGeoJsonFromDhis2` ([process_geojson.ts:107](server/geojson/process_geojson.ts#L107)) does `if (matchValue == null) continue` — so if the key is absent/differently-named in the geojson, **every** feature is dropped and an empty map is saved with no error. Two guards: (a) before processing, verify `areaMatchProp` exists on a sample geojson feature and **error** if not; (b) after processing, if `processedFeatures.length === 0`, **error** rather than store an empty map. Default to matching on `name` — but **do not assume `name` is a geojson property key**; `.json` and `.geojson` can differ, so confirm empirically (§9).
4. **`featureType` fallback — RESOLVED (2026-07-06): `featureType` is unusable** (absent from `.json` on both live 2.40.11.1 instances). Use the verified `filter=geometry:!null` count probe (see the amended Analyze bullet) — exact on both instances (Cameroon L3 200/224, DRC L3 519/519, matching the geojson feature sets precisely). Keep the analyze-side `featureCount === 0` error (level has no boundaries) driven by that count.
5. **`parent[id]` shape normalization — shapes CONFIRMED live (2026-07-06).** The geojson nests `parent` as a uid string; the `.json` fetch returns `parent` as an object (and `parent[id,name]` projection works, giving parent names for free). Normalize both to a `parentUid` string so `buildDhis2Context` is consistent (it currently does `typeof props.parent === "string"`).
6. **Explicit timeouts.** Thread an explicit timeout into the save fetch (e.g. `fetchOrgUnitsGeoJsonForLevel(creds, level, timeoutMs=180000)`) rather than bumping the global `FETCH_TIMEOUT` constant. Add an explicit `timeoutMs` on the `dhis2SaveGeoJsonMap` route (client default is 5 min — adequate, but make it explicit). Keep analyze on a short timeout (it's tiny now).
7. **Cache: separate namespaces for light vs heavy, then staleness.** Analyze and save share one cache via `getCacheKey(url, user, password, level)` ([session_cache.ts](server/dhis2/goal4_geojson/session_cache.ts)). The split stores two *different* payloads (light metadata, heavy geojson) — they **must use distinct key prefixes/TTLs** or they collide under the same key. Concrete: a metadata cache (short TTL) + a heavy-geojson cache (1–2 entries; item 8). Staleness: since the metadata fetch is now tiny, **re-fetch metadata at save** and compare to the cached set rather than trusting a 15-min-old snapshot. (The existing key also hashes the **plaintext password** with a weak 32-bit hash — fix under WS7.)
8. **Keep a small heavy-geojson cache (1–2 entries)** so a re-save after fixing a mapping isn't another 43 s fetch. (Today's behaviour reused the cache; don't regress the re-save case.)
9. **AA4 enablement — `step_3` virtualization (NOT needed for AA3; required for AA4).** At AA4 a country can have thousands of facilities, each an un-virtualized `<Select>` row in `step_3.tsx` (and the edit modal). Even with a fast analyze, the browser freezes rendering thousands of rows. This is one of the **two** things AA4 needs (the other is the background-worker save, Plan 2). It is **not** needed for AA3. Decision: ship WS1 as AA3-complete and leave AA4 (virtualization + worker) to Plan 2 — OR pull both into WS1 if AA4 must ship now. Recommended: **AA3 now, AA4 in Plan 2**, and say so to Angelica.

### Phasing within WS1
- **Phase 0 (optional interim, can ship in an afternoon):** raise the analyze fetch timeout 60 s → 180 s. The 43 s Cameroon AA3 fetch then likely *completes* during analyze. Cheap unblock; fragile for AA4 / slow days; not the real fix.
- **Phase 1:** the metadata/geometry split above. The real fix.

### Honest scope limit
Phase 1 reliably fixes **AA3** end-to-end. **AA4** is not solved by WS1 alone — it strains on *two* axes: the save payload (facility boundaries can far exceed 20 MB → needs the background worker + SSE progress in PLAN_GEOJSON_SNAPSHOT.md) and the client render (thousands of `step_3` rows → needs item 9's virtualization). Do not claim AA4 is closed by WS1; the comms note to Angelica must defer AA4 to Plan 2.

---

## 4. WS2 — Match observability (the trust layer)  ·  priority P0  ·  effort M  ·  STATUS: NOT STARTED

> **Verified 2026-06-23:** not implemented. No coverage tally exists at save or render; the `[INFO]`-string `Error` is still used as control flow (no typed sentinel). Note WS3 (done) currently degrades export figures via a **bare `catch`**, not this typed sentinel — the re-key below is still outstanding and is the WS2 hook into WS3.

**Goal:** make a wrong/partial map impossible to miss. Today unmatched features get `area_id=''` (kept — and step 4's wording, "kept unmapped (they can be mapped later)", is accurate; the earlier '"excluded" claim' was stale), and unmatched data rows render invisibly. **Correction 2026-07-06:** the wizard now DOES count coverage client-side — "N/M mapped" in steps 3–4 and matched/unmatched in the edit modal — so Half A's remaining scope is the **server-side save-time counts/guards** and the **render-side** coverage ("N of M data areas have a boundary"), which still don't exist anywhere. (Render-side invisibility remains the likely mechanism behind the reported Haiti "only one department" and Cameroun map errors.)

**Two halves with different key-model coupling** (a review correction — the earlier "fully key-agnostic" claim was only half true):

**Half A — coverage counting (key-model-agnostic; ships now, survives Plan 2 unchanged):**
- **At save:** report *"N of M features matched a chosen admin area; K unmatched"* — pure counting over the mapping the user built, independent of what `area_id` *is*.
- **At render:** surface *"N of M data areas have a boundary; N boundaries have no data."* **Correction:** panther `get_map_data` does **not** expose these counts — it builds the value maps but returns no coverage tally. WS2 must **compute the counts app-side** after the transform (or add a small count to panther `_010_maps`). Don't assume panther "already holds" them.
- **Threshold/policy (was undefined):** do **not** hard-block on "majority unmatched" — a country mid-rollout legitimately has partial coverage. Rule: **error only on 0 matched** (nothing would render); **warn-but-allow** otherwise, showing the coverage number (a prominent warning below ~70% matched is fine, but allow the save).

**Half B — `area_id` validity (interim name-based; tightens after Plan 2 WS-KEY):**
- **At save:** validate each chosen `area_id` resolves to a real admin area by joining `admin_areas_N`. **Correction:** that table is **name-keyed today**, so this join is **name-based in the interim** and gets re-pointed to the snapshot-local id once Plan 2's WS-KEY lands. Build it so the *interface* (matched/unmatched lists) stays stable while the *join key* changes.

**Cross-cutting:**
- **Typed sentinel:** replace the `[INFO] `-string `Error` used as control flow with a **typed result/enum**. Verified consumers (3 files): the throw in [build_figure_inputs.ts](client/src/generate_visualization/build_figure_inputs.ts); the normalize/check in [t2_presentation_objects.ts:217-222](client/src/state/project/t2_presentation_objects.ts#L217); the display check in [PresentationObjectMiniDisplay.tsx:127](client/src/components/PresentationObjectMiniDisplay.tsx#L127). Note: the dashboard export's `prepareFigures` currently **swallows** the throw to `null` (loses the reason), so threading a type also means updating `prepareFigures` to propagate it. ~3 files + the export guard — not a one-line swap.
- **Manager UI:** per-level coverage/health indicator (matched %, last-validated) instead of only level + `uploadedAt`.

**Why WS2 is here, not in Plan 2:** Half A is the user-facing trust win *and* the measurement tool Plan 2's WS-KEY backfill needs (verify no rows lost). Only Half B's join key changes with WS-KEY (see §7).

---

## 5. WS3 — Export-resilience: one real gap  ·  priority P0  ·  effort S  ·  STATUS: DONE

**Goal:** one map figure that can't resolve geometry must never abort an entire export.

**STATUS: DONE (2026-06-23), split across two changes.** (1) The earlier slice shipped + deployed (commit `d3743456`, live in 1.52.0): report and slide-deck exports degrade a failed figure to a placeholder; dashboard *render* already had `prepareFigures` try/catch ([_dashboard_pages.ts:30](client/src/exports/_dashboard_pages.ts#L30)). (2) The remaining model-build gap (below) is now closed in the **working tree (uncommitted)**. `deno task typecheck` passes both tiers.

**Corrections after verification (my earlier scope was wrong):**
- There is **no PNG export** in the codebase — drop it from scope.
- **XLSX export only touches table figures** ([export_dashboard_as_xlsx.ts:48](client/src/exports/export_dashboard_as_xlsx.ts#L48) `if ("tableData" in fi)`) — a map figure never reaches it, so nothing to harden there.

**The one genuine remaining gap — NOW FIXED (working tree, uncommitted):** the dashboard **build** step was unguarded. `itemFigureInputs` called `buildFigureInputs(item.bundle)` directly while constructing the export model — **before** `prepareFigures`' try/catch — so a throwing figure aborted the whole dashboard export at model-build.

**What was done (verified):**
- Added `tryItemFigureInputs` ([_dashboard_export_model.ts:18](client/src/exports/_dashboard_export_model.ts#L18)) — try/catch → `null`; `DashboardExportFigure.figureInputs` widened to `FigureInputs | null`. All three model-build sites repointed to it ([:100, :113, :121](client/src/exports/_dashboard_export_model.ts#L100)).
- `prepareFigures` ([_dashboard_pages.ts:32](client/src/exports/_dashboard_pages.ts#L32)) leaves an already-null figure as null (placeholder), only render-validating non-null ones.
- PDF ([export_dashboard_as_pdf.ts:78](client/src/exports/export_dashboard_as_pdf.ts#L78)) and PPTX ([export_dashboard_as_pptx.ts:40](client/src/exports/export_dashboard_as_pptx.ts#L40)) renderers substitute `placeholderMarkdown()` on null; PDF page-height falls back to `PDF_PLACEHOLDER_CONTENT_HEIGHT`.
- XLSX null-guarded ([export_dashboard_as_xlsx.ts:47](client/src/exports/export_dashboard_as_xlsx.ts#L47) `fi !== null && "tableData" in fi`) — required, not cosmetic (`"tableData" in null` would throw).
- Single-figure download modal ([download_dashboard_modal.tsx](client/src/components/public_viewer/download_dashboard_modal.tsx)) uses `tryItemFigureInputs` and surfaces a localized error if null (a one-figure download can't be placeholdered).
- The non-try `itemFigureInputs` remains only at the **live on-screen** render ([dashboard.tsx:372](client/src/components/public_viewer/dashboard.tsx#L372)) — correctly out of export scope.

**STILL OUTSTANDING (tracked under WS2):** the degrade is keyed off a **bare `catch`**, not WS2's typed sentinel. This is the documented interim (WS2 not built yet), but it means **any** figure-build failure — not just missing geometry — silently becomes a placeholder in exports, masking a real regression. Re-key off WS2's typed sentinel when it lands.

---

## 6. WS7 — Upload-edge hardening  ·  priority: path-traversal = P1; rest = P2  ·  effort M  ·  STATUS: P1 DONE; rest NOT STARTED

> **Verified 2026-06-23:** the P1 filename path-traversal fix is **DONE** (since committed, `a36121e2`) — see the bullet below. Every P2 item (size/type caps, parse guard, deeper geojson validation, credential handling, temp-file cleanup) is **NOT STARTED**.
>
> **Update 2026-07-02 (S5 review cycle):** adjacent ground shipped separately — read-side asset-path traversal closed repo-wide (`resolveAssetFilePath`, `ad6bd996`), DHIS2 passwords redacted from `user_logs` request-body logging, and analyze/save geometry-count parity fixed (`67870f28`). The P2 items listed here (size caps, parse OOM guard, deeper geometry validation, sessionStorage password persistence, 32-bit cache-key hash, temp cleanup) all still stand.

**Goal:** close the OOM/DoS and path-traversal surface on the authenticated upload path. Today the upload edge is essentially unguarded. **Priority correction after review:** the blanket "P2" undersold the **filename path-traversal** — treat that one-liner as **P1, pull it forward**; the rest (size caps, deeper validation, credential handling, temp cleanup) stays P2.

**Scope (all evidence-backed weaknesses found in the survey):**
- **Size/type caps:** enforce a max `Upload-Length` and `allowedFileTypes`/`maxFileSize` in **both** Uppy ([_uppy_file_upload.ts](client/src/components/_uppy_file_upload.ts), currently only `maxNumberOfFiles`) and server-side ([server/routes/instance/upload.ts](server/routes/instance/upload.ts), currently no MIME/size check).
- **Filename sanitization (P1 — pull forward) — DONE (working tree, uncommitted):** `sanitizeUploadFilename` ([upload.ts:97](server/routes/instance/upload.ts#L97)) `basename`s the metadata filename, normalizes Windows separators (`replaceAll("\\","/")`), and rejects `""`/`.`/`..` → `upload-${Date.now()}` fallback. Applied once at create ([:130](server/routes/instance/upload.ts#L130)) and the same sanitized value flows to the actual `Deno.rename` ([:282](server/routes/instance/upload.ts#L282)) and `createAssetMetadata` — so `../`, absolute, and Windows-separator traversal are all closed at the place that matters. Minor residue (non-blocking): dotfiles like `.env` still pass (land harmlessly in the assets dir; no traversal); same-name uploads overwrite (pre-existing behaviour, not a regression).
- **Parse guard:** add a feature-count/byte-size guard *before* `readTextFile` + `JSON.parse` in analyze/save — currently an unbounded parse → trivial OOM for any authenticated configure-data user.
- **Deeper geojson validation:** beyond the one-line type check — verify lon/lat order/range (WGS84), geometry types are polygonal, warn on non-unique match-property values.
- **Credential handling:** stop persisting the DHIS2 **plaintext password** to client session storage (verified 2026-07-06: `t4_dhis2_session.ts` stores it verbatim under `dhis2_credentials_session`, but only when the user ticks the opt-in checkbox, default off — real but narrower than "always"); replace the **32-bit, plaintext-concatenated** cache-key hash ([session_cache.ts](server/dhis2/goal4_geojson/session_cache.ts)) with a non-credential key or a proper KDF.
- **Temp-file cleanup:** reliably clean orphaned TUS temp files (current cleanup only walks the in-memory Map and only on a new POST).

---

## 7. Cross-plan dependency (the one coupling to Plan 2)

PLAN_GEOJSON_SNAPSHOT.md's match-key migration (WS-KEY) **backfills** existing geojson and needs a way to measure backfill correctness. **That measurement is WS2 Half A** (coverage counting). So:

- WS2 **Half A** (counting) ships in this plan, is key-model-agnostic, and is the tool Plan 2's backfill uses to confirm no rows were lost.
- WS2 **Half B** (the `area_id`-validity join) is name-based in the interim and gets **re-pointed to the snapshot-local id** when Plan 2's WS-KEY lands — its interface stays stable, only the join key changes.
- Plan 2's backfill must not start until WS2 Half A exists.

WS1, WS3, WS7 are otherwise independent of Plan 2.

---

## 8. Implementation order (within this plan)

1. ~~**WS7 filename-sanitization one-liner (P1)**~~ — **DONE** (`a36121e2`).
2. ~~**WS1**~~ — **DONE 2026-07-06** (`805f6b15`; no Phase-0 interim needed — went straight to the split). AA4 explicitly deferred to Plan 2.
3. **WS2** — save-side counting **DONE** (`805f6b15` + `e3cac93d`). **REMAINING:** render-side coverage ("N of M data areas have a boundary" — compute app-side after the panther transform), Half B `area_id`-validity join (name-based interim), the typed sentinel (~4 files incl. the export degrade re-key).
4. ~~**WS3** — the single build-step guard.~~ — **DONE** (`a36121e2`).
5. **WS7 (rest)** — geojson parse cap **DONE** (`14790e39`); SHA-256 cache key **DONE** (`805f6b15`). **REMAINING (policy calls needed):** global upload size/type caps (the Uppy/TUS primitives are shared with dataset CSVs — needs a per-type max ruling), deeper geometry validation, opt-in sessionStorage password store, TUS temp-file sweep.

**Remaining P0-adjacent work = WS2's render-side coverage + typed sentinel.** The WS7 remainder is P2 pending policy decisions.

**Shipping note:** "closing Angelica's email" = WS1 (**AA3**) implemented + **deployed** + a comms note that is **honest that AA4 follows in Plan 2**. Deploy state is currently clean (prod 1.52.0); the earlier logo/export fix is already live in 1.52.0.

---

## 9. Hard rules / verification

- ~~**DHIS2 API verification is a hard GATE**~~ — **GATE EXECUTED 2026-07-06** against both live instances (read-only). Results in the "Re-verification 2026-07-06" section at the top: (a) `featureType` REFUTED → use the `filter=geometry:!null` count probe; (b) `name` VERIFIED in both property sets (and is the only viable key on Cameroon L3 — no codes); (c) `parent` shapes confirmed (object in `.json`, string in `.geojson`; `parent[id,name]` projection works). WS1 code may proceed on the amended design.
- **Verify by executing**, not by reading.
- **Report-only until per-step go-ahead.**
- No payload-shape change without a cache-prefix bump (CLAUDE.md) — relevant if WS2's typed sentinel changes any cached shape.
- Stage app changes before any panther resync (WS2's render-count change touches the panther map join, `_010_maps`).
