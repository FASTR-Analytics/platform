// Pins the HFA registry writer, whose contract is SYSTEM_05 "HFA registry
// writes", and the kept-row facility scan that feeds it. Runs against a
// throwaway database built from _main_database.sql on the dev postgres (the
// .env the test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/hfa_facility_changes_test.ts

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  encodeHfaAdminTuple,
  encodeRawCsvHeader,
  findFirstEncodedCsvHeaderWithValues,
  HFA_CORE_FACILITY_ID_COLUMNS,
  hfaCorrectionColumnName,
  type HfaFacilityChangeGroupDecision,
  type HfaFacilityColumns,
  type StructureSchema,
} from "lib";
import { utils, write } from "xlsx/xlsx.mjs";
import { hfaFacilityColumnsSchema } from "../../lib/api-routes/instance/datasets.ts";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  countUnreferencedHfaFacilities,
  defaultHfaChangeDecision,
  editHfaFacility,
  findOrphanedHfaScopeAreas,
  finishHfaRegistryWrite,
  getHfaRegistryAdminAreaNames,
  previewHfaFacilityChanges,
  removeUnreferencedHfaFacilities,
  writeHfaFacilitiesFromImport,
} from "../db/instance/hfa_facilities.ts";
import {
  type HfaFileFacility,
  resolveHfaKeptRows,
  scanHfaFileFacilities,
  scanHfaHeadersWithValues,
  summarizeHfaFacilityColumns,
} from "../server_only_funcs_csvs/scan_hfa_rows.ts";
import { parseXlsForm } from "../server_only_funcs_csvs/parse_xlsform.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url)
    .pathname;
const DB_PREFIX = "hfa_facility_changes_test_";

const admin = getPgConnection("postgres", { max: 1 });
for (
  const { datname } of await admin<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname LIKE ${DB_PREFIX + "%"}
  `
) {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${datname} WITH (FORCE)`);
}
const dbName = `${DB_PREFIX}${Date.now()}`;
await admin.unsafe(`CREATE DATABASE ${dbName}`);
const db = getPgConnection(dbName, { max: 2 });
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
  VALUES ('R1', '202301', 1), ('R2', '202401', 2), ('R3', '202501', 3)
`;

const SL = "Sierra Leone";
const COLUMNS: HfaFacilityColumns = {
  adminArea1: { value: SL },
  adminAreas: [
    { level: 2, header: "Col 2: region" },
    { level: 3, header: "Col 3: district" },
  ],
  optional: { facility_type: { header: "Col 4: type" } },
};

type Seed = {
  id: string;
  admin: [string, string, string];
  type: string | null;
  ownership?: string;
};

// F2 is the only facility in Tonkolili, so moving it empties that district.
const REGISTRY: Seed[] = [
  { id: "F1", admin: [SL, "North", "Bombali"], type: "Hospital" },
  { id: "F2", admin: [SL, "North", "Tonkolili"], type: "Clinic" },
  { id: "F3", admin: [SL, "East", "Kenema"], type: "Clinic" },
  { id: "F4", admin: [SL, "East", "Kenema"], type: "CHC", ownership: "Public" },
];

async function resetRegistry(seeds: Seed[] = REGISTRY) {
  await db`DELETE FROM hfa_data`;
  await db`DELETE FROM hfa_variables`;
  await db`DELETE FROM hfa_facility_weights`;
  await db`DELETE FROM facilities_hfa`;
  for (let level = 4; level >= 1; level--) {
    await db`DELETE FROM ${db(`admin_areas_hfa_${level}`)}`;
  }
  await db`DELETE FROM instance_config WHERE config_key = 'structure_last_updated'`;
  await db`DELETE FROM scopes WHERE id <> 'all-data'`;
  await db`DELETE FROM geojson_maps`;
  for (const s of seeds) {
    const [a1, a2, a3] = s.admin;
    await db`INSERT INTO admin_areas_hfa_1 VALUES (${a1}) ON CONFLICT DO NOTHING`;
    await db`INSERT INTO admin_areas_hfa_2 (admin_area_2, admin_area_1) VALUES (${a2}, ${a1}) ON CONFLICT DO NOTHING`;
    await db`INSERT INTO admin_areas_hfa_3 (admin_area_3, admin_area_2, admin_area_1) VALUES (${a3}, ${a2}, ${a1}) ON CONFLICT DO NOTHING`;
    await db`INSERT INTO admin_areas_hfa_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) VALUES (${a3}, ${a3}, ${a2}, ${a1}) ON CONFLICT DO NOTHING`;
    await db`
      INSERT INTO facilities_hfa (facility_id, admin_area_1, admin_area_2, admin_area_3, admin_area_4, facility_type, facility_ownership)
      VALUES (${s.id}, ${a1}, ${a2}, ${a3}, ${a3}, ${s.type}, ${
      s.ownership ?? null
    })
    `;
  }
  // F1's type is the user's, F2's came from a round newer than the imported
  // one and F3's from an older one. No admin tuple has a source.
  await db`
    INSERT INTO hfa_facility_sources (facility_id, column_group, kind, time_point)
    VALUES ('F1', 'facility_type', 'user', NULL),
      ('F2', 'facility_type', 'round', 'R3'),
      ('F3', 'facility_type', 'round', 'R1')
  `;
}

function fileFacility(
  id: string,
  admin: string[],
  type: string,
): HfaFileFacility {
  return {
    facilityId: id,
    rowNumber: 1,
    admin,
    optional: { facility_type: type },
    context: {},
  };
}

// F1 re-typed, F2 moved and re-typed, F3 re-typed, F5 new, F6 new with no
// district. F4 is absent from the file.
const FILE: HfaFileFacility[] = [
  fileFacility("F1", [SL, "North", "Bombali"], "Clinic"),
  fileFacility("F2", [SL, "North", "Karene"], "Hospital"),
  fileFacility("F3", [SL, "East", "Kenema"], "Hospital"),
  fileFacility("F5", [SL, "South", "Bo"], "Hospital"),
  fileFacility("F6", [SL, "South", ""], "Clinic"),
];

const F2_FROM = encodeHfaAdminTuple([SL, "North", "Tonkolili"]);
const F2_TO = encodeHfaAdminTuple([SL, "North", "Karene"]);

function decision(
  column: HfaFacilityChangeGroupDecision["column"],
  from: string,
  to: string,
  facilityIds: string[],
  d: "keep" | "take",
  exceptions: string[] = [],
): HfaFacilityChangeGroupDecision {
  return { column, from, to, facilityIds, decision: d, exceptions };
}

const TAKE_ALL: HfaFacilityChangeGroupDecision[] = [
  decision("admin", F2_FROM, F2_TO, ["F2"], "take"),
  decision("facility_type", "Clinic", "Hospital", ["F2", "F3"], "take", [
    "F2",
  ]),
  decision("facility_type", "Hospital", "Clinic", ["F1"], "take"),
];

const KEEP_ALL: HfaFacilityChangeGroupDecision[] = [
  decision("admin", F2_FROM, F2_TO, ["F2"], "keep"),
  decision("facility_type", "Clinic", "Hospital", ["F2", "F3"], "keep"),
  decision("facility_type", "Hospital", "Clinic", ["F1"], "keep"),
];

async function registry() {
  return [
    ...await db`
    SELECT facility_id, admin_area_1, admin_area_2, admin_area_3, admin_area_4,
      facility_type, facility_ownership
    FROM facilities_hfa ORDER BY facility_id
  `,
  ];
}

async function sources() {
  return (await db<
    {
      facility_id: string;
      column_group: string;
      kind: string;
      time_point: string | null;
    }[]
  >`
    SELECT facility_id, column_group, kind, time_point
    FROM hfa_facility_sources ORDER BY facility_id, column_group
  `).map((r) =>
    `${r.facility_id} ${r.column_group} ${r.kind}${
      r.time_point ? ` ${r.time_point}` : ""
    }`
  ).toSorted();
}

async function stamp(): Promise<string | undefined> {
  return (await db<{ config_json_value: string }[]>`
    SELECT config_json_value FROM instance_config
    WHERE config_key = 'structure_last_updated'
  `).at(0)?.config_json_value;
}

async function importFile(
  decisions: HfaFacilityChangeGroupDecision[],
  recodes = {},
  file: HfaFileFacility[] = FILE,
) {
  return await db.begin(async (sql) => {
    const result = await writeHfaFacilitiesFromImport(sql, {
      file,
      facilityColumns: COLUMNS,
      timePoint: "R2",
      decisions,
      recodes,
    });
    await finishHfaRegistryWrite(sql, result.registryChanged);
    return result;
  });
}

Deno.test("changes are grouped per column and admin tuple, each facility with its default", async () => {
  await resetRegistry();
  const preview = await previewHfaFacilityChanges(db, {
    file: FILE,
    facilityColumns: COLUMNS,
    schema: SCHEMA,
    timePoint: "R2",
    decisions: [],
  });
  assertEquals(preview.match, { known: 3, new: 2, absent: 1 });
  assertEquals(
    preview.changes.map((g) => ({
      column: g.column,
      from: g.from,
      to: g.to,
      facilities: g.facilities.map((f) =>
        `${f.facilityId} ${f.defaultDecision ?? "none"}`
      ),
    })),
    [
      {
        column: "admin",
        from: F2_FROM,
        to: F2_TO,
        facilities: ["F2 none"],
      },
      {
        column: "facility_type",
        from: "Clinic",
        to: "Hospital",
        facilities: ["F2 keep", "F3 take"],
      },
      {
        column: "facility_type",
        from: "Hospital",
        to: "Clinic",
        facilities: ["F1 keep"],
      },
    ],
  );
  assertEquals(preview.newFacilityIds, ["F5", "F6"]);
  assertEquals(preview.newFacilitiesWithoutAdminTuple, {
    count: 1,
    sample: ["F6"],
  });
  assertEquals(preview.adminPathsIntroduced, [
    encodeHfaAdminTuple([SL, "North", "Karene"]),
    encodeHfaAdminTuple([SL, "South", "Bo"]),
  ]);
  assertEquals(
    preview.adminAreasLost.map((l) => `${l.level} ${l.name}`),
    ["3 Tonkolili"],
  );
});

Deno.test("defaults follow the source: the user's and a newer round's are kept, an older or deleted round's give way, an unknown has none", () => {
  const round = { label: "R2", sortOrder: 2 };
  const orders = new Map([["R1", 1], ["R2", 2], ["R3", 3]]);
  assertEquals(
    defaultHfaChangeDecision({ kind: "user" }, round, orders),
    "keep",
  );
  assertEquals(
    defaultHfaChangeDecision({ kind: "round", timePoint: "R3" }, round, orders),
    "keep",
  );
  assertEquals(
    defaultHfaChangeDecision({ kind: "round", timePoint: "R2" }, round, orders),
    "take",
  );
  assertEquals(
    defaultHfaChangeDecision({ kind: "round", timePoint: "R1" }, round, orders),
    "take",
  );
  assertEquals(
    defaultHfaChangeDecision({ kind: "round", timePoint: null }, round, orders),
    "take",
  );
  assertEquals(defaultHfaChangeDecision(undefined, round, orders), undefined);
});

Deno.test("deleting a round leaves its sources with no time point", async () => {
  await resetRegistry();
  await db`INSERT INTO hfa_time_points (label, period_id, sort_order) VALUES ('R0', '202201', 0)`;
  await db`UPDATE hfa_facility_sources SET time_point = 'R0' WHERE facility_id = 'F3'`;
  await db`DELETE FROM hfa_time_points WHERE label = 'R0'`;
  assertEquals((await sources()).includes("F3 facility_type round"), true);
});

Deno.test("decisions that differ from the recomputed changes refuse the write, naming the facilities", async () => {
  await resetRegistry();
  const before = await registry();
  const err = await assertRejects(() =>
    importFile([
      decision("admin", F2_FROM, F2_TO, ["F2"], "take"),
      decision("facility_type", "Clinic", "Hospital", ["F3", "F9"], "take"),
      decision("facility_type", "Hospital", "Clinic", ["F1"], "take"),
    ])
  );
  const message = err instanceof Error ? err.message : String(err);
  assertStringIncludes(message, "2 facilities: F2, F9");
  assertEquals(await registry(), before);
});

Deno.test("the write places new facilities with their admin areas, pads above the depth, applies the decisions and cleans up", async () => {
  await resetRegistry();
  const result = await importFile(TAKE_ALL);
  assertEquals(result.registryChanged, true);
  assertEquals(result.skippedFacilityIds, ["F6"]);
  assertEquals(result.changeCounts, [
    { column: "admin", changed: 1, kept: 0, taken: 1 },
    { column: "facility_type", changed: 3, kept: 1, taken: 2 },
  ]);
  assertEquals(await registry(), [
    {
      facility_id: "F1",
      admin_area_1: SL,
      admin_area_2: "North",
      admin_area_3: "Bombali",
      admin_area_4: "Bombali",
      facility_type: "Clinic",
      facility_ownership: null,
    },
    {
      facility_id: "F2",
      admin_area_1: SL,
      admin_area_2: "North",
      admin_area_3: "Karene",
      admin_area_4: "Karene",
      facility_type: "Clinic",
      facility_ownership: null,
    },
    {
      facility_id: "F3",
      admin_area_1: SL,
      admin_area_2: "East",
      admin_area_3: "Kenema",
      admin_area_4: "Kenema",
      facility_type: "Hospital",
      facility_ownership: null,
    },
    {
      facility_id: "F4",
      admin_area_1: SL,
      admin_area_2: "East",
      admin_area_3: "Kenema",
      admin_area_4: "Kenema",
      facility_type: "CHC",
      facility_ownership: "Public",
    },
    {
      facility_id: "F5",
      admin_area_1: SL,
      admin_area_2: "South",
      admin_area_3: "Bo",
      admin_area_4: "Bo",
      facility_type: "Hospital",
      facility_ownership: null,
    },
  ]);
  const level3 = (await getHfaRegistryAdminAreaNames(db)).get(3)!;
  assertEquals([...level3].toSorted(), ["Bo", "Bombali", "Karene", "Kenema"]);
  assertEquals(await sources(), [
    // Unchanged with no source: the round now vouches for it.
    "F1 admin round R2",
    // Taken against the user's default: the user's.
    "F1 facility_type user",
    // Taken with no default: the round's.
    "F2 admin round R2",
    // Kept, as the newer round's default keeps it: unchanged.
    "F2 facility_type round R3",
    "F3 admin round R2",
    // Taken as the older round's default says: the round's.
    "F3 facility_type round R2",
    "F5 admin round R2",
    "F5 facility_type round R2",
  ]);
  assertEquals((await stamp()) !== undefined, true);
});

Deno.test("mapping columns the schema lacks switches them on, a custom one under its label", async () => {
  await resetRegistry();
  const file = FILE.filter((f) => f.facilityId === "F5").map((f) => ({
    ...f,
    optional: { ...f.optional, facility_custom_2: "Rural" },
  }));
  // Through the launch route's body schema: the label must survive zod.
  const facilityColumns = hfaFacilityColumnsSchema.parse({
    ...COLUMNS,
    optional: {
      ...COLUMNS.optional,
      facility_custom_2: { header: "Col 9: setting", label: "Setting" },
    },
  });
  await db.begin(async (sql) =>
    await writeHfaFacilitiesFromImport(sql, {
      file,
      facilityColumns,
      timePoint: "R2",
      decisions: [],
      recodes: {},
    })
  );
  const stored = JSON.parse(
    (await db<{ config_json_value: string }[]>`
      SELECT config_json_value FROM instance_config
      WHERE config_key = 'structure_schema_hfa'
    `)[0].config_json_value,
  );
  assertEquals(stored, {
    ...SCHEMA,
    includeCustom2: true,
    labelCustom2: "Setting",
  });
  assertEquals(
    (await db<{ v: string }[]>`
      SELECT facility_custom_2 AS v FROM facilities_hfa WHERE facility_id = 'F5'
    `)[0].v,
    "Rural",
  );
  await db`
    UPDATE instance_config SET config_json_value = ${JSON.stringify(SCHEMA)}
    WHERE config_key = 'structure_schema_hfa'
  `;
});

Deno.test("keeping every change leaves the registry and the stamp untouched", async () => {
  await resetRegistry();
  const before = await registry();
  const known = FILE.filter((f) => ["F1", "F2", "F3"].includes(f.facilityId));
  const result = await importFile(KEEP_ALL, {}, known);
  assertEquals(result.registryChanged, false);
  assertEquals(await registry(), before);
  assertEquals(await stamp(), undefined);
  assertEquals(await sources(), [
    "F1 admin round R2",
    "F1 facility_type user",
    // Kept against no default: the user's.
    "F2 admin user",
    "F2 facility_type round R3",
    "F3 admin round R2",
    // Kept against the older round's take: the user's.
    "F3 facility_type user",
  ]);
});

Deno.test("a recode is the user's and names only a cell the import writes", async () => {
  await resetRegistry();
  await importFile(TAKE_ALL, {
    facility_type: { F5: "District hospital", F3: "Referral hospital" },
  });
  const rows = await registry();
  assertEquals(
    rows.filter((r) => ["F3", "F5"].includes(r.facility_id)).map((r) =>
      `${r.facility_id} ${r.facility_type}`
    ),
    ["F3 Referral hospital", "F5 District hospital"],
  );
  const srcs = await sources();
  assertEquals(srcs.includes("F3 facility_type user"), true);
  assertEquals(srcs.includes("F5 facility_type user"), true);

  await resetRegistry();
  const err = await assertRejects(() =>
    importFile(TAKE_ALL, { facility_type: { F2: "Clinic" } })
  );
  assertStringIncludes(
    err instanceof Error ? err.message : String(err),
    "does not write: F2",
  );
});

Deno.test("removing unreferenced facilities spares those with data or weights", async () => {
  await resetRegistry();
  await db`
    INSERT INTO hfa_variables (time_point, variable_id, variable_label, variable_type)
    VALUES ('R1', 'v1', 'V1', 'integer')
  `;
  await db`INSERT INTO hfa_data VALUES ('F1', 'R1', 'v1', '1')`;
  await db`INSERT INTO hfa_facility_weights (facility_id, time_point, weight) VALUES ('F2', 'R1', 2)`;
  assertEquals(await countUnreferencedHfaFacilities(db), 2);
  const removed = await db.begin((sql) => removeUnreferencedHfaFacilities(sql));
  assertEquals(removed, 2);
  assertEquals((await registry()).map((r) => r.facility_id), ["F1", "F2"]);
  const level2 = (await getHfaRegistryAdminAreaNames(db)).get(2)!;
  assertEquals([...level2], ["North"]);
  assertEquals((await stamp()) !== undefined, true);

  await db`DELETE FROM instance_config WHERE config_key = 'structure_last_updated'`;
  assertEquals(
    await db.begin((sql) => removeUnreferencedHfaFacilities(sql)),
    0,
  );
  assertEquals(await stamp(), undefined);
});

Deno.test("an edit makes each changed column group the user's", async () => {
  await resetRegistry();
  const unchanged = await db.begin((sql) =>
    editHfaFacility(sql, {
      facilityId: "F3",
      admin: [SL, "East", "Kenema"],
      optional: { facility_type: "Clinic" },
    })
  );
  assertEquals(unchanged.changed, false);
  assertEquals(await stamp(), undefined);

  const edited = await db.begin((sql) =>
    editHfaFacility(sql, {
      facilityId: "F2",
      admin: [SL, " East ", "Kailahun"],
      optional: { facility_ownership: "Private" },
    })
  );
  assertEquals(edited.changed, true);
  const f2 = (await registry()).find((r) => r.facility_id === "F2")!;
  assertEquals(
    [f2.admin_area_2, f2.admin_area_3, f2.admin_area_4, f2.facility_ownership],
    ["East", "Kailahun", "Kailahun", "Private"],
  );
  const srcs = await sources();
  assertEquals(srcs.includes("F2 admin user"), true);
  assertEquals(srcs.includes("F2 facility_ownership user"), true);
  assertEquals(srcs.includes("F2 facility_type round R3"), true);
  const level3 = (await getHfaRegistryAdminAreaNames(db)).get(3)!;
  assertEquals(level3.has("Tonkolili"), false);

  await assertRejects(() =>
    db.begin((sql) =>
      editHfaFacility(sql, { facilityId: "F2", admin: [SL, "East", ""] })
    )
  );
});

Deno.test("an area the decisions empty is reported with the scopes and the map that name it", async () => {
  await resetRegistry();
  const scopeId = crypto.randomUUID();
  await db`
    INSERT INTO scopes (id, label, definition, created_at, last_updated)
    VALUES (${scopeId}, 'East only', ${
    JSON.stringify({
      hmis: { include: false },
      hfa: {
        include: true,
        modules: null,
        indicators: null,
        adminArea2: "east",
        timePoints: null,
        categories: null,
        serviceCategories: null,
      },
      iceh: { include: false },
    })
  }, '2026-10-15', '2026-10-15')
  `;
  await db`
    INSERT INTO geojson_maps (facility_family, admin_area_level, geojson)
    VALUES ('hfa', 2, ${
    JSON.stringify({
      type: "FeatureCollection",
      features: [{ properties: { area_id: "East" } }],
    })
  })
  `;
  const move = (id: string) =>
    fileFacility(id, [SL, "West", "Freetown"], "Clinic");
  const file = [move("F3"), move("F4")];
  const tuple = (d: string) => encodeHfaAdminTuple([SL, "East", d]);
  const west = encodeHfaAdminTuple([SL, "West", "Freetown"]);
  const preview = await previewHfaFacilityChanges(db, {
    file,
    facilityColumns: COLUMNS,
    schema: SCHEMA,
    timePoint: "R2",
    decisions: [decision("admin", tuple("Kenema"), west, ["F3", "F4"], "take")],
  });
  assertEquals(
    preview.adminAreasLost.map((l) =>
      `${l.level} ${l.name} [${l.scopeLabels.join(",")}] ${l.inGeojsonMap}`
    ),
    ["2 East [East only] true", "3 Kenema [] false"],
  );
  const kept = await previewHfaFacilityChanges(db, {
    file,
    facilityColumns: COLUMNS,
    schema: SCHEMA,
    timePoint: "R2",
    decisions: [
      decision("admin", tuple("Kenema"), west, ["F3", "F4"], "take", ["F4"]),
    ],
  });
  assertEquals(kept.adminAreasLost, []);

  assertEquals(await findOrphanedHfaScopeAreas(db), []);
  await importFile(
    [
      decision("admin", tuple("Kenema"), west, ["F3", "F4"], "take"),
      decision("facility_type", "CHC", "Clinic", ["F4"], "keep"),
    ],
    {},
    file,
  );
  assertEquals(await findOrphanedHfaScopeAreas(db), [
    { scopeId, scopeLabel: "East only", adminArea2: "east" },
  ]);
});

// ============================================================================
// The kept-row scan
// ============================================================================

const tempPaths: string[] = [];

async function tempFile(suffix: string, contents: Uint8Array | string) {
  const path = await Deno.makeTempFile({ suffix });
  tempPaths.push(path);
  if (typeof contents === "string") {
    await Deno.writeTextFile(path, contents);
  } else {
    await Deno.writeFile(path, contents);
  }
  return path;
}

const workbook = utils.book_new();
utils.book_append_sheet(
  workbook,
  utils.aoa_to_sheet([
    ["type", "name", "label"],
    ["text", "id_fac_txt", "Facility id"],
    ["select_one fac", "id_fac", "Facility"],
    ["select_one region", "id_admin1_name", "Region"],
    ["select_one region", "id_admin1_corrected", "Region, corrected"],
    ["select_one ftype", "id_fac_type", "Type"],
    ["integer", "hr_01", "Staff"],
  ]),
  "survey",
);
utils.book_append_sheet(
  workbook,
  utils.aoa_to_sheet([
    ["list_name", "name", "label"],
    ["fac", "F1", "Facility one"],
    ["region", "1", "North"],
    ["region", "2", "East"],
    ["ftype", "1", "Hospital"],
    ["ftype", "2", "Clinic"],
  ]),
  "choices",
);
const xlsFormPath = await tempFile(
  ".xlsx",
  new Uint8Array(write(workbook, { type: "array", bookType: "xlsx" })),
);

const SCAN_LINES = [
  "id_fac_txt,id_fac,id_admin1_name,id_admin1_corrected,id_fac_type,hr_01",
  ",F1,1,,2,4",
  ",F2,1,2,9,5",
  ",F2,2,,1,6",
  ",F3,,,1,7",
];

Deno.test("the kept row's facility values: level 1 fixed, a filled correction wins, codes resolve and unknown codes stay raw", async () => {
  const csvPath = await tempFile(".csv", SCAN_LINES.join("\n") + "\n");
  const headers = SCAN_LINES[0].split(",");
  const enc = (name: string) => encodeRawCsvHeader(headers.indexOf(name), name);
  const facilityColumns: HfaFacilityColumns = {
    adminArea1: { value: ` ${SL} ` },
    adminAreas: [{
      level: 2,
      header: enc("id_admin1_name"),
      correctionHeader: enc("id_admin1_corrected"),
    }],
    optional: { facility_type: { header: enc("id_fac_type") } },
  };
  const scan = await scanHfaFileFacilities({
    csvFilePath: csvPath,
    mappings: {
      facilityIdColumn: enc("id_fac"),
      rowFilters: [],
      dedupStrategy: "first",
      dedupOverrides: [{ facilityId: "F2", keepRow: 2 }],
    },
    facilityColumns,
    adminDepth: 2,
    xlsForm: parseXlsForm(xlsFormPath),
    contextHeaders: [enc("hr_01")],
  });
  assertEquals(
    scan.facilities.map((f) => [
      f.facilityId,
      f.rowNumber,
      f.admin.join("/"),
      f.optional.facility_type,
      f.context[enc("hr_01")],
    ]),
    [
      ["F1", 1, `${SL}/North`, "Clinic", "4"],
      ["F2", 2, `${SL}/East`, "9", "5"],
      ["F3", 4, `${SL}/`, "Hospital", "7"],
    ],
  );
  assertEquals(scan.labelResolution, [
    {
      column: "admin_area_2",
      resolvedCount: 2,
      unresolvedCount: 0,
      unresolvedValues: [],
    },
    {
      column: "facility_type",
      resolvedCount: 2,
      unresolvedCount: 1,
      unresolvedValues: ["9"],
    },
  ]);
  const preview = summarizeHfaFacilityColumns({
    scan,
    facilityColumns,
    registryAdminNames: new Map([[2, new Set(["North"])]]),
  });
  assertEquals(preview.columns[0], {
    column: "admin_area_2",
    nBlank: 1,
    nDistinct: 2,
    topValues: [{ value: "East", count: 1 }, { value: "North", count: 1 }],
    nUnresolved: 0,
    unresolvedSample: [],
    valuesNotInRegistry: ["East"],
  });
  assertEquals(preview.columns[1].nUnresolved, 1);
});

Deno.test("the facility id defaults to the first core column that holds a value", async () => {
  const csvPath = await tempFile(".csv", SCAN_LINES.join("\n") + "\n");
  const headers = SCAN_LINES[0].split(",");
  const withValues = await scanHfaHeadersWithValues(csvPath);
  assertEquals(withValues.includes(encodeRawCsvHeader(0, "id_fac_txt")), false);
  assertEquals(
    findFirstEncodedCsvHeaderWithValues(
      headers,
      HFA_CORE_FACILITY_ID_COLUMNS,
      withValues,
    ),
    encodeRawCsvHeader(1, "id_fac"),
  );
  assertEquals(
    hfaCorrectionColumnName("id_admin1_name"),
    "id_admin1_corrected",
  );
  assertEquals(hfaCorrectionColumnName("id_fac_txt"), "id_fac_corrected");
  assertEquals(hfaCorrectionColumnName("id_fac_type"), "id_fac_type_corrected");
});

Deno.test("a stale duplicate override fails loudly", () => {
  const rows = new Map([["F1", [1]], ["F2", [2, 3]]]);
  assertEquals(
    [...resolveHfaKeptRows(rows, "last", [])],
    [["F1", 1], ["F2", 3]],
  );
  let message = "";
  try {
    resolveHfaKeptRows(rows, "first", [{ facilityId: "F1", keepRow: 1 }]);
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  assertStringIncludes(message, 'override for facility "F1"');
});

Deno.test("cleanup: drop the throwaway database and temp files", async () => {
  for (const path of tempPaths) {
    await Deno.remove(path).catch(() => {});
  }
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
