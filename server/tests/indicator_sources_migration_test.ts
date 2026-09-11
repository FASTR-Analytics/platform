// Pins instance migration 086 to the lib it restates (PLAN_A3 rulings 5,
// 10 and 12): the special and reserved word lists it fail-stops and
// generates against are the lib constants, and its NFKD-fold translate
// table maps every precomposed Latin letter in U+00C0..U+017F exactly as
// slugIndicatorId does. ./validate_indicator_sources checks the generated
// ids themselves against generateIndicatorId over a real dump.
//
//   deno test -A --env-file server/tests/indicator_sources_migration_test.ts

import { assert, assertEquals } from "@std/assert";
import { RESERVED_WORDS, slugIndicatorId, SPECIAL_INDICATOR_IDS } from "lib";

const MIGRATION_PATH = new URL(
  "../db/migrations/instance/086_indicator_sources.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(MIGRATION_PATH);

function sqlArrayLiteral(name: string): string[] {
  const match = sql.match(
    new RegExp(`${name} text\\[\\] := ARRAY\\[([\\s\\S]*?)\\];`),
  );
  assert(match, `${name} array not found in 086`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

Deno.test("086: v_special is SPECIAL_INDICATOR_IDS", () => {
  assertEquals(sqlArrayLiteral("v_special"), [...SPECIAL_INDICATOR_IDS]);
});

Deno.test("086: v_reserved is RESERVED_WORDS", () => {
  assertEquals(sqlArrayLiteral("v_reserved"), [...RESERVED_WORDS]);
});

// The SQL slug, emulated step for step: the two-character expansions, the
// one-to-one translate table, lower() (ASCII only here, the locale-free
// floor), the underscore runs, the trim.
function emulateSqlSlug(
  text: string,
  expansions: [string, string][],
  table: Map<string, string>,
): string {
  let s = text;
  for (const [from, to] of expansions) s = s.replaceAll(from, to);
  s = [...s].map((ch) => table.get(ch) ?? ch).join("");
  s = s.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
  return s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

Deno.test("086: the fold of every character in U+00C0..U+017F matches slugIndicatorId", () => {
  const translate = sql.match(
    /translate\(\s*replace[\s\S]*?,\s*'([^']*)',\s*'([^']*)'\s*\)\)/,
  );
  assert(translate, "translate table not found in 086");
  const from = [...translate[1]];
  const to = [...translate[2]];
  assertEquals(from.length, to.length, "translate strings differ in length");
  const table = new Map(from.map((ch, i) => [ch, to[i]]));
  assertEquals(table.size, from.length, "duplicate characters in the table");
  const chainStart = sql.indexOf("replace(replace(replace(replace(replace(p_text,");
  const chainEnd = sql.indexOf("'\u00c0", chainStart);
  assert(chainStart >= 0 && chainEnd > chainStart, "replace chain not found in 086");
  const expansions = [
    ...sql.slice(chainStart, chainEnd).matchAll(/'(.)', '([^']*)'\)/gu),
  ].map((m): [string, string] => [m[1], m[2]]);
  assertEquals(expansions.length, 5, "the two-character expansions");
  for (let cp = 0xc0; cp <= 0x17f; cp++) {
    const ch = String.fromCodePoint(cp);
    const probe = `x${ch}y`;
    assertEquals(
      emulateSqlSlug(probe, expansions, table),
      slugIndicatorId(probe),
      `U+${cp.toString(16)} ${ch}`,
    );
  }
});

Deno.test("086: the slug regexes and cap match lib", () => {
  assert(sql.includes("'[^a-z0-9]+', '_', 'g'"));
  assert(sql.includes("'^_+|_+$', '', 'g'"));
  assert(sql.includes("left(v_stem, 64)"));
  assert(sql.includes("v_stem ~ '^[0-9]'"));
});
