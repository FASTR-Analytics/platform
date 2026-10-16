// Pins a whole round through the HFA data import at the scale and with the
// mess of a real survey export, against a registry imported before facility
// sources existed: the launch validation, the stage and integrate legs the
// import worker runs, the changes preview the wizard shows, the run extract
// that m010 reads, and the weights import that follows the data. The registry
// has the dev registry's shape (2,363 facilities, 11 provinces, 162
// districts); the file carries duplicate submissions, ODK codes, a correction
// column, unresolved codes, renamed, retyped and moved facilities. Runs on a
// throwaway database built from _main_database.sql on the dev postgres, whose
// container shares the runs directory the extract is written to.
//
//   deno test -A --env-file server/tests/hfa_round_reimport_test.ts

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  type DatasetHfaCsvStagingResult,
  encodeRawCsvHeader,
  type HfaCsvMappingParams,
  type HfaFacilityChange,
  type HfaFacilityChangeDecision,
  type HfaFacilityChangeGroup,
  type HfaFacilityChangeGroupDecision,
  type HfaFacilityChangesPreview,
  type StructureSchema,
} from "lib";
import { utils, write } from "xlsx/xlsx.mjs";
import {
  _ASSETS_DIR_PATH,
  _RUNS_DIR_PATH,
  _RUNS_DIR_PATH_POSTGRES_INTERNAL,
} from "../exposed_env_vars.ts";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  getLatestCompleteHfaMappings,
  validateHfaCsvRunConfig,
} from "../db/instance/dataset_hfa_import_runs.ts";
import { previewHfaFacilityChanges } from "../db/instance/hfa_facilities.ts";
import { importHfaFacilityWeights } from "../db/instance/hfa_facility_weights.ts";
import { computeDatasetHfaRunCapture } from "../runs/capture_inputs/hfa.ts";
import { parseXlsForm } from "../server_only_funcs_csvs/parse_xlsform.ts";
import { scanHfaFileFacilities } from "../server_only_funcs_csvs/scan_hfa_rows.ts";
import {
  isCleanHfaStaging,
  stageHfaCsvIntoTables,
} from "../worker_routines/import_hfa_data_csv/stage_csv.ts";
import { integrateStagedHfaData } from "../worker_routines/import_hfa_data_csv/integrate_staged.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "hfa_round_reimport_test_";
const STAMP = Date.now();

const admin = getPgConnection("postgres", { max: 1 });
for (
  const { datname } of await admin<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname LIKE ${DB_PREFIX + "%"}
  `
) {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${datname} WITH (FORCE)`);
}
const dbName = `${DB_PREFIX}${STAMP}`;
await admin.unsafe(`CREATE DATABASE ${dbName}`);
const db = getPgConnection(dbName, { max: 3 });
await db.file(SCHEMA_PATH);

const SCHEMA: StructureSchema = {
  adminDepth: 3,
  includeNames: true,
  includeTypes: true,
  includeOwnership: true,
  includeCustom1: false,
  includeCustom2: false,
  includeCustom3: false,
  includeCustom4: false,
  includeCustom5: false,
};
await db`
  INSERT INTO instance_config (config_key, config_json_value)
  VALUES ('structure_schema_hfa', ${JSON.stringify(SCHEMA)})
`;
await db`
  INSERT INTO hfa_time_points (label, period_id, sort_order)
  VALUES ('R1', '202501', 1)
`;

// ─── The world: a registry, and the round's survey export ───────────────────

const COUNTRY = "Moçambique";
const PROVINCES = [
  "Cabo Delgado",
  "Gaza",
  "Inhambane",
  "Manica",
  "Maputo Cidade",
  "Maputo Província",
  "Nampula",
  "Niassa",
  "Sofala",
  "Tete",
  "Zambézia",
];
const N_DISTRICTS = 162;
const N_FACILITIES = 2363;
const TYPES = [
  "Hospital Central",
  "Hospital Provincial",
  "Hospital Distrital",
  "Centro de Saúde",
  "Posto de Saúde",
  "Other",
];
const OWNERS = ["Público", "Privado", "Religioso"];

const provinceOf = (district: number) => district % PROVINCES.length;
const districtName = (district: number) =>
  `${PROVINCES[provinceOf(district)]} ${
    Math.floor(district / PROVINCES.length) + 1
  }`;
// A district in the same province, so a corrected tuple is a known path.
const neighbour = (district: number) =>
  district + PROVINCES.length < N_DISTRICTS
    ? district + PROVINCES.length
    : district - PROVINCES.length;

type Facility = {
  id: string;
  district: number;
  name: string;
  type: number;
  owner: number;
  kind:
    | "plain"
    | "moved"
    | "retyped"
    | "unresolved"
    | "partialFirst"
    | "fullFirst"
    | "renamed";
};

const FACILITIES: Facility[] = Array.from({ length: N_FACILITIES }, (_, i) => {
  const kind: Facility["kind"] = i % 79 === 3
    ? "moved"
    : i % 59 === 7
    ? "retyped"
    : [100, 1100, 2100].includes(i)
    ? "unresolved"
    : i % 97 === 11
    ? "partialFirst"
    : i % 61 === 13
    ? "fullFirst"
    : i % 233 === 50
    ? "renamed"
    : "plain";
  return {
    id: `HF${String(i + 1).padStart(4, "0")}`,
    district: i % N_DISTRICTS,
    name: `Unidade Sanitária ${i + 1}`,
    type: (i * 7) % TYPES.length,
    owner: (i * 5) % OWNERS.length,
    kind,
  };
});
const ofKind = (kind: Facility["kind"]) =>
  FACILITIES.filter((f) => f.kind === kind);

const HEADERS = [
  "id_fac_txt",
  "id_admin1_name",
  "id_admin2_name",
  "id_admin2_corrected",
  "id_fac_name",
  "id_fac_type",
  "id_fac_type_other",
  "own",
  "hr_01",
  "svc_01",
  "fin_01",
];
const enc = (name: string) => encodeRawCsvHeader(HEADERS.indexOf(name), name);

// One kept row per facility (the first, as the import is told), plus the
// submission attempts a survey export carries.
function surveyRows(): string[] {
  const lines: string[] = [];
  for (const [i, f] of FACILITIES.entries()) {
    const full = (hr: number) =>
      [
        f.id,
        String(provinceOf(f.district) + 1),
        String(f.district + 1),
        f.kind === "moved" ? String(neighbour(f.district) + 1) : "",
        f.kind === "renamed" ? f.name.replace("á", "a") : f.name,
        f.kind === "unresolved" ? "99" : String(
          (f.kind === "retyped" ? (f.type + 1) % TYPES.length : f.type) + 1,
        ),
        f.type === TYPES.length - 1 ? "Clínica comunitária" : "",
        String(f.owner + 1),
        String(hr),
        String(i % 2),
        (i * 1.5).toFixed(1),
      ].join(",");
    const attempt = [
      f.id,
      String(provinceOf(f.district) + 1),
      String(f.district + 1),
      "",
      f.name,
      "",
      "",
      "",
      "",
      "",
      "",
    ].join(",");
    if (f.kind === "partialFirst") {
      lines.push(attempt, full(i % 50));
    } else if (f.kind === "fullFirst") {
      lines.push(full(i % 50), attempt);
    } else {
      lines.push(full(i % 50));
    }
  }
  return lines;
}

function writeXlsForm(path: string) {
  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ["type", "name", "label"],
      ["text", "id_fac_txt", "Facility ID"],
      ["select_one province", "id_admin1_name", "Province"],
      ["select_one district", "id_admin2_name", "District"],
      ["select_one district", "id_admin2_corrected", "Corrected district"],
      ["text", "id_fac_name", "Facility name"],
      ["select_one ftype", "id_fac_type", "Facility type"],
      ["text", "id_fac_type_other", "Other type"],
      ["select_one owner", "own", "Ownership"],
      ["integer", "hr_01", "Staff"],
      ["select_one yn", "svc_01", "Offers the service"],
      ["decimal", "fin_01", "Budget"],
    ]),
    "survey",
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ["list_name", "name", "label"],
      ...PROVINCES.map((p, i) => ["province", String(i + 1), p]),
      ...Array.from(
        { length: N_DISTRICTS },
        (_, d) => ["district", String(d + 1), districtName(d)],
      ),
      ...TYPES.map((t, i) => ["ftype", String(i + 1), t]),
      ...OWNERS.map((o, i) => ["owner", String(i + 1), o]),
      ["yn", "1", "Yes"],
      ["yn", "0", "No"],
    ]),
    "choices",
  );
  Deno.writeFileSync(
    path,
    new Uint8Array(write(workbook, { type: "array", bookType: "xlsx" })),
  );
}

const CSV_NAME = `${DB_PREFIX}${STAMP}_round.csv`;
const XLSFORM_NAME = `${DB_PREFIX}${STAMP}_form.xlsx`;
const WEIGHTS_NAME = `${DB_PREFIX}${STAMP}_weights.csv`;
const CSV_PATH = join(_ASSETS_DIR_PATH, CSV_NAME);
const XLSFORM_PATH = join(_ASSETS_DIR_PATH, XLSFORM_NAME);
const WEIGHTS_PATH = join(_ASSETS_DIR_PATH, WEIGHTS_NAME);
Deno.writeTextFileSync(
  CSV_PATH,
  [HEADERS.join(","), ...surveyRows()].join("\n"),
);
writeXlsForm(XLSFORM_PATH);

// The registry as the structure import left it: every facility, no sources.
async function seedRegistryImportedBeforeSources() {
  await db`INSERT INTO admin_areas_hfa_1 (admin_area_1) VALUES (${COUNTRY})`;
  for (const p of PROVINCES) {
    await db`
      INSERT INTO admin_areas_hfa_2 (admin_area_1, admin_area_2)
      VALUES (${COUNTRY}, ${p})
    `;
  }
  for (let d = 0; d < N_DISTRICTS; d++) {
    const p = PROVINCES[provinceOf(d)];
    await db`
      INSERT INTO admin_areas_hfa_3 (admin_area_1, admin_area_2, admin_area_3)
      VALUES (${COUNTRY}, ${p}, ${districtName(d)})
    `;
    await db`
      INSERT INTO admin_areas_hfa_4 (admin_area_1, admin_area_2, admin_area_3, admin_area_4)
      VALUES (${COUNTRY}, ${p}, ${districtName(d)}, ${districtName(d)})
    `;
  }
  await db`
    INSERT INTO facilities_hfa ${
    db(
      FACILITIES.map((f) => ({
        facility_id: f.id,
        admin_area_1: COUNTRY,
        admin_area_2: PROVINCES[provinceOf(f.district)],
        admin_area_3: districtName(f.district),
        admin_area_4: districtName(f.district),
        facility_name: f.name,
        facility_type: TYPES[f.type],
        facility_ownership: OWNERS[f.owner],
      })),
    )
  }
  `;
  await db`
    INSERT INTO instance_config (config_key, config_json_value)
    VALUES ('structure_last_updated', ${JSON.stringify("seeded")})
  `;
}
await seedRegistryImportedBeforeSources();

// ─── What the wizard sends, and what the worker runs ────────────────────────

function mappings(
  facilityChanges: HfaFacilityChangeGroupDecision[],
): HfaCsvMappingParams {
  return {
    facilityIdColumn: enc("id_fac_txt"),
    timePoint: "R1",
    rowFilters: [],
    dedupStrategy: "first",
    dedupOverrides: [],
    facilityColumns: {
      adminArea1: { value: COUNTRY },
      adminAreas: [
        { level: 2, header: enc("id_admin1_name") },
        {
          level: 3,
          header: enc("id_admin2_name"),
          correctionHeader: enc("id_admin2_corrected"),
        },
      ],
      optional: {
        facility_name: { header: enc("id_fac_name") },
        facility_type: { header: enc("id_fac_type") },
        facility_ownership: { header: enc("own") },
      },
    },
    facilityChanges,
    recodes: {},
  };
}

// The changes step's preview, as previewDatasetHfaFacilityChanges builds it.
async function previewChanges(): Promise<HfaFacilityChangesPreview> {
  const m = mappings([]);
  const scan = await scanHfaFileFacilities({
    csvFilePath: CSV_PATH,
    mappings: m,
    facilityColumns: m.facilityColumns,
    adminDepth: SCHEMA.adminDepth,
    xlsForm: parseXlsForm(XLSFORM_PATH),
    contextHeaders: [],
  });
  return await previewHfaFacilityChanges(db, {
    file: scan.facilities,
    facilityColumns: m.facilityColumns,
    schema: SCHEMA,
    timePoint: "R1",
    decisions: [],
  });
}

// The changes step's Next: each group's most common decision, the rest as
// exceptions.
function decisionsFrom(
  preview: HfaFacilityChangesPreview,
  pick: (
    group: HfaFacilityChangeGroup,
    change: HfaFacilityChange,
  ) => HfaFacilityChangeDecision,
): HfaFacilityChangeGroupDecision[] {
  return preview.changes.map((group) => {
    const picked = group.facilities.map((c) => pick(group, c));
    const keeps = picked.filter((d) => d === "keep").length;
    const decision = keeps * 2 >= picked.length ? "keep" : "take";
    return {
      column: group.column,
      from: group.from,
      to: group.to,
      facilityIds: group.facilities.map((c) => c.facilityId),
      decision,
      exceptions: group.facilities
        .filter((_, i) => picked[i] !== decision)
        .map((c) => c.facilityId),
    };
  });
}

async function importRound(
  decisions: HfaFacilityChangeGroupDecision[],
): Promise<DatasetHfaCsvStagingResult> {
  const config = await validateHfaCsvRunConfig(db, {
    csvFileName: CSV_NAME,
    xlsFormFileName: XLSFORM_NAME,
    mappings: mappings(decisions),
  });
  const [{ id }] = await db<{ id: number }[]>`
    INSERT INTO hfa_import_runs (csv_config, time_point, status)
    VALUES (${JSON.stringify(config)}, 'R1', 'running')
    RETURNING id
  `;
  const staged = await stageHfaCsvIntoTables({
    importDb: db,
    csvFilePath: CSV_PATH,
    csvFileName: CSV_NAME,
    xlsFormFilePath: XLSFORM_PATH,
    mappings: config.mappings,
    runId: id,
    onProgress: () => {},
  });
  assertEquals(isCleanHfaStaging(staged), true);
  await integrateStagedHfaData({
    importDb: db,
    mainDb: db,
    runId: id,
    mappings: config.mappings,
    stagingResult: staged,
    onProgress: () => {},
  });
  const [{ status }] = await db<{ status: string }[]>`
    SELECT status FROM hfa_import_runs WHERE id = ${id}
  `;
  assertEquals(status, "complete");
  return staged;
}

// ─── What is compared ───────────────────────────────────────────────────────

type Row = Record<string, string | null>;

async function facilityRows(): Promise<Row[]> {
  return await db<Row[]>`SELECT * FROM facilities_hfa ORDER BY facility_id`;
}

async function adminAreaRows(): Promise<Row[][]> {
  const levels: Row[][] = [];
  for (let level = 1; level <= 4; level++) {
    const columns = Array.from(
      { length: level },
      (_, i) => `admin_area_${i + 1}`,
    );
    levels.push(
      await db.unsafe<Row[]>(
        `SELECT * FROM admin_areas_hfa_${level} ORDER BY ${columns.join(", ")}`,
      ),
    );
  }
  return levels;
}

async function dataRows(): Promise<string[]> {
  return (await db<{ r: string }[]>`
    SELECT concat_ws('|', facility_id, time_point, variable_id, value) AS r
    FROM hfa_data ORDER BY facility_id, variable_id, value
  `).map((x) => x.r);
}

async function sourceRows(): Promise<string[]> {
  return (await db<{ r: string }[]>`
    SELECT concat_ws('|', facility_id, column_group, kind, time_point) AS r
    FROM hfa_facility_sources ORDER BY facility_id, column_group
  `).map((x) => x.r);
}

async function stamp(): Promise<string> {
  return (await db<{ v: string }[]>`
    SELECT config_json_value AS v FROM instance_config
    WHERE config_key = 'structure_last_updated'
  `)[0].v;
}

// What m010 reads: the extract CSV, and the facilities its parquet is built
// from.
const EXTRACT_DIR = `.tmp-${DB_PREFIX}${STAMP}`;
async function extract(label: string) {
  const target = {
    postgresPath: join(
      _RUNS_DIR_PATH_POSTGRES_INTERNAL,
      EXTRACT_DIR,
      `${label}.csv`,
    ),
    denoPath: join(_RUNS_DIR_PATH, EXTRACT_DIR, `${label}.csv`),
  };
  const res = await computeDatasetHfaRunCapture(db, target);
  if (!res.success) {
    throw new Error(res.err);
  }
  return {
    csv: await Deno.readTextFile(target.denoPath),
    facilities: res.data.facilities.toSorted((a, b) =>
      a.facility_id.localeCompare(b.facility_id)
    ),
    variables: res.data.variables,
    sentinelValues: res.data.sentinelValues,
  };
}

const changedIds = (before: Row[], after: Row[]) => {
  const prior = new Map(before.map((r) => [r.facility_id, JSON.stringify(r)]));
  return after
    .filter((r) => prior.get(r.facility_id) !== JSON.stringify(r))
    .map((r) => r.facility_id);
};

// ─── The round ──────────────────────────────────────────────────────────────

const registryBefore = await facilityRows();
const areasBefore = await adminAreaRows();
let afterFirst: {
  data: string[];
  sources: string[];
  extract: Awaited<ReturnType<typeof extract>>;
};

Deno.test("re-importing a round into a registry with no sources, keeping every change, leaves the registry byte-identical", async () => {
  const preview = await previewChanges();
  assertEquals(preview.match, { known: N_FACILITIES, new: 0, absent: 0 });
  assertEquals(preview.newFacilityIds, []);
  assertEquals(preview.adminPathsIntroduced, []);
  const changed = (column: string) =>
    preview.changes
      .filter((g) => g.column === column)
      .flatMap((g) => g.facilities.map((c) => c.facilityId))
      .toSorted();
  assertEquals(changed("admin"), ofKind("moved").map((f) => f.id));
  assertEquals(
    changed("facility_type"),
    [...ofKind("retyped"), ...ofKind("unresolved"), ...ofKind("partialFirst")]
      .map((f) => f.id).toSorted(),
  );
  assertEquals(
    changed("facility_ownership"),
    ofKind("partialFirst").map((f) => f.id),
  );
  assertEquals(changed("facility_name"), ofKind("renamed").map((f) => f.id));
  // A cell with no source has no default: the user must choose.
  assertEquals(
    preview.changes.flatMap((g) => g.facilities).every((c) =>
      c.defaultDecision === undefined
    ),
    true,
  );

  const stampBefore = await stamp();
  const staged = await importRound(decisionsFrom(preview, () => "keep"));
  assertEquals(staged.facilityMatch, {
    known: N_FACILITIES,
    new: 0,
    absent: 0,
  });
  const typeResolution = staged.labelResolution?.find((l) =>
    l.column === "facility_type"
  );
  assertEquals(typeResolution?.unresolvedValues, ["99"]);

  assertEquals(await facilityRows(), registryBefore);
  assertEquals(await adminAreaRows(), areasBefore);
  assertEquals(await stamp(), stampBefore);

  const nKept = preview.changes.flatMap((g) => g.facilities).length;
  const sources = await sourceRows();
  assertEquals(sources.length, N_FACILITIES * 4);
  assertEquals(sources.filter((s) => s.includes("|user")).length, nKept);
  assertEquals(
    sources.filter((s) => s.endsWith("|round|R1")).length,
    N_FACILITIES * 4 - nKept,
  );

  // The data comes from the same kept row as the facility values: a blank
  // first attempt keeps its blank answers.
  const data = await dataRows();
  assertEquals(
    data.filter((r) => r.split("|")[2] === "hr_01"),
    FACILITIES.map((f, i) =>
      `${f.id}|R1|hr_01|${f.kind === "partialFirst" ? "" : String(i % 50)}`
    ),
  );
  assertEquals((await getLatestCompleteHfaMappings(db)).success, true);

  afterFirst = { data, sources, extract: await extract("first") };
  assertEquals(
    afterFirst.extract.csv.split("\n").filter((l) => l.startsWith("HF"))
      .length,
    data.length,
  );
});

Deno.test("importing the same round again with the defaults changes nothing m010 reads", async () => {
  const preview = await previewChanges();
  // The kept cells are now the user's, so every change defaults to keep.
  assertEquals(
    preview.changes.flatMap((g) => g.facilities).every((c) =>
      c.defaultDecision === "keep"
    ),
    true,
  );
  const latest = await getLatestCompleteHfaMappings(db);
  assertEquals(
    latest.success ? latest.data?.facilityColumns : undefined,
    mappings([]).facilityColumns,
  );

  const stampBefore = await stamp();
  await importRound(
    decisionsFrom(preview, (_, c) => c.defaultDecision ?? "take"),
  );
  assertEquals(await facilityRows(), registryBefore);
  assertEquals(await adminAreaRows(), areasBefore);
  assertEquals(await stamp(), stampBefore);
  assertEquals(await dataRows(), afterFirst.data);
  assertEquals(await sourceRows(), afterFirst.sources);
  assertEquals(await extract("second"), afterFirst.extract);
});

Deno.test("taking one admin change moves that facility and nothing else", async () => {
  const moved = ofKind("moved")[0];
  const preview = await previewChanges();
  const stampBefore = await stamp();
  await importRound(
    decisionsFrom(
      preview,
      (group, c) =>
        group.column === "admin" && c.facilityId === moved.id
          ? "take"
          : c.defaultDecision ?? "take",
    ),
  );

  const registryAfter = await facilityRows();
  assertEquals(changedIds(registryBefore, registryAfter), [moved.id]);
  const row = registryAfter.find((r) => r.facility_id === moved.id);
  assertEquals(
    [row?.admin_area_3, row?.admin_area_4],
    [
      districtName(neighbour(moved.district)),
      districtName(neighbour(moved.district)),
    ],
  );
  // Both districts keep other facilities, so no admin area comes or goes.
  assertEquals(await adminAreaRows(), areasBefore);
  assertEquals((await stamp()) !== stampBefore, true);
  assertEquals(await dataRows(), afterFirst.data);

  const now = await extract("third");
  const before = new Set(afterFirst.extract.csv.split("\n"));
  const linesChanged = now.csv.split("\n").filter((l) => !before.has(l));
  assertEquals(linesChanged.length > 0, true);
  assertEquals(linesChanged.every((l) => l.startsWith(`${moved.id},`)), true);
  assertEquals(
    now.facilities
      .filter((f, i) =>
        JSON.stringify(f) !== JSON.stringify(afterFirst.extract.facilities[i])
      )
      .map((f) => f.facility_id),
    [moved.id],
  );
});

Deno.test("the round's weights import after its data, skipping the sampling frame's facilities the data lacks", async () => {
  const notInSample = FACILITIES.filter((_, i) => i % 23 === 0);
  const frameOnly = Array.from(
    { length: 15 },
    (_, i) => `FRAME${String(i + 1).padStart(2, "0")}`,
  );
  Deno.writeTextFileSync(
    WEIGHTS_PATH,
    [
      "id_fac_txt,wgt,stratum",
      ...FACILITIES.map((f, i) =>
        `${f.id},${i % 23 === 0 ? "" : (1 + (i % 9) / 10).toFixed(1)},${
          PROVINCES[provinceOf(f.district)]
        }`
      ),
      ...frameOnly.map((id) => `${id},2.0,Gaza`),
    ].join("\n"),
  );
  const res = await importHfaFacilityWeights(
    db,
    WEIGHTS_NAME,
    encodeRawCsvHeader(0, "id_fac_txt"),
    encodeRawCsvHeader(1, "wgt"),
    encodeRawCsvHeader(2, "stratum"),
    "R1",
  );
  assertEquals(res.success, true);
  if (!res.success) {
    return;
  }
  assertEquals(res.data.rowsImported, N_FACILITIES - notInSample.length);
  assertEquals(res.data.rowsSkippedNoWeight, notInSample.length);
  assertEquals(res.data.facilitiesNotInRegistry, {
    count: frameOnly.length,
    sample: frameOnly.slice(0, 10),
  });
  const [{ n }] = await db<{ n: number }[]>`
    SELECT count(*)::int AS n FROM hfa_facility_weights WHERE time_point = 'R1'
  `;
  assertEquals(n, N_FACILITIES - notInSample.length);
});

Deno.test("cleanup: drop the throwaway database, the assets and the extracts", async () => {
  for (const path of [CSV_PATH, XLSFORM_PATH, WEIGHTS_PATH]) {
    await Deno.remove(path).catch(() => {});
  }
  await Deno.remove(join(_RUNS_DIR_PATH, EXTRACT_DIR), { recursive: true })
    .catch(() => {});
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
