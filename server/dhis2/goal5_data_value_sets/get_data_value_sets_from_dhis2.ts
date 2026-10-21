import { FetchOptions, getDHIS2 } from "../common/base_fetcher.ts";
import { monthlyDataSetId } from "../goal2_indicators/element_eligibility.ts";
import {
  type DataSetElementsWire,
  toDataSetElements,
} from "../goal2_indicators/get_indicators_from_dhis2.ts";

// Unvalidated JSON from an external server: every field may be missing or
// null, whatever the DHIS2 docs promise.
export type DHIS2DataValue = {
  dataElement: string | null | undefined;
  period: string | null | undefined;
  orgUnit: string | null | undefined;
  categoryOptionCombo: string | null | undefined;
  attributeOptionCombo: string | null | undefined;
  value: string | null | undefined;
  lastUpdated: string | null | undefined;
  deleted: boolean | null | undefined;
};

// The export may state a field once for the whole set and leave it off each
// value: DHIS2 2.43 answers a single-period pull with a top-level `period`
// and no `period` on any value. `dataValuesWithSetDefaults` is the one
// place that shape is folded back onto the values.
export type DHIS2DataValueSetsResponse = {
  dataSet?: string | null;
  period?: string | null;
  orgUnit?: string | null;
  attributeOptionCombo?: string | null;
  dataValues: DHIS2DataValue[] | null | undefined;
};

export function dataValuesWithSetDefaults(
  res: DHIS2DataValueSetsResponse,
): DHIS2DataValue[] {
  return (res.dataValues ?? []).map((v) => ({
    ...v,
    period: v.period ?? res.period,
    orgUnit: v.orgUnit ?? res.orgUnit,
    attributeOptionCombo: v.attributeOptionCombo ?? res.attributeOptionCombo,
  }));
}

type IdRow = { id: string | null | undefined };

function presentIds(rows: IdRow[] | null | undefined): string[] {
  return (rows ?? []).flatMap((row) => (row.id == null ? [] : [row.id]));
}

// What one dataValueSets pull selects: the export reads dataElement= from
// DHIS2 2.39, and an earlier release ignores it (its resolved selection is
// empty and it answers 409 E2001), so there the pull names a data set the
// element is collected in and carries every element of that set. The import
// dispatcher chooses per run from the reported version (dispatch.ts).
export type Dhis2ValueSelector = {
  kind: "dataElement" | "dataSet";
  id: string;
};

// One country-scale pull per selector:
// ~1-2 s server think time + transfer, where the same data via the analytics
// engine costs minutes-to-hours. children=true descends from the given org
// units to facility level. A month with no data legitimately returns a body
// with no dataValues key: that is an unambiguous empty, not a failure
// (unlike analytics' missing "rows"). The values come back with every
// set-level field folded onto them.
//
// Selection is period=: an opaque token the DHIS2 server interprets in ITS
// OWN calendar, the same contract as analytics `pe:`. This is the only form
// that works fleet-wide: a calendar-configured server (Ethiopia, 2.40.1,
// calendar=ethiopian) does not read startDate/endDate as Gregorian dates, so
// even a correctly-converted date range returns nothing there (lab E13,
// 2026-07-15, range 0 records on 12/12 data-bearing elements while period=
// returned thousands, matching analytics per-facility 1,199/1,200 exact).
export async function getDataValueSetsFromDHIS2(
  params: {
    selector: Dhis2ValueSelector;
    orgUnits: string[];
    // The instance-calendar period id (YYYYMM), passed through untranslated.
    period: string;
  },
  options: FetchOptions,
): Promise<DHIS2DataValue[]> {
  const searchParams = new URLSearchParams();
  searchParams.append(params.selector.kind, params.selector.id);
  for (const orgUnit of params.orgUnits) {
    searchParams.append("orgUnit", orgUnit);
  }
  searchParams.set("children", "true");
  searchParams.set("period", params.period);
  return dataValuesWithSetDefaults(
    await getDHIS2<DHIS2DataValueSetsResponse>(
      "/api/dataValueSets.json",
      options,
      searchParams,
    ),
  );
}

type MetadataEndpoint = "dataElements" | "indicators" | "categoryOptionCombos";

// The rows of `ids` on a metadata endpoint, chunked id:in filters of 100.
async function getMetadataRows<T extends IdRow>(
  endpoint: MetadataEndpoint,
  ids: string[],
  fields: string,
  options: FetchOptions,
): Promise<T[]> {
  const rows: T[] = [];
  const distinct = Array.from(new Set(ids));
  const CHUNK_SIZE = 100;
  for (let i = 0; i < distinct.length; i += CHUNK_SIZE) {
    const chunk = distinct.slice(i, i + CHUNK_SIZE);
    const params = new URLSearchParams();
    params.set("fields", fields);
    params.set("filter", `id:in:[${chunk.join(",")}]`);
    params.set("paging", "false");
    const res = await getDHIS2<Record<string, T[] | null | undefined>>(
      `/api/${endpoint}.json`,
      options,
      params,
    );
    rows.push(...(res[endpoint] ?? []));
  }
  return rows;
}

// Which of `ids` exist on a DHIS2 metadata endpoint. Drives the fetch
// dispatcher's per-run classification: metadata is the source of truth, no
// stored type field to drift.
export async function getExistingMetadataIds(
  endpoint: MetadataEndpoint,
  ids: string[],
  options: FetchOptions,
): Promise<Set<string>> {
  return new Set(
    presentIds(await getMetadataRows<IdRow>(endpoint, ids, "id", options)),
  );
}

type DataSetElementsRow = IdRow & { dataSetElements: DataSetElementsWire };

// The monthly data set each element is collected in, for a release whose
// export is served by data set. An element in no monthly data set is absent
// from the map.
export async function getMonthlyDataSetIdByElement(
  elementIds: string[],
  options: FetchOptions,
): Promise<Map<string, string>> {
  const rows = await getMetadataRows<DataSetElementsRow>(
    "dataElements",
    elementIds,
    "id,dataSetElements[dataSet[id,periodType]]",
    options,
  );
  const byElement = new Map<string, string>();
  for (const row of rows) {
    const dataSetId = monthlyDataSetId(toDataSetElements(row.dataSetElements));
    if (row.id != null && dataSetId !== undefined) {
      byElement.set(row.id, dataSetId);
    }
  }
  return byElement;
}

// Org unit ids at a hierarchy level: level 1 = the root(s) for whole-country
// dataValueSets pulls; level 2 = the subtree split when a 1-month pull still
// exceeds the response cap.
export async function getOrgUnitIdsAtLevel(
  level: number,
  options: FetchOptions,
): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("fields", "id");
  params.set("filter", `level:eq:${level}`);
  params.set("paging", "false");
  const res = await getDHIS2<{
    organisationUnits: IdRow[] | null | undefined;
  }>("/api/organisationUnits.json", options, params);
  return presentIds(res.organisationUnits);
}
