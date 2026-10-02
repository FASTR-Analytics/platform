#!/usr/bin/env -S deno run --allow-read --allow-run
// jsonb lint: stored JSON is a `text` column, read and written as text and
// parsed in TypeScript. No tracked source file, SQL file or script may name
// jsonb in any case (a column type, a cast, or a jsonb_* function) outside
// the migration files.
//
// Run: deno task lint:jsonb

const ALLOWED_PREFIX = "server/db/migrations/";
const SELF = "lint_jsonb.ts";

const SCANNED_EXTENSION = /\.(tsx?|jsx?|mjs|sql|sh)$/;
// The extensionless executables at the repo root (validate_*, deploy, ...).
const ROOT_SCRIPT = /^[^/.]+$/;
// A word start, so an identifier such as readJsonBody is not a hit.
const JSONB = /\bjsonb/i;

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
      !f.startsWith(ALLOWED_PREFIX) && f !== SELF
    );
}

function scan(file: string, text: string): Hit[] {
  return text.split("\n").flatMap((line, i) =>
    JSONB.test(line) ? [{ file, line: i + 1, text: line.trim() }] : []
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
  console.error(
    `\nFAIL: ${hits.length} use(s) of jsonb outside ${ALLOWED_PREFIX}.`,
  );
  Deno.exit(1);
}
console.log("OK: no jsonb outside the migration files.");
