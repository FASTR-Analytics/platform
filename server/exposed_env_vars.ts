import {
  InstanceCalendar,
  InstanceLanguage,
  setCalendar,
  setLanguage,
} from "lib";

///////////////////////////////////////////////////////////////////////////////
// Environment Indicator
///////////////////////////////////////////////////////////////////////////////

export const _IS_PRODUCTION = !!Deno.env.get("IS_PRODUCTION");

///////////////////////////////////////////////////////////////////////////////
// Instance Configuration
///////////////////////////////////////////////////////////////////////////////

export const _INSTANCE_NAME = Deno.env
  .get("INSTANCE_NAME")
  ?.replaceAll("'", "")
  .replaceAll(`"`, "")!;
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

export const _INSTANCE_REDIRECT_URL = Deno.env.get("INSTANCE_REDIRECT_URL")!;
if (_INSTANCE_REDIRECT_URL === undefined) {
  throw new Error("Could not get INSTANCE_REDIRECT_URL env variable");
}

export const _INSTANCE_LANGUAGE = (Deno.env
  .get("INSTANCE_LANGUAGE")
  ?.replaceAll("'", "")
  .replaceAll(`"`, "") as InstanceLanguage) ?? "en";
if (
  _INSTANCE_LANGUAGE === undefined ||
  !["en", "fr"].includes(_INSTANCE_LANGUAGE)
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
