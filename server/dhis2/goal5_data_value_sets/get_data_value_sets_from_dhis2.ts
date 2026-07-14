import { FetchOptions, getDHIS2 } from "../common/base_fetcher.ts";

export type DHIS2DataValue = {
  dataElement: string;
  period: string;
  orgUnit: string;
  categoryOptionCombo: string;
  attributeOptionCombo: string;
  value: string;
  lastUpdated?: string;
  deleted?: boolean;
};

export type DHIS2DataValueSetsResponse = {
  dataValues?: DHIS2DataValue[];
};

// One country-scale pull per base data element (PLAN_DHIS2_IMPORTER §2.4):
// ~1-2 s server think time + transfer, where the same data via the analytics
// engine costs minutes-to-hours. children=true descends from the given org
// units to facility level. A month with no data legitimately returns a body
// with no dataValues key — that is an unambiguous empty, not a failure
// (unlike analytics' missing "rows").
//
// Selection is period= — an opaque token the DHIS2 server interprets in ITS
// OWN calendar, the same contract as analytics `pe:`. This is the only form
// that works fleet-wide: a calendar-configured server (Ethiopia, 2.40.1,
// calendar=ethiopian) does not read startDate/endDate as Gregorian dates, so
// even a correctly-converted date range returns nothing there (lab E13,
// 2026-07-15 — range 0 records on 12/12 data-bearing elements while period=
// returned thousands, matching analytics per-facility 1,199/1,200 exact).
export async function getDataValueSetsFromDHIS2(
  params: {
    dataElement: string;
    orgUnits: string[];
    // The instance-calendar period id (YYYYMM), passed through untranslated.
    period: string;
  },
  options: FetchOptions,
): Promise<DHIS2DataValueSetsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.append("dataElement", params.dataElement);
  for (const orgUnit of params.orgUnits) {
    searchParams.append("orgUnit", orgUnit);
  }
  searchParams.set("children", "true");
  searchParams.set("period", params.period);
  return await getDHIS2<DHIS2DataValueSetsResponse>(
    "/api/dataValueSets.json",
    options,
    searchParams,
  );
}

// Which of `ids` exist on a DHIS2 metadata endpoint (fields=id, chunked id:in
// filters). Drives the fetch dispatcher's per-run classification — metadata is
// the source of truth, no stored type field to drift (PLAN_DHIS2_IMPORTER §4.4).
export async function getExistingMetadataIds(
  endpoint: "dataElements" | "indicators" | "categoryOptionCombos",
  ids: string[],
  options: FetchOptions,
): Promise<Set<string>> {
  const existing = new Set<string>();
  const distinct = Array.from(new Set(ids));
  const CHUNK_SIZE = 100;
  for (let i = 0; i < distinct.length; i += CHUNK_SIZE) {
    const chunk = distinct.slice(i, i + CHUNK_SIZE);
    const params = new URLSearchParams();
    params.set("fields", "id");
    params.set("filter", `id:in:[${chunk.join(",")}]`);
    params.set("paging", "false");
    const res = await getDHIS2<Record<string, Array<{ id: string }>>>(
      `/api/${endpoint}.json`,
      options,
      params,
    );
    for (const item of res[endpoint] ?? []) {
      existing.add(item.id);
    }
  }
  return existing;
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
  const res = await getDHIS2<{ organisationUnits?: Array<{ id: string }> }>(
    "/api/organisationUnits.json",
    options,
    params,
  );
  return (res.organisationUnits ?? []).map((o) => o.id);
}
