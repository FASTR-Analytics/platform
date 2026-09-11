// Pins PLAN_A3 ruling 6 as a pure function: a DHIS2 data element is a source
// only when its aggregation type is SUM, its value type is a count and it is
// collected in a monthly data set. An operand is checked through its element.
//
//   deno test -A --env-file server/tests/dhis2_source_eligibility_test.ts

import { assertEquals } from "@std/assert";
import type { DHIS2DataElement } from "lib";
import {
  getDhis2OperandVerdict,
  getDhis2SourceVerdict,
} from "../dhis2/goal2_indicators/source_eligibility.ts";

function element(overrides: Partial<DHIS2DataElement>): DHIS2DataElement {
  return {
    id: "AbCdEfGhIj1",
    name: "ANC 1st visit",
    displayName: "ANC 1st visit",
    aggregationType: "SUM",
    valueType: "INTEGER_ZERO_OR_POSITIVE",
    dataSetElements: [{ dataSet: { id: "DsAbCdEfGh1", periodType: "Monthly" } }],
    ...overrides,
  };
}

Deno.test("eligibility: a SUM monthly integer element is accepted", () => {
  assertEquals(getDhis2SourceVerdict(element({})), { accepted: true });
});

Deno.test("eligibility: NUMBER with SUM is accepted", () => {
  assertEquals(getDhis2SourceVerdict(element({ valueType: "NUMBER" })), {
    accepted: true,
  });
});

Deno.test("eligibility: every INTEGER count type is accepted", () => {
  for (const valueType of ["INTEGER", "INTEGER_POSITIVE", "INTEGER_ZERO_OR_POSITIVE"]) {
    assertEquals(getDhis2SourceVerdict(element({ valueType })), {
      accepted: true,
    });
  }
});

Deno.test("eligibility: each non-SUM aggregation type is refused", () => {
  for (
    const aggregationType of [
      "AVERAGE",
      "AVERAGE_SUM_ORG_UNIT",
      "LAST",
      "LAST_AVERAGE_ORG_UNIT",
      "LAST_IN_PERIOD",
      "FIRST",
      "COUNT",
      "STDDEV",
      "VARIANCE",
      "MIN",
      "MAX",
      "NONE",
      "CUSTOM",
      "DEFAULT",
    ]
  ) {
    assertEquals(getDhis2SourceVerdict(element({ aggregationType })), {
      accepted: false,
      refusal: { kind: "aggregation_type", value: aggregationType },
    });
  }
  assertEquals(getDhis2SourceVerdict(element({ aggregationType: undefined })), {
    accepted: false,
    refusal: { kind: "aggregation_type", value: undefined },
  });
});

Deno.test("eligibility: each non-count value type is refused", () => {
  for (
    const valueType of [
      "PERCENTAGE",
      "UNIT_INTERVAL",
      "INTEGER_NEGATIVE",
      "TEXT",
      "LONG_TEXT",
      "BOOLEAN",
      "TRUE_ONLY",
      "DATE",
      "DATETIME",
      "COORDINATE",
      "ORGANISATION_UNIT",
      "FILE_RESOURCE",
    ]
  ) {
    assertEquals(getDhis2SourceVerdict(element({ valueType })), {
      accepted: false,
      refusal: { kind: "value_type", value: valueType },
    });
  }
  assertEquals(getDhis2SourceVerdict(element({ valueType: undefined })), {
    accepted: false,
    refusal: { kind: "value_type", value: undefined },
  });
});

Deno.test("eligibility: each non-monthly period type is refused", () => {
  for (
    const periodType of [
      "Daily",
      "Weekly",
      "BiWeekly",
      "BiMonthly",
      "Quarterly",
      "SixMonthly",
      "Yearly",
      "FinancialJuly",
    ]
  ) {
    assertEquals(
      getDhis2SourceVerdict(
        element({ dataSetElements: [{ dataSet: { periodType } }] }),
      ),
      { accepted: false, refusal: { kind: "period_type", value: periodType } },
    );
  }
});

Deno.test("eligibility: an element in no data set has no period and is refused", () => {
  assertEquals(getDhis2SourceVerdict(element({ dataSetElements: [] })), {
    accepted: false,
    refusal: { kind: "period_type", value: undefined },
  });
  assertEquals(getDhis2SourceVerdict(element({ dataSetElements: undefined })), {
    accepted: false,
    refusal: { kind: "period_type", value: undefined },
  });
});

Deno.test("eligibility: one monthly data set among several is enough; none among several is refused with the list", () => {
  assertEquals(
    getDhis2SourceVerdict(
      element({
        dataSetElements: [
          { dataSet: { periodType: "Quarterly" } },
          { dataSet: { periodType: "Monthly" } },
        ],
      }),
    ),
    { accepted: true },
  );
  assertEquals(
    getDhis2SourceVerdict(
      element({
        dataSetElements: [
          { dataSet: { periodType: "Quarterly" } },
          { dataSet: { periodType: "Yearly" } },
        ],
      }),
    ),
    {
      accepted: false,
      refusal: { kind: "period_type", value: "Quarterly, Yearly" },
    },
  );
});

Deno.test("eligibility: the checks apply in order, aggregation first", () => {
  assertEquals(
    getDhis2SourceVerdict(
      element({ aggregationType: "AVERAGE", valueType: "PERCENTAGE" }),
    ),
    { accepted: false, refusal: { kind: "aggregation_type", value: "AVERAGE" } },
  );
});

Deno.test("eligibility: an operand is checked through its element", () => {
  assertEquals(getDhis2OperandVerdict(element({})), { accepted: true });
  assertEquals(getDhis2OperandVerdict(element({ valueType: "PERCENTAGE" })), {
    accepted: false,
    refusal: { kind: "value_type", value: "PERCENTAGE" },
  });
  assertEquals(getDhis2OperandVerdict(undefined), {
    accepted: false,
    refusal: { kind: "element_not_found" },
  });
});
