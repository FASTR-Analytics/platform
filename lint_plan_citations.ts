#!/usr/bin/env -S deno run --allow-read --allow-run
// Plan citation lint: code and the standing docs never cite a plan. A plan is
// deleted when its work lands, so a citation into one points at nothing, and
// while the plan is open it makes a ruling the code has moved past read as
// current. A comment that needs a reason states the reason.
//
// Run: deno task lint:plan-citations

// An existing migration is not edited, so the ones that cited a plan before
// this rule keep their citations. Nothing is ever added to this list.
const EXISTING_MIGRATIONS = new Set([
  "server/db/migrations/instance/000_legacy_project_shell.sql",
  "server/db/migrations/instance/044_drop_share_tokens.sql",
  "server/db/migrations/instance/056_dataset_hmis_import_ledger.sql",
  "server/db/migrations/instance/057_dataset_hmis_import_runs.sql",
  "server/db/migrations/instance/058_dataset_hmis_dhis2_scheduling.sql",
  "server/db/migrations/instance/059_scheduled_imports_armed_at.sql",
  "server/db/migrations/instance/060_scheduled_imports_no_pause.sql",
  "server/db/migrations/instance/061_instance_dhis2_credentials.sql",
  "server/db/migrations/instance/062_reset_structure_dhis2_attempts.sql",
  "server/db/migrations/instance/064_schedule_recurrence.sql",
  "server/db/migrations/instance/065_add_runs.sql",
  "server/db/migrations/instance/066_run_generation.sql",
  "server/db/migrations/instance/067_run_generation_attempt_by_user.sql",
  "server/db/migrations/instance/070_hmis_csv_import_runs.sql",
  "server/db/migrations/instance/071_hfa_import_runs.sql",
  "server/db/migrations/instance/072_iceh_import_runs.sql",
  "server/db/migrations/instance/076_structure_family_split.sql",
  "server/db/migrations/instance/079_common_indicator_types.sql",
  "server/db/migrations/instance/080_population_store.sql",
  "server/db/migrations/instance/081_drop_legacy_structure_tables.sql",
  "server/db/migrations/instance/084_population_reserved_words.sql",
  "server/db/migrations/instance/086_indicators_one_table.sql",
  "server/db/migrations/instance/087_indicator_data_key.sql",
  "server/db/migrations/instance/092_hfa_indicator_id.sql",
  "server/db/migrations/instance/093_hfa_variable_id.sql",
  "server/db/migrations/instance/202_drop_project_layer.sql",
  "server/db/migrations/instance/203_report_styles.sql",
  "server/db/migrations/instance/204_scopes.sql",
  "server/db/migrations/instance/205_user_scopes.sql",
  "server/db/migrations/instance/210_product_ownership.sql",
  "server/db/migrations/project/043_hfa_indicator_id.sql",
  "server/db/migrations/project/044_hfa_variable_id.sql",
]);
const SELF = "lint_plan_citations.ts";

const CODE = /\.(tsx?|jsx?|mjs|sql|sh)$/;
// The extensionless executables at the repo root (validate_*, deploy, ...).
const ROOT_SCRIPT = /^[^/.]+$/;
// The standing docs. Plans and work trackers are working files and may name a
// plan.
const STANDING_DOC =
  /(^|\/)(SYSTEMS|SYSTEM_\d+_\w+|PROTOCOL_APP_\w+|CLAUDE|README|USER_GUIDE_\w+)\.md$/;

// Anywhere in a line, strings included: a plan or a review is a working file,
// and a ruling cited in a script's output points into one as surely as a
// comment does.
const ANYWHERE = [
  /\b(PLAN|REVIEW)_[A-Z0-9]/,
  /\brulings? [DR]?\d/i,
  /\b(ruled|decided),? 20\d\d|\bTim's ruling|\(Tim,? 20\d\d/,
  /\bQ-[A-Z]\b/,
  /\breview finding \d/,
  /[(,;] ?[DR]\d{1,2}[a-z]?\)/,
];
// Only in prose. In code, `D01` is an ICEH decile key, and in a doc `§`
// numbers SYSTEMS.md's own sections.
const RULING_ID = /\b[DR]\d{1,2}[a-z]?\b/;
const PLAN_SECTION = /(?<!(SYSTEMS(\.md)?|RFC \d+) )§ ?\d/;

type Hit = { file: string; line: number; text: string };

async function trackedFiles(): Promise<string[]> {
  const out = await new Deno.Command("git", {
    // report-forge/ is a submodule (its own repository, which cites no plan of
    // this one): listed as one extensionless path it would read as a root
    // script.
    args: [
      "ls-files",
      "--",
      ":!panther",
      ":!vendor",
      ":!client/public",
      ":!report-forge",
    ],
    stdout: "piped",
  }).output();
  return new TextDecoder()
    .decode(out.stdout)
    .split("\n")
    .filter((f) =>
      (CODE.test(f) || ROOT_SCRIPT.test(f) || STANDING_DOC.test(f)) &&
      !EXISTING_MIGRATIONS.has(f) && f !== SELF
    );
}

// The comment text of each line. A `//` or `/*` inside a string reads as a
// comment, which can only add hits.
function commentTexts(file: string, lines: string[]): string[] {
  if (file.endsWith(".sh") || ROOT_SCRIPT.test(file)) {
    return lines.map((line) => line.slice(Math.max(line.indexOf("#"), 0)));
  }
  const lineMarker = file.endsWith(".sql") ? "--" : "//";
  let inBlock = false;
  return lines.map((line) => {
    let rest = line;
    let text = "";
    while (rest.length > 0) {
      if (inBlock) {
        const end = rest.indexOf("*/");
        text += end === -1 ? rest : rest.slice(0, end);
        rest = end === -1 ? "" : rest.slice(end + 2);
        inBlock = end === -1;
        continue;
      }
      const lineAt = rest.indexOf(lineMarker);
      const blockAt = rest.indexOf("/*");
      if (lineAt !== -1 && (blockAt === -1 || lineAt < blockAt)) {
        text += rest.slice(lineAt);
        rest = "";
      } else if (blockAt !== -1) {
        rest = rest.slice(blockAt + 2);
        inBlock = true;
      } else {
        rest = "";
      }
    }
    return text;
  });
}

function scan(file: string, text: string): Hit[] {
  const lines = text.split("\n");
  const isDoc = file.endsWith(".md");
  const prose = isDoc ? lines : commentTexts(file, lines);
  return lines.flatMap((line, i) =>
    ANYWHERE.some((re) => re.test(line)) || RULING_ID.test(prose[i]) ||
      (!isDoc && PLAN_SECTION.test(prose[i]))
      ? [{ file, line: i + 1, text: line.trim() }]
      : []
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
  console.error(`\nFAIL: ${hits.length} plan citation(s).`);
  Deno.exit(1);
}
console.log("OK: no plan citations.");
