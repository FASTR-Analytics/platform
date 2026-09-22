---
system: 7
name: DHIS2 Connector
globs:
  - client/src/components/data/hmis/dhis2_connection/**
  - server/dhis2/**
  - server/routes/instance/indicators_dhis2.ts
  - server/tests/dhis2_decompose_indicator_test.ts
  - server/tests/dhis2_element_eligibility_test.ts
docs_absorbed:
---
# S7: DHIS2 Connector

The self-contained typed HTTP adapter for external DHIS2 instances: one
base fetcher owning auth/timeout/retry, four `goalN_` endpoint groups
(org units, indicators, geojson, data value sets + metadata id-existence
for the S6 import dispatcher), two-phase connection
validation with a never-throw user boundary, and the client credentials
UX. No DB access in the adapter (`server/dhis2/**`); the route file
reaches the DB only through S5 and S6 functions. It fetches and shapes;
callers persist. Reviewed against code (first review cycle,
review-only; absorbs DOC_DHIS2_INTEGRATION).

Boundaries: what happens to fetched data is the consumer's system:
structure/facility staging and geojson storage are **S5**, HMIS dataset
staging is **S6**. Period (`YYYYMM`) semantics are **S9**. The in-memory
geojson session cache here is the sanctioned process-local alternative to
Valkey. See
[SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md) for when to use which. The
instance-wide stored DHIS2 credentials (encrypted at rest, one row for
every DHIS2 flow: structure, indicators, geojson, HMIS data) live in
**S6** (`server/db/instance/instance_dhis2_credentials.ts`); this
system only ever receives an already-resolved `Dhis2Credentials` and
never touches storage. Sub-file custody exceptions are in SYSTEMS.md §4.1 (none
currently touch this system).

## The base fetcher (`server/dhis2/common/base_fetcher.ts`)

**One fetcher, all calls.** Every DHIS2 request goes through
`fetchFromDHIS2<T>(endpoint, options)` (or its GET wrapper
`getDHIS2<T>(endpoint, options, params?)`). Callers never construct auth
headers or call `fetch` directly; credentials travel as
`FetchOptions.dhis2Credentials = { url, username, password }` and only
the fetcher turns them into a `Basic` header.

Per call it: builds the URL (`buildUrl` strips the trailing slash,
appends params; an already-absolute `http…` endpoint passes through);
sets `Authorization: Basic`, `Accept: application/json`, and
`X-Requested-With: XMLHttpRequest`, the last being load-bearing because
without it DHIS2 v2.28+ answers auth failures with a 302 to the login
page instead of a 401; runs inside an `AbortController` timeout (default
120 000 ms) whose timer deliberately spans the **body read**, not just
time-to-headers: clearing it when `fetch()` resolves would leave
`response.json()` unbounded and a trickling body would hang the caller
forever (verified empirically; the abort signal does cancel an in-flight
body read). On `!ok` it throws a structured `DHIS2FetchError`
(`message` = `"DHIS2 API Error (status): statusText. details"`, plus
`status`, `statusText`, `url`, `responseBody`); on abort it throws a
plain `Error` naming the timeout and URL.

`maxResponseBytes` is an opt-in streaming cap enforced while reading the
body (a Content-Length check is not enough: chunked responses have
none). The heavy geojson fetch and S6's dataValueSets pulls pass it
(100 MB each).

Logging happens **only** behind explicit `logRequest`/`logResponse`
flags, and logs only method/URL/status, never credentials.

## Wire types: what a response type may claim

`getDHIS2<T>` returns `data as T`. Nothing validates the body, so a
response type is a claim about an external server, not a guarantee, and
DHIS2 does send `null` and omit keys where its docs promise a value (a
dataValueSets row arrived with `value: null` in production, 1.73.1).
The rule for every type that describes a fetched body:

- **Every field is `T | null | undefined`**, never `?:`. Both forms
  reach the wire (a serialised `null` and a missing key), and a required
  nullable field makes every object literal spell the field out, so a
  field added to the type is caught at each fixture.
- **The wire type is private to its fetcher, which normalises.** The
  fetcher maps each row into a clean app type and drops a row that lacks
  its identity (no `id`, no `path`), counting the drop where a caller can
  show it (`OrgUnitPathPage.dropped`). Consumers, routes and the client
  never see the wire shape. goal 1, goal 2 and goal 4 all work this way.
- **The exception is goal 5's dataValueSets row.** `DHIS2DataValue` is
  exported nullable and guarded at the S6 reduce instead of copied,
  because a country-month pull is up to 10 MB and the reduce already
  walks every row once.

The compiler enforces the first point; the second is discipline, so a
new fetcher is reviewed against it.

## Retry (`server/dhis2/common/retry_utils.ts`)

The whole fetch closure runs inside `withRetry(fn, options)`. Defaults:
`maxAttempts: 5`, exponential backoff 1 s → 30 s cap, multiplier 2,
±25 % jitter, and an `onRetry` that console-logs attempt/message/delay.
The default `shouldRetry` retries network errors and 5xx, and among 4xx
retries only 429, but it classifies by **substring-matching
`error.message`** (`"API Error (4"` / `"download failed: 4"` /
`"429"`), not the structured `error.status` that `DHIS2FetchError`
carries. It works for current message shapes and is brittle (Open
items). On exhaustion, `withRetry` throws a **new plain `Error`**
(`"Failed after N attempts. Last error: …"`). The structured
`status`/`responseBody` fields do not survive to the caller.

Callers can tune per call: the S6 HMIS import worker passes
`maxAttempts: 3` and excludes size-cap and timeout errors from retry
(it splits the pull by org-unit subtree instead); the heavy geojson fetch
passes `maxAttempts: 1` because retrying a ~20 MB download re-pays the
whole transfer per attempt.

## The `goalN_` convention

Endpoints are grouped by goal, each folder with a `mod.ts` barrel;
`server/dhis2/mod.ts` and `common/mod.ts` re-export everything.

| Folder | Goal | Key functions |
| --- | --- | --- |
| `common/` | fetcher + retry + validation | `fetchFromDHIS2`, `getDHIS2`, `withRetry`, `validateDhis2Connection` |
| `goal1_org_units_v2/` | org-unit hierarchy metadata and paged units | `getOrgUnitMetadata` (levels + counts + roots, parallel), `getOrgUnitNamesAtLevel`, `pageOrgUnitPathsAtLevel` (one page of units with paths per yield), `testDHIS2Connection` |
| `goal2_indicators/` | indicator / data-element discovery, element eligibility, indicator decomposition | `get/search{Indicators,DataElements}FromDHIS2`, `searchAllIndicatorsAndDataElements`, `getDhis2ElementVerdict`, `parseDhis2Indicator`, `withElementVerdicts`, `withDecompositions` |
| `goal4_geojson/` | boundary import for maps | `fetchOrgUnitsMetadataForLevel`, `fetchGeometryCountForLevel`, `fetchOrgUnitsGeoJsonForLevel`, session caches |
| `goal5_data_value_sets/` | reported values + metadata id-existence | `getDataValueSetsFromDHIS2`, `getExistingMetadataIds`, `getOrgUnitIdsAtLevel` |

(`goal1`'s `_v2` suffix is vestigial: no v1 survives.)

**Query idioms.** `fields=` comma-lists (`DATA_ELEMENT_FIELDS` /
`INDICATOR_FIELDS`, fixed so the mappers know what they read); repeated
`filter=` params; `paging`; `rootJunction: "OR"` for ilike OR-search over
name/code/id. `searchAllIndicatorsAndDataElements` splits the query on
comma/semicolon/newline, searches every term in parallel across both
endpoints, and merges deduped by id. The data-element field list carries
`dataSetElements[dataSet[id,periodType]]` so the eligibility check below
can see the element's period type.

**Element eligibility** (`goal2_indicators/element_eligibility.ts`, pure;
PLAN_A3 ruling 6). A DHIS2 data element may fill a DHIS2 element indicator
(be its data id) only when DHIS2's own metadata says it is an additive monthly
count: `aggregationType` is `SUM`; `valueType` is `NUMBER` (the DHIS2
editor's default, which most real count elements carry; integrality is
enforced per value at import by S6's skip-and-record), `INTEGER`,
`INTEGER_POSITIVE` or `INTEGER_ZERO_OR_POSITIVE` (`INTEGER_NEGATIVE` is
refused, since every value of such an element would be skipped at
import; `PERCENTAGE`, `UNIT_INTERVAL` and every non-numeric type are
refused); and at least one of its data sets has period type `Monthly`
(an element in no data set has no period and is refused; one monthly
data set among several is enough, since the monthly values are what the
dataValueSets pull reads). `getDhis2ElementVerdict(element)` returns
`{ accepted: true }` or `{ accepted: false, refusal }` where the refusal
names the failing field and the metadata value; an operand is checked
through its element by `getDhis2OperandVerdict`, which adds
`element_not_found` for an element the server no longer has. The verdict
types live in `lib/types/indicators.ts` (S5).

**Indicator decomposition** (`goal2_indicators/decompose_indicator.ts`,
pure; PLAN_A3 ruling 8). A DHIS2 indicator is never imported as values;
`parseDhis2Indicator({ numerator, denominator, annualized, factor })`
turns it into operands and an expression, or refuses it. The formula is
accepted by WHITELIST: `#{uid}` and `#{uid.coc}` terms (each part a
DHIS2 UID), plain numeric literals (`[0-9]+(\.[0-9]+)?`), `+ - * /`,
unary minus, parentheses and any whitespace; the indicator is not
`annualized`; the factor is 1 (`number`), 100 (`percent`), 10000
(`rate_per_10k`) or 1000 (`number`, the expression multiplied by 1000
and a three-language `note` in the result, because there is no
`rate_per_1k` format); and the distinct operand count is at most
`MAX_INDICATOR_EXPRESSION_INGREDIENTS`. Everything else is refused with
the offending construct as the user would recognise it in the formula:
three-part and wildcard operands (`#{uid.coc.aoc}`, `#{uid.*.aoc}`),
item modifiers (`.periodOffset(-1)`), `N{}` `D{}` `A{}` `I{}` `R{}`
`OUG{}` `C{}`, `[days]`, operators outside the four (`^ % > == && ||`),
functions (`if`, `isNull`, `d2:zing`), a malformed formula (a `syntax`
refusal with the token it stopped at). A blacklist would miss the next
form DHIS2 adds. The accepted result's `expression` is written in the
app's own grammar through `writeIndicatorExpression`, fully
parenthesised as `((numerator) / (denominator))`, with each operand as
the identifier `data_id`, bracket-quoted (`[uid]`, `[uid.coc]`) unless
the uid matches `BARE_IDENTIFIER_PATTERN` (`^[a-z][a-z0-9_]*$`) and is
not a function name (`isFunctionName`), in which case `writeIdentifier`
writes it bare;
it re-parses with `parseIndicatorExpression` and the naming step can
rename those identifiers to the indicator ids the elements land in with
`renameIdentifiers`. Operands are deduped by `data_id` in first-
appearance order across numerator then denominator.

**Search-result shaping** (`goal2_indicators/attach_verdicts.ts`).
`withElementVerdicts(elements)` attaches a `verdict` to each data element.
`withDecompositions(options, indicators, known?)` attaches a
`decomposition` to each indicator: the parse, each operand with its own
verdict judged through its element, and `accepted` = the parse accepted
and every operand accepted. Operand elements not already in `known` are
fetched by chunked `id:in:[...]` filters (100 per request) with the
default field list, one round of requests for the whole result set. The
three search routes return these shapes (`Dhis2DataElementSearchItem`,
`Dhis2IndicatorSearchItem`); the combined search passes its own
data-element results as `known`. Pinned by
`server/tests/dhis2_element_eligibility_test.ts` and
`server/tests/dhis2_decompose_indicator_test.ts`.

**Data value sets.** `getDataValueSetsFromDHIS2` pulls one data element
for one `period=` token (passed through untranslated: the DHIS2 server
reads it in its own calendar) under the given org units with
`children=true`, so one root pull covers a country and a level-2 pull
covers one subtree. A body with no `dataValues` key is a legitimate empty
month. `getExistingMetadataIds` answers which of a list of ids exist on
`dataElements`, `indicators` or `categoryOptionCombos` (chunked `id:in`
filters, 100 per request); `getOrgUnitIdsAtLevel` lists the ids at one
hierarchy level. There is no analytics fetcher: the importer never asks
DHIS2 to evaluate a formula.

**Geojson: metadata-vs-heavy split.** Analyze-side,
`fetchOrgUnitsMetadataForLevel` pulls geometry-less org-unit metadata
(`id,name,code,parent[id,name]`, ~17 KB where the polygons would be
~20 MB) and `fetchGeometryCountForLevel` gets the exact with-geometry
count via `filter=geometry:!null` + `filter=level:eq:N` (~1 KB). Two
DHIS2 2.40 facts are load-bearing there: `level` MUST be expressed as a
filter (a bare `level=` param is ignored when `filter=` is present,
verified live on 2.40.11.1), and `featureType` is absent from the fields
projection, so the geometry-null filter is the only presence probe.
Save-side, `fetchOrgUnitsGeoJsonForLevel` downloads the full
FeatureCollection from `/api/organisationUnits.geojson` with
caller-supplied budgets (S5's save route passes 180 s timeout, 1
attempt, 100 MB cap) and validates the envelope shape. The `.geojson`
endpoint OMITS boundary-less units rather than returning null
geometries, so "units without boundaries" = metadata total − geometry
count.

**Session caches** (`goal4_geojson/session_cache.ts`): two deliberately
separate process-local `Map` caches for the geojson wizard, keyed by
SHA-256 over `url|username|password|dhis2Level` (`getCredsCacheKey`, so a
key never holds the plaintext credentials). Metadata cache: 10 entries. Heavy cache: 2
entries. It exists only so a fix-the-mapping-and-re-save loop doesn't
re-download 20 MB. Both: 15-min TTL, expired entries evicted on every
get/set, oldest-first eviction when full. S5's save route deletes both
entries on successful save so a follow-up wizard run fetches fresh data.
Per-process only: a latency optimization, not a shared cache.

## Connection validation and the never-throw boundary

`validateDhis2Connection(credentials)` returns a discriminated
`Dhis2ValidationResult` with `TranslatableString` (en/fr/pt) messages,
and it never throws. Two phases, 10 s timeout each (fail fast, vs the
fetcher's 120 s):

1. **Phase 1 (unauthenticated, follows redirects):**
   `GET /api/system/info.json`: is this even DHIS2? Accepts JSON with a
   `version` field, or DHIS2 markers in an HTML login redirect. Failure →
   `invalid_url` / `dhis2_unavailable`.
2. **Phase 2 (authenticated, `redirect: "manual"`):** `GET /api/me.json`
   401/403/**302** → `bad_credentials` (the manual redirect is the
   point: a 302 here IS an auth failure); other non-OK → `server_error`.

`testDHIS2Connection` (goal 1) composes validation with sample queries and
returns `{ success, message: TranslatableString, details? }` (org-unit/level
counts, DHIS2 version).

The layering:

```text
internals (fetchFromDHIS2, get_*_from_dhis2)        → throw DHIS2FetchError / Error
public helpers (validateDhis2Connection, test fns)  → return { valid } / { success, message }
routes                                              → catch → APIResponse envelope
```

Validation runs on the user-triggered save/confirm routes (S6's
`saveInstanceDhis2Credentials`, structure confirm, geojson levels,
analyze and cache-miss save), so bad credentials fail once with one
localized message. The bulk paths themselves (HMIS import run
worker, S5 structure stager) do NOT re-validate: a credential revoked
between launch and run surfaces as retry exhaustion inside the job.

## The route file and client credentials UX

`routes/instance/indicators_dhis2.ts` is the system's only route file:
three POST search routes (indicators / data elements / combined) plus the naming step's save
(`/indicators-dhis2/create`, S5), all guarded `can_configure_data`. The
three search routes return the shaped items above: every data element
with its eligibility verdict, every indicator with its decomposition. Bodies
carry no credentials: each handler reads the stored connection through
S6's `getStoredDhis2CredentialsDecrypted`. This system
never stores or reads the credentials table itself, only the resolved
`Dhis2Credentials`. The geojson routes (`routes/instance/geojson_maps.ts`,
owned by S5) do the same; the session caches there hash the resolved
credentials, so replacing the stored connection misses the cache.

`Dhis2CredentialsEditor.tsx` is the credentials widget: plain
url/username/password inputs with a show/hide toggle, no persistence of
its own. Its one caller is the manage-connection modal
(`_shared/dhis2_credentials/manage_connection.tsx`), opened only from the
Data page's DHIS2 connection card: the one place a connection is set,
replaced or deleted. Every other DHIS2 flow uses the stored connection
and, when none is stored, points to that card. All user-facing strings in
this system carry en/fr/pt.

## Consumers

- **S5 structure import**: step-1 test connection
  (`testDHIS2Connection`), org-unit level metadata (`getOrgUnitMetadata`),
  then bulk staging via `stageStructureFromDhis2V2`: parent names from
  `getOrgUnitNamesAtLevel`, facilities from `pageOrgUnitPathsAtLevel`,
  whose per-page `dropped` count (units with no id or no path) the stager
  adds to its invalid-row count.
- **S5 geojson wizard**: validation, `getOrgUnitMetadata` (level list),
  the metadata/count/heavy fetchers and both session caches.
- **S5 HMIS indicator manager**: the combined search and create routes
  of `indicators_dhis2` (`searchDhis2All`, `createIndicatorsFromDhis2`).
- **S6 HMIS dataset import**: `launchDatasetHmisDhis2Run` checks that a
  connection is stored (`getStoredDhis2CredentialsInfo`) without
  validating it, then the import run worker's dispatcher uses goal 5
  (`getDataValueSetsFromDHIS2`, `getExistingMetadataIds`,
  `getOrgUnitIdsAtLevel`) for classification + country pulls. The
  worker's semantics (dispatcher classification, per-pair integration,
  skip-and-record, the subtree split) are S6's documentation.

## Traps

- **`X-Requested-With` is load-bearing.** Without it some DHIS2
  versions answer auth failures with a 302 login redirect instead of a
  401, which validation and retry would misread.
- **Retry classifies on `error.message` substrings**, not
  `error.status`; and after exhaustion the thrown error is a plain
  `Error` with no `status`/`responseBody`. Don't branch on
  `DHIS2FetchError` fields downstream of `withRetry` without checking
  the exhaustion path.
- **The timeout timer spans the body read on purpose.** Don't "fix" it
  to clear at headers: a stalled body would hang the caller forever.
- **DHIS2 2.40 geojson facts**: `level` must be a filter when any
  `filter=` is present; `featureType` is not returned; the `.geojson`
  endpoint silently omits boundary-less units.
- **The session caches are per-process.** Each process in a
  multi-process deploy has its own.
- `getOrgUnitCountsByLevel` says "sample" but sets `paging=false`: it
  pulls id+level for **every** org unit. Fine for counts today; not a
  sample.
- Phase-1 validation accepts any response body containing `DHIS`/`dhis2`
  as "is a DHIS2 instance", deliberately loose (login-page HTML), so a
  proxy error page mentioning DHIS2 would pass phase 1 and fail phase 2
  with the less specific message.

## Open items

- Classify retries off `DHIS2FetchError.status` instead of message
  substrings, and decide whether the exhaustion error should preserve
  the structured fields.
- Cruft: retire the `goal1_..._v2` suffix (no v1 exists).
