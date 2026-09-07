// m012 decides which rows exist by evaluating each indicator's expression per
// row in R (the rule and the R bindings are stated in its script.R header).
// This pins that R evaluation to the TypeScript evaluator: the real script,
// substituted through the real getScriptWithParameters from a real resolved
// catalog, runs over one fixture, and the set of rows it writes must equal
// the set the TypeScript evaluator keeps over the same sums.
//
// Needs the local modules checkout (FASTR_MODULES_LOCAL_DIR) and Rscript on
// the path; skipped otherwise:
//   deno test -A --env-file server/tests/m012_expression_parity_test.ts

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  type CommonIndicator,
  type CommonIndicatorCatalogRow,
  evaluateIndicatorExpression,
  type ExpressionValues,
  parseIndicatorExpression,
  POPULATION_TYPE_IDS,
  populationIngredientId,
  resolveCommonIndicatorCatalog,
} from "lib";
import { getModuleDefinitionDetail } from "../module_loader/mod.ts";
import { getScriptWithParameters } from "../server_only_funcs/get_script_with_parameters.ts";

const POPULATION_TYPE = "u5";

function common(
  id: string,
  definition: CommonIndicator["definition"],
  sortOrder: number,
): CommonIndicator {
  return {
    indicator_common_id: id,
    indicator_common_label: id,
    is_default: false,
    definition,
    format_as: "number",
    thresholds: null,
    sort_order: sortOrder,
  };
}

// Every construct of the expression language, each with a reason to drop a
// row: a missing ingredient, a zero denominator, a nullif that fires, a
// population the store does not cover, an ingredient with no rows at all,
// and a coalesce that turns a missing ingredient into a kept row.
const COMMONS: CommonIndicator[] = [
  common("anc1", { type: "base" }, 1),
  common("anc4", { type: "base" }, 2),
  common("penta1", { type: "base" }, 3),
  common("opd", { type: "base" }, 4),
  common("anc4_rate", { type: "derived", expression: "anc4 / anc1" }, 5),
  common("anc4_rate_fill", {
    type: "derived",
    expression: "coalesce(anc4, 0) / anc1",
  }, 6),
  common("anc1_not5", { type: "derived", expression: "nullif(anc1, 5)" }, 7),
  common("anc1_per_1000_u5", {
    type: "derived",
    expression: `1000 * anc1 / [${populationIngredientId(POPULATION_TYPE)}]`,
  }, 8),
  common("penta1_share", { type: "derived", expression: "penta1 / anc1" }, 9),
  common("anc_gap", {
    type: "derived",
    expression: "-anc1 + abs(anc4 - anc1)",
  }, 10),
];

// `opd` is unmapped; `penta1` is mapped but has no rows.
const BASE_IDS_IN_DATA = new Set(["anc1", "anc4", "penta1"]);

type AdjustedRow = {
  facility: string;
  aa2: string;
  aa3: string;
  period: number;
  indicator: string;
  count: number | null;
};

const row = (
  facility: string,
  aa2: string,
  aa3: string,
  period: number,
  indicator: string,
  count: number | null,
): AdjustedRow => ({ facility, aa2, aa3, period, indicator, count });

// Area A sums for anc1 are 5, 2, 0 (both facilities NA in 202403); anc4 is
// reported by one facility in A only; B never reports anc4.
const ADJUSTED: AdjustedRow[] = [
  row("f1", "A", "A1", 202401, "anc1", 3),
  row("f1", "A", "A1", 202402, "anc1", 2),
  row("f1", "A", "A1", 202403, "anc1", null),
  row("f2", "A", "A2", 202401, "anc1", 2),
  row("f2", "A", "A2", 202402, "anc1", 0),
  row("f2", "A", "A2", 202403, "anc1", null),
  row("f3", "B", "B1", 202401, "anc1", 4),
  row("f3", "B", "B1", 202402, "anc1", 6),
  row("f3", "B", "B1", 202403, "anc1", 8),
  row("f1", "A", "A1", 202401, "anc4", 1),
  row("f1", "A", "A1", 202402, "anc4", 1),
  row("f1", "A", "A1", 202403, "anc4", 1),
];

const PERIODS = [202401, 202402, 202403];
const POPULATION_PERSON_YEARS = 100;
// The store covers area A only.
const POPULATION_AREAS = ["A"];

const COUNT_COLUMNS = [
  "count_final_none",
  "count_final_outliers",
  "count_final_completeness",
  "count_final_both",
];

function adjustedCsv(): string {
  const header = [
    "facility_id",
    "admin_area_2",
    "admin_area_3",
    "period_id",
    "indicator_common_id",
    ...COUNT_COLUMNS,
  ];
  const lines = ADJUSTED.map((r) => {
    const count = r.count === null ? "NA" : String(r.count);
    return [
      r.facility,
      r.aa2,
      r.aa3,
      String(r.period),
      r.indicator,
      ...COUNT_COLUMNS.map(() => count),
    ].join(",");
  });
  return [header.join(","), ...lines].join("\n") + "\n";
}

function populationCsv(): string {
  const lines = POPULATION_AREAS.flatMap((aa2) =>
    PERIODS.map((p) =>
      [aa2, String(p), POPULATION_TYPE, String(POPULATION_PERSON_YEARS)].join(
        ",",
      )
    )
  );
  return [
    "admin_area_2,period_id,population_type,person_years",
    ...lines,
  ].join("\n") + "\n";
}

const cellKey = (indicator: string, aa2: string, period: number) =>
  `${indicator}|${aa2}|${period}`;

// The TypeScript side of the rule, over the same area x month sums m012
// builds. A row exists in m012 only when at least one ingredient joined
// (its inner join), and survives only when the expression over the sums is
// a number.
function expectedCells(catalog: CommonIndicatorCatalogRow[]): Set<string> {
  const sums = new Map<string, number>();
  for (const r of ADJUSTED) {
    const key = cellKey(r.indicator, r.aa2, r.period);
    sums.set(key, (sums.get(key) ?? 0) + (r.count ?? 0));
  }
  for (const aa2 of POPULATION_AREAS) {
    for (const p of PERIODS) {
      sums.set(
        cellKey(populationIngredientId(POPULATION_TYPE), aa2, p),
        POPULATION_PERSON_YEARS,
      );
    }
  }
  const areas = [...new Set(ADJUSTED.map((r) => r.aa2))];
  const cells = new Set<string>();
  for (const entry of catalog) {
    if (entry.expression === null || entry.slot_map === null) continue;
    const ast = parseIndicatorExpression(entry.expression);
    for (const aa2 of areas) {
      for (const p of PERIODS) {
        const values: ExpressionValues = {};
        let joined = false;
        for (const ingredientId of Object.keys(entry.slot_map)) {
          const sum = sums.get(cellKey(ingredientId, aa2, p));
          values[ingredientId] = sum ?? null;
          if (sum !== undefined) joined = true;
        }
        if (!joined) continue;
        if (evaluateIndicatorExpression(ast, values) !== null) {
          cells.add(cellKey(entry.indicator_common_id, aa2, p));
        }
      }
    }
  }
  return cells;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const fields = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, fields[i]]));
  });
}

async function runM012(script: string): Promise<Record<string, string>[]> {
  const work = await Deno.makeTempDir({ prefix: "m012_parity_" });
  const m012Dir = join(work, "outputs", "m012");
  await Deno.mkdir(join(work, "inputs", "datasets"), { recursive: true });
  await Deno.mkdir(join(work, "outputs", "m002"), { recursive: true });
  await Deno.mkdir(m012Dir, { recursive: true });
  await Deno.writeTextFile(
    join(work, "outputs", "m002", "M2_adjusted_data.csv"),
    adjustedCsv(),
  );
  await Deno.writeTextFile(
    join(work, "inputs", "population.csv"),
    populationCsv(),
  );
  await Deno.writeTextFile(join(m012Dir, "script.R"), script);
  const result = await new Deno.Command("Rscript", {
    args: ["script.R"],
    cwd: m012Dir,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stderr = new TextDecoder().decode(result.stderr);
  if (!result.success) {
    throw new Error(`m012 failed:\n${stderr}`);
  }
  return parseCsv(
    await Deno.readTextFile(join(m012Dir, "M12_indicator_values.csv")),
  );
}

async function hasRscript(): Promise<boolean> {
  try {
    const result = await new Deno.Command("Rscript", { args: ["--version"] })
      .output();
    return result.success;
  } catch {
    return false;
  }
}

const canRun = Deno.env.get("FASTR_MODULES_LOCAL_DIR") !== undefined &&
  await hasRscript();

Deno.test({
  name: "m012 keeps exactly the rows the TypeScript evaluator keeps",
  ignore: !canRun,
  async fn() {
    const detailRes = await getModuleDefinitionDetail("m012", "en", undefined);
    if (!detailRes.success) throw new Error(detailRes.err);
    const detail = detailRes.data;
    const catalog = resolveCommonIndicatorCatalog(
      COMMONS,
      BASE_IDS_IN_DATA,
      POPULATION_TYPE_IDS,
    );
    const script = getScriptWithParameters(
      detail,
      {
        parameterDefinitions: detail.configRequirements.parameters,
        parameterSelections: { SELECTEDCOUNT: "count_final_none" },
      },
      "TST",
      "../../inputs/datasets",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );

    const output = await runM012(script);
    const written = output.map((r) =>
      cellKey(r.indicator_common_id, r.admin_area_2, Number(r.period_id))
    );
    assertEquals(new Set(written).size, written.length);
    assertEquals(written.sort(), [...expectedCells(catalog)].sort());

    // The rule, stated directly over what was written: every row evaluates.
    const byId = new Map(catalog.map((c) => [c.indicator_common_id, c]));
    for (const r of output) {
      const entry = byId.get(r.indicator_common_id)!;
      const values: ExpressionValues = {};
      for (const [ingredientId, slot] of Object.entries(entry.slot_map!)) {
        values[ingredientId] = r[slot] === "NA" ? null : Number(r[slot]);
      }
      assert(
        evaluateIndicatorExpression(
          parseIndicatorExpression(entry.expression!),
          values,
        ) !== null,
        `${r.indicator_common_id} ${r.admin_area_2} ${r.period_id} was written but does not evaluate`,
      );
    }

    // The cases by name, so a regression reads as a sentence.
    const cellsOf = (id: string) =>
      written.filter((k) => k.startsWith(`${id}|`)).map((k) =>
        k.slice(id.length + 1)
      ).sort();
    assertEquals(cellsOf("anc1"), [
      "A|202401",
      "A|202402",
      "A|202403",
      "B|202401",
      "B|202402",
      "B|202403",
    ]);
    assertEquals(cellsOf("anc4"), ["A|202401", "A|202402", "A|202403"]);
    // B never reports anc4; A's 202403 divides by zero.
    assertEquals(cellsOf("anc4_rate"), ["A|202401", "A|202402"]);
    // coalesce turns B's missing anc4 into a zero rate.
    assertEquals(cellsOf("anc4_rate_fill"), [
      "A|202401",
      "A|202402",
      "B|202401",
      "B|202402",
      "B|202403",
    ]);
    // nullif fires on A's 202401 sum of 5.
    assertEquals(cellsOf("anc1_not5"), [
      "A|202402",
      "A|202403",
      "B|202401",
      "B|202402",
      "B|202403",
    ]);
    // The store covers A only.
    assertEquals(cellsOf("anc1_per_1000_u5"), [
      "A|202401",
      "A|202402",
      "A|202403",
    ]);
    // penta1 has no rows anywhere: the indicator is absent.
    assertEquals(cellsOf("penta1_share"), []);
    assertEquals(cellsOf("anc_gap"), ["A|202401", "A|202402", "A|202403"]);
    // opd is unmapped: never in the output.
    assertEquals(cellsOf("opd"), []);
  },
});
