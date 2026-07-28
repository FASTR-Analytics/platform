# INVESTIGATE: "Cannot convert a Symbol value to a string" in AI figure tools

## Status: ROOT CAUSE ESTABLISHED AND REPRODUCED

The mechanism is fully understood and reproduced end-to-end (§4). A fix for it
is **already in `main`**, shipped in **v1.61.1** (commit `bfcd3da7`, 2026-07-21).
The open question is operational, not diagnostic: **which platform version the
CAR instance is running** (§6).

Reported by Angélica López Hernández (R4D), 2026-07-27, four emails on the
thread "DQA tables: bug report in CAR instance" (to Tim + Nick; cc Ashley,
Claire, Caitlin, Meghan).

---

## 1. Problem statement (user-facing symptom)

In the CAR instance, AI assistant figure tools fail with:

> `Cannot convert a Symbol value to a string`

The failure blocks report authoring: the AI cannot apply indicator filters to
figures, so the user must open every slide in the visual editor and select
indicators by hand. With 70 indicators in the project and 7 regional slides,
this is hours of manual work.

### Reported triggers

| # | Trigger | Reported in |
|---|---|---|
| 1 | `from_metric` **with** `filters: [{disOpt: "indicator_common_id", values: [...]}]` | msg 1 |
| 2 | `from_metric` **without** any filter (preset alone fails to render) | msg 1 |
| 3 | `update_figure` with `filterBy` | msg 1, 2, 3 |
| 4 | `update_figure` with *any* patch at all — including `footnote: ""` or a caption change | msg 4 |
| 5 | Slide layout modification with a new `from_metric` block | msg 1 |
| 6 | Block replacement via `update_slide_content` with a `from_metric` block | msg 1 |

### Reported affected metrics / presets

- **DQA tables** (msg 1) — presets `completeness-table`, `outlier-table`,
  `consistency-table`, `dqa-score-table`, `mean-dqa-table` on metrics
  `m1-01-01`, `m1-02-02`, `m1-03-01`, `m1-04-01`, `m1-04-02`
- **Disruption charts** (msg 2, 3) — preset
  `disruption-chart-single-admin-area-2`, saved viz
  `dee25984-afe7-4643-a823-fd0e26b3cbc0`. The `admin_area_2` replicant works;
  layering an `indicator_common_id` filter on top does not, so all 7 regional
  slides (RS 1–7) show all 48 indicators instead of the relevant 8–10.
- **Coverage metrics** (msg 4) — `m6-01-01`, `m6-02-01`, across 16 figures on 8
  slides.

Reproducible 100% of the time, per the reporter.

### Reported workarounds (both bad)

- Insert via `from_visualization` with a saved viz ID — renders, but saved
  visualizations accept no additional filters, so indicator filtering is
  impossible programmatically.
- Rebuild the figure from scratch via `update_slide_content` — destructive:
  discards replicant, filters, period and footnote, resetting to defaults.

### Reporter's hypothesis — partly wrong, worth stating

The AI chat that wrote the bug reports guessed the Symbol was authored into the
preset/metric config ("replace it with a regular string key") and that
`JSON.stringify` was the crash site. **Both are wrong.**

- No `Symbol(` literal exists anywhere in `client/`, `lib/`, or `panther/`.
  Nothing in a preset, metric or config is authored as a Symbol.
- `JSON.stringify` does not throw on Symbols — it silently skips them. The crash
  is *string coercion*, which is a different operation.

The Symbol is injected at runtime by SolidJS, and the crash is in our own error
formatting. See §3.

---

## 2. Reports are consistent with ONE bug, not several

Msg 1 says `from_visualization` **works**; msg 2 says the bug affects anything
built from `from_visualization`. That looks contradictory, but is not: the
common factor in every failing case is the **figure-config resolve step**
(`from_metric` create, `update_figure` edit), which both tools route through.
`from_visualization` *insertion* is a genuinely different code path
(`resolveFigureBundleFromVizConfig`) that reads from a plain-JSON cache and
never touches the Solid store — which is why it works. What msg 2 actually hit
was `update_figure` applied *to* a figure that had been inserted via
`from_visualization`; that edit goes through the metric resolve path like
everything else.

So: one bug, one crash site.

---

## 3. Root cause

A four-step chain. Each link is verified in §4.

### 3.1 SolidJS stamps hidden Symbol keys onto raw store objects

`client/src/state/project/t1_store.ts:56` holds project state — including
`metrics` — in a Solid `createStore`. Reading *any* nested object through the
store proxy causes `solid-js/store` to define two symbol-keyed properties on the
**raw target object**:

```js
// solid-js/store/dist/store.js
const $NODE = Symbol("store-node");
// wrap():
Object.defineProperty(value, $PROXY, { value: p = new Proxy(value, proxyTraps) });
// getNodes(), called unconditionally by the `get` trap:
if (!nodes) Object.defineProperty(target, symbol, { value: nodes = Object.create(null) });
```

Neither `defineProperty` call passes `enumerable`, so both default to
**non-enumerable**. This is what makes the bug so hard to see:

- `Object.keys(obj)` → clean
- `JSON.stringify(obj)` → clean
- `unwrap(obj)` → returns the raw target, symbols still attached
- `Reflect.ownKeys(obj)` → **shows them**

The stamping is permanent for the page's lifetime, and happens as a side effect
of *any* component having rendered that metric.

### 3.2 Zod's record parser enumerates with `Reflect.ownKeys`

`zod@4.3.6`, `zod/v4/core/schemas.cjs:1392`:

```js
for (const key of Reflect.ownKeys(input)) {
    if (key === "__proto__") continue;
    let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
    ...
    payload.issues.push({ code: "invalid_key", ..., path: [key] });
}
```

`z.record()` — unlike `z.object()` — walks **all** own keys including
non-enumerable symbols, runs the key schema (`z.string()`) against each, and on
failure pushes an issue whose `path` contains **the raw Symbol**.

### 3.3 The only record field on the hot path is `valueLabelReplacements`

`figureBundleSchema` (`lib/types/_figure_bundle.ts:104`) has exactly two
`z.record` fields:

- `items` → `jsonArrayItemSchema` (line 95) — sourced from a server fetch, plain
  JSON, **never** store-backed. Not a vector.
- `resultsValue.valueLabelReplacements` (line 61) — sourced from
  `metric.valueLabelReplacements`, i.e. **straight off the Solid metrics
  store**. This is the vector.

`presentationObjectConfigSchema` contains no `z.record` at all, so `config`
alone cannot trigger it.

Every metric named in the bug reports has a non-empty `valueLabelReplacements`
in its authored `definition.json` (verified in `wb-fastr-modules`):

```
m001: m1-01-00 → empty   m1-01-01 → 1   m1-02-02 → 1
      m1-03-01 → 5       m1-04-01 → 1   m1-04-02 → 1
m006: m6-01-01 → 3       m6-02-01 → 3
```

### 3.4 The crash is our own error formatting

`client/src/generate_visualization/resolve_figure_from_metric.ts:98-106` — the
construction-time bundle validation:

```ts
const validation = figureBundleSchema.safeParse(bundle);
if (!validation.success) {
  const issue = validation.error.issues[0];
  throw new Error(
    `Invalid figure bundle at "${issue.path.join(".")}": ${issue.message}`,
  );
}
```

`safeParse` itself does **not** throw. `Array.prototype.join` implicitly coerces
each element to a string, and implicit coercion of a Symbol throws
`TypeError: Cannot convert a Symbol value to a string`. That is the exact
message the users see, and it masks the real validation error underneath.

### Why every trigger in §1 fails identically

`from_metric` and `update_figure` both funnel into
`resolveBundleFromMetricAndConfig` → `resolveFigureBundleFromMetric`:

- `resolve_figure_from_metric.ts:24` (`from_metric` create path)
- `slide_editor.tsx:426` (`update_figure` edit path)
- `report_editor.ts:378` (`update_report_figure`)

The bundle is validated at construction on **every** call, before any patch
semantics are considered. This is why trigger 4 — `footnote: ""` — fails just as
hard as a filter change: the patch is irrelevant, the crash happens during the
mandatory re-resolve. It is also why trigger 2 (`from_metric` with no filter at
all) fails: filters were never the issue.

---

## 4. Reproduction (verified, not theorised)

Run against Solid's **browser** build — Deno resolves `solid-js` to the SSR
build by default, which has no proxies and will not reproduce this.

```
deno.json imports:
  "solid-js":       "npm:solid-js@1.9.10/dist/solid.js"
  "solid-js/store": "npm:solid-js@1.9.10/store/dist/store.js"
  "zod":            "npm:zod@4.3.6"
```

```ts
const [metrics] = createStore({
  list: [{ id: "m6-01-01", valueLabelReplacements: { a: "A", b: "B" } }],
});
void metrics.list[0].valueLabelReplacements.a;   // any read through the proxy

const rawVLR = unwrap(metrics.list[0]).valueLabelReplacements;
const r = z.record(z.string(), z.string()).safeParse(rawVLR);
r.error.issues[0].path.join(".");
```

Output:

```
symbols on raw valueLabelReplacements: [ "Symbol(solid-proxy)", "Symbol(store-node)" ]
Object.keys(rawVLR):      [ "a", "b" ]                                    <- looks clean
JSON.stringify(rawVLR):   {"a":"A","b":"B"}                               <- looks clean
Reflect.ownKeys(rawVLR):  [ "a", "b", "Symbol(solid-proxy)", "Symbol(store-node)" ]
safeParse success: false
issue codes: [ "invalid_key", "invalid_key" ]
>>> CRASH on path.join(): Cannot convert a Symbol value to a string
path.map(String).join:    Symbol(solid-proxy)                             <- does not crash
after structuredClone, safeParse success: true                            <- clone clears it
```

---

## 5. The fix already in `main` (v1.61.1, commit `bfcd3da7`, 2026-07-21)

Two changes, one per link in the chain:

**Root cause — stop symbols entering the parse**
(`resolve_bundle_from_metric_and_config.ts:23-24`):

```ts
metric = structuredClone(unwrap(metric));
config = structuredClone(unwrap(config));
```

`structuredClone` drops symbol keys entirely (verified in §4). `unwrap()` alone
is **not** sufficient — it returns the raw target with the symbols still on it.

**Symptom — stop the formatter crashing**
(`resolve_figure_from_metric.ts:104`):

```diff
-`Invalid figure bundle at "${issue.path.join(".")}": ${issue.message}`
+`Invalid figure bundle at "${issue.path.map(String).join(".")}": ${issue.message}`
```

`String(sym)` is explicit coercion and is legal; only implicit coercion throws.

Both fixes are on the three code paths that matter (`from_metric`,
`update_figure`, `update_report_figure`), because all three route through
`resolveBundleFromMetricAndConfig`.

---

## 6. RESOLVED: CAR is on 1.59.1 — it needs the deploy, not a code change

The crash site `issue.path.join(".")` **only existed before v1.61.1**. The exact
string "Cannot convert a Symbol value to a string" cannot be produced anywhere
else in `client/`, `lib/`, or `panther/` — that call site is the sole place a
zod issue path is implicitly coerced (verified by grep across all three trees).

Therefore: **an instance reporting this message is running < 1.61.1.**

**Confirmed 2026-07-28: CAR reports `serverVersion` 1.59.1.** That build predates
both halves of the fix. No code change is required for the Symbol bug — CAR
needs the deploy to current `main` (1.63.4), and every trigger in §1 is
explained. The reporter will need a hard reload afterwards (IndexedDB caching).

Tim's own email on the same thread family (2026-07-21, "Two blockers on
mirroring reports across projects"):

> "The fix is in the latest version, which currently only the Demo platforms,
> Sierra Leone, and Afghanistan are on."

CAR was not in that list. Current `main` is at 1.63.4.

**Check:**

```bash
curl -s https://<car-host>.fastr-analytics.org/health_check | jq .serverVersion
```

(`/health_check` is public by design and reports `serverVersion`; server and
client ship together, so it stands in for the client bundle version.)

If it reports < 1.61.1, **no code change is required** — CAR needs the deploy,
and everything in §1 is explained. If it reports ≥ 1.61.1, the fix is incomplete
and §7 becomes live work.

Note for the reporter: the client caches aggressively in IndexedDB, so a
hard-reload is needed after the instance is upgraded before re-testing.

---

## 7. Residual risk — audited, currently clean

Checked whether any *other* path can carry store symbols into a `z.record`
parse. Nothing outstanding was found, but recording the audit so it is not
redone:

- `resolveFigureBundleFromVizConfig` / `makeFigureBundleFromFetchedData` —
  `resultsValue` comes from `poDetail`, served by `_PO_DETAIL_CACHE`
  (`reactive_cache.ts`), which holds plain JSON in a `Map` + IndexedDB, **not**
  a Solid store. Not a vector.
- `_PO_ITEMS_CACHE` → `bundle.items` — same, server JSON. Not a vector.
- `applyFigureConfigPatch` — returns `{...config, d, t}`; object spread copies
  only enumerable own string keys, so it drops top-level symbols. Nested aliases
  survive, but PO config has no `z.record`, so nothing parses them.
- Server-side parses are structurally immune: payloads cross the wire via
  `JSON.stringify`, which omits non-enumerable symbol keys.
- `resolve_figure_from_metric.ts:104` is the only zod-issue-path coercion in
  `client/`. `server/module_loader/load_module.ts:158` and
  `server/routes/route-helpers.ts:39` also do a bare `i.path.join(".")`, but
  both parse server-side JSON that can never carry symbols.

---

## 8. Second wall behind this one: `allowedFilters` blocks 3 of the 5 DQA presets

Independent of the Symbol bug. Once CAR is upgraded, the reporter's stated goal
— filter DQA tables by indicator — succeeds on only two of the five presets she
listed. From the authored `m001/definition.json`:

| Metric | Preset | `allowedFilters` | Filter by indicator? |
|---|---|---|---|
| m1-01-01 | `outlier-table` | `indicator_common_id`, `admin_area_2` | yes |
| m1-02-02 | `completeness-table` | `indicator_common_id`, `admin_area_2` | yes |
| m1-03-01 | `consistency-table` | `ratio_type`, `admin_area_2` | **no** |
| m1-04-01 | `dqa-score-table` | `admin_area_2` | **no** |
| m1-04-02 | `mean-dqa-table` | `admin_area_2` | **no** |

On the bottom three, `from_metric` with an `indicator_common_id` filter will
fail with a *different*, clearer error from `buildConfigFromPreset`
(`build_config_from_metric.ts:70-79`):

> `Invalid filter dimension "indicator_common_id" for preset "dqa-score-table".
> Allowed filter dimensions: admin_area_2`

The Section 4 regional disruption charts are fine: `m3-03-01` /
`disruption-chart-single-admin-area-2` allows `indicator_common_id`, so
`update_figure` with `filterBy` on top of the existing `admin_area_2` replicant
will work once the Symbol crash is gone.

### The module defs are correct — the fix belongs in the AI tool code

The `allowedFilters` values above are not conservative authoring choices; they
track what is physically in each results file. From `m001/script.R`:

| Results object | Columns written | Has `indicator_common_id`? |
|---|---|---|
| `M1_output_outliers.csv` (m1-01-01) | facility, geo, indicator, period, outlier flags | yes |
| `M1_output_completeness.csv` (m1-02-02) | `facility_id`, geo, `indicator_common_id`, `period_id`, `completeness_flag` | yes |
| `M1_output_consistency_geo.csv` (m1-03-01) | district-level consistency by `ratio_type` | no |
| `M1_output_dqa.csv` (m1-04-01, m1-04-02) | `facility_id`, geo, `period_id`, `dqa_mean`, `dqa_score` | **no** |

The DQA score is already aggregated **across** indicators per facility × period
(`script.R:753-764`), and consistency is computed on indicator *pairs*, which is
why its dimension is `ratio_type`. So filtering those three by indicator is not
restricted — it is **meaningless**. `allowedFilters` is right, and adding
`indicator_common_id` to those presets would be wrong.

That inverts the fork: **do not touch the module defs.** The defect is that
`update_figure` does not enforce the same rule.

### The actual defect: `update_figure` accepts filters on non-existent dimensions

`allowedFilters` is checked only on the create path
(`build_config_from_metric.ts:66-82`). `update_figure` checks neither
`allowedFilters` nor even that `disOpt` is a real dimension of the metric:

- `validateFilters` (`content_validators.ts:71-87`) — which *does* check
  `disOpt` against `metric.disaggregationOptions` — is reached only from
  `validateAiMetricQuery` and `validatePresetOverrides`, i.e. query and create.
- `validateMetricInputs` (`content_validators.ts:169-210`), the only validator
  `update_figure` runs, validates filter **values**, not dimensions. And it
  fails open on an unknown dimension:

  ```ts
  const dimValues = metricInfoRes.data.disaggregationPossibleValues[filter.disOpt];
  if (dimValues?.status === "ok") { ... }   // dim absent -> undefined -> check skipped
  ```

So `update_figure` with `filterBy: [{disOpt: "indicator_common_id", ...}]` on a
`dqa-score-table` figure passes validation silently and goes on to build a
fetch config filtering on a column that does not exist in `M1_output_dqa.csv`.

**Fix:** call `validateFilters(newConfig.d.filterBy, bundle.metricId, metric)`
in the `update_figure` handler (`slide_editor.tsx`, before the re-resolve at
line 426), and in the `update_report_figure` equivalent. That reuses the
existing validator and yields the same clear message the create path gives.

Deliberately **not** enforcing `allowedFilters` on the edit path: that is a
preset-authoring concept, and once a figure exists the preset is no longer the
authority. The right invariant for an edit is "the dimension exists on the
metric".

### Consequence for the reporter

Her request is achievable for `outlier-table` and `completeness-table`, and for
the Section 4 regional disruption charts. For `consistency-table`,
`dqa-score-table` and `mean-dqa-table` it is not achievable at all — those
outputs carry no indicator dimension. That is a data-model answer, not a bug to
fix.

### Worth considering (not required to close this bug)

The `structuredClone(unwrap(...))` guard sits in one function and protects the
three current callers by luck of routing, not by construction. A fourth caller
that builds a bundle from store-derived data would silently reintroduce this.
Two options if it recurs:

1. Do the clone at the **store read boundary** — have the AI tool layer hand out
   plain snapshots of `metrics` rather than live store objects.
2. Make `resolveFigureBundleFromMetric` (the validating function) responsible for
   its own input hygiene, so the guarantee lives with the parse rather than with
   each caller.

Option 1 is the stronger fix and also removes a class of aliasing bugs where a
stored bundle accidentally references live store state.
