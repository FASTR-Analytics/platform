#!/usr/bin/env -S deno run --allow-read --allow-run
// SQL json lint: stored JSON is a `text` column, read and written as text and
// parsed in TypeScript. No tracked source file, SQL file or script may use
// the SQL json or jsonb types: a column type, a cast, or a json_* / jsonb_*
// function, in any case.
//
// Run: deno task lint:sql-json

// An existing migration is not edited, so the ones that used json or jsonb
// before this rule keep them. Nothing is ever added to this list: a new
// migration that has to reshape stored JSON is a .ts migration.
const EXISTING_MIGRATIONS = new Set(
  [
    "027_share_tokens_text.sql",
    "053_hfa_indicator_service_categories_multi.sql",
    "064_schedule_recurrence.sql",
    "076_structure_family_split.sql",
    "079_common_indicator_types.sql",
    "084_population_reserved_words.sql",
    "086_indicators_one_table.sql",
    "087_indicator_data_key.sql",
    "088_indicator_direction_target_low_counts.sql",
    "093_hfa_variable_id.sql",
    "204_scopes.sql",
    "206_scopes_hfa_categories.sql",
  ].map((name) => `server/db/migrations/instance/${name}`),
);
const SELF = "lint_sql_json.ts";

const SCANNED_EXTENSION = /\.(tsx?|jsx?|mjs|sql|sh)$/;
// The extensionless executables at the repo root (validate_*, deploy, ...).
const ROOT_SCRIPT = /^[^/.]+$/;

// `sheet_to_json(` and `readJsonBody` are not hits: each pattern needs a word
// start, and `_` is a word character.
const CAST = /::\s*jsonb?\b/i;
const FUNCTION = /\b(jsonb?_[a-z_]+|to_jsonb?|row_to_json|array_to_json)\s*\(/i;
const JSONB_WORD = /\bjsonb\b/i;
// In a .sql file every statement is SQL, so the bare word outside a comment
// is a column type.
const JSON_WORD = /\bjsonb?\b/i;

type Hit = { file: string; line: number; text: string };

async function trackedFiles(): Promise<string[]> {
  const out = await new Deno.Command("git", {
    args: ["ls-files", "--", ":!panther", ":!vendor"],
    stdout: "piped",
  }).output();
  return new TextDecoder()
    .decode(out.stdout)
    .split("\n")
    .filter((f) =>
      (SCANNED_EXTENSION.test(f) || ROOT_SCRIPT.test(f)) &&
      !EXISTING_MIGRATIONS.has(f) && f !== SELF
    );
}

function isHit(file: string, line: string): boolean {
  if (CAST.test(line) || FUNCTION.test(line) || JSONB_WORD.test(line)) {
    return true;
  }
  return file.endsWith(".sql") && JSON_WORD.test(line.replace(/--.*$/, ""));
}

function scan(file: string, text: string): Hit[] {
  return text.split("\n").flatMap((line, i) =>
    isHit(file, line) ? [{ file, line: i + 1, text: line.trim() }] : []
  );
}

const hits: Hit[] = [];
for (const file of await trackedFiles()) {
  hits.push(...scan(file, await Deno.readTextFile(file)));
}

if (hits.length > 0) {
  for (const hit of hits) {
    console.error(`${hit.file}:${hit.line}: ${hit.text}`);
  }
  console.error(`\nFAIL: ${hits.length} use(s) of SQL json or jsonb.`);
  Deno.exit(1);
}
console.log("OK: no SQL json or jsonb.");
