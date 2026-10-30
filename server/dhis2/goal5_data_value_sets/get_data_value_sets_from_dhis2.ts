import { FetchOptions, getDHIS2 } from "../common/base_fetcher.ts";
import {
  getMetadataRows,
  type MetadataEndpoint,
} from "../common/metadata_rows.ts";
import { monthlyDataSetId } from "../goal2_indicators/element_eligibility.ts";
import { getDataSetLinksByElement } from "../goal2_indicators/get_data_set_links_from_dhis2.ts";

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

// Which of `ids` exist on a DHIS2 metadata endpoint. Drives the fetch
// dispatcher's per-run classification: metadata is the source of truth, no
// stored type field to drift.
export async function getExistingMetadataIds(
  endpoint: MetadataEndpoint,
  ids: string[],
  options: FetchOptions,
): Promise<Set<string>> {
  const rows = await getMetadataRows<IdRow>(
    endpoint,
    { property: "id", values: ids },
    "id",
    options,
  );
  return new Set(presentIds(rows));
}

// The monthly data set each element is collected in, for a release whose
// export is served by data set. An element in no monthly data set is absent
// from the map.
export async function getMonthlyDataSetIdByElement(
  elementIds: string[],
  options: FetchOptions,
): Promise<Map<string, string>> {
  const links = await getDataSetLinksByElement(options, elementIds);
  const byElement = new Map<string, string>();
  for (const [elementId, dataSets] of links) {
    const dataSetId = monthlyDataSetId(dataSets);
    if (dataSetId !== undefined) {
      byElement.set(elementId, dataSetId);
    }
  }
  return byElement;
}

// Unvalidated JSON from /api/me: the org units the account may read values
// under. DHIS2 falls back to the capture org units when no data-view org
// units are assigned, and so does `dataViewRootIds`.
export type DHIS2MeOrgUnits = {
  dataViewOrganisationUnits: IdRow[] | null | undefined;
  organisationUnits: IdRow[] | null | undefined;
};

export function dataViewRootIds(me: DHIS2MeOrgUnits): string[] {
  const dataView = presentIds(me.dataViewOrganisationUnits);
  return dataView.length > 0 ? dataView : presentIds(me.organisationUnits);
}

// The roots a whole-country dataValueSets pull descends from: the account's
// own data-view org units, not every level-1 unit. A server can hold a root
// the account may not view (Malawi: "Malawi" beside "MOH MALAWI Govt", which
// holds every facility), and one such orgUnit= fails the whole request with
// 409.
export async function getDataViewRootOrgUnitIds(
  options: FetchOptions,
): Promise<string[]> {
  const me = await getDHIS2<DHIS2MeOrgUnits>("/api/me.json", options, {
    fields: "dataViewOrganisationUnits[id],organisationUnits[id]",
  });
  return dataViewRootIds(me);
}

// The roots' children: the subtree split when a 1-month pull still exceeds
// the response cap.
export async function getChildOrgUnitIds(
  parentIds: string[],
  options: FetchOptions,
): Promise<string[]> {
  if (parentIds.length === 0) return [];
  const res = await getDHIS2<{
    organisationUnits: IdRow[] | null | undefined;
  }>("/api/organisationUnits.json", options, {
    fields: "id",
    filter: `parent.id:in:[${parentIds.join(",")}]`,
    paging: "false",
  });
  return presentIds(res.organisationUnits);
}
