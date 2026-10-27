// A DHIS2 data element may fill a DHIS2 element indicator only when DHIS2's
// own metadata says it is an additive monthly count, and an operand of it
// only under a combo the element lists that is not its default one. Pure:
// the caller fetches the element (whose data sets the fetcher attaches) and
// asks here.

import type {
  DHIS2DataElement,
  DHIS2DataSetLink,
  Dhis2ElementVerdict,
} from "lib";

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

// The first monthly data set the element is collected in: what a
// dataValueSets export by data set names (goal 5), on the releases whose
// export cannot select a data element. The links are in data set id order,
// so an element in several monthly sets always names the same one.
export function monthlyDataSetId(
  dataSets: readonly DHIS2DataSetLink[],
): string | undefined {
  return dataSets.find((s) => s.periodType === MONTHLY_PERIOD_TYPE)?.id;
}

export function getDhis2ElementVerdict(
  element: DHIS2DataElement,
): Dhis2ElementVerdict {
  if (element.aggregationType !== "SUM") {
    return refuse({ kind: "aggregation_type", value: element.aggregationType });
  }
  if (
    element.valueType === undefined ||
    !COUNT_VALUE_TYPES.includes(element.valueType)
  ) {
    return refuse({ kind: "value_type", value: element.valueType });
  }
  const periodTypes = element.dataSets
    .map((s) => s.periodType)
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

// The verdict on an element id, a bare UID or a `UID.COC` operand, through
// its element: an element the server does not have is a refusal of its own,
// and an operand's combo must be one the element lists. Its default combo
// is refused too, naming the bare id: the default category combo has that
// one combo, so `UID.COC` with it names the series of bare `UID`, which the
// picker folds onto the bare id and the DHIS2 id repair treats as a
// duplicate.
export function getDhis2OperandVerdict(
  element: DHIS2DataElement | undefined,
  dataId: string,
): Dhis2ElementVerdict {
  if (element === undefined) return refuse({ kind: "element_not_found" });
  const verdict = getDhis2ElementVerdict(element);
  if (!verdict.accepted) return verdict;
  const coc = dataId.split(".")[1];
  if (coc === undefined) return verdict;
  if (isDefaultComboOf(element, coc)) {
    return refuse({ kind: "default_combo", value: element.id });
  }
  if (!listsCombo(element, coc)) {
    return refuse({ kind: "combo_not_found", value: coc });
  }
  return verdict;
}

export function isDefaultComboOf(
  element: Pick<DHIS2DataElement, "categoryCombo"> | undefined,
  coc: string,
): boolean {
  return element?.categoryCombo?.isDefault === true &&
    listsCombo(element, coc);
}

function listsCombo(
  element: Pick<DHIS2DataElement, "categoryCombo">,
  coc: string,
): boolean {
  return (element.categoryCombo?.categoryOptionCombos ?? []).some((c) =>
    c.id === coc
  );
}

function refuse(
  refusal: Extract<Dhis2ElementVerdict, { accepted: false }>["refusal"],
): Dhis2ElementVerdict {
  return { accepted: false, refusal };
}
