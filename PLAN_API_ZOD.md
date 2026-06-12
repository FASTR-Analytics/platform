# Plan — Zod at the Route Boundary (params + body validation)

> **Status: NOT STARTED. Blocked on [PLAN_API_ROUTES_HARDENING.md](PLAN_API_ROUTES_HARDENING.md) A1** — this plan introduces HTTP 400 envelope responses, which today would reach the UI as raw JSON text (the 403 bug). Design agreed in the 2026-06-12 route-system review.
>
> Closes the gap DOC_API_ROUTES.md documents under "What NOT to do": *"there is no runtime validation of the request body at the route boundary."* When done, rewrite that section and the `route()` field table (params/body become runtime values).

## Why this is cheap here

- **Zod 4 is already a dependency on both runtimes**: `deno.json:36` (`npm:zod@^4.0.0`), `client/package.json:44` (`^4.3.6`). Keep versions aligned.
- **It is already in the client bundle** — `lib/types/*` imports zod heavily and the client bundles lib. Zero marginal bytes.
- **The heavy domain types already have schemas** built for the stored-JSON validation layer: `lib/types/_presentation_object_config.ts`, `_dashboard_config.ts`, `_slide_config.ts`, `reports.ts`, `conditional_formatting_standalone.ts`, … Route bodies that carry these configs import existing schemas instead of authoring new ones.

## Locked decisions

| # | Decision | Choice + rationale |
|---|----------|-------------------|
| 1 | What gets runtime validation | **Requests only** (params + body). Responses stay compile-time phantoms (`{} as T`): the server is the trusted side, response types include the app's largest payloads (ReportDetail, SlideWithMeta, data grids), and runtime-parsing every response is cost without benefit. Response-side enforcement is compile-time via hardening B1 (TypedResponse). Optional dev-mode response validation where schemas already exist = **out of scope**. |
| 2 | Where validation runs | **Centrally in `defineRoute`** — one implementation covers all routes. `safeParse` failure → `c.json({ success: false, err }, 400)` with a prettified zod message. Never throw. |
| 3 | Schema strictness | **Default strip mode, never `.strict()`.** The client's `buildRequestParams` puts every leftover arg into the body — e.g. a caller passing `projectId` to a non-`requiresProject` route lands it in the body. Strip tolerates this; strict would turn working calls into 400s. |
| 4 | Sentinel-encoded payloads | `createSlide`/`updateSlide` `slide` field and `updateReportFigures` `figures` field cross the wire **sentinel-encoded** (`prepareSlideForTransmit` / `prepareReportFiguresForTransmit`). Schema these fields as `z.unknown()` passthrough; real validation stays in the DB layer after decode. Do **not** author schemas of the encoded shape — they'd break when the sentinel scheme changes. |
| 5 | Param coercion | Params arrive as strings; use `z.coerce.number()` for numeric params (e.g. `:level` in geojson routes) and `z.uuid()` where the param is an id. Removes scattered manual `parseInt`/format checks from handlers — delete those as each route migrates. |
| 6 | Migration mechanics | **Incremental.** `route()` accepts `ZodType | phantom` per field during migration; `defineRoute` validates only when the value is a real schema (`instanceof z.ZodType`). End state: phantom support deleted. |
| 7 | Bodies are always objects | By construction (`buildRequestParams` assembles the body from leftover arg keys), every body is a plain object → every body schema is `z.object({...})`. No scalar/array bodies exist. |

## End-state shape

```ts
// lib/api-routes/route-utils.ts
export function route<
  TPath extends string,
  TMethod extends Method,
  TParams extends z.ZodType | undefined = undefined,
  TBody extends z.ZodType | undefined = undefined,
  TResponse = never,
  ...
>(config: {
  path: TPath;
  method: TMethod;
  params?: TParams;          // z.object({ report_id: z.uuid() })
  body?: TBody;              // z.object({ label: z.string(), folderId: z.string().nullable().optional() })
  response?: TResponse;      // stays a phantom: {} as T
  requiresProject?: boolean;
  isStreaming?: boolean;
  timeoutMs?: number;        // from hardening B6
})
```

- Types derive from the schemas: `RouteBody<K> = z.infer<NonNullable<Registry[K]["body"]>>` (and same for params) in **both** `server/routes/route-helpers.ts` and `lib/api-routes/server-action-types.ts`. The registry stays the single source of truth — now for runtime *and* compile time, with the `{} as T` casting and its `never`-gymnastics deleted (hardening B4 fixes the worst of it earlier; this removes the rest).
- `defineRoute` validation step (replaces the bare `c.req.json()` extraction):
  1. Parse params via schema if present → 400 envelope on failure.
  2. For body methods, `safeParse` the JSON body → 400 envelope on failure; pass `parsed.data` (not the raw body) to the handler.
- **Boot assertions** (extend hardening B3, now possible because params are runtime objects): for every migrated route, `Object.keys(paramsSchema.shape)` must equal the `:placeholders` parsed from `path`. Catches the typo class the phantom system can't.
- **Client**: no required change — `createServerAction` behavior is identical. Optional dev-only pre-send body validation: defer, decide at the end.

## Wire-format gotchas (check per route while migrating)

- **JSON drops `undefined`.** Any field the client may omit or set `undefined` must be `.optional()` — `.nullable()` alone will 400 on an absent key. The existing registry types are honest about `?` vs `| null`; carry that over exactly.
- **Dates are ISO strings on the wire.** Use `z.string()` (or `z.iso.datetime()` where format matters), never `z.date()`.
- **Don't tighten semantics while migrating.** The schema's job in this pass is to encode the *current* declared type, not to add new constraints (beyond uuid/number coercion per decision 5). Tightening (enums, ranges) is welcome but do it consciously, route by route, where the handler/DB already enforces it.

## Migration order (registry-file batches, each independently shippable)

Each batch: write schemas → flip the registry file → typecheck both sides → exercise the feature's main flows in the browser.

1. **Pilot + plumbing:** `route-utils.ts` dual-mode support, `defineRoute` validation step, boot assertion. Pilot on `lib/api-routes/instance/custom_prompts.ts` (4 routes, trivial bodies) end to end.
2. **Small primitive bodies:** `instance/users.ts`, `instance/instance.ts`, `instance/hfa_time_points.ts`, `instance/backups.ts`, `project/report-folders.ts`, `project/slide-deck-folders.ts`, `project/visualization-folders.ts`, `project/cache-status.ts`, `project/emails.ts`.
3. **Medium:** `instance/indicators.ts`, `instance/calculated_indicators.ts`, `instance/hfa_indicators.ts`, `instance/datasets.ts`, `instance/structure.ts`, `instance/geojson_maps.ts`, `instance/indicators_dhis2.ts`, `instance/assets.ts`, `instance/iceh.ts`, `instance/modules.ts`.
4. **Project core:** `project/projects.ts`, `project/modules.ts`, `project/ai-tools.ts`.
5. **Config-carrying bodies (reuse lib/types schemas):** `project/presentation-objects.ts`, `project/dashboards.ts`, `project/slide-decks.ts`, `project/reports.ts`.
   - **Fetch-config fields are an explicit exception to decision 3's "don't tighten while migrating".** `getPresentationObjectItems` and `getReplicantOptions` carry `fetchConfig` (and `getReplicantOptions` a top-level `replicateBy`) whose `groupBys` / `filters[].disOpt` / `replicateBy` are interpolated into `projectDb.unsafe` SQL. Schema these as `z.enum(ALL_DISAGGREGATION_OPTIONS)` (period options are a subset), not `z.string()`. `values[].prop` → a bare-identifier regex; `postAggregationExpression` → the safe-charset regex. This formalizes at the boundary what `validateFetchConfig` now enforces imperatively (added 2026-06-12, see PLAN_SYSTEMS §6.1) — once the Zod schemas land, the in-handler `validateFetchConfig` calls become redundant for these fields and can be reviewed for removal. **Does not cover `postAggregationExpression` fully** — see the residual note in PLAN_SYSTEMS §6.1 (a server-authoritative PAE check is the real fix; a charset enum cannot stop scalar subqueries built from word-chars).
6. **Sentinel routes last:** `project/slides.ts` + `updateReportFigures` (decision 4 passthrough).
7. **Teardown:** delete phantom support from `route()`, delete the residual `never`-handling in `server-action-types.ts`, make the boot assertion unconditional, rewrite DOC_API_ROUTES.md (§"What NOT to do" body-trust paragraph, the `route()` field table, §"Enforcement opportunities" last bullet).

Scale: ~120 routes carry a body; the large majority are 2–4 primitive fields. Batches 1–3 are mechanical; 5 is mostly importing existing schemas; 6 needs care.

## Explicitly out of scope

- Response runtime validation (decision 1).
- OpenAPI generation, AI-tool-schema reuse (DOC_AI_TOOL_SCHEMAS) — natural follow-ons once schemas exist, separate efforts.
- Replacing the DB layer's stored-JSON validation (DOC_MIGRATIONS) — different boundary (DB rows, not wire), stays as is.

## Verification (per batch + final)

- `deno task typecheck` green both sides.
- Boot green (route validation + new schema/path assertions).
- Negative test per batch: hand-`fetch` one migrated route with a wrong-typed body → 400 + readable envelope `err` (confirms A1's client fix renders it).
- Final: grep `lib/api-routes` for `{} as` → only `response:` fields remain (then none after teardown step 7 — `response` keeps `{} as T` by design).
