# DHIS2 Integration

The external-API client layer (`server/dhis2/`): one base fetcher with retry, the `goalN_` subfolder convention, credentials threaded via `FetchOptions`, the two-phase connection validation, and the translatable never-throw boundary for user-facing helpers.

> This doc owns the DHIS2 **API client**. What happens to fetched data — staging org-units/analytics into the DB — is [SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) (datasets) and S5 (structure). Period (`YYYYMM`) formatting for analytics queries is [DOC_period_column_handling.md](DOC_period_column_handling.md). The in-memory geojson session cache here is the "process-local" alternative to the Valkey cache — see [DOC_VALKEY_CACHE.md](DOC_VALKEY_CACHE.md) for when to use which.

---

## Principles

1. **One fetcher, all calls.** Every DHIS2 request goes through `fetchFromDHIS2` / `getDHIS2`, which owns auth, headers, timeout, error shaping, and retry. Callers never construct auth or call `fetch` directly.
2. **Credentials are passed, never assembled by callers.** `FetchOptions.dhis2Credentials = { url, username, password }`; only the base fetcher turns them into a Basic-auth header.
3. **Organize by goal.** `goalN_<topic>` subfolders group related endpoints, each with a `mod.ts` barrel and `get_*_from_dhis2` fetch+shape functions.
4. **Never throw across the user boundary.** Public test/connection helpers return `{ valid }` / `{ success, message: TranslatableString }`; routes convert to the `APIResponse` envelope. Internals throw.
5. **Never log credentials.** The library layer logs only behind explicit `logRequest`/`logResponse` flags and never logs secrets.

---

## The System

```text
  caller (goalN fetcher / worker)
    getDHIS2(endpoint, { dhis2Credentials, retryOptions?, timeout?, logRequest? }, params?)
        │
        ▼  fetchFromDHIS2
    buildUrl(endpoint, credentials.url, params)
    withRetry(fetchFn):
        set Authorization: Basic, Accept: json, X-Requested-With  (no creds in logs)
        AbortController timeout (default 120s)
        fetch → !ok ? createDHIS2Error(response) (structured: status/url/body) : response.json()
        retry: exp backoff + jitter, skip non-429 4xx, retry network/5xx (default 5 attempts)
        │
        ▼
    shaped, typed result  →  staged into DB (SYSTEM_06_ingestion)
```

### The base fetcher (`server/dhis2/common/base_fetcher.ts`)

`fetchFromDHIS2<T>(endpoint, options)`:
- builds the URL (`buildUrl` strips trailing slash, appends params);
- sets `Authorization: Basic <btoa(user:pass)>`, `Accept: application/json`, and `X-Requested-With: XMLHttpRequest` (the last prevents DHIS2 v2.28+ returning a 302 instead of a 401);
- wraps the call in an `AbortController` timeout (default 120 000 ms);
- on `!response.ok`, builds a structured `DHIS2FetchError` (`message`, **`status`**, `statusText`, `url`, `responseBody`) and throws it;
- on success, `response.json()` as `T`;
- the whole `fetchFn` runs inside `withRetry`.

`getDHIS2<T>` is the GET convenience wrapper. Logging happens **only** when `logRequest`/`logResponse` are set, and only the method/URL/status — never credentials.

### Retry (`server/dhis2/common/retry_utils.ts`)

`withRetry(fn, options)` — defaults: `maxAttempts: 5`, `initialDelayMs: 1000`, `maxDelayMs: 30000`, `backoffMultiplier: 2`, `jitterFactor: 0.25`. The default `shouldRetry`:

```ts
shouldRetry: (error) => {
  if (error.message.includes("API Error (4") || error.message.includes("download failed: 4")) {
    return error.message.includes("429");   // retry 429 only among 4xx
  }
  return true;                               // retry network + 5xx
}
```

This **matches on `error.message`**, not the structured `error.status`. It happens to work for `createDHIS2Error` messages (`"DHIS2 API Error (404): …"` contains `"API Error (4"`), but it is brittle — see enforcement.

### The `goalN_` convention

| Folder | Goal | Key functions |
|--------|------|---------------|
| `goal1_org_units_v2` | facilities / org-unit hierarchy | `connection.ts` (`validateDhis2Connection` use), `get_metadata.ts` |
| `goal2_indicators` | data-element / indicator discovery | `get_indicators_from_dhis2.ts` |
| `goal3_analytics` | analytics values for facilities×indicators×periods | `get_analytics_from_dhis2.ts` |
| `goal4_geojson` | facility geojson | `fetch_geojson.ts`, `session_cache.ts`, `build_dhis2_context.ts` |

Each goal has a `mod.ts` barrel; the top `server/dhis2/mod.ts` and `common/mod.ts` re-export. (`goal1` carries a vestigial `_v2` suffix with no surviving v1 — see [DOC_SSE_REALTIME.md](DOC_SSE_REALTIME.md) for the repo-wide "drop the suffix" theme.)

### Query idioms

`fields=` comma-list (with `DEFAULT_DATA_ELEMENT_FIELDS` / `DEFAULT_INDICATOR_FIELDS` defaults), multiple `filter` params, `paging`/`pageSize`, and `rootJunction: "OR"` for ilike OR-search over name/code/id. DHIS2 limits force batching large `dx`/`ou`/`pe` lists across requests.

### Two-phase connection validation

`validateDhis2Connection(credentials)` returns a discriminated `Dhis2ValidationResult` with `TranslatableString` (en/fr) messages — never throws:
1. **Phase 1 (unauthenticated):** `GET /api/system/info.json` — is this even a DHIS2 instance? (checks `json.version`, or DHIS2 markers in an HTML login redirect). Failure → `invalid_url` / `dhis2_unavailable`.
2. **Phase 2 (authenticated):** `GET /api/me.json` with `redirect: "manual"` — `401`/`403`/`302` → `bad_credentials`; other non-OK → `server_error`; OK → `{ valid: true }`.

This surfaces *one* clear, localized message to the user instead of N per-item retry failures. It is called before org-unit connection, indicator discovery, geojson, and dataset import — but not uniformly across every path (see enforcement).

### The never-throw boundary

```text
internals (fetchFromDHIS2, get_*_from_dhis2)  → throw DHIS2FetchError / Error
   ▲
public helpers (validateDhis2Connection, test endpoints) → return { valid }/{ success, message: TranslatableString }
   ▲
routes → catch → APIResponse { success: false, err }   (DOC_API_ROUTES)
```

### The geojson session cache (process-local)

`goal4_geojson/session_cache.ts` is an **in-memory** `Map` (not Valkey): `CACHE_TTL_MS = 15 min`, `MAX_CACHE_ENTRIES = 10`, evict-on-insert when full, TTL-checked on read. The cache key is derived from `url + username + password + dhis2Level` via a homegrown weak hash. This is the sanctioned process-local cache pattern; contrast the cross-process `TimCacheC` ([DOC_VALKEY_CACHE.md](DOC_VALKEY_CACHE.md)).

---

## Rules

1. **All DHIS2 calls go through `getDHIS2`/`fetchFromDHIS2`.** Don't build a DHIS2 URL + `fetch` + auth header yourself.
2. **Pass `dhis2Credentials` in `FetchOptions`** — let the fetcher build the auth header.
3. **New endpoints live in the right `goalN_` folder** with a `get_*_from_dhis2` function and a `mod.ts` re-export.
4. **User-facing helpers return `{ valid }` / `TranslatableString`, never throw.** Routes do the `APIResponse` conversion.
5. **Validate the connection before bulk work** so bad credentials fail once with a clear message, not N times deep in a worker.
6. **Never log credentials**; gate any request/response logging behind `logRequest`/`logResponse`.

---

## What NOT to do

- **Don't log the DHIS2 URL or credential structure unconditionally.** The HMIS DHIS2 staging worker emits `DEBUG: credentials.url: <url>` and `credentials.username/password: [set]/[not set]` on every run, while the library layer is deliberately silent. Even logging the URL + "credentials are set" is more than the library exposes — gate it behind `logRequest`.
- **Don't build a parallel analytics request.** The HMIS DHIS2 worker assembles its own `/api/analytics.json?…` params and inlines `maxAttempts: 10` (vs the default 5) instead of routing entirely through `getAnalyticsFromDHIS2` — a second source of truth that can drift on `dx`/`pe`/`ou` ordering.
- **Don't redefine shared wire types per goal.** `DHIS2PagedResponse<T>` is defined twice — `server/dhis2/goal1_org_units_v2/types.ts` and `lib/types/indicators.ts`. Per-goal `types.ts` should extend, not duplicate, shared shapes.
- **Don't derive a cache key from plaintext credentials via a homegrown hash** (the geojson session cache does) without considering collision/secret-handling.

---

## Gotchas

- **Retry matches on the message string, not `status`.** It works for current `DHIS2FetchError` messages but is fragile: a reworded message, a non-DHIS2 error, or the `"download failed: 4"` path could misclassify. The structured `error.status` exists and is the robust thing to branch on.
- **`X-Requested-With` is load-bearing** — without it some DHIS2 versions answer with a 302 to a login page instead of a 401, which the validator/retry logic would misread.
- **Default timeout is 120 s for fetches but 10 s for validation** — validation is meant to fail fast.
- **`validateDhis2Connection` Phase 1 is unauthenticated and follows redirects**; Phase 2 uses `redirect: "manual"` so a 302 is treated as an auth failure. Don't "simplify" the redirect handling.
- **The session cache is per-process** — in a multi-process deploy each process has its own; it's a latency optimization, not a shared cache.

---

## Enforcement opportunities

- **Single home for DHIS2 wire types** (one `DHIS2PagedResponse<T>`); per-goal types may only extend it.
- **Route all analytics through `getAnalyticsFromDHIS2`** (remove the worker's inlined params + `maxAttempts: 10`).
- **Classify retries off `DHIS2FetchError.status`**, not substring-matching `error.message`.
- **Gate all DHIS2 request/response logging behind `logRequest`/`logResponse` and never log the URL/credentials** in workers.
- **Define when `validateDhis2Connection` is required** (especially before bulk worker jobs and on geojson cache-miss paths that currently skip it).
- **Document the geojson session-cache contract** (TTL, max entries, key derivation) and replace the weak credential-hash key.
- **Retire the `goal1_..._v2` suffix** (no v1 exists).

---

## Adding a DHIS2 call — checklist

- [ ] Put it in the right `goalN_<topic>` folder as a `get_*_from_dhis2` function
- [ ] Call `getDHIS2`/`fetchFromDHIS2`; pass `dhis2Credentials` in `FetchOptions`
- [ ] Reuse `DHIS2PagedResponse<T>` and shared wire types; don't redefine
- [ ] If user-triggered, return `TranslatableString` and let the route build the `APIResponse`
- [ ] Validate the connection first for bulk operations
- [ ] No credential logging; logging only behind `logRequest`/`logResponse`
- [ ] Re-export from the goal's `mod.ts`

---

## Key files

| File | Purpose |
|------|---------|
| `server/dhis2/common/base_fetcher.ts` | `fetchFromDHIS2`/`getDHIS2`, auth/headers/timeout, `DHIS2FetchError`, `validateDhis2Connection` |
| `server/dhis2/common/retry_utils.ts` | `withRetry` + default backoff/`shouldRetry` |
| `server/dhis2/goal1_org_units_v2/` | org units / facilities |
| `server/dhis2/goal2_indicators/get_indicators_from_dhis2.ts` | indicator/data-element discovery |
| `server/dhis2/goal3_analytics/get_analytics_from_dhis2.ts` | analytics values |
| `server/dhis2/goal4_geojson/session_cache.ts` | process-local geojson cache |
| `server/dhis2/mod.ts` | top barrel |
| `lib/types/indicators.ts` | shared DHIS2 wire types (one of the two `DHIS2PagedResponse` homes) |
