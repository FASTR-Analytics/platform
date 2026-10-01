// Pins the one-shot markdown to FASTR Markdown conversion
// (server/db/migrations/data_transforms/reports.ts, Block 4): the plain
// markdown format is retired, and every report still on it becomes a FASTR
// Markdown report on the `legacy` theme.
//
// The sweep is driven over a stubbed tagged-template `tx`, so the real code
// path runs with no database. What matters is that it flips ONLY the config,
// converts every shape that reads as markdown (including the oldest reports,
// which carry no config at all), leaves the other formats alone, and is
// idempotent: it forces markdown rows past a skip gate they would otherwise
// pass, so a second boot must write nothing.
//
// Needs the instance env vars, because the sweep's figure-block half reads
// them at module scope. Run:
//   deno test -A --env-file server/tests/report_format_conversion_test.ts

import { assert, assertEquals } from "@std/assert";
import { UNCONSTRAINED_SCOPE_DEFINITION } from "lib";
import { migrateReports } from "../db/migrations/data_transforms/reports.ts";

type StubRow = Record<string, unknown>;

function reportRow(id: string, config: string | null, body = "# R\n"): StubRow {
  return {
    id,
    label: id,
    config,
    body,
    figures: "{}",
    images: "{}",
    run_id: "run1",
    scope_definition: JSON.stringify(UNCONSTRAINED_SCOPE_DEFINITION),
  };
}

// The config written per report id, and how many rows were updated.
async function runSweep(rows: StubRow[]) {
  const configs = new Map<string, string>();
  let updates = 0;
  const tx = (strings: TemplateStringsArray, ...args: unknown[]) => {
    const sql = strings.join("?");
    if (/SELECT[\s\S]*FROM reports/.test(sql)) return Promise.resolve(rows);
    if (/UPDATE reports/.test(sql)) {
      updates++;
      configs.set(String(args[3]), String(args[0]));
    }
    return Promise.resolve([]);
  };
  const stats = await migrateReports(tx as never, "SLE");
  return { configs, updates, stats };
}

Deno.test("the markdown sweep converts every markdown shape and nothing else", async () => {
  const { configs, stats } = await runSweep([
    reportRow("explicit", JSON.stringify({ version: 1, format: "markdown" })),
    // The oldest reports: no config row at all.
    reportRow("noConfig", null),
    // A config that predates the format field.
    reportRow("noFormat", JSON.stringify({ version: 1 })),
    // A format that no longer exists reads as markdown, so it converts too.
    reportRow("unknown", JSON.stringify({ version: 1, format: "rtf" })),
    reportRow(
      "html",
      JSON.stringify({ version: 1, format: "html", htmlStyle: "swiss" }),
    ),
    reportRow(
      "fastr",
      JSON.stringify({
        version: 1,
        format: "fastr",
        fastrTheme: "ministry",
        themeChosen: true,
      }),
    ),
  ]);

  for (const id of ["explicit", "noConfig", "noFormat", "unknown"]) {
    const written = JSON.parse(configs.get(id) ?? "{}");
    assertEquals(written.format, "fastr", id);
    // A STARTING theme, not a fixture: the report opens on the look it had,
    // and the Page menu re-themes it like any other FASTR report.
    assertEquals(written.fastrTheme, "legacy", id);
    // Never written: its absence is what keeps the theme modal from
    // interrupting a report about a choice it was never offered.
    assertEquals("themeChosen" in written, false, id);
  }
  // The other two formats are not touched at all.
  assertEquals(configs.has("html"), false);
  assertEquals(configs.has("fastr"), false);
  assertEquals(stats.rowsTransformed, 4);
});

Deno.test("the markdown sweep is idempotent: a second boot writes nothing", async () => {
  const first = await runSweep([
    reportRow("a", JSON.stringify({ version: 1, format: "markdown" })),
    reportRow("b", null),
  ]);
  assertEquals(first.updates, 2);

  const second = await runSweep([
    reportRow("a", first.configs.get("a")!),
    reportRow("b", first.configs.get("b")!),
  ]);
  assertEquals(second.updates, 0);
  assertEquals(second.stats.rowsTransformed, 0);
});

Deno.test("the markdown sweep converts a body with a stray ::: fence, and says so", async () => {
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...a: unknown[]) => void warnings.push(a.join(" "));
  try {
    const { configs } = await runSweep([
      reportRow(
        "stray",
        JSON.stringify({ version: 1, format: "markdown" }),
        // Inert prose as markdown; an unclosed container in FASTR Markdown.
        "# R\n\n:::tiles\n\nthe rest of the report\n",
      ),
    ]);
    // Converted like every other row: the body is the author's, never
    // rewritten, so the report is named in the log instead of being skipped.
    assertEquals(JSON.parse(configs.get("stray")!).format, "fastr");
  } finally {
    console.warn = realWarn;
  }
  assertEquals(warnings.length, 1);
  assert(warnings[0].includes("stray"));
  assert(warnings[0].includes("line 3"));
});
