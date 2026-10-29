// Pins the status core: the issue kinds per field, the round status they
// give, consistency, and cycles read off the generator's dependency graph.
//
//   deno test -A server/tests/hfa_indicator_status_test.ts

import { assertEquals } from "@std/assert";
import {
  checkHfaCodeResultType,
  type HfaDictionaryForValidation,
  type HfaIndicator,
  type HfaIndicatorCode,
  hfaIndicatorsStatus,
  type HfaIndicatorVariantCode,
  isHfaCodeConsistent,
  validateHfaIndicatorCode,
} from "lib";

const dictionary: HfaDictionaryForValidation = {
  timePoints: [
    {
      timePoint: "R1",
      variables: [
        { variableId: "q1", variableLabel: "Q1", variableType: "select_one" },
        { variableId: "q2", variableLabel: "Q2", variableType: "integer" },
      ],
      values: [],
    },
    {
      timePoint: "R2",
      variables: [
        { variableId: "q1", variableLabel: "Q1", variableType: "select_one" },
      ],
      values: [],
    },
  ],
};

function indicator(
  indicatorId: string,
  extra: Partial<HfaIndicator> = {},
): HfaIndicator {
  return {
    indicatorId,
    categoryId: null,
    subCategoryId: null,
    serviceCategoryIds: [],
    shortLabel: "",
    definition: indicatorId,
    type: "binary",
    aggregation: "avg",
    sortOrder: 0,
    variantGroupId: null,
    ...extra,
  };
}

function code(
  indicatorId: string,
  timePoint: string,
  rCode: string,
  rFilterCode?: string,
): HfaIndicatorCode {
  return { indicatorId, timePoint, rCode, rFilterCode };
}

function status(
  indicators: HfaIndicator[],
  allCode: HfaIndicatorCode[],
  variantCode: HfaIndicatorVariantCode[] = [],
) {
  return hfaIndicatorsStatus({
    indicators,
    code: allCode,
    variantCode,
    variantItems: [
      { id: "campaign", groupId: "g1" },
      { id: "routine", groupId: "g2" },
    ],
    dictionary,
  });
}

function kinds(
  result: ReturnType<typeof status>,
  id: string,
  timePoint: string,
) {
  const round = result.get(id)!.rounds.find((r) => r.timePoint === timePoint)!;
  return {
    status: round.status,
    issues: round.issues.map((i) =>
      i.itemId === undefined
        ? `${i.field} ${i.kind}`
        : `${i.field} ${i.itemId} ${i.kind}`
    ),
  };
}

Deno.test("a round with no code and no filter is none; good code is ready", () => {
  const r = status([indicator("a")], [code("a", "R1", "q1 == 1")]);
  assertEquals(kinds(r, "a", "R1"), { status: "ready", issues: [] });
  assertEquals(kinds(r, "a", "R2"), { status: "none", issues: [] });
});

Deno.test("a syntax error and an unknown variable are errors on their field", () => {
  const r = status([indicator("a")], [
    code("a", "R1", "q1 = 1", "q9 == 1"),
    code("a", "R2", "q2 == 1"),
  ]);
  assertEquals(kinds(r, "a", "R1"), {
    status: "error",
    issues: ["rCode syntax", "rFilterCode unknown_variable"],
  });
  assertEquals(kinds(r, "a", "R2"), {
    status: "error",
    issues: ["rCode unknown_variable"],
  });
});

Deno.test("main code may name another indicator but not its own id", () => {
  const r = status([indicator("a"), indicator("b")], [
    code("a", "R1", "b == 1"),
    code("b", "R1", "b == 1"),
  ]);
  assertEquals(kinds(r, "a", "R1"), { status: "ready", issues: [] });
  assertEquals(kinds(r, "b", "R1").issues, [
    "rCode unknown_variable",
    "rCode cycle",
  ]);
});

Deno.test("a filter without main code is filter_without_code", () => {
  const r = status([indicator("a")], [code("a", "R1", "", "q1 == 1")]);
  assertEquals(kinds(r, "a", "R1"), {
    status: "error",
    issues: ["rFilterCode filter_without_code"],
  });
});

Deno.test("variant code is validated per item, may name its own indicator, and needs main code", () => {
  const ind = indicator("a", { variantGroupId: "g1" });
  const r = status([ind], [code("a", "R1", "q1 == 1")], [
    { indicatorId: "a", timePoint: "R1", itemId: "campaign", rCode: "a == 1" },
    { indicatorId: "a", timePoint: "R2", itemId: "campaign", rCode: "q7 == 1" },
    { indicatorId: "a", timePoint: "R1", itemId: "routine", rCode: "q9 == 1" },
  ]);
  assertEquals(kinds(r, "a", "R1"), { status: "ready", issues: [] });
  assertEquals(kinds(r, "a", "R2"), {
    status: "error",
    issues: [
      "variantCode campaign unknown_variable",
      "variantCode campaign variant_without_code",
    ],
  });
});

Deno.test("every indicator in a cycle carries it in each round with code", () => {
  // a -> b -> a is found by the generator's depth-first search from a; c -> a
  // closes the cycle a -> c -> a through b's finished node, which that search
  // does not report. The strongly connected component holds all three.
  const r = status([indicator("a"), indicator("b"), indicator("c")], [
    code("a", "R1", "b == 1 AND c == 1"),
    code("b", "R1", "a == 1"),
    code("c", "R1", "b == 1"),
    code("c", "R2", "q1 == 1"),
  ]);
  for (const id of ["a", "b", "c"]) {
    assertEquals(kinds(r, id, "R1"), {
      status: "error",
      issues: ["rCode cycle"],
    });
  }
  assertEquals(kinds(r, "c", "R2"), {
    status: "error",
    issues: ["rCode cycle"],
  });
  assertEquals(kinds(r, "a", "R2"), { status: "none", issues: [] });
});

Deno.test("a result-type mismatch is a warning and never an error", () => {
  const r = status(
    [indicator("a"), indicator("n", { type: "numeric" })],
    [code("a", "R1", "q2 + 1"), code("n", "R1", "q1 == 1")],
  );
  assertEquals(kinds(r, "a", "R1"), {
    status: "warning",
    issues: ["rCode result_type"],
  });
  assertEquals(kinds(r, "n", "R1"), {
    status: "warning",
    issues: ["rCode result_type"],
  });
  assertEquals(checkHfaCodeResultType("q1 = 1", "binary"), undefined);
});

Deno.test("an error outranks a warning in the same round", () => {
  const r = status([indicator("a")], [code("a", "R1", "q2 + 1", "q9 == 1")]);
  assertEquals(kinds(r, "a", "R1").status, "error");
});

Deno.test("consistency compares the trimmed main and filter code of non-empty rounds", () => {
  assertEquals(
    isHfaCodeConsistent([
      { rCode: "q1 == 1 ", rFilterCode: "q2 > 0" },
      { rCode: "q1 == 1", rFilterCode: " q2 > 0" },
      { rCode: "", rFilterCode: "" },
    ]),
    true,
  );
  assertEquals(
    isHfaCodeConsistent([{ rCode: "q1 == 1" }, { rCode: "q1 == 2" }]),
    false,
  );
  const r = status([indicator("a")], [
    code("a", "R1", "q1 == 1"),
    code("a", "R2", "q1 == 2"),
  ]);
  assertEquals(r.get("a")!.consistent, false);
});

Deno.test("an unknown variable suggests the id that differs only in case", () => {
  const v = validateHfaIndicatorCode(
    "Q1 == 1 AND b == 1",
    new Set(["q1"]),
    new Set(["b"]),
  );
  assertEquals(v.referencedIds, ["b"]);
  assertEquals(
    v.issues.map((i) => i.text.en),
    ["Variable 'Q1' not found in this time point. Did you mean 'q1'?"],
  );
});
