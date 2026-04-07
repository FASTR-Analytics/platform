# Plan: DHIS2 Credential Validation Improvements

## Problem

Bad DHIS2 URLs and bad credentials are not caught early enough. Currently:

1. `dhis2ConfirmCredentials` stores credentials with zero validation — errors only surface deep in the staging worker
2. A standalone DHIS2 credentials button in the instance top nav saves to sessionStorage but is disconnected from any flow
3. Two separate connection-test functions exist (`testDHIS2Connection`, `testIndicatorsConnection`) doing overlapping work with different return shapes

The structure import flow (`structureStep1Dhis2_SetCredentials`) is the only flow that validates credentials before proceeding.

## Changes

### 1. Consolidate connection validation into one function

**File: `server/dhis2/common/base_fetcher.ts`**

Add a single canonical validation function:

```ts
export async function validateDhis2Connection(credentials: Dhis2Credentials): Promise<
  | { valid: true }
  | { valid: false; reason: "url_not_reachable"; message: string }
  | { valid: false; reason: "bad_credentials"; message: string }
  | { valid: false; reason: "server_error"; message: string }
>
```

**Implementation details:**

- Uses raw `fetch()` for both phases — NOT `fetchFromDHIS2()` (which auto-adds auth and throws on non-OK responses)
- Reuses `buildUrl()` for URL construction (handles trailing slash normalization) and `createAuthHeader()` for phase 2
- No retries — validation should give fast feedback
- 10s timeout on both phases

**Phase 1 — URL reachability:**

```ts
const url = buildUrl("/api/system/info.json", credentials.url);
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);
try {
  await fetch(url, { signal: controller.signal });
  // Any HTTP response = server is reachable, move to phase 2
} catch {
  return { valid: false, reason: "url_not_reachable", message: "..." };
} finally {
  clearTimeout(timeoutId);
}
```

**Phase 2 — Auth check:**

```ts
const url = buildUrl("/api/me.json", credentials.url);
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);
try {
  const response = await fetch(url, {
    headers: { Authorization: createAuthHeader(credentials) },
    signal: controller.signal,
  });
  if (response.status === 401 || response.status === 403) {
    return { valid: false, reason: "bad_credentials", message: "..." };
  }
  if (!response.ok) {
    return { valid: false, reason: "server_error", message: "..." };
  }
  return { valid: true };
} catch {
  return { valid: false, reason: "server_error", message: "..." };
} finally {
  clearTimeout(timeoutId);
}
```

**Error messages:**

- `url_not_reachable`: "Could not connect to a DHIS2 server at this URL. Either the URL is wrong or the DHIS2 instance is down/unavailable."
- `bad_credentials`: "The DHIS2 server was reached, but the username or password is incorrect."
- `server_error`: "The DHIS2 server was reached but returned an unexpected error. Please try again."

**Migrate existing functions:**

- `server/dhis2/goal1_org_units_v2/connection.ts` — `testDHIS2Connection()`: call `validateDhis2Connection()` first; if invalid, return early with failure. If valid, proceed with existing domain-specific fetches (org unit count, levels, version) that provide the detailed return shape.
- `server/dhis2/goal2_indicators/get_indicators_from_dhis2.ts` — `testIndicatorsConnection()`: same pattern — validate first, then do existing domain-specific fetches (data element count, indicator count, groups) on success.

### 2. Wire validation into credential-accepting routes

**A. HMIS import — `server/routes/instance/datasets.ts`**

Validate at the route level in the `dhis2ConfirmCredentials` handler (matching the pattern used by structure import at `structure.ts:254`):

```ts
// In the route handler, before calling the DB function:
const validation = await validateDhis2Connection(body);
if (!validation.valid) {
  return c.json({ success: false, err: validation.message });
}
const res = await updateDatasetUploadAttempt_Step1Dhis2Confirm(c.var.mainDb, body);
return c.json(res);
```

No changes to `server/db/instance/dataset_hmis.ts` — the DB function stays pure.

No client changes needed — `StateHolderFormError` in `step_1_dhis2.tsx` already renders the error.

**B. Indicator search routes — NOT adding per-request validation**

The `testDhis2IndicatorsConnection` route already exists for upfront validation. Adding `validateDhis2Connection()` to every search request would add 2 extra HTTP round-trips (~1-2s) to DHIS2 on every search, for negligible benefit — credentials don't go bad mid-session. If the user passed the connection test, searches should proceed directly. If credentials are somehow invalid, the search will fail with a DHIS2 API error, which is sufficient.

**C. Structure import — `server/routes/instance/structure.ts`**

Already validates via `testDHIS2Connection()`. After the refactor, this automatically uses `validateDhis2Connection()` under the hood. No behavior change needed.

### 3. Remove standalone DHIS2 credentials button from instance top nav

**File: `client/src/components/instance/index.tsx`**

- Remove `handleDhis2Credentials()` function (lines 79-102)
- Remove the button that calls it (lines 266-272)
- Remove imports of `Dhis2CredentialsForm` and session storage functions that are no longer used here

Keep `Dhis2CredentialsForm` itself — still used by `indicators_manager.tsx`.

## Not in scope

- **Already-stored bad credentials in upload attempts**: The staging worker already fails gracefully on bad credentials. The user can restart.

## File change summary

| File | Action |
|------|--------|
| `server/dhis2/common/base_fetcher.ts` | Add `validateDhis2Connection()` |
| `server/dhis2/goal1_org_units_v2/connection.ts` | Validate first, then do domain-specific fetches |
| `server/dhis2/goal2_indicators/get_indicators_from_dhis2.ts` | Validate first, then do domain-specific fetches |
| `server/routes/instance/datasets.ts` | Validate in `dhis2ConfirmCredentials` route handler |
| `client/src/components/instance/index.tsx` | Remove DHIS2 credentials button + handler |

## Order of implementation

1. Add `validateDhis2Connection()` to `base_fetcher.ts`
2. Refactor `testDHIS2Connection()` and `testIndicatorsConnection()` to validate-then-fetch
3. Add validation to `dhis2ConfirmCredentials` route handler in `datasets.ts`
4. Remove instance nav button + handler
5. Typecheck
