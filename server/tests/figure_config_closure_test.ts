// What wb-fastr-modules copies to check its presets: the figure config's schema
// and validator reach only files that import nothing else of the app's, and
// take from panther only what its zod-only schema files and its period
// utilities export, which themselves import only zod and each other.

import { assertEquals } from "@std/assert";
import { dirname, fromFileUrl, join, normalize } from "@std/path";

const ROOT = normalize(join(dirname(fromFileUrl(import.meta.url)), "../.."));

const IMPORT =
  /(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g;
const FROM_PANTHER = /\{([^}]*)\}\s*from\s*["']@timroberton\/panther["']/g;
const EXPORTED =
  /export\s+(?:declare\s+)?(?:const|let|function|type|class|interface|enum)\s+(\w+)/g;

type Closure = {
  files: string[];
  external: string[];
  pantherNames: string[];
};

async function closure(entries: readonly string[]): Promise<Closure> {
  const files = new Set<string>();
  const external = new Set<string>();
  const pantherNames = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    if (files.has(file)) return;
    files.add(file);
    const source = await Deno.readTextFile(join(ROOT, file));
    for (const m of source.matchAll(FROM_PANTHER)) {
      for (const raw of m[1].split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
        if (name !== "") pantherNames.add(name);
      }
    }
    for (const m of source.matchAll(IMPORT)) {
      const spec = m[1];
      if (!spec.startsWith(".")) {
        external.add(spec);
        continue;
      }
      await visit(normalize(join(dirname(file), spec)));
    }
  };
  for (const entry of entries) await visit(entry);
  return {
    files: [...files].sort(),
    external: [...external].sort(),
    pantherNames: [...pantherNames].sort(),
  };
}

const PANTHER_FILES = [
  "panther/_150_figure_schema/leaves.ts",
  "panther/_151_long_table_schema/filters.ts",
  "panther/_000_utils/periods.ts",
];

Deno.test("the schema and the validator reach only files the modules repo can copy", async () => {
  const app = await closure([
    "lib/figure_config/schema.ts",
    "lib/figure_config/validate.ts",
  ]);
  assertEquals(app.files, [
    "lib/figure_config/schema.ts",
    "lib/figure_config/validate.ts",
    "lib/rollup.ts",
    "lib/special_chart_metrics.ts",
    "lib/types/disaggregation_options.ts",
    "lib/types/period_options.ts",
    "lib/types/value_func.ts",
  ]);
  assertEquals(app.external, ["@timroberton/panther", "zod"]);

  const panther = await closure(PANTHER_FILES);
  assertEquals(panther.files, [
    "panther/_000_utils/assert.ts",
    "panther/_000_utils/periods.ts",
    "panther/_000_utils/translate.ts",
    "panther/_150_figure_schema/leaves.ts",
    "panther/_151_long_table_schema/filters.ts",
  ]);
  assertEquals(panther.external, ["zod"]);

  const exported = new Set<string>();
  for (const file of PANTHER_FILES) {
    const source = await Deno.readTextFile(join(ROOT, file));
    for (const m of source.matchAll(EXPORTED)) exported.add(m[1]);
  }
  assertEquals(app.pantherNames.filter((n) => !exported.has(n)), []);
});
