// The data sets each data element is collected in, read from the data-set
// side. The element side cannot be trusted for them: a dataElements request
// whose field list carries dataSetElements answers 400 whenever a result
// holds an element with a broken DataSetElement row (Ethiopia, 2.40.1,
// 2026-10-22), while /api/dataSets serves every link. That endpoint lists
// only the data sets the connection's user may read, so a set the user
// cannot read is no set.

import type { DHIS2DataSetLink } from "lib";
import type { FetchOptions } from "../common/base_fetcher.ts";
import { getMetadataRows } from "../common/metadata_rows.ts";

// Unvalidated JSON from an external server: every field may be missing or
// null, whatever the DHIS2 docs promise.
export type DataSetWire = {
  id: string | null | undefined;
  periodType: string | null | undefined;
  dataSetElements:
    | Array<
      | { dataElement: { id: string | null | undefined } | null | undefined }
      | null
      | undefined
    >
    | null
    | undefined;
};

const DATA_SET_FIELDS = "id,periodType,dataSetElements[dataElement[id]]";

export async function getDataSetLinksByElement(
  options: FetchOptions,
  elementIds: Iterable<string>,
): Promise<Map<string, DHIS2DataSetLink[]>> {
  const ids = [...elementIds];
  const dataSets = await getMetadataRows<DataSetWire>(
    "dataSets",
    { property: "dataSetElements.dataElement.id", values: ids },
    DATA_SET_FIELDS,
    options,
  );
  return dataSetLinksByElement(ids, dataSets);
}

// Pure. The links of every asked element, in data set id order, from the
// data sets an in-filter answered. An answer carries every element of each
// matching set, so an element not asked for is dropped; a set holding asked
// ids from two chunks is answered twice, so links are deduped by set id; an
// asked id in no answered set has no links.
export function dataSetLinksByElement(
  elementIds: Iterable<string>,
  dataSets: readonly DataSetWire[],
): Map<string, DHIS2DataSetLink[]> {
  const setsByElement = new Map<string, Map<string, DHIS2DataSetLink>>();
  for (const id of elementIds) {
    setsByElement.set(id, new Map());
  }
  for (const set of dataSets) {
    if (set.id == null) continue;
    for (const dse of set.dataSetElements ?? []) {
      const elementId = dse?.dataElement?.id;
      if (elementId == null) continue;
      setsByElement.get(elementId)?.set(set.id, {
        id: set.id,
        periodType: set.periodType ?? undefined,
      });
    }
  }
  return new Map(
    [...setsByElement].map(([id, sets]) => [
      id,
      [...sets.values()].sort((a, b) => compareIds(a.id, b.id)),
    ]),
  );
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
