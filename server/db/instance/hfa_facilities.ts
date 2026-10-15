import type { Sql } from "postgres";
import {
  _OPTIONAL_FACILITY_COLUMNS,
  _RECODABLE_FACILITY_COLUMNS,
  type APIResponseWithData,
  decodeHfaAdminTuple,
  encodeHfaAdminTuple,
  type GeojsonOrphanedAreaIds,
  getEnabledOptionalFacilityColumns,
  HFA_FACILITY_COLUMN_GROUPS,
  type HfaAdminAreaLost,
  type HfaFacilityChange,
  type HfaFacilityChangeCounts,
  type HfaFacilityChangeDecision,
  type HfaFacilityChangeGroup,
  type HfaFacilityChangeGroupDecision,
  type HfaFacilityChangesPreview,
  type HfaFacilityColumnGroup,
  type HfaFacilityColumns,
  type HfaFacilityIdSample,
  type HfaFacilityMatch,
  type HfaFacilitySource,
  type HfaOrphanedScopeArea,
  type HfaRegistryFacility,
  type HfaRegistrySaveResult,
  type OptionalFacilityColumn,
  parseScopeDefinition,
  type StructureRecodableColumn,
  type StructureRecodes,
  type StructureSchema,
  throwIfErrWithData,
} from "lib";
import type { HfaFileFacility } from "../../server_only_funcs_csvs/scan_hfa_rows.ts";
import { cleanupUnusedAdminAreas } from "../../server_only_funcs_importing/integrate_structure_from_staging.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { getStructureSchema } from "./config.ts";
import { countOrphanedGeoJsonAreaIds } from "./geojson_maps.ts";

// The HFA registry's reads and writes: facilities_hfa, admin_areas_hfa_1..4
// and hfa_facility_sources. Every write runs inside the caller's transaction
// and bumps structure_last_updated only when a registry row or an admin area
// changed. The contract is SYSTEM_05 "HFA registry writes".

export type HfaRegistryRow =
  & {
    facility_id: string;
    admin_area_1: string;
    admin_area_2: string;
    admin_area_3: string;
    admin_area_4: string;
  }
  & Record<OptionalFacilityColumn, string | null>;

type HfaSchema = { adminDepth: number; enabled: OptionalFacilityColumn[] };

export type HfaRound = { label: string; sortOrder: number };

export type HfaRegistryContext = {
  adminDepth: number;
  // Every registry facility the file names, at least.
  registry: Map<string, HfaRegistryRow>;
  registryCount: number;
  sources: Map<string, Map<HfaFacilityColumnGroup, HfaFacilitySource>>;
  round: HfaRound;
  roundSortOrders: Map<string, number>;
};

export type HfaFacilityChangeSet = {
  match: HfaFacilityMatch;
  changes: HfaFacilityChangeGroup[];
  newFacilities: HfaFileFacility[];
  newFacilitiesWithoutAdminTuple: string[];
  // Unchanged mapped cells the imported round now vouches for: their source
  // becomes the round.
  confirmations: { facilityId: string; column: HfaFacilityColumnGroup }[];
};

export type ResolvedDecisions = Map<
  string,
  Map<HfaFacilityColumnGroup, HfaFacilityChangeDecision>
>;

export type HfaSourceWrite = {
  facilityId: string;
  column: HfaFacilityColumnGroup;
  source: HfaFacilitySource;
};

export type HfaRegistryWriteResult = {
  registryChanged: boolean;
  match: HfaFacilityMatch;
  changeCounts: HfaFacilityChangeCounts[];
  // New facilities whose file tuple is incomplete: not written, so the caller
  // drops their data.
  facilitiesWithoutAdminTuple: HfaFacilityIdSample;
  skippedFacilityIds: string[];
};

export type HfaFacilityEdit = {
  facilityId: string;
  admin?: string[];
  optional?: Partial<Record<OptionalFacilityColumn, string>>;
};

const SAMPLE_SIZE = 10;

const REGISTRY_COLUMNS = [
  "facility_id",
  "admin_area_1",
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
  ..._OPTIONAL_FACILITY_COLUMNS,
];

const USER_SOURCE: HfaFacilitySource = { kind: "user" };

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function idSample(ids: string[]): HfaFacilityIdSample {
  const sorted = ids.toSorted(compareIds);
  return { count: sorted.length, sample: sorted.slice(0, SAMPLE_SIZE) };
}

function namedIds(ids: Iterable<string>): string {
  const sorted = [...ids].toSorted(compareIds);
  const more = sorted.length > SAMPLE_SIZE
    ? `, … (${sorted.length} in all)`
    : "";
  return sorted.slice(0, SAMPLE_SIZE).join(", ") + more;
}

function groupKey(
  column: HfaFacilityColumnGroup,
  from: string,
  to: string,
): string {
  return JSON.stringify([column, from, to]);
}

function opposite(d: HfaFacilityChangeDecision): HfaFacilityChangeDecision {
  return d === "keep" ? "take" : "keep";
}

function registryAdminTuple(row: HfaRegistryRow, adminDepth: number): string[] {
  return [
    row.admin_area_1,
    row.admin_area_2,
    row.admin_area_3,
    row.admin_area_4,
  ].slice(0, adminDepth);
}

function isCompleteAdminTuple(tuple: string[]): boolean {
  return tuple.every((name) => name !== "");
}

// The registry stores four levels: those above the admin depth repeat the
// deepest level, as the structure stager has always padded them.
function padAdminTuple(tuple: string[]): string[] {
  const deepest = tuple[tuple.length - 1];
  return [0, 1, 2, 3].map((i) => tuple[i] ?? deepest);
}

function recodeFor(
  recodes: StructureRecodes,
  facilityId: string,
  column: HfaFacilityColumnGroup,
): string | undefined {
  return column === "admin"
    ? undefined
    : recodes[column as StructureRecodableColumn]?.[facilityId];
}

// ============================================================================
// Defaults and changes (pure)
// ============================================================================

// A user's value is kept, and so is a newer round's; an older or equal
// round's, or a deleted round's, gives way to the file. A cell with no
// source has no default.
export function defaultHfaChangeDecision(
  source: HfaFacilitySource | undefined,
  round: HfaRound,
  roundSortOrders: Map<string, number>,
): HfaFacilityChangeDecision | undefined {
  if (source === undefined) {
    return undefined;
  }
  if (source.kind === "user") {
    return "keep";
  }
  if (source.timePoint === null) {
    return "take";
  }
  const sourceOrder = roundSortOrders.get(source.timePoint);
  if (sourceOrder === undefined) {
    throw new Error(`No HFA time point is labelled "${source.timePoint}".`);
  }
  return sourceOrder > round.sortOrder ? "keep" : "take";
}

// Compares every file facility the registry knows with its registry row, per
// mapped column group. An incomplete file admin tuple is no change: the
// registry keeps its tuple.
export function computeHfaFacilityChanges(
  file: HfaFileFacility[],
  mappedOptional: OptionalFacilityColumn[],
  ctx: HfaRegistryContext,
): HfaFacilityChangeSet {
  const groups = new Map<string, HfaFacilityChangeGroup>();
  const confirmations: HfaFacilityChangeSet["confirmations"] = [];
  const newFacilities: HfaFileFacility[] = [];
  const withoutTuple: string[] = [];
  let known = 0;
  for (const facility of file) {
    const row = ctx.registry.get(facility.facilityId);
    const complete = isCompleteAdminTuple(facility.admin);
    if (!row) {
      if (complete) {
        newFacilities.push(facility);
      } else {
        withoutTuple.push(facility.facilityId);
      }
      continue;
    }
    known++;
    const sources = ctx.sources.get(facility.facilityId);
    const compare = (
      column: HfaFacilityColumnGroup,
      from: string,
      to: string,
    ) => {
      const source = sources?.get(column);
      const defaultDecision = defaultHfaChangeDecision(
        source,
        ctx.round,
        ctx.roundSortOrders,
      );
      if (from === to) {
        if (defaultDecision !== "keep") {
          confirmations.push({ facilityId: facility.facilityId, column });
        }
        return;
      }
      const key = groupKey(column, from, to);
      let group = groups.get(key);
      if (!group) {
        group = { column, from, to, facilities: [] };
        groups.set(key, group);
      }
      group.facilities.push({
        facilityId: facility.facilityId,
        source,
        defaultDecision,
      });
    };
    if (complete) {
      compare(
        "admin",
        encodeHfaAdminTuple(registryAdminTuple(row, ctx.adminDepth)),
        encodeHfaAdminTuple(facility.admin),
      );
    }
    for (const column of mappedOptional) {
      compare(column, row[column] ?? "", facility.optional[column] ?? "");
    }
  }
  const columnOrder = (c: HfaFacilityColumnGroup) =>
    HFA_FACILITY_COLUMN_GROUPS.indexOf(c);
  const changes = [...groups.values()]
    .map((g) => ({
      ...g,
      facilities: g.facilities.toSorted((a, b) =>
        compareIds(a.facilityId, b.facilityId)
      ),
    }))
    .toSorted((a, b) =>
      columnOrder(a.column) - columnOrder(b.column) ||
      b.facilities.length - a.facilities.length ||
      compareIds(a.from, b.from) ||
      compareIds(a.to, b.to)
    );
  return {
    match: {
      known,
      new: newFacilities.length + withoutTuple.length,
      absent: ctx.registryCount - known,
    },
    changes,
    newFacilities,
    newFacilitiesWithoutAdminTuple: withoutTuple.toSorted(compareIds),
    confirmations,
  };
}

// Every recomputed change must be in the group the user decided it in, and
// every decided group must be exactly what was recomputed: a facility that
// joined, left or moved between groups since the review refuses the write,
// named.
export function resolveHfaChangeDecisions(
  changes: HfaFacilityChangeGroup[],
  decisions: HfaFacilityChangeGroupDecision[],
): ResolvedDecisions {
  const byKey = new Map<string, HfaFacilityChangeGroupDecision>();
  for (const d of decisions) {
    const key = groupKey(d.column, d.from, d.to);
    if (byKey.has(key)) {
      throw new Error(
        `The change of ${d.column} from "${d.from}" to "${d.to}" is decided twice.`,
      );
    }
    const members = new Set(d.facilityIds);
    const outside = d.exceptions.filter((id) => !members.has(id));
    if (outside.length > 0) {
      throw new Error(
        `Exceptions to the change of ${d.column} from "${d.from}" to "${d.to}" name facilities outside it: ${
          namedIds(outside)
        }.`,
      );
    }
    byKey.set(key, d);
  }
  const differing = new Set<string>();
  const resolved: ResolvedDecisions = new Map();
  const recomputedKeys = new Set<string>();
  for (const group of changes) {
    const key = groupKey(group.column, group.from, group.to);
    recomputedKeys.add(key);
    const recomputed = new Set(group.facilities.map((f) => f.facilityId));
    const d = byKey.get(key);
    if (!d) {
      recomputed.forEach((id) => differing.add(id));
      continue;
    }
    const decided = new Set(d.facilityIds);
    recomputed.forEach((id) => !decided.has(id) && differing.add(id));
    decided.forEach((id) => !recomputed.has(id) && differing.add(id));
    const exceptions = new Set(d.exceptions);
    for (const id of recomputed) {
      let perFacility = resolved.get(id);
      if (!perFacility) {
        perFacility = new Map();
        resolved.set(id, perFacility);
      }
      perFacility.set(
        group.column,
        exceptions.has(id) ? opposite(d.decision) : d.decision,
      );
    }
  }
  for (const [key, d] of byKey) {
    if (!recomputedKeys.has(key)) {
      d.facilityIds.forEach((id) => differing.add(id));
    }
  }
  if (differing.size > 0) {
    throw new Error(
      `The facility changes differ from the ones reviewed for ${differing.size} ${
        differing.size === 1 ? "facility" : "facilities"
      }: ${
        namedIds(differing)
      }. Start the import again and review the facility changes.`,
    );
  }
  return resolved;
}

export function countHfaFacilityChanges(
  changes: HfaFacilityChangeGroup[],
  resolved: ResolvedDecisions,
): HfaFacilityChangeCounts[] {
  const counts: HfaFacilityChangeCounts[] = [];
  for (const group of changes) {
    let c = counts.find((x) => x.column === group.column);
    if (!c) {
      c = { column: group.column, changed: 0, kept: 0, taken: 0 };
      counts.push(c);
    }
    for (const change of group.facilities) {
      c.changed++;
      if (resolved.get(change.facilityId)?.get(group.column) === "take") {
        c.taken++;
      } else {
        c.kept++;
      }
    }
  }
  return counts;
}

// A recode names a new facility, or a facility whose change in that column is
// taken: those are the cells written from the file.
function assertRecodesNameWrittenCells(
  recodes: StructureRecodes,
  mappedOptional: OptionalFacilityColumn[],
  changeSet: HfaFacilityChangeSet,
  resolved: ResolvedDecisions,
): void {
  const newIds = new Set([
    ...changeSet.newFacilities.map((f) => f.facilityId),
    ...changeSet.newFacilitiesWithoutAdminTuple,
  ]);
  for (const [column, map] of Object.entries(recodes)) {
    const col = column as StructureRecodableColumn;
    if (!_RECODABLE_FACILITY_COLUMNS.includes(col)) {
      throw new Error(`The column ${column} cannot be recoded.`);
    }
    if (!mappedOptional.includes(col)) {
      throw new Error(
        `Recodes name the column ${column}, which the import does not map.`,
      );
    }
    const unwritten = Object.keys(map ?? {}).filter((id) =>
      !newIds.has(id) && resolved.get(id)?.get(col) !== "take"
    );
    if (unwritten.length > 0) {
      throw new Error(
        `Recodes of ${column} name facilities whose ${column} the import does not write: ${
          namedIds(unwritten)
        }.`,
      );
    }
  }
}

// A decision that agrees with the default and writes the file's value is the
// round's; one against the default is the user's; a kept value that the
// default keeps has its source unchanged. With no default, taking is the
// round's and keeping is the user's. A recoded value is the user's. New
// facilities are the round's, recodes aside.
export function planHfaSourceWrites(args: {
  changeSet: HfaFacilityChangeSet;
  resolved: ResolvedDecisions;
  recodes: StructureRecodes;
  mappedOptional: OptionalFacilityColumn[];
  timePoint: string;
}): HfaSourceWrite[] {
  const { changeSet, resolved, recodes, mappedOptional, timePoint } = args;
  const roundSource: HfaFacilitySource = { kind: "round", timePoint };
  const writes: HfaSourceWrite[] = [];
  const mappedGroups: HfaFacilityColumnGroup[] = ["admin", ...mappedOptional];
  for (const facility of changeSet.newFacilities) {
    for (const column of mappedGroups) {
      writes.push({
        facilityId: facility.facilityId,
        column,
        source: recodeFor(recodes, facility.facilityId, column) === undefined
          ? roundSource
          : USER_SOURCE,
      });
    }
  }
  for (const group of changeSet.changes) {
    for (const change of group.facilities) {
      const decision = resolved.get(change.facilityId)?.get(group.column);
      if (decision === undefined) {
        throw new Error(
          `No decision for ${change.facilityId}'s ${group.column}.`,
        );
      }
      const source = decision === "take"
        ? recodeFor(recodes, change.facilityId, group.column) !== undefined ||
            change.defaultDecision === "keep"
          ? USER_SOURCE
          : roundSource
        : change.defaultDecision === "keep"
        ? undefined
        : USER_SOURCE;
      if (source) {
        writes.push({
          facilityId: change.facilityId,
          column: group.column,
          source,
        });
      }
    }
  }
  for (const confirmation of changeSet.confirmations) {
    writes.push({ ...confirmation, source: roundSource });
  }
  return writes;
}

// What each admin area level would hold after the decisions: the names no
// facility would carry any more, and the paths the file adds.
function projectHfaAdminAreas(args: {
  registry: HfaRegistryRow[];
  adminDepth: number;
  written: Map<string, string[]>;
}): {
  lost: { level: 1 | 2 | 3 | 4; name: string }[];
  introducedPaths: string[];
} {
  const { registry, adminDepth, written } = args;
  const before = registry.map((r) => registryAdminTuple(r, adminDepth));
  const registryIds = new Set(registry.map((r) => r.facility_id));
  const after = [
    ...registry.map((r) =>
      written.get(r.facility_id) ?? registryAdminTuple(r, adminDepth)
    ),
    ...[...written].filter(([id]) => !registryIds.has(id)).map(([, t]) => t),
  ];
  const lost: { level: 1 | 2 | 3 | 4; name: string }[] = [];
  for (let level = 1; level <= adminDepth; level++) {
    const afterNames = new Set(after.map((t) => t[level - 1]));
    const lostNames = new Set(
      before.map((t) => t[level - 1]).filter((n) => !afterNames.has(n)),
    );
    for (const name of [...lostNames].toSorted(compareIds)) {
      lost.push({ level: level as 1 | 2 | 3 | 4, name });
    }
  }
  const beforePaths = new Set(before.map(encodeHfaAdminTuple));
  const introducedPaths = [
    ...new Set([...written.values()].map(encodeHfaAdminTuple)),
  ]
    .filter((p) => !beforePaths.has(p))
    .toSorted(compareIds);
  return { lost, introducedPaths };
}

// ============================================================================
// Reads
// ============================================================================

function toHfaSchema(schema: StructureSchema): HfaSchema {
  return {
    adminDepth: schema.adminDepth,
    enabled: getEnabledOptionalFacilityColumns(schema),
  };
}

async function readHfaSchema(sql: Sql): Promise<HfaSchema> {
  const res = await getStructureSchema(sql, "hfa");
  throwIfErrWithData(res);
  return toHfaSchema(res.data);
}

function mappedOptionalColumns(
  facilityColumns: HfaFacilityColumns,
  schema: HfaSchema,
): OptionalFacilityColumn[] {
  const mapped = Object.keys(
    facilityColumns.optional,
  ) as OptionalFacilityColumn[];
  const disabled = mapped.filter((c) => !schema.enabled.includes(c));
  if (disabled.length > 0) {
    throw new Error(
      `The HFA structure schema does not enable ${disabled.join(", ")}.`,
    );
  }
  return _OPTIONAL_FACILITY_COLUMNS.filter((c) => mapped.includes(c));
}

function assertFileShape(file: HfaFileFacility[], adminDepth: number): void {
  const seen = new Set<string>();
  for (const facility of file) {
    if (seen.has(facility.facilityId)) {
      throw new Error(
        `Facility "${facility.facilityId}" is in the file twice.`,
      );
    }
    seen.add(facility.facilityId);
    if (facility.admin.length !== adminDepth) {
      throw new Error(
        `Facility "${facility.facilityId}" has ${facility.admin.length} admin levels; the HFA admin depth is ${adminDepth}.`,
      );
    }
  }
}

// The sources of the named facilities, or of every facility.
async function loadHfaRegistrySources(
  sql: Sql,
  facilityIds: string[] | undefined,
): Promise<Map<string, Map<HfaFacilityColumnGroup, HfaFacilitySource>>> {
  const sourceRows = await sql<
    {
      facility_id: string;
      column_group: HfaFacilityColumnGroup;
      kind: "round" | "user";
      time_point: string | null;
    }[]
  >`
    SELECT facility_id, column_group, kind, time_point
    FROM hfa_facility_sources
    ${facilityIds ? sql`WHERE facility_id = ANY(${facilityIds})` : sql``}
  `;
  const sources = new Map<
    string,
    Map<HfaFacilityColumnGroup, HfaFacilitySource>
  >();
  for (const s of sourceRows) {
    let perFacility = sources.get(s.facility_id);
    if (!perFacility) {
      perFacility = new Map();
      sources.set(s.facility_id, perFacility);
    }
    perFacility.set(
      s.column_group,
      s.kind === "user"
        ? USER_SOURCE
        : { kind: "round", timePoint: s.time_point },
    );
  }
  return sources;
}

async function loadHfaRegistryContext(
  sql: Sql,
  args: {
    registryRows: HfaRegistryRow[];
    adminDepth: number;
    timePoint: string;
  },
): Promise<HfaRegistryContext> {
  const sources = await loadHfaRegistrySources(
    sql,
    args.registryRows.map((r) => r.facility_id),
  );
  const rounds = await sql<{ label: string; sort_order: number }[]>`
    SELECT label, sort_order FROM hfa_time_points
  `;
  const roundSortOrders = new Map(rounds.map((r) => [r.label, r.sort_order]));
  const sortOrder = roundSortOrders.get(args.timePoint);
  if (sortOrder === undefined) {
    throw new Error(
      `Time point "${args.timePoint}" does not exist. Create it on the HFA time points page before importing data.`,
    );
  }
  const registryCount = (
    await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM facilities_hfa
    `
  )[0].count;
  return {
    adminDepth: args.adminDepth,
    registry: new Map(args.registryRows.map((r) => [r.facility_id, r])),
    registryCount,
    sources,
    round: { label: args.timePoint, sortOrder },
    roundSortOrders,
  };
}

// Per level, the names the registry's admin areas carry.
export async function getHfaRegistryAdminAreaNames(
  sql: Sql,
): Promise<Map<number, Set<string>>> {
  const names = new Map<number, Set<string>>();
  for (let level = 1; level <= 4; level++) {
    const column = `admin_area_${level}`;
    const rows = await sql<{ name: string }[]>`
      SELECT DISTINCT ${sql(column)} AS name
      FROM ${sql(`admin_areas_hfa_${level}`)}
    `;
    names.set(level, new Set(rows.map((r) => r.name)));
  }
  return names;
}

async function getHfaScopeAreas(sql: Sql): Promise<HfaOrphanedScopeArea[]> {
  const rows = await sql<{ id: string; label: string; definition: string }[]>`
    SELECT id, label, definition FROM scopes ORDER BY label
  `;
  return rows.flatMap((r) => {
    const hfa = parseScopeDefinition(r.definition).hfa;
    return hfa.include && hfa.adminArea2 !== null
      ? [{ scopeId: r.id, scopeLabel: r.label, adminArea2: hfa.adminArea2 }]
      : [];
  });
}

async function getHfaGeojsonAreaIds(
  sql: Sql,
): Promise<Map<number, Set<string>>> {
  const rows = await sql<{ admin_area_level: number; geojson: string }[]>`
    SELECT admin_area_level, geojson FROM geojson_maps
    WHERE facility_family = 'hfa'
  `;
  return new Map(rows.map((r) => {
    const parsed = JSON.parse(r.geojson) as {
      features: { properties?: Record<string, unknown> }[];
    };
    const ids = new Set<string>();
    for (const feature of parsed.features) {
      const areaId = feature.properties?.area_id;
      if (typeof areaId === "string" && areaId !== "") {
        ids.add(areaId);
      }
    }
    return [r.admin_area_level, ids];
  }));
}

// Scopes whose HFA section names an area 2 the registry no longer has,
// matched ignoring case as the scoped view matches.
export async function findOrphanedHfaScopeAreas(
  sql: Sql,
): Promise<HfaOrphanedScopeArea[]> {
  const scopeAreas = await getHfaScopeAreas(sql);
  const names = (await getHfaRegistryAdminAreaNames(sql)).get(2) ??
    new Set<string>();
  const upper = new Set([...names].map((n) => n.toUpperCase()));
  return scopeAreas.filter((s) => !upper.has(s.adminArea2.toUpperCase()));
}

export async function reportHfaRegistryOrphans(sql: Sql): Promise<{
  orphanedGeojsonAreaIds: GeojsonOrphanedAreaIds[];
  orphanedScopeAreas: HfaOrphanedScopeArea[];
}> {
  return {
    orphanedGeojsonAreaIds: await countOrphanedGeoJsonAreaIds(sql, "hfa"),
    orphanedScopeAreas: await findOrphanedHfaScopeAreas(sql),
  };
}

// The file's changes against the whole registry, read without locks.
export async function readHfaFacilityChangeSet(
  sql: Sql,
  input: {
    file: HfaFileFacility[];
    facilityColumns: HfaFacilityColumns;
    schema: StructureSchema;
    timePoint: string;
  },
): Promise<
  { changeSet: HfaFacilityChangeSet; registryRows: HfaRegistryRow[] }
> {
  const schema = toHfaSchema(input.schema);
  const mappedOptional = mappedOptionalColumns(input.facilityColumns, schema);
  assertFileShape(input.file, schema.adminDepth);
  const registryRows = await sql<HfaRegistryRow[]>`
    SELECT ${sql(REGISTRY_COLUMNS)} FROM facilities_hfa
  `;
  const ctx = await loadHfaRegistryContext(sql, {
    registryRows,
    adminDepth: schema.adminDepth,
    timePoint: input.timePoint,
  });
  return {
    changeSet: computeHfaFacilityChanges(input.file, mappedOptional, ctx),
    registryRows,
  };
}

// The changes step's preview, read without locks. A change the request
// carries no decision for counts as its default, and as taken where it has
// none, for the areas lost and the paths introduced.
export async function previewHfaFacilityChanges(
  sql: Sql,
  input: {
    file: HfaFileFacility[];
    facilityColumns: HfaFacilityColumns;
    schema: StructureSchema;
    timePoint: string;
    decisions: HfaFacilityChangeGroupDecision[];
  },
): Promise<HfaFacilityChangesPreview> {
  const { changeSet, registryRows } = await readHfaFacilityChangeSet(
    sql,
    input,
  );

  const decisionByKey = new Map(
    input.decisions.map((d) => [groupKey(d.column, d.from, d.to), {
      members: new Set(d.facilityIds),
      exceptions: new Set(d.exceptions),
      decision: d.decision,
    }]),
  );
  const decide = (
    group: HfaFacilityChangeGroup,
    change: HfaFacilityChange,
  ): HfaFacilityChangeDecision => {
    const d = decisionByKey.get(groupKey(group.column, group.from, group.to));
    if (d?.members.has(change.facilityId)) {
      return d.exceptions.has(change.facilityId)
        ? opposite(d.decision)
        : d.decision;
    }
    return change.defaultDecision ?? "take";
  };
  const written = new Map<string, string[]>(
    changeSet.newFacilities.map((f) => [f.facilityId, f.admin]),
  );
  for (const group of changeSet.changes) {
    if (group.column !== "admin") {
      continue;
    }
    for (const change of group.facilities) {
      if (decide(group, change) === "take") {
        written.set(change.facilityId, decodeHfaAdminTuple(group.to));
      }
    }
  }
  const projected = projectHfaAdminAreas({
    registry: registryRows,
    adminDepth: input.schema.adminDepth,
    written,
  });
  const scopeAreas = projected.lost.some((l) => l.level === 2)
    ? await getHfaScopeAreas(sql)
    : [];
  const geojsonAreaIds = projected.lost.length > 0
    ? await getHfaGeojsonAreaIds(sql)
    : new Map<number, Set<string>>();
  const adminAreasLost: HfaAdminAreaLost[] = projected.lost.map((l) => ({
    ...l,
    scopeLabels: l.level === 2
      ? scopeAreas
        .filter((s) => s.adminArea2.toUpperCase() === l.name.toUpperCase())
        .map((s) => s.scopeLabel)
      : [],
    inGeojsonMap: geojsonAreaIds.get(l.level)?.has(l.name) ?? false,
  }));
  return {
    match: changeSet.match,
    changes: changeSet.changes,
    newFacilityIds: [
      ...changeSet.newFacilities.map((f) => f.facilityId),
      ...changeSet.newFacilitiesWithoutAdminTuple,
    ].toSorted(compareIds),
    newFacilitiesWithoutAdminTuple: idSample(
      changeSet.newFacilitiesWithoutAdminTuple,
    ),
    adminPathsIntroduced: projected.introducedPaths,
    adminAreasLost,
  };
}

// ============================================================================
// Writes (inside the caller's transaction)
// ============================================================================

async function stampStructureLastUpdated(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO instance_config (config_key, config_json_value)
    VALUES ('structure_last_updated', ${
    JSON.stringify(new Date().toISOString())
  })
    ON CONFLICT (config_key)
    DO UPDATE SET config_json_value = EXCLUDED.config_json_value
  `;
}

// Admin rows go in before the facilities that reference them: the composite
// FK on facilities_hfa is immediate.
async function insertHfaAdminPaths(
  sql: Sql,
  tuples: string[][],
): Promise<void> {
  if (tuples.length === 0) {
    return;
  }
  const padded = [
    ...new Map(tuples.map((t) => {
      const p = padAdminTuple(t);
      return [JSON.stringify(p), p];
    })).values(),
  ];
  const [a1, a2, a3, a4] = [0, 1, 2, 3].map((i) => padded.map((p) => p[i]));
  await sql`
    INSERT INTO admin_areas_hfa_1 (admin_area_1)
    SELECT DISTINCT a1 FROM unnest(${a1}::text[]) AS t(a1)
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO admin_areas_hfa_2 (admin_area_2, admin_area_1)
    SELECT DISTINCT a2, a1 FROM unnest(${a2}::text[], ${a1}::text[]) AS t(a2, a1)
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO admin_areas_hfa_3 (admin_area_3, admin_area_2, admin_area_1)
    SELECT DISTINCT a3, a2, a1
    FROM unnest(${a3}::text[], ${a2}::text[], ${a1}::text[]) AS t(a3, a2, a1)
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO admin_areas_hfa_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    SELECT DISTINCT a4, a3, a2, a1
    FROM unnest(${a4}::text[], ${a3}::text[], ${a2}::text[], ${a1}::text[])
      AS t(a4, a3, a2, a1)
    ON CONFLICT DO NOTHING
  `;
}

async function updateHfaAdminTuples(
  sql: Sql,
  updates: { facilityId: string; tuple: string[] }[],
): Promise<void> {
  if (updates.length === 0) {
    return;
  }
  const ids = updates.map((u) => u.facilityId);
  const padded = updates.map((u) => padAdminTuple(u.tuple));
  const [a1, a2, a3, a4] = [0, 1, 2, 3].map((i) => padded.map((p) => p[i]));
  await sql`
    UPDATE facilities_hfa f
    SET admin_area_1 = t.a1, admin_area_2 = t.a2,
      admin_area_3 = t.a3, admin_area_4 = t.a4
    FROM unnest(${ids}::text[], ${a1}::text[], ${a2}::text[], ${a3}::text[], ${a4}::text[])
      AS t(id, a1, a2, a3, a4)
    WHERE f.facility_id = t.id
  `;
}

async function updateHfaOptionalColumn(
  sql: Sql,
  column: OptionalFacilityColumn,
  updates: { facilityId: string; value: string }[],
): Promise<void> {
  if (updates.length === 0) {
    return;
  }
  await sql`
    UPDATE facilities_hfa f SET ${sql(column)} = t.v
    FROM unnest(
      ${updates.map((u) => u.facilityId)}::text[],
      ${updates.map((u) => u.value)}::text[]
    ) AS t(id, v)
    WHERE f.facility_id = t.id
  `;
}

const INSERT_BATCH_SIZE = 1000;

async function insertHfaFacilities(
  sql: Sql,
  facilities: HfaFileFacility[],
  mappedOptional: OptionalFacilityColumn[],
  recodes: StructureRecodes,
): Promise<void> {
  const columns = [
    "facility_id",
    "admin_area_1",
    "admin_area_2",
    "admin_area_3",
    "admin_area_4",
    ...mappedOptional,
  ];
  const rows = facilities.map((f) => {
    const [a1, a2, a3, a4] = padAdminTuple(f.admin);
    const row: Record<string, string> = {
      facility_id: f.facilityId,
      admin_area_1: a1,
      admin_area_2: a2,
      admin_area_3: a3,
      admin_area_4: a4,
    };
    for (const column of mappedOptional) {
      row[column] = recodeFor(recodes, f.facilityId, column) ??
        f.optional[column] ?? "";
    }
    return row;
  });
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    await sql`
      INSERT INTO facilities_hfa
      ${sql(rows.slice(i, i + INSERT_BATCH_SIZE), columns)}
    `;
  }
}

async function upsertHfaSources(
  sql: Sql,
  writes: HfaSourceWrite[],
): Promise<void> {
  if (writes.length === 0) {
    return;
  }
  await sql`
    INSERT INTO hfa_facility_sources (facility_id, column_group, kind, time_point)
    SELECT * FROM unnest(
      ${writes.map((w) => w.facilityId)}::text[],
      ${writes.map((w) => w.column)}::text[],
      ${writes.map((w) => w.source.kind)}::text[],
      ${
    writes.map((w) => w.source.kind === "round" ? w.source.timePoint : null)
  }::text[]
    )
    ON CONFLICT (facility_id, column_group)
    DO UPDATE SET kind = EXCLUDED.kind, time_point = EXCLUDED.time_point
  `;
}

// The import's registry write, in the integrate transaction before the
// round's data goes in: the file's known rows are locked, the changes are
// recomputed and must match the decisions, then admin areas, facilities and
// sources are written. finishHfaRegistryWrite completes it after the data.
export async function writeHfaFacilitiesFromImport(
  sql: Sql,
  input: {
    file: HfaFileFacility[];
    facilityColumns: HfaFacilityColumns;
    timePoint: string;
    decisions: HfaFacilityChangeGroupDecision[];
    recodes: StructureRecodes;
  },
): Promise<HfaRegistryWriteResult> {
  const schema = await readHfaSchema(sql);
  const mappedOptional = mappedOptionalColumns(input.facilityColumns, schema);
  assertFileShape(input.file, schema.adminDepth);
  const registryRows = await sql<HfaRegistryRow[]>`
    SELECT ${sql(REGISTRY_COLUMNS)} FROM facilities_hfa
    WHERE facility_id = ANY(${input.file.map((f) => f.facilityId)})
    ORDER BY facility_id
    FOR UPDATE
  `;
  const ctx = await loadHfaRegistryContext(sql, {
    registryRows,
    adminDepth: schema.adminDepth,
    timePoint: input.timePoint,
  });
  const changeSet = computeHfaFacilityChanges(input.file, mappedOptional, ctx);
  const resolved = resolveHfaChangeDecisions(
    changeSet.changes,
    input.decisions,
  );
  assertRecodesNameWrittenCells(
    input.recodes,
    mappedOptional,
    changeSet,
    resolved,
  );

  const adminUpdates: { facilityId: string; tuple: string[] }[] = [];
  const optionalUpdates = new Map<
    OptionalFacilityColumn,
    { facilityId: string; value: string }[]
  >();
  for (const group of changeSet.changes) {
    for (const change of group.facilities) {
      if (resolved.get(change.facilityId)?.get(group.column) !== "take") {
        continue;
      }
      if (group.column === "admin") {
        adminUpdates.push({
          facilityId: change.facilityId,
          tuple: decodeHfaAdminTuple(group.to),
        });
        continue;
      }
      const value = recodeFor(input.recodes, change.facilityId, group.column) ??
        group.to;
      if (value !== group.from) {
        const updates = optionalUpdates.get(group.column) ?? [];
        updates.push({ facilityId: change.facilityId, value });
        optionalUpdates.set(group.column, updates);
      }
    }
  }

  await insertHfaAdminPaths(sql, [
    ...changeSet.newFacilities.map((f) => f.admin),
    ...adminUpdates.map((u) => u.tuple),
  ]);
  await insertHfaFacilities(
    sql,
    changeSet.newFacilities,
    mappedOptional,
    input.recodes,
  );
  await updateHfaAdminTuples(sql, adminUpdates);
  for (const [column, updates] of optionalUpdates) {
    await updateHfaOptionalColumn(sql, column, updates);
  }
  await upsertHfaSources(
    sql,
    planHfaSourceWrites({
      changeSet,
      resolved,
      recodes: input.recodes,
      mappedOptional,
      timePoint: input.timePoint,
    }),
  );

  return {
    registryChanged: changeSet.newFacilities.length > 0 ||
      adminUpdates.length > 0 ||
      [...optionalUpdates.values()].some((u) => u.length > 0),
    match: changeSet.match,
    changeCounts: countHfaFacilityChanges(changeSet.changes, resolved),
    facilitiesWithoutAdminTuple: idSample(
      changeSet.newFacilitiesWithoutAdminTuple,
    ),
    skippedFacilityIds: changeSet.newFacilitiesWithoutAdminTuple,
  };
}

// Admin areas left without a facility are removed and the stamp is bumped,
// only after a registry row changed: no other write moves a facility out of
// an area.
export async function finishHfaRegistryWrite(
  sql: Sql,
  registryChanged: boolean,
): Promise<void> {
  if (!registryChanged) {
    return;
  }
  await cleanupUnusedAdminAreas(sql, "hfa");
  await stampStructureLastUpdated(sql);
}

// One facility edited on the facilities page: every column group whose value
// changes becomes the user's.
export async function editHfaFacility(
  sql: Sql,
  edit: HfaFacilityEdit,
): Promise<{ changed: boolean }> {
  const schema = await readHfaSchema(sql);
  const row = (
    await sql<HfaRegistryRow[]>`
      SELECT ${sql(REGISTRY_COLUMNS)} FROM facilities_hfa
      WHERE facility_id = ${edit.facilityId}
      FOR UPDATE
    `
  ).at(0);
  if (!row) {
    throw new Error(`HFA facility "${edit.facilityId}" does not exist.`);
  }
  const writes: HfaSourceWrite[] = [];
  let adminTuple: string[] | undefined;
  if (edit.admin) {
    const tuple = edit.admin.map((name) => name.trim());
    if (tuple.length !== schema.adminDepth || !isCompleteAdminTuple(tuple)) {
      throw new Error(
        `An HFA facility's admin areas are ${schema.adminDepth} non-blank names.`,
      );
    }
    if (
      encodeHfaAdminTuple(tuple) !==
        encodeHfaAdminTuple(registryAdminTuple(row, schema.adminDepth))
    ) {
      adminTuple = tuple;
      writes.push({
        facilityId: edit.facilityId,
        column: "admin",
        source: USER_SOURCE,
      });
    }
  }
  const optionalUpdates: [OptionalFacilityColumn, string][] = [];
  for (const [column, value] of Object.entries(edit.optional ?? {})) {
    const col = column as OptionalFacilityColumn;
    if (!schema.enabled.includes(col)) {
      throw new Error(`The HFA structure schema does not enable ${column}.`);
    }
    const trimmed = value.trim();
    if (trimmed !== (row[col] ?? "")) {
      optionalUpdates.push([col, trimmed]);
      writes.push({
        facilityId: edit.facilityId,
        column: col,
        source: USER_SOURCE,
      });
    }
  }
  if (writes.length === 0) {
    return { changed: false };
  }
  if (adminTuple) {
    await insertHfaAdminPaths(sql, [adminTuple]);
    await updateHfaAdminTuples(sql, [
      { facilityId: edit.facilityId, tuple: adminTuple },
    ]);
  }
  for (const [column, value] of optionalUpdates) {
    await updateHfaOptionalColumn(sql, column, [
      { facilityId: edit.facilityId, value },
    ]);
  }
  await upsertHfaSources(sql, writes);
  await finishHfaRegistryWrite(sql, true);
  return { changed: true };
}

export async function countUnreferencedHfaFacilities(
  sql: Sql,
): Promise<number> {
  return (
    await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM facilities_hfa f
      WHERE NOT EXISTS (SELECT 1 FROM hfa_data d WHERE d.facility_id = f.facility_id)
        AND NOT EXISTS (SELECT 1 FROM hfa_facility_weights w WHERE w.facility_id = f.facility_id)
    `
  )[0].count;
}

// Removes the facilities that no data and no weights reference. The
// candidates are locked first, which makes a concurrent data or weights write
// on one wait for this transaction and then fail its FK; the delete re-checks
// in a fresh statement, so a reference committed while the lock waited keeps
// its facility (weights would otherwise vanish through their CASCADE FK).
export async function removeUnreferencedHfaFacilities(
  sql: Sql,
): Promise<number> {
  const candidates = (
    await sql<{ facility_id: string }[]>`
      SELECT facility_id FROM facilities_hfa f
      WHERE NOT EXISTS (SELECT 1 FROM hfa_data d WHERE d.facility_id = f.facility_id)
        AND NOT EXISTS (SELECT 1 FROM hfa_facility_weights w WHERE w.facility_id = f.facility_id)
      ORDER BY facility_id
      FOR UPDATE
    `
  ).map((r) => r.facility_id);
  if (candidates.length === 0) {
    return 0;
  }
  const deleted = await sql`
    DELETE FROM facilities_hfa f
    WHERE f.facility_id = ANY(${candidates})
      AND NOT EXISTS (SELECT 1 FROM hfa_data d WHERE d.facility_id = f.facility_id)
      AND NOT EXISTS (SELECT 1 FROM hfa_facility_weights w WHERE w.facility_id = f.facility_id)
  `;
  await finishHfaRegistryWrite(sql, deleted.count > 0);
  return deleted.count;
}

// ============================================================================
// The facilities page: each read or save in its own transaction, a save
// reporting what it left orphaned
// ============================================================================

export async function getHfaRegistry(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaRegistryFacility[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const schema = await readHfaSchema(mainDb);
    const rows = await mainDb<HfaRegistryRow[]>`
      SELECT ${mainDb(REGISTRY_COLUMNS)} FROM facilities_hfa
      ORDER BY facility_id
    `;
    const sources = await loadHfaRegistrySources(mainDb, undefined);
    return {
      success: true,
      data: rows.map((row) => ({
        facilityId: row.facility_id,
        admin: registryAdminTuple(row, schema.adminDepth),
        optional: Object.fromEntries(
          schema.enabled.map((col) => [col, row[col] ?? ""]),
        ),
        sources: Object.fromEntries(sources.get(row.facility_id) ?? []),
      })),
    };
  });
}

async function saveWithOrphanReport(
  mainDb: Sql,
  write: (sql: Sql) => Promise<number>,
): Promise<APIResponseWithData<HfaRegistrySaveResult>> {
  return await tryCatchDatabaseAsync(async () => {
    const data = await mainDb.begin(async (sql) => {
      const nChanged = await write(sql);
      return { nChanged, ...(await reportHfaRegistryOrphans(sql)) };
    });
    return { success: true, data };
  });
}

export async function saveHfaFacilityEdit(
  mainDb: Sql,
  edit: HfaFacilityEdit,
): Promise<APIResponseWithData<HfaRegistrySaveResult>> {
  return await saveWithOrphanReport(
    mainDb,
    async (sql) => (await editHfaFacility(sql, edit)).changed ? 1 : 0,
  );
}

export async function getHfaUnreferencedFacilityCount(
  mainDb: Sql,
): Promise<APIResponseWithData<{ count: number }>> {
  return await tryCatchDatabaseAsync(async () => ({
    success: true,
    data: { count: await countUnreferencedHfaFacilities(mainDb) },
  }));
}

export async function saveHfaUnreferencedFacilitiesRemoval(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaRegistrySaveResult>> {
  return await saveWithOrphanReport(mainDb, removeUnreferencedHfaFacilities);
}
