import type { AssetFilePin } from "./assets.ts";
import {
  _OPTIONAL_FACILITY_COLUMNS,
  type AdminAreaColumn,
  type OptionalFacilityColumn,
} from "./instance.ts";
import type { AdminAreaLevel, GeojsonOrphanedAreaIds } from "./structure.ts";

// ============================================================================
// Wizard config types
// ============================================================================

export type HfaRowFilter = {
  column: string;
  op: "equals" | "not_equals";
  value: string;
};

export type HfaDedupOverride = {
  facilityId: string;
  keepRow: number; // 1-based position of the data row in the file (computed, not a column)
};

export type HfaCsvMappingParams = {
  facilityIdColumn: string;
  timePoint: string;
  rowFilters: HfaRowFilter[];
  dedupStrategy: "first" | "last";
  dedupOverrides: HfaDedupOverride[];
};

export type HfaDuplicateGroup = {
  facilityId: string;
  rows: number[]; // surviving row numbers, ascending
};

export type HfaDuplicatePreview = {
  groups: HfaDuplicateGroup[];
  nRowsFilteredOut: number;
};

// ============================================================================
// Facility columns, changes and sources
// ============================================================================

// A registry column read from the file. Both headers are encoded
// ("Col N: name"). The correction header's trimmed cell wins where it is
// non-blank, and each header is resolved through the XLSForm by its own name.
export type HfaFacilityColumnHeaders = {
  header: string;
  correctionHeader?: string;
};

// The registry columns an HFA import reads from the same kept row as its
// data. Level 1 is the country, one value for every facility. Levels 2 to the
// HFA admin depth are mapped all or none. Optional columns come from the HFA
// structure schema's enabled set.
export type HfaFacilityColumns = {
  adminArea1: { value: string };
  adminAreas: (HfaFacilityColumnHeaders & { level: AdminAreaLevel })[];
  optional: Partial<Record<OptionalFacilityColumn, HfaFacilityColumnHeaders>>;
};

// What a change, a decision and a source cover. "admin" is the whole admin
// tuple, because admin values are only a valid hierarchy as a tuple.
export type HfaFacilityColumnGroup = "admin" | OptionalFacilityColumn;

export const HFA_FACILITY_COLUMN_GROUPS: HfaFacilityColumnGroup[] = [
  "admin",
  ..._OPTIONAL_FACILITY_COLUMNS,
];

// Who set a registry cell's current value. A round's timePoint is null once
// that round is deleted. A cell with no source is of unknown origin.
export type HfaFacilitySource =
  | { kind: "round"; timePoint: string | null }
  | { kind: "user" };

export type HfaFacilityChangeDecision = "keep" | "take";

// An admin tuple as one change value: the names of levels 1 to the registry
// depth, as JSON so that no area name can make two tuples read the same.
export function encodeHfaAdminTuple(names: string[]): string {
  return JSON.stringify(names);
}

export function decodeHfaAdminTuple(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) || !parsed.every((n) => typeof n === "string")
  ) {
    throw new Error(`Not an admin tuple: ${value}`);
  }
  return parsed;
}

// One existing facility whose file value differs from its registry value.
// defaultDecision is undefined where the cell has no source.
export type HfaFacilityChange = {
  facilityId: string;
  source: HfaFacilitySource | undefined;
  defaultDecision: HfaFacilityChangeDecision | undefined;
};

// Every change in one column group from one registry value to one file value,
// facilities ascending by id. An admin value is an encoded admin tuple; a
// blank optional value is "".
export type HfaFacilityChangeGroup = {
  column: HfaFacilityColumnGroup;
  from: string;
  to: string;
  facilities: HfaFacilityChange[];
};

// A change group as the user decided it. facilityIds is the whole group as
// the user was shown it and exceptions the members decided the other way, so
// any (facility, column, from, to) that differs at staging or integration is
// detected and refuses the run.
export type HfaFacilityChangeGroupDecision = {
  column: HfaFacilityColumnGroup;
  from: string;
  to: string;
  facilityIds: string[];
  decision: HfaFacilityChangeDecision;
  exceptions: string[];
};

export type HfaFacilityMatch = {
  known: number;
  new: number;
  absent: number;
};

export type HfaFacilityIdSample = {
  count: number;
  sample: string[];
};

// Per mapped registry column: codes the XLSForm resolved to choice labels,
// and up to 10 distinct codes it could not, which stay raw.
export type HfaLabelResolution = {
  column: AdminAreaColumn | OptionalFacilityColumn;
  resolvedCount: number;
  unresolvedValues: string[];
};

// The facility columns step's preview, one entry per mapped registry column,
// over the kept rows. topValues is the most frequent first, capped;
// valuesNotInRegistry is set on admin columns only.
export type HfaFacilityColumnPreview = {
  column: AdminAreaColumn | OptionalFacilityColumn;
  nBlank: number;
  nDistinct: number;
  topValues: { value: string; count: number }[];
  nUnresolved: number;
  unresolvedSample: string[];
  valuesNotInRegistry?: string[];
};

export type HfaFacilityColumnsPreview = {
  nFacilities: number;
  columns: HfaFacilityColumnPreview[];
};

// An admin area name no facility would carry after the import, with what
// still names it: scopes (level 2, matched ignoring case, as the scoped view
// matches) and the level's geojson map.
export type HfaAdminAreaLost = {
  level: 1 | 2 | 3 | 4;
  name: string;
  scopeLabels: string[];
  inGeojsonMap: boolean;
};

// The changes step's preview. adminAreasLost and adminPathsIntroduced are
// computed under the decisions the request carries, a change with none
// counting as its default and a change with no default as taken.
export type HfaFacilityChangesPreview = {
  match: HfaFacilityMatch;
  changes: HfaFacilityChangeGroup[];
  newFacilityIds: string[];
  newFacilitiesWithoutAdminTuple: HfaFacilityIdSample;
  adminPathsIntroduced: string[];
  adminAreasLost: HfaAdminAreaLost[];
};

// A scope whose HFA section names an area 2 the registry no longer has.
export type HfaOrphanedScopeArea = {
  scopeId: string;
  scopeLabel: string;
  adminArea2: string;
};

export type HfaFacilityChangeCounts = {
  column: HfaFacilityColumnGroup;
  changed: number;
  kept: number;
  taken: number;
};

// What the wizard sends at launch: the two input assets' fileNames plus the
// mappings. The server validates the assets exist and stamps the pins.
export type HfaCsvRunLaunchInput = {
  csvFileName: string;
  xlsFormFileName: string;
  mappings: HfaCsvMappingParams;
};

// The launch payload stored in hfa_import_runs.csv_config. Two instance
// assets (the data CSV and the XLSForm questionnaire) named by fileName and
// byte-pinned at launch validation (see AssetFilePin), plus the wizard's
// mappings. resumeFromStaging marks a needs_review run resolved with
// "Integrate anyway": the worker skips the stage leg and integrates the
// surviving per-run staging tables.
export type HfaCsvRunConfig = {
  csvFileName: string;
  csvFilePin: AssetFilePin;
  xlsFormFileName: string;
  xlsFormFilePin: AssetFilePin;
  mappings: HfaCsvMappingParams;
  resumeFromStaging?: boolean;
};

// ============================================================================
// Import Run Types
// ============================================================================

// "needs_review" = staging dropped facility rows; the run holds with its
// diagnostics and RELEASES the single-running slot until the user integrates
// anyway or discards. No "queued". HFA refuses a second launch explicitly.
export type HfaImportRunStatus =
  | "running"
  | "needs_review"
  | "complete"
  | "error"
  | "cancelled";

// Small JSON on the run row, rewritten at most every 2 s.
export type HfaImportRunProgress = {
  phase: "staging" | "integrating";
  percent: number;
};

export type HfaImportRunSummary = {
  id: number;
  triggeredBy?: string;
  timePoint: string;
  csvFileName: string;
  status: HfaImportRunStatus;
  error?: string;
  progress?: HfaImportRunProgress;
  // The staging diagnostics, durable for the run's whole life (written at the
  // needs_review hold AND at complete). Small enough to ride the polled list.
  diagnostics?: DatasetHfaCsvStagingResult;
  nRowsIntegrated?: number;
  startedAt: string;
  endedAt?: string;
};

// ============================================================================
// Staging Result Types
// ============================================================================

// The staging tables are named per run (see the run worker's
// hfaStagingTableNames): never recorded here.
export type DatasetHfaCsvStagingResult = {
  dateImported: string;
  assetFileName: string;
  nRowsInFile: number;
  nRowsValid: number;
  nRowsInvalidMissingFacilityId: number;
  nRowsInvalidFacilityNotFound: number;
  // At most 10 of the facility ids counted above, ascending. Absent on runs
  // staged before the field existed.
  facilityNotFoundSample?: string[];
  nRowsDuplicated: number;
  nRowsFilteredOut: number;
  dedupStrategy: "first" | "last";
  nDedupOverridesApplied: number;
  nRowsTotal: number;
  timePoint: string;
  nDictionaryVariables: number;
  nDictionaryValues: number;
  nXlsFormQuestionsNotInCsv: number;
  // At most 10 of the question ids counted above, in form order. Absent on
  // runs staged before the field existed.
  xlsFormQuestionsNotInCsvSample?: string[];
  nCsvColsNotInXlsForm: number;
  // At most 10 of the headers counted above, in file order. Absent on runs
  // staged before the field existed.
  csvColsNotInXlsFormSample?: string[];
  nSelectMultipleExpanded: number;
  // The facility columns' outcome. Absent on runs staged before they existed.
  facilityMatch?: HfaFacilityMatch;
  facilityChanges?: HfaFacilityChangeCounts[];
  labelResolution?: HfaLabelResolution[];
  facilitiesWithoutAdminTuple?: HfaFacilityIdSample;
  orphanedGeojsonAreaIds?: GeojsonOrphanedAreaIds[];
  orphanedScopeAreas?: HfaOrphanedScopeArea[];
};
