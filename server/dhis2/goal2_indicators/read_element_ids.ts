// Reads a list of element ids (data element UIDs and `UID.COC` operands)
// from a connection and judges each as the picker would, so a typed id is
// confirmed before it is saved and the label refresh reads the same way:
// the elements by id with the picker's field list, each id judged through
// its element with its combo, then one `indicators` existence check for the
// bare UIDs the fetch did not return, to tell a formula from nothing.
// Nothing is cached: every call asks the server.

import {
  DHIS2_UID_PATTERN,
  type DHIS2DataElement,
  type Dhis2ElementVerdict,
} from "lib";
import type { FetchOptions } from "../common/base_fetcher.ts";
import { getExistingMetadataIds } from "../goal5_data_value_sets/get_data_value_sets_from_dhis2.ts";
import { getDhis2OperandVerdict } from "./element_eligibility.ts";
import { getDataElementsByIds } from "./get_indicators_from_dhis2.ts";

export type Dhis2ElementIdReading = {
  // One verdict per asked id.
  verdicts: Map<string, Dhis2ElementVerdict>;
  // The data elements the server returned, by element id, for their names.
  elements: Map<string, DHIS2DataElement>;
};

export async function readDhis2ElementIds(
  options: FetchOptions,
  ids: readonly string[],
): Promise<Dhis2ElementIdReading> {
  const unique = [...new Set(ids)];
  const elements = new Map(
    (await getDataElementsByIds(options, unique.map(dataElementIdOf))).map(
      (e) => [e.id, e],
    ),
  );
  const verdicts = new Map(
    unique.map((id) => [
      id,
      getDhis2OperandVerdict(elements.get(dataElementIdOf(id)), id),
    ]),
  );
  const unfoundUids = unique.filter((id) =>
    DHIS2_UID_PATTERN.test(id) && !elements.has(id)
  );
  if (unfoundUids.length > 0) {
    const formulas = await getExistingMetadataIds(
      "indicators",
      unfoundUids,
      options,
    );
    for (const id of formulas) {
      verdicts.set(id, { accepted: false, refusal: { kind: "formula" } });
    }
  }
  return { verdicts, elements };
}

export function dataElementIdOf(dataId: string): string {
  return dataId.split(".")[0];
}
