#!/usr/bin/env -S deno run --allow-read --allow-run
// jsonb lint: stored JSON is a `text` column, read and written as text and
// parsed in TypeScript. No tracked .ts, .tsx or .sql file may name jsonb (a
// column type, a cast, or a jsonb_* function) outside the migration files.
//
// Run: deno task lint:jsonb

const ALLOWED_PREFIX = "server/db/migrations/";
const SELF = "lint_jsonb.ts";

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
      /\.(tsx?|sql)$/.test(f) && !f.startsWith(ALLOWED_PREFIX) && f !== SELF
    );
}

function scan(file: string, text: string): Hit[] {
  return text.split("\n").flatMap((line, i) =>
    line.includes("jsonb") ? [{ file, line: i + 1, text: line.trim() }] : []
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
