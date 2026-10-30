// The permission matrix: every registry route, raw endpoint and static tier
// against every persona, on the dev database. EXPECTED is written by hand and
// typed over the registry, so a guard that changes in the code without a
// matching change here fails, and a route added without a row here does not
// compile. For every route and persona the test sends an empty body (product
// routes name the seeded product, folder routes an unknown folder) and asserts
// the class: 401 with no identity, 403 for a persona the guard refuses, and
// neither for one it admits, where the handler's 400 or 404 proves the guard
// passed without doing the work. A handler that would do real work with no
// body at all (a delete-all, a staging run, a DHIS2 call) is marked
// refusals_only: its admitted class is proven by the refusals alone.
//
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/permission_matrix_test.ts

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import type { Hono } from "hono";
import {
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  _USER_PERMISSIONS_DEFAULT_NO_ACCESS,
  ALL_SCOPES,
  type APIResponseWithData,
  buildUserPermissionsFromRow,
  type CollabServerMessage,
  geographyOnlyScopeDefinition,
  H_USERS,
  permissionsUnderScopeAccess,
  type ProductAccessLevel,
  type ProductLevel,
  productLevelAtLeast,
  routeRegistry,
  type ScopeUuid,
  type UserPermission,
  type UserPermissions,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import type { DBUser } from "../db/mod.ts";
import {
  createPersonalAccessToken,
  revokePersonalAccessToken,
} from "../db/instance/personal_access_tokens.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { createScope } from "../db/instance/scopes.ts";
import { setUserScopeAccess } from "../db/instance/users.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import {
  createFolder,
  createProduct,
  FOLDER_NOT_FOUND,
  setProductAccess,
} from "../db/products/mod.ts";
import { _ASSETS_DIR_PATH, _STATUS_API_KEY } from "../exposed_env_vars.ts";
import { headlessApp } from "../headless_app.ts";
import { setupStaticServing } from "../middleware/static.ts";
import { routesAiFiles } from "../routes/instance/ai_files.ts";
import { routesAssets } from "../routes/instance/assets.ts";
import {
  COLLAB_CLOSE_UNAUTHORIZED,
  routesCollab,
} from "../routes/instance/collab.ts";
import { routesCopilotAiProxy } from "../routes/instance/copilot_ai_proxy.ts";
import { routesCustomPrompts } from "../routes/instance/custom_prompts.ts";
import { routesDatasets } from "../routes/instance/datasets.ts";
import { routesDhis2Credentials } from "../routes/instance/dhis2_credentials.ts";
import { routesEmails } from "../routes/instance/emails.ts";
import { routesGeoJsonMaps } from "../routes/instance/geojson_maps.ts";
import { routesHealth } from "../routes/instance/health.ts";
import { routesHfaIndicators } from "../routes/instance/hfa_indicators.ts";
import { routesHfaTimePoints } from "../routes/instance/hfa_time_points.ts";
import { routesIceh } from "../routes/instance/iceh.ts";
import { routesIndicators } from "../routes/instance/indicators.ts";
import { routesIndicatorsDhis2 } from "../routes/instance/indicators_dhis2.ts";
import { routesInstance } from "../routes/instance/instance.ts";
import { routesInstanceSSE } from "../routes/instance/instance-sse.ts";
import { routesOnboarding } from "../routes/instance/onboarding.ts";
import { routesPopulation } from "../routes/instance/population.ts";
import { routesRunGeneration } from "../routes/instance/run_generation.ts";
import { routesScopes } from "../routes/instance/scopes.ts";
import { routesStructure } from "../routes/instance/structure.ts";
import { routesUpload } from "../routes/instance/upload.ts";
import { routesUsers } from "../routes/instance/users.ts";
import { routesWhatsNew } from "../routes/instance/whats_new.ts";
import { routesFolders } from "../routes/products/folders.ts";
import { routesProducts } from "../routes/products/products.ts";
import { routesProductReports } from "../routes/products/reports.ts";
import { routesProductSlideDecks } from "../routes/products/slide_decks.ts";
import { routesProductSlides } from "../routes/products/slides.ts";
import { routesOAuthMetadata } from "../routes/public/oauth_metadata.ts";
import {
  appFor,
  assertRealAuth,
  call,
  type Session,
  statusOf,
} from "./_harness/route_app.ts";

// ---------------------------------------------------------------------------
// The expectation table
// ---------------------------------------------------------------------------

// Who may call a route. A permission names one flag; a list of flags means
// any of them (the data-file static tier takes either data flag). A product
// or folder class names the level the route declares.
type GuardClass =
  | "public"
  | "signed_in"
  | "approved"
  | "admin"
  | "operator"
  | "status_key"
  | UserPermission
  | readonly UserPermission[]
  | `product:${ProductAccessLevel}`
  | `folder:${ProductAccessLevel}`;

// What an admitted call sends when the empty default would make the handler
// do real work: a body the schema refuses, params the lookup misses, or
// refusals_only when nothing can stop the handler.
type Probe =
  | { body?: unknown; params?: Record<string, string> }
  | "refusals_only";

type Expectation = {
  guard: GuardClass;
  // Whether the headless app admits the route (the /mcp allowlist).
  headless: "open" | "closed";
  // Also admitted to a machine call carrying the status key.
  orStatusKey?: true;
  probe?: Probe;
};

const closed = (guard: GuardClass, probe?: Probe): Expectation => ({
  guard,
  headless: "closed",
  probe,
});
const open = (guard: GuardClass): Expectation => ({ guard, headless: "open" });

const EXPECTED: Record<keyof typeof routeRegistry, Expectation> = {
  addStructureUploadAttempt: closed("can_configure_data", "refusals_only"),
  addUsers: closed("can_configure_users"),
  analyzeGeoJsonUpload: closed("can_configure_data"),
  batchUploadHfaIndicators: closed("can_configure_data"),
  batchUploadUsers: closed("can_configure_users"),
  bulkSetUserScopeAccess: closed("can_configure_users"),
  bulkUpdateUserPermissions: closed("can_configure_users"),
  cancelDatasetHfaRun: closed("can_configure_data"),
  cancelDatasetHmisDhis2Run: closed("can_configure_data"),
  cancelDatasetIcehRun: closed("can_configure_data"),
  classifyDatasetHmisDhis2Selection: closed("can_configure_data"),
  copyReportVersion: closed("product:view"),
  copySlideDeckVersion: closed("product:view"),
  copySlidesToSlideDeck: closed("product:view"),
  countUnreferencedHfaFacilities: closed("can_configure_data"),
  createCustomPrompt: closed("approved"),
  createDatasetHmisDhis2Schedule: closed("can_configure_data"),
  createFolder: closed("folder:edit"),
  createHfaIndicator: closed("can_configure_data"),
  createHfaIndicatorCategory: closed("can_configure_data"),
  createHfaIndicatorServiceCategory: closed("can_configure_data"),
  createHfaIndicatorSubCategory: closed("can_configure_data"),
  createHfaIndicatorVariantGroup: closed("can_configure_data"),
  createHfaIndicatorVariantItem: closed("can_configure_data"),
  createHfaTimePoint: closed("can_configure_data"),
  createIndicators: closed("can_configure_data"),
  createIndicatorsFromDhis2: closed("can_configure_data"),
  createPersonalAccessToken: closed("approved"),
  createProduct: closed("product:edit"),
  createReportStyle: closed("product:edit"),
  createScope: closed("admin"),
  createSlide: closed("product:edit"),
  deleteAllDatasetHmisData: closed("can_configure_data"),
  deleteAllHfaFacilityWeights: closed("can_configure_data", "refusals_only"),
  deleteAllPopulation: closed("can_configure_data", "refusals_only"),
  deleteAssets: closed("approved"),
  deleteCustomPrompt: closed("approved"),
  deleteDatasetHfaData: closed("can_configure_data", {
    body: { timePoint: 1 },
  }),
  deleteDatasetHmisDhis2Schedule: closed("can_configure_data"),
  deleteDatasetIcehData: closed("can_configure_data", "refusals_only"),
  deleteDatasetIcehIndicators: closed("can_configure_data"),
  deleteFamilyFacilities: closed("can_configure_data"),
  deleteFolder: closed("folder:edit"),
  deleteGeoJsonMap: closed("can_configure_data"),
  deleteHfaIndicatorCategory: closed("can_configure_data"),
  deleteHfaIndicatorServiceCategory: closed("can_configure_data"),
  deleteHfaIndicatorSubCategory: closed("can_configure_data"),
  deleteHfaIndicatorVariantGroup: closed("can_configure_data"),
  deleteHfaIndicatorVariantItem: closed("can_configure_data"),
  deleteHfaIndicators: closed("can_configure_data"),
  deleteHfaTimePoint: closed("can_configure_data"),
  deleteIndicators: closed("can_configure_data"),
  deleteInstanceDhis2Credentials: closed(
    "can_configure_data",
    "refusals_only",
  ),
  deletePopulationTypeData: closed("can_configure_data"),
  deleteProducts: closed("product:own"),
  deleteReportStyle: closed("product:edit"),
  deleteRun: closed("can_configure_data"),
  deleteScope: closed("admin"),
  deleteSlides: closed("product:edit"),
  deleteStructureUploadAttempt: closed("can_configure_data", "refusals_only"),
  deleteUser: closed("can_configure_users"),
  dhis2AnalyzeGeoJson: closed("can_configure_data"),
  dhis2GetOrgUnitLevels: closed("can_configure_data", "refusals_only"),
  dhis2SaveGeoJsonMap: closed("can_configure_data"),
  duplicateProduct: closed("product:view"),
  duplicateSlides: closed("product:edit"),
  editHfaFacility: closed("can_configure_data"),
  enqueueDatasetHmisCsvRun: closed("can_configure_data"),
  enqueueDatasetHmisDhis2Run: closed("can_configure_data"),
  getAdminAreaOptionsForLevel: closed("approved"),
  getAiUsage: closed("approved"),
  getAllHfaIndicatorCode: closed("can_configure_data"),
  getAllHfaIndicatorVariantCode: closed("can_configure_data"),
  getCurrentUser: open("signed_in"),
  getCustomPrompts: closed("approved"),
  getDatasetHfaDisplayInfo: closed("can_view_data"),
  getDatasetHfaImportRuns: closed("can_view_data"),
  getDatasetHfaLatestMappings: closed("can_configure_data"),
  getDatasetHmisDhis2Scheduling: closed("can_view_data"),
  getDatasetHmisDisplayInfo: closed("can_view_data"),
  getDatasetHmisImportLedger: closed("can_view_data"),
  getDatasetHmisImportRunDetail: closed("can_view_data"),
  getDatasetHmisImportRuns: closed("can_view_data"),
  getDatasetHmisVersions: closed("can_view_data"),
  getDatasetIcehDetail: closed("can_view_data"),
  getDatasetIcehDisplayData: closed("can_view_data"),
  getDatasetIcehImportRuns: closed("can_view_data"),
  getHfaDictionaryForValidation: closed("can_configure_data"),
  getHfaFacilityWeightsItems: closed("can_view_data"),
  getHfaIndicatorCategories: closed("can_configure_data"),
  getHfaIndicatorCode: closed("can_configure_data"),
  getHfaIndicatorServiceCategories: closed("can_configure_data"),
  getHfaIndicatorSubCategories: closed("can_configure_data"),
  getHfaIndicatorVariantCode: closed("can_configure_data"),
  getHfaIndicatorVariantGroups: closed("can_configure_data"),
  getHfaIndicatorVariantItems: closed("can_configure_data"),
  getHfaIndicators: closed("can_configure_data"),
  getHfaRegistry: closed("can_view_data"),
  getIndicators: closed("can_configure_data"),
  getInstanceDhis2CredentialsInfo: closed("can_configure_data"),
  getInstanceMeta: closed("public"),
  getModuleDefaultsGlobal: closed("can_configure_data"),
  getPopulationTypeStore: closed("can_view_data"),
  getReportDetail: closed("product:view"),
  getReportVersion: closed("product:view"),
  getReportVersionLineage: closed("product:view"),
  getRunAuthoringContext: closed("approved"),
  getRunDetail: closed("can_view_data"),
  getRunGenerationDefaults: closed("can_configure_data"),
  getRunGenerationModuleOptions: closed("can_configure_data"),
  getRunGeoJsonStamp: closed("approved"),
  getRunGridItems: closed("approved"),
  getRunModuleLogs: closed("can_view_logs"),
  getRunModuleScript: closed("can_view_data"),
  getRunModuleWithConfigSelections: closed("can_view_data"),
  getRunPresentationObjectItems: open("approved"),
  getRunReplicantOptions: closed("approved"),
  getRunResultsObjectItems: closed("approved"),
  getRunResultsValueInfo: open("approved"),
  getSlide: closed("product:view"),
  getSlideDeckDetail: closed("product:view"),
  getSlideDeckVersion: closed("product:view"),
  getSlides: closed("product:view"),
  getStructureItems: closed("can_view_data"),
  getStructureStagedColumnValues: closed("can_configure_data"),
  getStructureStagedRecodeRows: closed("can_configure_data"),
  getStructureUploadAttempt: closed("can_configure_data"),
  getStructureUploadStatus: closed("can_configure_data"),
  getUserPermissions: closed("can_configure_users"),
  getUsersLastActive: closed("can_view_logs"),
  getWhatsNewPosts: closed("approved"),
  importHfaFacilityWeights: closed("can_configure_data"),
  importHfaIndicatorsWorkbook: closed("can_configure_data"),
  importPopulationCsv: closed("can_configure_data"),
  launchDatasetHfaCsvRun: closed("can_configure_data"),
  launchDatasetHmisCsvRun: closed("can_configure_data"),
  launchDatasetHmisDhis2Run: closed("can_configure_data"),
  launchDatasetIcehRun: closed("can_configure_data"),
  launchRunGeneration: closed("can_configure_data"),
  listAdminArea2s: closed("approved"),
  listPersonalAccessTokens: closed("approved"),
  listReadyPackages: closed("approved"),
  listReportStyles: closed("product:view"),
  listReportVersions: closed("product:view"),
  listRunCatalog: closed("can_configure_data"),
  listRunModuleFiles: closed("can_view_data"),
  listSlideDeckVersions: closed("product:view"),
  moveFolder: closed("folder:edit", { body: { parentId: null } }),
  moveProductsToFolder: closed("product:edit"),
  moveSlides: closed("product:edit"),
  parseDatasetHfaCsvHeaders: closed("can_configure_data"),
  parseDatasetHmisCsvHeaders: closed("can_configure_data"),
  parseDatasetIcehZipPreview: closed("can_configure_data"),
  pinResultsPackage: closed("can_configure_data"),
  previewDatasetHfaDuplicates: closed("can_configure_data"),
  previewDatasetHfaFacilityChanges: closed("can_configure_data"),
  previewDatasetHfaFacilityColumns: closed("can_configure_data"),
  previewPopulationCsv: closed("can_configure_data"),
  readWeightsCsvHeaders: closed("can_configure_data"),
  receiveUserNameSync: closed("status_key"),
  receiveUserProfileSync: closed("status_key"),
  recordTourEvent: closed("approved"),
  recordWhatsNewEvent: closed("approved"),
  refreshDhis2Labels: closed("can_configure_data", "refusals_only"),
  remapGeoJson: closed("can_configure_data"),
  removeUnreferencedHfaFacilities: closed(
    "can_configure_data",
    "refusals_only",
  ),
  renameUserEmail: { guard: "admin", headless: "closed", orStatusKey: true },
  renameUserEmailEverywhere: closed("signed_in"),
  renderReportPdf: closed("product:view"),
  reorderHfaIndicatorCategories: closed("can_configure_data"),
  reorderHfaIndicatorServiceCategories: closed("can_configure_data"),
  reorderHfaIndicatorSubCategories: closed("can_configure_data"),
  reorderHfaIndicatorVariantGroups: closed("can_configure_data"),
  reorderHfaIndicatorVariantItems: closed("can_configure_data"),
  reorderHfaTimePoints: closed("can_configure_data"),
  reorderIndicators: closed("can_configure_data"),
  resolveDatasetHfaReview: closed("can_configure_data"),
  resolveDatasetHmisCsvReview: closed("can_configure_data"),
  resolveDatasetIcehReview: closed("can_configure_data"),
  restoreReportVersion: closed("product:edit"),
  restoreSlideDeckVersion: closed("product:edit"),
  revokePersonalAccessToken: closed("approved"),
  saveGeoJsonMap: closed("can_configure_data"),
  saveHfaIndicatorFull: closed("can_configure_data"),
  saveHfaIndicatorsBatch: closed("can_configure_data"),
  saveInstanceDhis2Credentials: closed("can_configure_data"),
  saveRunGenerationDefaults: closed("can_configure_data"),
  scanDatasetHmisCsvIndicatorValues: closed("can_configure_data"),
  searchDhis2All: closed("can_configure_data"),
  searchDhis2DataElements: closed("can_configure_data"),
  searchDhis2Indicators: closed("can_configure_data"),
  sendHelpEmail: closed("approved"),
  sendReportEmail: closed("approved"),
  sendSlideDeckEmail: closed("approved"),
  setFolderProductsAccess: closed("folder:own"),
  setIndicatorsIncludeInAnalysis: closed("can_configure_data"),
  setPopulationLevel: closed("can_configure_data"),
  setProductAccess: closed("product:edit"),
  setProductOwner: closed("product:own"),
  setProductPackage: closed("product:edit"),
  setProductScope: closed("product:edit"),
  setReportStyle: closed("product:edit"),
  setStructureRecodes: closed("can_configure_data"),
  setUserContactPerson: closed("approved"),
  setUserScopeAccess: closed("can_configure_users"),
  setUserUnlimitedAi: closed("approved"),
  structureStep0_SetSourceType: closed("can_configure_data"),
  structureStep1Csv_UploadFile: closed("can_configure_data"),
  structureStep1Dhis2_ConfirmConnection: closed(
    "can_configure_data",
    "refusals_only",
  ),
  structureStep2Csv_SetColumnMappings: closed("can_configure_data"),
  structureStep2Dhis2_GetOrgUnitsMetadata: closed(
    "can_configure_data",
    "refusals_only",
  ),
  structureStep2Dhis2_SetOrgUnitSelection: closed("can_configure_data"),
  structureStep3Csv_StageDataStreaming: closed(
    "can_configure_data",
    "refusals_only",
  ),
  structureStep3Dhis2_StageDataStreaming: closed(
    "can_configure_data",
    "refusals_only",
  ),
  structureStep4_ImportData: closed("can_configure_data"),
  toggleUserAdmin: closed("admin"),
  unpinResultsPackage: closed("can_configure_data"),
  updateAdminAreaLabelsConfig: closed("can_configure_settings", {
    body: { label1: 1 },
  }),
  updateAiContextConfig: closed("can_configure_settings"),
  updateAssetVisibility: closed("approved"),
  updateCustomPrompt: closed("approved"),
  updateDatasetHmisDhis2Schedule: closed("can_configure_data"),
  updateFolder: closed("folder:edit", { body: { label: "x", color: null } }),
  updateHfaIndicator: closed("can_configure_data"),
  updateHfaIndicatorCategory: closed("can_configure_data"),
  updateHfaIndicatorServiceCategory: closed("can_configure_data"),
  updateHfaIndicatorSubCategory: closed("can_configure_data"),
  updateHfaIndicatorVariantGroup: closed("can_configure_data"),
  updateHfaIndicatorVariantItem: closed("can_configure_data"),
  updateHfaTimePoint: closed("can_configure_data"),
  updateIndicator: closed("can_configure_data"),
  updateMyProfile: closed("signed_in"),
  updateProductLabel: closed("product:edit"),
  updateReportBody: closed("product:edit"),
  updateReportConfig: closed("product:edit"),
  updateReportFigures: closed("product:edit"),
  updateReportImages: closed("product:edit"),
  updateReportStyle: closed("product:edit"),
  updateScope: closed("admin"),
  updateSlide: closed("product:edit"),
  updateSlideDeckConfig: closed("product:edit"),
  updateStructureSchema: closed("can_configure_settings"),
  updateUserPermissions: closed("can_configure_users"),
};

// The endpoints off the registry, and the static tiers, with the class each
// holds. A private asset is the one tier whose refusal is a 404 to everyone
// but its owner, the owner's existence included. The authorization-server
// document proxies Clerk and is not called.
type RawEndpoint = {
  name: string;
  method: string;
  path: string;
  guard: GuardClass | "asset_owner";
  probe?: { body?: unknown; headers?: Record<string, string> };
};

const DATA_FLAGS = ["can_view_data", "can_configure_data"] as const;

function rawEndpoints(seed: Seed): RawEndpoint[] {
  return [
    {
      name: "instance stream",
      method: "GET",
      path: "/instance_updates",
      guard: "signed_in",
    },
    { name: "TUS create", method: "POST", path: "/upload", guard: "approved" },
    { name: "TUS status", method: "GET", path: "/upload/x", guard: "public" },
    {
      name: "TUS chunk",
      method: "PATCH",
      path: "/upload/x",
      guard: "approved",
    },
    {
      name: "TUS abort",
      method: "DELETE",
      path: "/upload/x",
      guard: "approved",
    },
    {
      name: "copilot proxy",
      method: "POST",
      path: "/ai/v1/messages",
      guard: "approved",
      probe: { body: "not json" },
    },
    {
      name: "copilot files",
      method: "POST",
      path: "/ai/files",
      guard: "approved",
      probe: { body: {} },
    },
    {
      name: "health check",
      method: "GET",
      path: "/health_check",
      guard: "public",
    },
    {
      name: "health user_logs",
      method: "GET",
      path: "/user_logs",
      guard: "public",
    },
    {
      name: "health user_activity",
      method: "GET",
      path: "/user_activity",
      guard: "public",
    },
    {
      name: "health user_logs_all",
      method: "GET",
      path: "/user_logs_all",
      guard: "public",
    },
    {
      name: "health user_logs_aggregate",
      method: "GET",
      path: "/user_logs_aggregate",
      guard: "public",
    },
    {
      name: "health ai_usage",
      method: "GET",
      path: "/ai_usage",
      guard: "public",
    },
    {
      name: "health ai_weekly_usage",
      method: "GET",
      path: "/ai_weekly_usage",
      guard: "public",
    },
    {
      name: "health ai_limit_hits",
      method: "GET",
      path: "/ai_limit_hits",
      guard: "public",
    },
    {
      name: "health pg_stat_statements",
      method: "GET",
      path: "/pg_stat_statements",
      guard: "public",
    },
    {
      name: "health dhis2 export",
      method: "GET",
      path: "/dhis2-indicators-export",
      guard: "public",
    },
    {
      name: "health module defaults",
      method: "GET",
      path: "/module_defaults_snapshot",
      guard: "status_key",
    },
    {
      name: "health stats reset",
      method: "POST",
      path: "/pg_stat_statements_reset",
      guard: "status_key",
    },
    {
      name: "weights CSV",
      method: "GET",
      path: "/structure/hfa_facility_weights/export/csv",
      guard: "can_view_data",
    },
    {
      name: "facilities CSV",
      method: "GET",
      path: "/structure/facilities/export/csv/x",
      guard: "can_view_data",
    },
    {
      name: "population CSV",
      method: "GET",
      path: "/population/export/csv",
      guard: "can_view_data",
    },
    {
      name: "population template",
      method: "GET",
      path: "/population/template/csv",
      guard: "can_configure_data",
    },
    {
      name: "run boundary file",
      method: "GET",
      path: "/run_generation/run/x/geojson/hmis/2",
      guard: "approved",
    },
    {
      name: "geojson level",
      method: "GET",
      path: "/geojson-maps/level/hmis/2/x",
      guard: "approved",
    },
    {
      name: "oauth resource",
      method: "GET",
      path: "/.well-known/oauth-protected-resource",
      guard: "public",
    },
    {
      name: "oauth resource mcp",
      method: "GET",
      path: "/.well-known/oauth-protected-resource/mcp",
      guard: "public",
    },
    {
      name: "static public image",
      method: "GET",
      path: `/${seed.files.png}`,
      guard: "public",
    },
    {
      name: "static data file",
      method: "GET",
      path: `/${seed.files.csv}`,
      guard: DATA_FLAGS,
    },
    {
      name: "static run output",
      method: "GET",
      path: "/x/outputs/m/file.txt",
      guard: "can_view_data",
    },
    {
      name: "static fallback",
      method: "GET",
      path: `/${seed.files.pdf}`,
      guard: "approved",
    },
    {
      name: "static private asset",
      method: "GET",
      path: `/${seed.files.privatePdf}`,
      guard: "asset_owner",
    },
  ];
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

type Persona = {
  name: string;
  email: string;
  approved: boolean;
  isAdmin: boolean;
  // The stored flags; the effective ones are derived where the guard does it.
  flags: UserPermissions;
  restricted: boolean;
  isHUser: boolean;
  // The level held on the seeded product.
  productLevel: ProductLevel;
};

type Caller =
  | { kind: "none" }
  | { kind: "machine" }
  | { kind: "clerk"; persona: Persona };

const tag = crypto.randomUUID().slice(0, 8);
const email = (name: string) => `matrix-${name}-${tag}@example.com`;
const flagsOf = (...keys: UserPermission[]): UserPermissions => ({
  ..._USER_PERMISSIONS_DEFAULT_NO_ACCESS,
  ...Object.fromEntries(keys.map((k) => [k, true])),
});

function persona(
  name: string,
  over: Partial<Omit<Persona, "name" | "email">> = {},
): Persona {
  return {
    name,
    email: email(name),
    approved: true,
    isAdmin: false,
    flags: _USER_PERMISSIONS_DEFAULT_NO_ACCESS,
    restricted: false,
    isHUser: false,
    productLevel: "none",
    ...over,
  };
}

const UNAPPROVED = persona("unapproved", { approved: false });
const NO_FLAGS = persona("no-flags");
const ONE_FLAG = (
  [
    "can_view_data",
    "can_configure_data",
    "can_view_users",
    "can_configure_users",
    "can_view_logs",
    "can_configure_settings",
  ] as const
).map((flag) => persona(flag.replaceAll("_", "-"), { flags: flagsOf(flag) }));
const MANAGER = persona("manager", {
  flags: flagsOf("can_configure_users", "can_view_users"),
});
const RESTRICTED = persona("restricted", {
  flags: _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  restricted: true,
  productLevel: "view",
});
const RESTRICTED_OTHER = persona("restricted-other", {
  flags: _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  restricted: true,
});
const ADMIN = persona("admin", { isAdmin: true, productLevel: "own" });
const EDITOR = persona("editor", { productLevel: "edit" });
const VIEWER = persona("viewer", { productLevel: "view" });
const STRANGER = persona("stranger");

function effectiveFlags(p: Persona): UserPermissions {
  if (p.isAdmin) return _USER_PERMISSIONS_DEFAULT_FULL_ACCESS;
  return permissionsUnderScopeAccess(
    p.flags,
    p.restricted ? { all: false, scopeIds: [] } : ALL_SCOPES,
  );
}

// The status the guard answers, or "admitted" when the request reaches the
// handler.
function expected(
  guard: GuardClass | "asset_owner",
  caller: Caller,
  orStatusKey: boolean,
  seed: Seed,
): number | "admitted" {
  if (guard === "public") return "admitted";
  if (guard === "asset_owner") {
    return caller.kind === "clerk" && caller.persona.email === seed.assetOwner
      ? "admitted"
      : 404;
  }
  if (guard === "status_key") {
    return caller.kind === "machine" ? "admitted" : 401;
  }
  if (caller.kind === "none") return 401;
  if (caller.kind === "machine") return orStatusKey ? "admitted" : 401;
  const p = caller.persona;
  if (guard === "signed_in") return "admitted";
  if (guard === "approved") return p.approved ? "admitted" : 403;
  if (guard === "admin") return p.isAdmin ? "admitted" : 403;
  if (guard === "operator") return p.isHUser ? "admitted" : 403;
  if (typeof guard === "string" && guard.startsWith("product:")) {
    const level = guard.slice("product:".length) as ProductAccessLevel;
    if (!p.approved) return 403;
    if (p.isAdmin) return "admitted";
    return productLevelAtLeast(p.productLevel, level) ? "admitted" : 403;
  }
  if (typeof guard === "string" && guard.startsWith("folder:")) {
    const level = guard.slice("folder:".length) as ProductAccessLevel;
    if (!p.approved) return 403;
    if (p.isAdmin) return "admitted";
    return level !== "own" && !p.restricted ? "admitted" : 403;
  }
  const flags: readonly UserPermission[] = typeof guard === "string"
    ? [guard as UserPermission]
    : guard;
  const held = effectiveFlags(p);
  return p.approved && flags.some((f) => held[f]) ? "admitted" : 403;
}

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------

type Seed = {
  runId: string;
  scopeIn: ScopeUuid;
  scopeOther: ScopeUuid;
  folderId: string;
  productId: string;
  assetOwner: string;
  files: { png: string; csv: string; pdf: string; privatePdf: string };
};

const UNKNOWN_FOLDER_ID = crypto.randomUUID();

function data<T>(res: APIResponseWithData<T>): T {
  if (!res.success) throw new Error(res.err);
  return res.data;
}

async function createSeedProduct(
  mainDb: ReturnType<typeof getPgConnectionFromCacheOrNew>,
  seed: Pick<Seed, "runId" | "scopeIn" | "folderId">,
): Promise<string> {
  const { productId } = data(
    await createProduct(mainDb, {
      type: "slide_deck",
      folderId: seed.folderId,
      runId: seed.runId,
      scopeId: seed.scopeIn,
      createdBy: ADMIN.email,
    }),
  );
  data(
    await setProductAccess(mainDb, productId, {
      defaultAccess: "none",
      grants: [
        { email: EDITOR.email, level: "edit" },
        { email: VIEWER.email, level: "view" },
        { email: RESTRICTED.email, level: "view" },
        { email: RESTRICTED_OTHER.email, level: "view" },
      ],
    }),
  );
  return productId;
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

function mainApp(session: Session): Hono {
  const app = appFor(
    session,
    routesOAuthMetadata,
    routesHealth,
    routesInstance,
    routesInstanceSSE,
    routesUsers,
    routesStructure,
    routesRunGeneration,
    routesScopes,
    routesAssets,
    routesGeoJsonMaps,
    routesPopulation,
    routesUpload,
    routesDatasets,
    routesDhis2Credentials,
    routesHfaIndicators,
    routesHfaTimePoints,
    routesIceh,
    routesIndicators,
    routesIndicatorsDhis2,
    routesEmails,
    routesProducts,
    routesFolders,
    routesProductSlideDecks,
    routesProductSlides,
    routesProductReports,
    routesCustomPrompts,
    routesWhatsNew,
    routesOnboarding,
  );
  app.route("/ai", routesCopilotAiProxy);
  app.route("/ai", routesAiFiles);
  setupStaticServing(app);
  return app;
}

const STATUS_KEY_HEADER = { "status-api-key": _STATUS_API_KEY };

function describe(caller: Caller): string {
  return caller.kind === "clerk" ? caller.persona.name : caller.kind;
}

function assertClass(
  label: string,
  want: number | "admitted",
  got: number,
): void {
  if (want === "admitted") {
    assert(
      got !== 401 && got !== 403,
      `${label}: expected the guard to admit, got ${got}`,
    );
  } else {
    assertEquals(got, want, `${label}: expected ${want}, got ${got}`);
  }
}

// The collab socket admits or refuses after the upgrade: the server's hello,
// or the close code it answers with.
async function collabOutcome(session: Session): Promise<"hello" | number> {
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    appFor(session, routesCollab).fetch,
  );
  try {
    const ws = new WebSocket(`ws://localhost:${server.addr.port}/collab`);
    return await new Promise<"hello" | number>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("no hello and no close"));
      }, 10_000);
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data) as CollabServerMessage;
        if (msg.type === "hello") {
          clearTimeout(timer);
          ws.onclose = null;
          ws.close();
          resolve("hello");
        }
      };
      ws.onclose = (evt) => {
        clearTimeout(timer);
        resolve(evt.code);
      };
      ws.onerror = () => reject(new Error("socket error"));
    });
  } finally {
    await server.shutdown();
  }
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

Deno.test("permission matrix: every route and tier against every persona", async () => {
  assertRealAuth();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const startedAt = new Date();
  const runId = data(await getPinnedRunId(mainDb));
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }

  // The operator is the first H_USERS entry. Its row may already exist on
  // the dev database, in which case it is used as it is and left as it is;
  // its class follows the row.
  const operatorEmail = H_USERS[0];
  const operatorRow = (
    await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${operatorEmail}`
  ).at(0);
  const operatorSeeded = operatorRow === undefined;
  if (operatorSeeded) {
    await mainDb`INSERT INTO users (email, is_admin) VALUES (${operatorEmail}, FALSE)`;
  }
  const OPERATOR: Persona = {
    name: "operator",
    email: operatorEmail,
    approved: true,
    isAdmin: operatorRow?.is_admin ?? false,
    flags: operatorRow === undefined
      ? _USER_PERMISSIONS_DEFAULT_NO_ACCESS
      : buildUserPermissionsFromRow(operatorRow),
    restricted: operatorRow === undefined ? false : !operatorRow.all_scopes,
    isHUser: true,
    productLevel: operatorRow?.is_admin ? "own" : "none",
  };

  const seededPersonas = [
    NO_FLAGS,
    ...ONE_FLAG,
    MANAGER,
    RESTRICTED,
    RESTRICTED_OTHER,
    ADMIN,
    EDITOR,
    VIEWER,
    STRANGER,
  ];
  const clerkPersonas = [UNAPPROVED, ...seededPersonas, OPERATOR];
  const callers: Caller[] = [
    { kind: "none" },
    { kind: "machine" },
    ...clerkPersonas.map((p): Caller => ({ kind: "clerk", persona: p })),
  ];

  const files = {
    png: `matrix_${tag}.png`,
    csv: `matrix_${tag}.csv`,
    pdf: `matrix_${tag}.pdf`,
    privatePdf: `matrix_private_${tag}.pdf`,
  };
  const pats = new Map<string, { token: string; id: number }>();
  let seed: Seed | undefined;

  try {
    for (const p of seededPersonas) {
      await mainDb`
        INSERT INTO users (
          email, is_admin, can_configure_users, can_view_users, can_view_logs,
          can_configure_settings, can_configure_data, can_view_data
        ) VALUES (
          ${p.email}, ${p.isAdmin}, ${p.flags.can_configure_users},
          ${p.flags.can_view_users}, ${p.flags.can_view_logs},
          ${p.flags.can_configure_settings}, ${p.flags.can_configure_data},
          ${p.flags.can_view_data}
        )
      `;
    }
    const systemCaller = {
      email: ADMIN.email,
      isGlobalAdmin: true,
      scopeAccess: ALL_SCOPES,
    };
    const scopeIn = data(
      await createScope(mainDb, {
        label: `Matrix in ${tag}`,
        definition: geographyOnlyScopeDefinition(`Matrix In ${tag}`),
        createdBy: ADMIN.email,
      }),
    ).scopeId;
    const scopeOther = data(
      await createScope(mainDb, {
        label: `Matrix other ${tag}`,
        definition: geographyOnlyScopeDefinition(`Matrix Other ${tag}`),
        createdBy: ADMIN.email,
      }),
    ).scopeId;
    for (
      const [p, scopeId] of [
        [RESTRICTED, scopeIn],
        [RESTRICTED_OTHER, scopeOther],
      ] as const
    ) {
      const granted = await setUserScopeAccess(mainDb, systemCaller, p.email, {
        all: false,
        scopeIds: [scopeId],
      });
      if (!granted.success) throw new Error(granted.err);
    }
    const folderId = data(
      await createFolder(mainDb, {
        label: `Matrix ${tag}`,
        color: null,
        parentId: null,
        createdBy: ADMIN.email,
      }),
    ).folderId;
    seed = {
      runId,
      scopeIn,
      scopeOther,
      folderId,
      productId: await createSeedProduct(mainDb, { runId, scopeIn, folderId }),
      assetOwner: NO_FLAGS.email,
      files,
    };
    for (const name of Object.values(files)) {
      await Deno.writeTextFile(join(_ASSETS_DIR_PATH, name), "matrix");
    }
    await mainDb`
      INSERT INTO private_assets (file_name, owner_email)
      VALUES (${files.privatePdf}, ${seed.assetOwner})
    `;
    for (const p of clerkPersonas.filter((p) => p.approved)) {
      const minted = data(
        await createPersonalAccessToken(mainDb, p.email, `matrix ${tag}`),
      );
      pats.set(p.email, { token: minted.token, id: minted.pat.id });
    }

    const apps = new Map<Caller, Hono>(
      callers.map((caller) => [
        caller,
        mainApp(caller.kind === "clerk" ? caller.persona.email : null),
      ]),
    );
    const headersFor = (caller: Caller) =>
      caller.kind === "machine" ? STATUS_KEY_HEADER : {};

    // The raw endpoints and the static tiers.
    for (const raw of rawEndpoints(seed)) {
      for (const caller of callers) {
        const got = await statusOf(apps.get(caller)!, raw.method, raw.path, {
          body: raw.probe?.body,
          headers: { ...headersFor(caller), ...raw.probe?.headers },
        });
        assertClass(
          `${raw.name} as ${describe(caller)}`,
          expected(raw.guard, caller, false, seed),
          got,
        );
      }
    }
    const appOf = (p: Persona) =>
      apps.get(callers.find((c) => c.kind === "clerk" && c.persona === p)!)!;
    assertEquals(
      await statusOf(appOf(NO_FLAGS), "GET", `/${files.privatePdf}`),
      200,
      "the private asset's owner downloads it",
    );

    // The registry.
    const names = Object.keys(routeRegistry) as (keyof typeof routeRegistry)[];
    for (const name of names) {
      const entry = routeRegistry[name] as { method: string; path: string };
      const exp = EXPECTED[name];
      const probe = exp.probe === "refusals_only" ? undefined : exp.probe;
      const isProductRoute = typeof exp.guard === "string" &&
        exp.guard.startsWith("product:");
      for (const caller of callers) {
        const want = expected(
          exp.guard,
          caller,
          exp.orStatusKey === true,
          seed,
        );
        if (want === "admitted" && exp.probe === "refusals_only") continue;
        const params: Record<string, string> = {
          product_id: seed.productId,
          folder_id: UNKNOWN_FOLDER_ID,
          ...probe?.params,
        };
        const path = entry.path.replace(
          /:(\w+)/g,
          (_, key: string) => params[key] ?? "x",
        );
        const body = entry.method === "GET" ? undefined : probe?.body ??
          (isProductRoute ? { productIds: [seed.productId] } : {});
        const got = await statusOf(apps.get(caller)!, entry.method, path, {
          body,
          headers: headersFor(caller),
        });
        assertClass(`${name} as ${describe(caller)}`, want, got);
        if (isProductRoute && want === "admitted") {
          await mainDb`DELETE FROM products WHERE id = ${seed.productId}`;
          seed.productId = await createSeedProduct(mainDb, seed);
        }
      }
    }

    // An unknown folder id reaches the handler and answers the typed 404.
    const admin = appOf(ADMIN);
    for (
      const [method, path, body] of [
        ["PUT", `/folders/${UNKNOWN_FOLDER_ID}`, { label: "x", color: null }],
        ["PUT", `/folders/${UNKNOWN_FOLDER_ID}/parent`, { parentId: null }],
        ["DELETE", `/folders/${UNKNOWN_FOLDER_ID}`, undefined],
      ] as const
    ) {
      const res = await call(admin, method, path, body);
      assertEquals(res.status, 404, `${method} ${path}`);
      assertEquals(res.body, { success: false, err: FOLDER_NOT_FOUND });
    }

    // The headless app: the allowlist answers 403 before any guard on every
    // route it does not open; on the routes it opens a PAT persona has the
    // class of its Clerk twin. The /info docs take any valid credential.
    const headless = async (
      token: string | undefined,
      method: string,
      path: string,
      body?: unknown,
    ) =>
      await statusOf(headlessApp, method, path, {
        body,
        headers: token === undefined
          ? {}
          : { Authorization: `Bearer ${token}` },
      });
    const adminPat = pats.get(ADMIN.email)!.token;
    for (const name of names) {
      const entry = routeRegistry[name] as { method: string; path: string };
      const exp = EXPECTED[name];
      const path = entry.path.replace(/:(\w+)/g, "x");
      const body = entry.method === "GET" ? undefined : {};
      if (exp.headless === "closed") {
        assertEquals(
          await headless(adminPat, entry.method, path, body),
          403,
          `${name} is headless-closed`,
        );
        continue;
      }
      for (const p of clerkPersonas.filter((p) => p.approved)) {
        const want = expected(
          exp.guard,
          { kind: "clerk", persona: p },
          false,
          seed,
        );
        assertClass(
          `${name} as PAT ${p.name}`,
          want,
          await headless(pats.get(p.email)!.token, entry.method, path, body),
        );
      }
      assertEquals(await headless(undefined, entry.method, path, body), 401);
    }
    for (const p of clerkPersonas.filter((p) => p.approved)) {
      assertClass(
        `/info as PAT ${p.name}`,
        "admitted",
        await headless(pats.get(p.email)!.token, "GET", "/info/x.md"),
      );
    }
    assertEquals(await headless(undefined, "GET", "/info/x.md"), 401);

    // The collab socket: signed in and approved, or closed as unauthorized.
    assertEquals(await collabOutcome(null), COLLAB_CLOSE_UNAUTHORIZED);
    assertEquals(
      await collabOutcome(UNAPPROVED.email),
      COLLAB_CLOSE_UNAUTHORIZED,
    );
    assertEquals(await collabOutcome(NO_FLAGS.email), "hello");
  } finally {
    if (seed !== undefined) {
      await mainDb`DELETE FROM products WHERE id = ${seed.productId}`;
      await mainDb`DELETE FROM folders WHERE id = ${seed.folderId}`;
    }
    await mainDb`DELETE FROM private_assets WHERE file_name = ${files.privatePdf}`;
    for (const name of Object.values(files)) {
      await Deno.remove(join(_ASSETS_DIR_PATH, name)).catch(() => {});
    }
    await mainDb`DELETE FROM users WHERE email = ANY(${
      seededPersonas.map((p) => p.email)
    })`;
    if (seed !== undefined) {
      await mainDb`DELETE FROM scopes WHERE id IN (${seed.scopeIn}, ${seed.scopeOther})`;
    }
    const operatorPat = pats.get(operatorEmail);
    if (operatorSeeded) {
      await mainDb`DELETE FROM users WHERE email = ${operatorEmail}`;
    } else {
      if (operatorPat !== undefined) {
        await revokePersonalAccessToken(mainDb, operatorEmail, operatorPat.id);
      }
      await mainDb`
        DELETE FROM user_logs
        WHERE user_email = ${operatorEmail} AND timestamp >= ${startedAt}
      `;
    }
    await closeAllConnections();
  }
});
