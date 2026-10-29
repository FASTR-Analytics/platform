// Pins the geojson wizard's area-name matching (SYSTEM_05 "Geojson
// boundaries"): the normalizer folds what a name carries invisibly or by
// spelling, the auto-mapper proposes a pairing only when the normalized name
// is unambiguous, and the admin-area read reports every leaf name more than
// one area carries. The read runs on a throwaway database built from
// _main_database.sql on the dev postgres (the .env the test task loads),
// dropped afterwards.
//
//   deno test -A --env-file server/tests/geojson_area_match_test.ts

import { assertEquals } from "@std/assert";
import { autoMapAreaNames, normalizeAreaName } from "lib";
import { getPgConnection } from "../db/postgres/connection_manager.ts";
import {
  countDuplicateAdminAreaNames,
  getAdminAreaOptionsForLevel,
} from "../db/instance/geojson_maps.ts";

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "geojson_area_match_test_";

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

const hmisSchema = {
  adminDepth: 3,
  includeNames: false,
  includeTypes: false,
  includeOwnership: false,
  includeCustom1: false,
  includeCustom2: false,
  includeCustom3: false,
  includeCustom4: false,
  includeCustom5: false,
};
await db`
  INSERT INTO instance_config (config_key, config_json_value)
  VALUES ('structure_schema_hmis', ${JSON.stringify(hmisSchema)})
`;
await db`
  INSERT INTO admin_areas_hmis_1 (admin_area_1) VALUES ('North'), ('South')
`;
await db`
  INSERT INTO admin_areas_hmis_2 (admin_area_2, admin_area_1)
  VALUES ('Centre', 'North'), ('Centre', 'South'), ('Lake', 'South')
`;
await db`
  INSERT INTO admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1)
  VALUES ('Port', 'Centre', 'North'), ('Port', 'Lake', 'South'),
    ('Hill', 'Lake', 'South')
`;

Deno.test("an NFD and an NFC spelling of one accented name match", () => {
  const nfc = "Boké".normalize("NFC");
  const nfd = "Boké".normalize("NFD");
  assertEquals(normalizeAreaName(nfc), normalizeAreaName(nfd));
  assertEquals(autoMapAreaNames([nfd], [nfc]).mapping, { [nfd]: nfc });
});

Deno.test("an accented name matches its unaccented spelling", () => {
  assertEquals(autoMapAreaNames(["Boké"], ["Boke"]).mapping, {
    "Boké": "Boke",
  });
});

Deno.test("surrounding and non-breaking spaces are folded", () => {
  assertEquals(
    autoMapAreaNames([" Kindia ", "Labé  Centre"], [
      "Kindia",
      "Labé Centre",
    ]).mapping,
    { " Kindia ": "Kindia", "Labé  Centre": "Labé Centre" },
  );
});

Deno.test("case is folded", () => {
  assertEquals(autoMapAreaNames(["KANKAN"], ["Kankan"]).mapping, {
    KANKAN: "Kankan",
  });
});

Deno.test("Turkish dotless i is left unmatched rather than mismatched", () => {
  assertEquals(autoMapAreaNames(["Sırnak"], ["Sirnak"]), {
    mapping: {},
    unmatched: ["Sırnak"],
  });
});

Deno.test("two areas that differ only by accent are not guessed between", () => {
  assertEquals(autoMapAreaNames(["Boke"], ["Boké", "BOKE"]), {
    mapping: {},
    unmatched: ["Boke"],
  });
  assertEquals(autoMapAreaNames(["Boké"], ["Boké", "BOKE"]).mapping, {
    "Boké": "Boké",
  });
});

Deno.test("level 2 reports a name shared by two level-1 parents", async () => {
  const res = await getAdminAreaOptionsForLevel(db, "hmis", 2);
  assertEquals(res, {
    success: true,
    data: {
      options: [
        { value: "Centre", label: "Centre" },
        { value: "Lake", label: "Lake" },
      ],
      duplicates: [
        { name: "Centre", parentPaths: [["North"], ["South"]] },
      ],
    },
  });
});

Deno.test("level 3 gives one option per name and reports the repeat", async () => {
  const res = await getAdminAreaOptionsForLevel(db, "hmis", 3);
  assertEquals(res, {
    success: true,
    data: {
      options: [
        { value: "Hill", label: "Lake > Hill" },
        { value: "Port", label: "Port" },
      ],
      duplicates: [
        {
          name: "Port",
          parentPaths: [["North", "Centre"], ["South", "Lake"]],
        },
      ],
    },
  });
});

Deno.test("the import summary counts duplicates per level", async () => {
  assertEquals(await countDuplicateAdminAreaNames(db, "hmis"), [
    { adminAreaLevel: 2, duplicateCount: 1 },
    { adminAreaLevel: 3, duplicateCount: 1 },
  ]);
});

Deno.test("levels past the structure's depth are not counted", async () => {
  const depth = async (adminDepth: number) =>
    await db`
      UPDATE instance_config
      SET config_json_value = ${JSON.stringify({ ...hmisSchema, adminDepth })}
      WHERE config_key = 'structure_schema_hmis'
    `;
  await depth(2);
  assertEquals(await countDuplicateAdminAreaNames(db, "hmis"), [
    { adminAreaLevel: 2, duplicateCount: 1 },
  ]);
  await depth(3);
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
