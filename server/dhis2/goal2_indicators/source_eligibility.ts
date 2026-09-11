// PLAN_A3 ruling 6: a DHIS2 data element may be a source only when DHIS2's
// own metadata says it is an additive monthly count. Pure: the caller fetches
// the element (with dataSetElements[dataSet[periodType]]) and asks here.

import type { DHIS2DataElement, Dhis2SourceVerdict } from "lib";

// NUMBER is the DHIS2 editor's default value type and most real count
// elements carry it; integrality is enforced per value at import.
// INTEGER_NEGATIVE is left out on purpose: every value of such an element is
// skipped at import, so it can never contribute a count.
const COUNT_VALUE_TYPES: readonly string[] = [
  "NUMBER",
  "INTEGER",
  "INTEGER_POSITIVE",
  "INTEGER_ZERO_OR_POSITIVE",
];

const MONTHLY_PERIOD_TYPE = "Monthly";

export function getDhis2SourceVerdict(
  element: DHIS2DataElement,
): Dhis2SourceVerdict {
  if (element.aggregationType !== "SUM") {
    return refuse({ kind: "aggregation_type", value: element.aggregationType });
  }
  if (
    element.valueType === undefined ||
    !COUNT_VALUE_TYPES.includes(element.valueType)
  ) {
    return refuse({ kind: "value_type", value: element.valueType });
  }
  const periodTypes = (element.dataSetElements ?? [])
    .map((dse) => dse.dataSet?.periodType)
    .filter((p): p is string => p !== undefined);
  // An element collected in a monthly data set and also in a quarterly one
  // reports its monthly values under the monthly set, which is what the
  // dataValueSets pull reads; one monthly data set is enough.
  if (!periodTypes.includes(MONTHLY_PERIOD_TYPE)) {
    return refuse({
      kind: "period_type",
      value: periodTypes.length === 0 ? undefined : periodTypes.join(", "),
    });
  }
  return { accepted: true };
}

// An operand is checked through its element; an element the server no
// longer has is a refusal of its own.
export function getDhis2OperandVerdict(
  element: DHIS2DataElement | undefined,
): Dhis2SourceVerdict {
  return element === undefined
    ? refuse({ kind: "element_not_found" })
    : getDhis2SourceVerdict(element);
}

function refuse(
  refusal: Extract<Dhis2SourceVerdict, { accepted: false }>["refusal"],
): Dhis2SourceVerdict {
  return { accepted: false, refusal };
}
