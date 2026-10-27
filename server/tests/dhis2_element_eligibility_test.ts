// Pins DHIS2 element eligibility as a pure function: a DHIS2 data element
// fills a DHIS2 element indicator only when its aggregation type is SUM, its
// value type is a count and it is collected in a monthly data set. An
// operand is checked through its element, then its combo: one the element
// does not list is refused, and the element's default combo is refused
// naming the bare id.
//
//   deno test -A --env-file server/tests/dhis2_element_eligibility_test.ts

import { assert, assertEquals } from "@std/assert";
import type { DHIS2DataElement } from "lib";
import {
  getDhis2ElementVerdict,
  getDhis2OperandVerdict,
  isDefaultComboOf,
} from "../dhis2/goal2_indicators/element_eligibility.ts";

function element(overrides: Partial<DHIS2DataElement>): DHIS2DataElement {
  return {
    id: "AbCdEfGhIj1",
    name: "ANC 1st visit",
    displayName: "ANC 1st visit",
    aggregationType: "SUM",
    valueType: "INTEGER_ZERO_OR_POSITIVE",
    dataSets: [{ id: "DsAbCdEfGh1", periodType: "Monthly" }],
    ...overrides,
  };
}

Deno.test("eligibility: a SUM monthly integer element is accepted", () => {
  assertEquals(getDhis2ElementVerdict(element({})), { accepted: true });
});

Deno.test("eligibility: NUMBER with SUM is accepted", () => {
  assertEquals(getDhis2ElementVerdict(element({ valueType: "NUMBER" })), {
    accepted: true,
  });
});

Deno.test("eligibility: every INTEGER count type is accepted", () => {
  for (
    const valueType of [
      "INTEGER",
      "INTEGER_POSITIVE",
      "INTEGER_ZERO_OR_POSITIVE",
    ]
  ) {
    assertEquals(getDhis2ElementVerdict(element({ valueType })), {
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
    assertEquals(getDhis2ElementVerdict(element({ aggregationType })), {
      accepted: false,
      refusal: { kind: "aggregation_type", value: aggregationType },
    });
  }
  assertEquals(
    getDhis2ElementVerdict(element({ aggregationType: undefined })),
    {
      accepted: false,
      refusal: { kind: "aggregation_type", value: undefined },
    },
  );
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
    assertEquals(getDhis2ElementVerdict(element({ valueType })), {
      accepted: false,
      refusal: { kind: "value_type", value: valueType },
    });
  }
  assertEquals(getDhis2ElementVerdict(element({ valueType: undefined })), {
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
      getDhis2ElementVerdict(
        element({ dataSets: [{ id: "DsAbCdEfGh1", periodType }] }),
      ),
      { accepted: false, refusal: { kind: "period_type", value: periodType } },
    );
  }
});

Deno.test("eligibility: an element in no data set has no period and is refused", () => {
  assertEquals(getDhis2ElementVerdict(element({ dataSets: [] })), {
    accepted: false,
    refusal: { kind: "period_type", value: undefined },
  });
  assertEquals(
    getDhis2ElementVerdict(
      element({ dataSets: [{ id: "DsAbCdEfGh1", periodType: undefined }] }),
    ),
    {
      accepted: false,
      refusal: { kind: "period_type", value: undefined },
    },
  );
});

Deno.test("eligibility: one monthly data set among several is enough; none among several is refused with the list", () => {
  assertEquals(
    getDhis2ElementVerdict(
      element({
        dataSets: [
          { id: "DsAbCdEfGh1", periodType: "Quarterly" },
          { id: "DsAbCdEfGh2", periodType: "Monthly" },
        ],
      }),
    ),
    { accepted: true },
  );
  assertEquals(
    getDhis2ElementVerdict(
      element({
        dataSets: [
          { id: "DsAbCdEfGh1", periodType: "Quarterly" },
          { id: "DsAbCdEfGh2", periodType: "Yearly" },
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
    getDhis2ElementVerdict(
      element({ aggregationType: "AVERAGE", valueType: "PERCENTAGE" }),
    ),
    {
      accepted: false,
      refusal: { kind: "aggregation_type", value: "AVERAGE" },
    },
  );
});

const ELEMENT = "AbCdEfGhIj1";
const FEMALE = "CocFemale01";
const DEFAULT = "CocDefault1";

const SEX_COMBO: DHIS2DataElement["categoryCombo"] = {
  id: "CcSexAbCd01",
  name: "Sex",
  isDefault: false,
  categoryOptionCombos: [{ id: FEMALE, name: "Female" }],
};
const DEFAULT_COMBO: DHIS2DataElement["categoryCombo"] = {
  id: "CcDefault01",
  name: "default",
  isDefault: true,
  categoryOptionCombos: [{ id: DEFAULT, name: "default" }],
};

Deno.test("eligibility: an operand is checked through its element, which the server must have", () => {
  assertEquals(getDhis2OperandVerdict(element({}), ELEMENT), {
    accepted: true,
  });
  assertEquals(
    getDhis2OperandVerdict(element({ valueType: "PERCENTAGE" }), ELEMENT),
    {
      accepted: false,
      refusal: { kind: "value_type", value: "PERCENTAGE" },
    },
  );
  assertEquals(getDhis2OperandVerdict(undefined, ELEMENT), {
    accepted: false,
    refusal: { kind: "element_not_found" },
  });
  assertEquals(getDhis2OperandVerdict(undefined, `${ELEMENT}.${FEMALE}`), {
    accepted: false,
    refusal: { kind: "element_not_found" },
  });
});

Deno.test("eligibility: an operand's combo must be one the element lists", () => {
  const sexed = element({ categoryCombo: SEX_COMBO });
  assertEquals(getDhis2OperandVerdict(sexed, `${ELEMENT}.${FEMALE}`), {
    accepted: true,
  });
  assertEquals(getDhis2OperandVerdict(sexed, `${ELEMENT}.CocUnknown1`), {
    accepted: false,
    refusal: { kind: "combo_not_found", value: "CocUnknown1" },
  });
  assertEquals(
    getDhis2OperandVerdict(element({}), `${ELEMENT}.${FEMALE}`),
    {
      accepted: false,
      refusal: { kind: "combo_not_found", value: FEMALE },
    },
  );
});

Deno.test("eligibility: an operand under the element's default combo is refused naming the bare id", () => {
  const plain = element({ categoryCombo: DEFAULT_COMBO });
  assertEquals(getDhis2OperandVerdict(plain, ELEMENT), { accepted: true });
  assertEquals(getDhis2OperandVerdict(plain, `${ELEMENT}.${DEFAULT}`), {
    accepted: false,
    refusal: { kind: "default_combo", value: ELEMENT },
  });
  assert(isDefaultComboOf(plain, DEFAULT));
  assert(!isDefaultComboOf(plain, FEMALE));
  assert(!isDefaultComboOf(element({ categoryCombo: SEX_COMBO }), FEMALE));
  assert(!isDefaultComboOf(undefined, DEFAULT));
});

Deno.test("eligibility: the element's own verdict comes before the combo", () => {
  assertEquals(
    getDhis2OperandVerdict(
      element({ aggregationType: "AVERAGE", categoryCombo: DEFAULT_COMBO }),
      `${ELEMENT}.${DEFAULT}`,
    ),
    {
      accepted: false,
      refusal: { kind: "aggregation_type", value: "AVERAGE" },
    },
  );
});
