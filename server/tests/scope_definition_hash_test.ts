// The definition hash is the token in every cache key and figure stamp, so it
// must not move with anything that does not change what a scope filters.
//
//   deno test -A --env-file server/tests/scope_definition_hash_test.ts

import { assertEquals, assertNotEquals } from "@std/assert";
import { createHash } from "node:crypto";
import {
  geographyOnlyScopeDefinition,
  type ScopeDefinition,
  scopeDefinitionHash,
  UNCONSTRAINED_SCOPE_DEFINITION,
  WHOLE_PACKAGE_DEFINITION_HASH,
} from "lib";

const FULL: ScopeDefinition = {
  geography: { adminArea2: "Kano" },
  time: { years: { start: 2020, end: 2022 }, hfaTimePoints: ["r1", "r2"] },
  modules: ["m001", "m002"],
  indicators: { hmis: ["anc1", "penta3"], hfa: ["water"], iceh: null },
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

Deno.test("hash: the hashed form holds only the constrained parts", () => {
  assertEquals(WHOLE_PACKAGE_DEFINITION_HASH, sha256("{}"));
  assertEquals(
    scopeDefinitionHash(geographyOnlyScopeDefinition("Kano")),
    sha256('{"geography":{"adminArea2":"KANO"}}'),
  );
  assertEquals(
    scopeDefinitionHash({
      ...UNCONSTRAINED_SCOPE_DEFINITION,
      time: { years: { start: 2020, end: 2022 }, hfaTimePoints: null },
    }),
    sha256('{"time":{"years":{"end":2022,"start":2020}}}'),
  );
});

Deno.test("hash: stable across key order", () => {
  const reordered = {
    indicators: { iceh: null, hfa: ["water"], hmis: ["anc1", "penta3"] },
    modules: ["m001", "m002"],
    time: { hfaTimePoints: ["r1", "r2"], years: { end: 2022, start: 2020 } },
    geography: { adminArea2: "Kano" },
  };
  assertEquals(scopeDefinitionHash(reordered), scopeDefinitionHash(FULL));
});

Deno.test("hash: stable across list order and duplicates", () => {
  const shuffled: ScopeDefinition = {
    ...FULL,
    time: { ...FULL.time, hfaTimePoints: ["r2", "r1", "r2"] },
    modules: ["m002", "m001"],
    indicators: {
      hmis: ["penta3", "anc1", "anc1"],
      hfa: ["water"],
      iceh: null,
    },
  };
  assertEquals(scopeDefinitionHash(shuffled), scopeDefinitionHash(FULL));
});

Deno.test("hash: stable across area case", () => {
  assertEquals(
    scopeDefinitionHash({ ...FULL, geography: { adminArea2: "kANO" } }),
    scopeDefinitionHash(FULL),
  );
});

Deno.test("hash: an extra unconstrained key changes nothing", () => {
  const widened = {
    ...FULL,
    facilityTypes: null,
    time: { ...FULL.time, quarters: null },
    indicators: { ...FULL.indicators, survey: null },
    ownership: { kinds: null },
  } as ScopeDefinition;
  assertEquals(scopeDefinitionHash(widened), scopeDefinitionHash(FULL));
});

Deno.test("hash: an empty list is a constraint, null is not", () => {
  assertNotEquals(
    scopeDefinitionHash({ ...UNCONSTRAINED_SCOPE_DEFINITION, modules: [] }),
    WHOLE_PACKAGE_DEFINITION_HASH,
  );
});

Deno.test("hash: each dimension moves it", () => {
  const variants: ScopeDefinition[] = [
    { ...FULL, geography: { adminArea2: "Lagos" } },
    { ...FULL, geography: null },
    { ...FULL, time: { ...FULL.time, years: { start: 2020, end: 2023 } } },
    { ...FULL, time: { ...FULL.time, hfaTimePoints: ["r1"] } },
    { ...FULL, modules: ["m001"] },
    { ...FULL, indicators: { ...FULL.indicators, hmis: ["anc1"] } },
    { ...FULL, indicators: { ...FULL.indicators, iceh: ["water"] } },
  ];
  const hashes = new Set(variants.map(scopeDefinitionHash));
  hashes.add(scopeDefinitionHash(FULL));
  assertEquals(hashes.size, variants.length + 1);
});

Deno.test("hash: the digest is SHA-256 beyond one block", () => {
  const long: ScopeDefinition = {
    ...UNCONSTRAINED_SCOPE_DEFINITION,
    indicators: {
      hmis: Array.from({ length: 400 }, (_, i) => `indicator_é_${i}`),
      hfa: null,
      iceh: null,
    },
  };
  const canonical = JSON.stringify({
    indicators: { hmis: long.indicators.hmis!.toSorted() },
  });
  assertEquals(scopeDefinitionHash(long), sha256(canonical));
});
