import type { Language } from "@timroberton/panther";
import type { AssetInfo } from "./assets.ts";
import type { HfaTimePoint } from "./dataset_hfa.ts";
import type { DatasetType } from "./datasets.ts";
import type { UserPermissions } from "./permissions.ts";
import type { GeoJsonMapSummary } from "./geojson_maps.ts";
import type { InstanceCalendar, InstanceConfigAdminAreaLabels, InstanceFiscalYear, OtherUser, StructureFamilyCounts, StructureSchema } from "./instance.ts";
import type { LastUpdateTableName } from "./last_updated_tables.ts";
import type { Folder, ProductSummary } from "./products.ts";
import type { RunCatalogItem, RunProgress } from "./run_generation.ts";
import type { HfaWeightsCoverage } from "./structure.ts";

// A ready results package, as offered by the product package picker and the
// Explore tab. Deliberately NOT gated on can_configure_data: a package label
// is approved-user data, since every product card shows the label of the
// package it serves from. This is a considered revision of SYSTEM_03's Q-B
// ("run labels must not fan out"), which now covers generation telemetry only.
export type ReadyPackage = {
  id: string;
  label: string;
  createdAt: string;
};

// ============================================================================
// Instance SSE State
// ============================================================================

export type InstanceState = {
  // Client and server share one type. The server sends `isReady: true` in the
  // `starting` message. The client initializes the store with `isReady: false`
  // and applies the full starting payload via `reconcile()`, which flips it to
  // true in a single atomic update. No special client-side logic needed.
  isReady: boolean;

  // Immutable (set from env vars at server startup, never changes at runtime,
  // only sent in the `starting` message, no SSE event updates these)
  instanceName: string;
  instanceLanguage: Language;
  instanceCalendar: InstanceCalendar;
  instanceFiscalYear: InstanceFiscalYear;

  // Config (rarely changes, updated via `config_updated` event)
  countryIso3: string | undefined;
  structureSchemaHmis: StructureSchema | null;
  structureSchemaHfa: StructureSchema | null;
  adminAreaLabels: InstanceConfigAdminAreaLabels;
  dhis2ConnectionUrl: string | null;

  // Products and folders — the Drive-like list every approved user sees.
  // Withheld from an unapproved connection by the same roster rule as `users`.
  // `products` is maintained PER ROW (`products_upserted` / `products_deleted`)
  // rather than as a whole-list broadcast: a deck-heavy instance would
  // otherwise re-send every card on every keystroke checkpoint.
  products: ProductSummary[];
  folders: Folder[];
  readyPackages: ReadyPackage[];
  // The cache-version index: `lastUpdated.products[id]` versions a deck/report
  // detail read, `lastUpdated.slides[id]` versions a slide read
  // (SYSTEM_03 "the last_updated → SSE → cache triangle").
  lastUpdated: Record<LastUpdateTableName, Record<string, string>>;
  // [] for an unapproved connection (its user absent from the roster), in
  // the starting payload and every users_updated, until a roster names them
  // — routesInstanceSSE / buildInstanceState.
  users: OtherUser[];
  assets: AssetInfo[];
  geojsonMaps: GeoJsonMapSummary[];
  // Per-user (Q-B: generation telemetry must not fan out).
  // Filled at build for can_configure_data / global-admin callers ([] for
  // everyone else); after that, `runs_catalog_updated` broadcasts only a
  // data-free nonce and each entitled client refetches via listRunCatalog,
  // whose route guard is evaluated per request — so grants/revocations take
  // effect live, with no connection-captured gating anywhere.
  // `runsCatalogSignal` is a NONCE (collision-proof; a same-ms timestamp pair
  // was dropped by the store's equality guard), stamped fresh on every
  // connect: the refetch after every `starting` is DELIBERATE — it is the
  // reconnect self-healing path (backfill runs, missed signals). The
  // starting-payload fill above prevents an empty flash while it resolves.
  runsCatalog: RunCatalogItem[];
  runsCatalogSignal: string;
  // The at-most-one package the instance blesses (SYSTEM_08 "The pinned
  // package + followers"); null = nothing pinned. The ONE field every
  // Pinned badge derives from (catalogue, product card, picker). Broadcast
  // to EVERY client (unlike runsCatalog): a bare run id is not sensitive —
  // an approved user already sees the id of the package each product serves
  // from. It is also the DEFAULT package for a new product (D5) and the
  // Explore tab's starting package (D6); it does NOT move any product row.
  pinnedRunId: string | null;

  // Summaries (lightweight aggregates)
  structure:
    | {
        hmis: StructureFamilyCounts;
        hfa: StructureFamilyCounts;
      }
    | undefined;
  structureLastUpdated: string | undefined;
  hfaWeights: HfaWeightsCoverage[];
  indicators: {
    commonIndicators: number;
    rawIndicators: number;
    hfaIndicators: number;
    calculatedIndicators: number;
  };
  datasetsWithData: DatasetType[];
  datasetVersions: { hmis?: number; hfa?: number };
  hmisNVersions: number;
  // While a per-pair DHIS2 run is integrating, dataset_hmis keeps changing
  // under the settled version token — display caches must be bypassed.
  hmisImportRunActive: boolean;
  // Queued DHIS2 runs waiting for the import slot (Phase 4 C6).
  hmisImportRunsQueued: number;
  // A scheduled DHIS2 import needs attention: its last fire was refused or
  // missed, or the run it launched ended in error (Phase 4 C4).
  hmisScheduledImportAttention: boolean;
  hfaTimePoints: HfaTimePoint[];
  hfaCacheHash: string;
  icehCacheHash: string;

  // Cache versioning (regular fields, read by dataset caches as version keys)
  indicatorMappingsVersion: string;
  hfaIndicatorsVersion: string;
  calculatedIndicatorsVersion: string;

  // Per-connection current user (populated by server in starting message,
  // re-derived on users_updated — different for each connected client)
  currentUserEmail: string;
  currentUserApproved: boolean;
  currentUserIsGlobalAdmin: boolean;
  currentUserPermissions: UserPermissions;
};

// ============================================================================
// Instance SSE Event Data Types
// ============================================================================

export type InstanceConfig = {
  countryIso3: string | undefined;
  structureSchemaHmis: StructureSchema | null;
  structureSchemaHfa: StructureSchema | null;
  adminAreaLabels: InstanceConfigAdminAreaLabels;
  dhis2ConnectionUrl: string | null;
};

export type InstanceStructureSummary = {
  structure:
    | {
        hmis: StructureFamilyCounts;
        hfa: StructureFamilyCounts;
      }
    | undefined;
  structureLastUpdated: string | undefined;
  hfaWeights: HfaWeightsCoverage[];
};

export type InstanceIndicatorsSummary = {
  indicators: {
    commonIndicators: number;
    rawIndicators: number;
    hfaIndicators: number;
    calculatedIndicators: number;
  };
  indicatorMappingsVersion: string;
  hfaIndicatorsVersion: string;
  calculatedIndicatorsVersion: string;
};

export type InstanceDatasetsSummary = {
  datasetsWithData: DatasetType[];
  datasetVersions: { hmis?: number; hfa?: number };
  hmisNVersions: number;
  hmisImportRunActive: boolean;
  hmisImportRunsQueued: number;
  hmisScheduledImportAttention: boolean;
  hfaTimePoints: HfaTimePoint[];
  hfaCacheHash: string;
  icehCacheHash: string;
};

// ============================================================================
// Instance SSE Message (discriminated union)
// ============================================================================

// `run_progress` and `r_script` are the results-package catalogue's live
// generation view (Q-B ruling). They are ephemeral execution state, not
// InstanceState fields, and they are the only messages on this channel that
// are FILTERED per user: routesInstanceSSE drops them for callers without
// can_configure_data, because run labels, module ids and R error detail must
// not fan out to every connected user. The filter is LIVE — it re-derives
// from each `users_updated` passing through the forward loop, so grants and
// revocations take effect without a reconnect. Per-message filtering is
// acceptable ONLY because these are ephemeral telemetry — durable per-user
// state (`runsCatalog`) instead broadcasts a data-free signal
// and lets each client fetch its own view through a per-request-guarded
// route. `pinned_run_updated` is neither: a plain unfiltered broadcast of a
// bare run id (see `pinnedRunId`), the same class as `config_updated`.
// This is the ONLY channel there is — the project channel died with projects.
//
// `readyPackages` has no message of its own: it follows the `runsCatalog`
// idiom exactly, filled in `starting` and refetched on the existing
// `runs_catalog_updated` nonce.
export type InstanceSseMessage =
  | { type: "starting"; data: InstanceState }
  | { type: "run_progress"; data: { runId: string; progress: RunProgress } }
  | {
      type: "r_script";
      data: { runId: string; moduleId: string; text: string };
    }
  | { type: "config_updated"; data: InstanceConfig }
  // The ONLY product-list message: per-row, emitted by every product mutation
  // route and every collab checkpoint.
  | { type: "products_upserted"; data: { products: ProductSummary[] } }
  | { type: "products_deleted"; data: { ids: string[] } }
  | { type: "folders_updated"; data: { folders: Folder[] } }
  // Carries `slides` only. A product's own stamp rides its `products_upserted`
  // summary, so emitting it here as well would version the same read twice.
  | {
      type: "last_updated";
      data: {
        tableName: LastUpdateTableName;
        ids: string[];
        lastUpdated: string;
      };
    }
  | { type: "users_updated"; data: OtherUser[] }
  // Data-free nonce signal only — the catalogue itself is fetched per user.
  | { type: "runs_catalog_updated"; data: string }
  | { type: "pinned_run_updated"; data: { pinnedRunId: string | null } }
  | { type: "assets_updated"; data: AssetInfo[] }
  | { type: "geojson_maps_updated"; data: GeoJsonMapSummary[] }
  | { type: "structure_updated"; data: InstanceStructureSummary }
  | { type: "indicators_updated"; data: InstanceIndicatorsSummary }
  | { type: "datasets_updated"; data: InstanceDatasetsSummary }
  | { type: "error"; data: { message: string } };
