// The definition hash is the token in every cache key and figure stamp, so it
// must not move with anything that does not change what a scope filters. The
// schema beside it refuses the one shape that would say "nothing" twice: an
// empty list, where `include: false` is the way to drop a family.
//
//   deno test -A --env-file server/tests/scope_definition_hash_test.ts

import { assertEquals, assertNotEquals } from "@std/assert";
import { createHash } from "node:crypto";
import {
  ALL_DATA_DEFINITION_HASH,
  ALL_DATA_SCOPE_DEFINITION,
  ALL_DATA_SCOPE_ID,
  geographyOnlyScopeDefinition,
  type ScopeDefinition,
  scopeDefinitionHash,
  scopeDefinitionSchema,
  scopeIdSchema,
} from "lib";

const FULL = {
  hmis: {
    include: true,
    modules: ["m001", "m002"],
    indicators: ["anc1", "penta3"],
    adminArea2: "Kano",
    years: { start: 2020, end: 2022 },
  },
  hfa: {
    include: true,
    modules: ["m007"],
    indicators: ["water"],
    adminArea2: "Kano State",
    timePoints: ["r1", "r2"],
  },
  iceh: {
    include: true,
    modules: null,
    indicators: ["cov_a"],
    years: { start: 2015, end: 2019 },
  },
} as const satisfies ScopeDefinition;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

Deno.test("hash: the hashed form keeps `include` and only the limited parts", () => {
  assertEquals(
    ALL_DATA_DEFINITION_HASH,
    sha256(
      '{"hfa":{"include":true},"hmis":{"include":true},"iceh":{"include":true}}',
    ),
  );
  assertEquals(
    scopeDefinitionHash(geographyOnlyScopeDefinition("Kano")),
    sha256(
      '{"hfa":{"adminArea2":"KANO","include":true},"hmis":{"adminArea2":"KANO","include":true},"iceh":{"include":true}}',
    ),
  );
  assertEquals(
    scopeDefinitionHash({
      ...ALL_DATA_SCOPE_DEFINITION,
      hfa: { include: false },
      iceh: { ...FULL.iceh, indicators: null },
    }),
    sha256(
      '{"hfa":{"include":false},"hmis":{"include":true},"iceh":{"include":true,"years":{"end":2019,"start":2015}}}',
    ),
  );
});

Deno.test("hash: stable across key order", () => {
  const reordered: ScopeDefinition = {
    iceh: {
      years: { end: 2019, start: 2015 },
      indicators: ["cov_a"],
      modules: null,
      include: true,
    },
    hfa: {
      timePoints: ["r1", "r2"],
      adminArea2: "Kano State",
      indicators: ["water"],
      modules: ["m007"],
      include: true,
    },
    hmis: {
      years: { end: 2022, start: 2020 },
      adminArea2: "Kano",
      indicators: ["anc1", "penta3"],
      modules: ["m001", "m002"],
      include: true,
    },
  };
  assertEquals(scopeDefinitionHash(reordered), scopeDefinitionHash(FULL));
});

Deno.test("hash: stable across list order and duplicates", () => {
  const shuffled: ScopeDefinition = {
    ...FULL,
    hmis: {
      ...FULL.hmis,
      modules: ["m002", "m001"],
      indicators: ["penta3", "anc1", "anc1"],
    },
    hfa: { ...FULL.hfa, timePoints: ["r2", "r1", "r2"] },
  };
  assertEquals(scopeDefinitionHash(shuffled), scopeDefinitionHash(FULL));
});

Deno.test("hash: stable across area case", () => {
  assertEquals(
    scopeDefinitionHash({
      ...FULL,
      hmis: { ...FULL.hmis, adminArea2: "kANO" },
      hfa: { ...FULL.hfa, adminArea2: "kano STATE" },
    }),
    scopeDefinitionHash(FULL),
  );
});

Deno.test("hash: an extra unlimited key changes nothing", () => {
  const widened = {
    ...FULL,
    hmis: { ...FULL.hmis, facilityTypes: null },
    iceh: { ...FULL.iceh, strats: null },
  } as ScopeDefinition;
  assertEquals(scopeDefinitionHash(widened), scopeDefinitionHash(FULL));
});

Deno.test("hash: each section and each dimension moves it", () => {
  const variants: ScopeDefinition[] = [
    { ...FULL, hmis: { include: false } },
    { ...FULL, hfa: { include: false } },
    { ...FULL, iceh: { include: false } },
    { ...FULL, hmis: { ...FULL.hmis, adminArea2: "Lagos" } },
    { ...FULL, hmis: { ...FULL.hmis, adminArea2: null } },
    { ...FULL, hfa: { ...FULL.hfa, adminArea2: "Kano" } },
    { ...FULL, hmis: { ...FULL.hmis, years: { start: 2020, end: 2023 } } },
    { ...FULL, iceh: { ...FULL.iceh, years: { start: 2020, end: 2022 } } },
    { ...FULL, hfa: { ...FULL.hfa, timePoints: ["r1"] } },
    { ...FULL, hmis: { ...FULL.hmis, modules: ["m001"] } },
    { ...FULL, hfa: { ...FULL.hfa, modules: null } },
    { ...FULL, hmis: { ...FULL.hmis, indicators: ["anc1"] } },
    { ...FULL, hfa: { ...FULL.hfa, indicators: ["power"] } },
    { ...FULL, iceh: { ...FULL.iceh, indicators: ["cov_b"] } },
  ];
  const hashes = new Set(variants.map(scopeDefinitionHash));
  hashes.add(scopeDefinitionHash(FULL));
  assertEquals(hashes.size, variants.length + 1);
});

Deno.test("hash: one list moved between sections moves it", () => {
  assertNotEquals(
    scopeDefinitionHash({
      ...ALL_DATA_SCOPE_DEFINITION,
      hmis: { ...ALL_DATA_SCOPE_DEFINITION.hmis, indicators: ["x"] },
    } as ScopeDefinition),
    scopeDefinitionHash({
      ...ALL_DATA_SCOPE_DEFINITION,
      hfa: { ...ALL_DATA_SCOPE_DEFINITION.hfa, indicators: ["x"] },
    } as ScopeDefinition),
  );
});

Deno.test("hash: the digest is SHA-256 beyond one block", () => {
  const indicators = Array.from({ length: 400 }, (_, i) => `indicator_é_${i}`);
  const long: ScopeDefinition = {
    ...ALL_DATA_SCOPE_DEFINITION,
    hmis: {
      ...FULL.hmis,
      modules: null,
      adminArea2: null,
      years: null,
      indicators,
    },
  };
  const canonical = JSON.stringify({
    hfa: { include: true },
    hmis: { include: true, indicators: indicators.toSorted() },
    iceh: { include: true },
  });
  assertEquals(scopeDefinitionHash(long), sha256(canonical));
});

Deno.test("schema: the full definition and All data parse", () => {
  assertEquals(scopeDefinitionSchema.safeParse(FULL).success, true);
  assertEquals(
    scopeDefinitionSchema.safeParse(ALL_DATA_SCOPE_DEFINITION).success,
    true,
  );
});

Deno.test("schema: an empty list is refused in every list of every section", () => {
  const withEmpty: unknown[] = [
    { ...FULL, hmis: { ...FULL.hmis, modules: [] } },
    { ...FULL, hmis: { ...FULL.hmis, indicators: [] } },
    { ...FULL, hfa: { ...FULL.hfa, modules: [] } },
    { ...FULL, hfa: { ...FULL.hfa, indicators: [] } },
    { ...FULL, hfa: { ...FULL.hfa, timePoints: [] } },
    { ...FULL, iceh: { ...FULL.iceh, modules: [] } },
    { ...FULL, iceh: { ...FULL.iceh, indicators: [] } },
  ];
  for (const definition of withEmpty) {
    assertEquals(scopeDefinitionSchema.safeParse(definition).success, false);
  }
});

Deno.test("schema: a section holds only its own family's dimensions", () => {
  const misplaced: unknown[] = [
    { ...FULL, hmis: { ...FULL.hmis, timePoints: ["r1"] } },
    { ...FULL, hfa: { ...FULL.hfa, years: { start: 2020, end: 2021 } } },
    { ...FULL, iceh: { ...FULL.iceh, adminArea2: "Kano" } },
    { ...FULL, hmis: { include: false, adminArea2: "Kano" } },
    { hmis: FULL.hmis, hfa: FULL.hfa },
    { ...FULL, hmis: { ...FULL.hmis, years: { start: 2022, end: 2020 } } },
    { ...FULL, iceh: { ...FULL.iceh, years: { start: 999, end: 2020 } } },
    { ...FULL, hmis: { ...FULL.hmis, adminArea2: "" } },
  ];
  for (const definition of misplaced) {
    assertEquals(scopeDefinitionSchema.safeParse(definition).success, false);
  }
});

Deno.test("schema: a scope id is the reserved id or a UUID, never null", () => {
  assertEquals(scopeIdSchema.safeParse(ALL_DATA_SCOPE_ID).success, true);
  assertEquals(
    scopeIdSchema.safeParse("00000000-0000-4000-8000-00000000000a").success,
    true,
  );
  for (const bad of [null, undefined, "", "all data", "ALL-DATA", "x"]) {
    assertEquals(scopeIdSchema.safeParse(bad).success, false);
  }
});
