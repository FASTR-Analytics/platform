import {
  ALL_INSTANCE_FISCAL_YEARS,
  InstanceCalendar,
  InstanceFiscalYear,
  setCalendar,
  setLanguage,
} from "lib";
import type { Language } from "@timroberton/panther";

///////////////////////////////////////////////////////////////////////////////
// Environment Indicator
///////////////////////////////////////////////////////////////////////////////

export const _IS_PRODUCTION = !!Deno.env.get("IS_PRODUCTION");

export const _MODULES_LOCAL_DIR = Deno.env.get("FASTR_MODULES_LOCAL_DIR") ??
  "./modules";

///////////////////////////////////////////////////////////////////////////////
// Instance Configuration
///////////////////////////////////////////////////////////////////////////////

export const _INSTANCE_NAME = Deno.env.get("INSTANCE_NAME")!;
if (_INSTANCE_NAME === undefined) {
  throw new Error("Could not get INSTANCE_NAME env variable");
}

export const _INSTANCE_ID = Deno.env
  .get("INSTANCE_ID")
  ?.replaceAll("'", "")
  .replaceAll(`"`, "")!;
if (_INSTANCE_ID === undefined) {
  throw new Error("Could not get INSTANCE_ID env variable");
}

export const _INSTANCE_LANGUAGE = (Deno.env
  .get("INSTANCE_LANGUAGE")
  ?.replaceAll("'", "")
  .replaceAll(`"`, "") as Language) ?? "en";
if (
  _INSTANCE_LANGUAGE === undefined ||
  !["en", "fr", "pt"].includes(_INSTANCE_LANGUAGE)
) {
  throw new Error("Could not get INSTANCE_LANGUAGE env variable");
}
setLanguage(_INSTANCE_LANGUAGE);

export const _INSTANCE_CALENDAR = (Deno.env
  .get("INSTANCE_CALENDAR")
  ?.replaceAll("'", "")
  .replaceAll(`"`, "") as InstanceCalendar) ?? "gregorian";
if (
  _INSTANCE_CALENDAR === undefined ||
  !["gregorian", "ethiopian"].includes(_INSTANCE_CALENDAR)
) {
  throw new Error("Could not get INSTANCE_CALENDAR env variable");
}
setCalendar(_INSTANCE_CALENDAR);

// Fiscal-year reporting mode. Orthogonal to INSTANCE_CALENDAR: it relabels
// quarterly timeseries axes only, and only for gregorian instances (FY-July is
// a gregorian variant; Ethiopian quarters bucket differently). Unset means
// "none", so existing instances need no env change.
export const _INSTANCE_FISCAL_YEAR = (Deno.env
  .get("INSTANCE_FISCAL_YEAR")
  ?.replaceAll("'", "")
  .replaceAll(`"`, "")
  .trim() as InstanceFiscalYear) ?? "none";
if (!ALL_INSTANCE_FISCAL_YEARS.includes(_INSTANCE_FISCAL_YEAR)) {
  throw new Error(
    `INSTANCE_FISCAL_YEAR must be one of ${
      ALL_INSTANCE_FISCAL_YEARS.join(" | ")
    } (got "${_INSTANCE_FISCAL_YEAR}")`,
  );
}
if (_INSTANCE_FISCAL_YEAR !== "none" && _INSTANCE_CALENDAR !== "gregorian") {
  throw new Error(
    `INSTANCE_FISCAL_YEAR is only supported with INSTANCE_CALENDAR=gregorian (got "${_INSTANCE_CALENDAR}")`,
  );
}

///////////////////////////////////////////////////////////////////////////////
// Directory Paths
///////////////////////////////////////////////////////////////////////////////

export const _SANDBOX_DIR_PATH = Deno.env.get("SANDBOX_DIR_PATH")!;
if (_SANDBOX_DIR_PATH === undefined) {
  throw new Error("Could not get SANDBOX_DIR_PATH env variable");
}

export const _SANDBOX_DIR_PATH_EXTERNAL = Deno.env.get(
  "SANDBOX_DIR_PATH_EXTERNAL",
)!;
if (_SANDBOX_DIR_PATH_EXTERNAL === undefined) {
  throw new Error("Could not get SANDBOX_DIR_PATH_EXTERNAL env variable");
}

export const _SANDBOX_DIR_PATH_POSTGRES_INTERNAL = Deno.env.get(
  "SANDBOX_DIR_PATH_POSTGRES_INTERNAL",
)!;
if (_SANDBOX_DIR_PATH_POSTGRES_INTERNAL === undefined) {
  throw new Error(
    "Could not get SANDBOX_DIR_PATH_POSTGRES_INTERNAL env variable",
  );
}

export const _ASSETS_DIR_PATH = Deno.env.get("ASSETS_DIR_PATH")!;
if (_ASSETS_DIR_PATH === undefined) {
  throw new Error("Could not get ASSETS_DIR_PATH env variable");
}

// Immutable results-package directories (PLAN_RESULTS_RUNS §2.1), with the
// same three path namespaces as the sandbox (binding decision 4): the Deno
// process reads/writes packages at _RUNS_DIR_PATH; the R container mounts a
// package's tmp dir during generation via _EXTERNAL (host path); the Postgres
// container writes COPY TO dataset extracts directly into that tmp dir via
// _POSTGRES_INTERNAL, so it must see the same directory.
//
// **They DEFAULT TO THE SANDBOX PATHS — the same directory, not a subdir of it**
// (Tim's ruling 2026-07-30). The sandbox volume is already mounted into BOTH
// the app and the Postgres containers on every fleet instance and is already
// world-writable, so defaulting here means a results package needs no new
// volume, no compose change, no chmod and no new env var — the whole class of
// "instance N never got the runs mount" disappears, and it cannot half-work:
// if the sandbox is wrong, nothing works today either.
//
// Sharing one directory is safe because nothing treats its entries as a
// homogeneous set: every consumer addresses a NAMED entry — a `{projectId}`
// dir, the `.tmp-{runId}` prefix (the boot sweep's only filter), or
// `.duckdb-spill`. Package dirs are freshly minted UUIDs, so they can never
// collide with a project id.
//
// The end state (Tim): once Phase 4 removes the legacy per-project dirs, this
// directory holds only packages and gets RENAMED sandbox → runs. Setting the
// env vars below overrides the default, so that rename is a config change plus
// a `mv`, never a code change. Dev sets them explicitly, which keeps the two
// dirs separate locally and exercises the override path.
const runsDirDefault = (envVar: string, sandboxPath: string): string => {
  const explicit = Deno.env.get(envVar);
  return explicit === undefined || explicit === "" ? sandboxPath : explicit;
};

export const _RUNS_DIR_PATH = runsDirDefault(
  "RUNS_DIR_PATH",
  _SANDBOX_DIR_PATH,
);

export const _RUNS_DIR_PATH_EXTERNAL = runsDirDefault(
  "RUNS_DIR_PATH_EXTERNAL",
  _SANDBOX_DIR_PATH_EXTERNAL,
);

export const _RUNS_DIR_PATH_POSTGRES_INTERNAL = runsDirDefault(
  "RUNS_DIR_PATH_POSTGRES_INTERNAL",
  _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
);

///////////////////////////////////////////////////////////////////////////////
// Database Configuration
///////////////////////////////////////////////////////////////////////////////

export const _PG_HOST = Deno.env.get("PG_HOST")!;
if (_PG_HOST === undefined) {
  throw new Error("Could not get PG_HOST env variable");
}

export const _PG_PORT = Deno.env.get("PG_PORT")!;
if (_PG_PORT === undefined) {
  throw new Error("Could not get PG_PORT env variable");
}

export const _PG_PASSWORD = Deno.env.get("PG_PASSWORD")!;
if (_PG_PASSWORD === undefined) {
  throw new Error("Could not get PG_PASSWORD env variable");
}

///////////////////////////////////////////////////////////////////////////////
// AI / External APIs
///////////////////////////////////////////////////////////////////////////////

export const _ANTHROPIC_API_URL = Deno.env.get("ANTHROPIC_API_URL")!;
if (_ANTHROPIC_API_URL === undefined) {
  throw new Error("Could not get ANTHROPIC_API_URL env variable");
}

export const _ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
if (_ANTHROPIC_API_KEY === undefined) {
  throw new Error("Could not get ANTHROPIC_API_KEY env variable");
}

export const _STATUS_API_KEY = Deno.env.get("STATUS_API_KEY")!;
if (_STATUS_API_KEY === undefined) {
  throw new Error("Could not get STATUS_API_KEY env variable");
}

export const _SEND_GRID_API = Deno.env.get("SEND_GRID_API")!;
if (_SEND_GRID_API === undefined) {
  throw new Error("Could not get SEND_GRID_API env variable");
}

export const _GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");

///////////////////////////////////////////////////////////////////////////////
// Volume Auto-Resize (Optional)
///////////////////////////////////////////////////////////////////////////////

export const _VOLUME_NAME = Deno.env.get("VOLUME_NAME");

export const _DAILY_TOKEN_LIMIT: number | null =
  Deno.env.get("DAILY_TOKEN_LIMIT")
    ? parseInt(Deno.env.get("DAILY_TOKEN_LIMIT")!)
    : null;
if (_DAILY_TOKEN_LIMIT !== null && Number.isNaN(_DAILY_TOKEN_LIMIT)) {
  throw new Error("DAILY_TOKEN_LIMIT is set but is not a number");
}

export const _WEEKLY_TOKEN_LIMIT: number | null =
  Deno.env.get("WEEKLY_TOKEN_LIMIT")
    ? parseInt(Deno.env.get("WEEKLY_TOKEN_LIMIT")!)
    : null;
if (_WEEKLY_TOKEN_LIMIT !== null && Number.isNaN(_WEEKLY_TOKEN_LIMIT)) {
  throw new Error("WEEKLY_TOKEN_LIMIT is set but is not a number");
}

///////////////////////////////////////////////////////////////////////////////
// DHIS2 Import Tuning (Optional)
///////////////////////////////////////////////////////////////////////////////

export const _DHIS2_FACILITY_BATCH_SIZE: number = Deno.env.get(
  "DHIS2_FACILITY_BATCH_SIZE",
)
  ? parseInt(Deno.env.get("DHIS2_FACILITY_BATCH_SIZE")!)
  : 400;
if (
  Number.isNaN(_DHIS2_FACILITY_BATCH_SIZE) ||
  _DHIS2_FACILITY_BATCH_SIZE < 1
) {
  throw new Error(
    "DHIS2_FACILITY_BATCH_SIZE is set but is not a positive number",
  );
}

export const _DHIS2_CONCURRENT_REQUESTS: number = Deno.env.get(
  "DHIS2_CONCURRENT_REQUESTS",
)
  ? parseInt(Deno.env.get("DHIS2_CONCURRENT_REQUESTS")!)
  : 5;
if (
  Number.isNaN(_DHIS2_CONCURRENT_REQUESTS) ||
  _DHIS2_CONCURRENT_REQUESTS < 1
) {
  throw new Error(
    "DHIS2_CONCURRENT_REQUESTS is set but is not a positive number",
  );
}

// Encrypts the stored DHIS2 password at rest (PLAN_DHIS2_IMPORTER Phase 4,
// C3). Unset = credentials cannot be stored, so nothing can fire unattended;
// saving/decrypting fails loudly with a clear message. Changing the key
// orphans the stored password (re-save credentials once).
export const _DHIS2_CREDENTIALS_ENCRYPTION_KEY: string =
  Deno.env.get("DHIS2_CREDENTIALS_ENCRYPTION_KEY") ?? "";

///////////////////////////////////////////////////////////////////////////////
// Authentication (Optional)
///////////////////////////////////////////////////////////////////////////////

export const _OPEN_ACCESS = !!Deno.env.get("OPEN_ACCESS");

// Only enabled if BYPASS_AUTH=true AND not in production
export const _BYPASS_AUTH = !!Deno.env.get("BYPASS_AUTH") && !_IS_PRODUCTION;

///////////////////////////////////////////////////////////////////////////////
// Deployment Metadata
///////////////////////////////////////////////////////////////////////////////

export const _SERVER_VERSION = Deno.env.get("SERVER_VERSION")!;
if (_SERVER_VERSION === undefined) {
  throw new Error("Could not get SERVER_VERSION env variable");
}

export const _DATABASE_FOLDER = Deno.env.get("DATABASE_FOLDER")!;
if (_DATABASE_FOLDER === undefined) {
  throw new Error("Could not get DATABASE_FOLDER env variable");
}

export const _START_TIME = new Date().toISOString();

///////////////////////////////////////////////////////////////////////////////
// Module Execution Constants
///////////////////////////////////////////////////////////////////////////////

export const _MODULE_SCRIPT_FILE_NAME = "___script___.R";
export const _MODULE_LOG_FILE_NAME = "___logs___.txt";

export const UPLOADED_HMIS_DATA_STAGING_TABLE_NAME =
  "uploaded_hmis_data_staging_ready_for_integration";
export const UPLOADED_HFA_DATA_STAGING_TABLE_NAME =
  "uploaded_hfa_data_staging_ready_for_integration";
export const UPLOADED_HFA_DICT_VARS_STAGING_TABLE_NAME =
  "uploaded_hfa_dictionary_vars_staging";
export const UPLOADED_HFA_DICT_VALUES_STAGING_TABLE_NAME =
  "uploaded_hfa_dictionary_values_staging";
