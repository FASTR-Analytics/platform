// GOAL 2: data elements and indicators from DHIS2, for the dictionary.
// Every fetcher reads a private wire type (every field possibly missing or
// null, whatever the DHIS2 docs promise) and returns the lib app type; a row
// with no id is dropped at the fetcher, so nothing downstream sees the wire
// shape.

import type { DHIS2CategoryOptionCombo, DHIS2DataElement, DHIS2Indicator } from "lib";
import { FetchOptions, getDHIS2 } from "../common/base_fetcher.ts";

type IdNameWire = {
  id: string | null | undefined;
  name: string | null | undefined;
};

type CategoryOptionComboWire = IdNameWire & {
  displayName: string | null | undefined;
};

type DataElementWire = {
  id: string | null | undefined;
  name: string | null | undefined;
  displayName: string | null | undefined;
  code: string | null | undefined;
  shortName: string | null | undefined;
  aggregationType: string | null | undefined;
  domainType: string | null | undefined;
  valueType: string | null | undefined;
  categoryCombo:
    | {
      id: string | null | undefined;
      name: string | null | undefined;
      isDefault: boolean | null | undefined;
      categoryOptionCombos: CategoryOptionComboWire[] | null | undefined;
    }
    | null
    | undefined;
  dataElementGroups: IdNameWire[] | null | undefined;
  dataSetElements:
    | Array<{
      dataSet:
        | { id: string | null | undefined; periodType: string | null | undefined }
        | null
        | undefined;
    }>
    | null
    | undefined;
  created: string | null | undefined;
  lastUpdated: string | null | undefined;
};

type IndicatorWire = {
  id: string | null | undefined;
  name: string | null | undefined;
  displayName: string | null | undefined;
  code: string | null | undefined;
  shortName: string | null | undefined;
  numerator: string | null | undefined;
  denominator: string | null | undefined;
  annualized: boolean | null | undefined;
  indicatorType:
    | {
      id: string | null | undefined;
      name: string | null | undefined;
      factor: number | null | undefined;
    }
    | null
    | undefined;
  indicatorGroups: IdNameWire[] | null | undefined;
  created: string | null | undefined;
  lastUpdated: string | null | undefined;
};

type Query = {
  filter: string[];
  paging: boolean;
  rootJunction?: "AND" | "OR";
};

function buildParams(fields: readonly string[], query: Query): URLSearchParams {
  const params = new URLSearchParams();
  params.set("fields", fields.join(","));
  for (const f of query.filter) {
    params.append("filter", f);
  }
  params.set("paging", String(query.paging));
  if (query.rootJunction !== undefined) {
    params.set("rootJunction", query.rootJunction);
  }
  return params;
}

function ilikeFilters(query: string): string[] {
  return [`name:ilike:${query}`, `code:ilike:${query}`, `id:ilike:${query}`];
}

function idNames(
  rows: IdNameWire[] | null | undefined,
): Array<{ id: string; name: string }> {
  return (rows ?? []).flatMap((r) =>
    r.id == null ? [] : [{ id: r.id, name: r.name ?? "" }]
  );
}

function toCategoryOptionCombo(
  w: CategoryOptionComboWire,
): DHIS2CategoryOptionCombo[] {
  return w.id == null ? [] : [{
    id: w.id,
    name: w.name ?? "",
    displayName: w.displayName ?? undefined,
  }];
}

function toDataElement(w: DataElementWire): DHIS2DataElement[] {
  if (w.id == null) {
    return [];
  }
  const combo = w.categoryCombo;
  return [{
    id: w.id,
    name: w.name ?? "",
    displayName: w.displayName || w.name || "",
    code: w.code ?? undefined,
    shortName: w.shortName ?? undefined,
    aggregationType: w.aggregationType ?? undefined,
    domainType: w.domainType ?? undefined,
    valueType: w.valueType ?? undefined,
    categoryCombo: combo?.id == null ? undefined : {
      id: combo.id,
      name: combo.name ?? "",
      isDefault: combo.isDefault ?? undefined,
      categoryOptionCombos: (combo.categoryOptionCombos ?? []).flatMap(
        toCategoryOptionCombo,
      ),
    },
    dataElementGroups: idNames(w.dataElementGroups),
    dataSetElements: (w.dataSetElements ?? []).map((dse) => ({
      dataSet: dse.dataSet == null ? undefined : {
        id: dse.dataSet.id ?? undefined,
        periodType: dse.dataSet.periodType ?? undefined,
      },
    })),
    created: w.created ?? undefined,
    lastUpdated: w.lastUpdated ?? undefined,
  }];
}

// An indicator type without a numeric factor is no type at all: the
// decomposition then refuses the indicator for its missing factor.
function toIndicator(w: IndicatorWire): DHIS2Indicator[] {
  if (w.id == null) {
    return [];
  }
  const type = w.indicatorType;
  return [{
    id: w.id,
    name: w.name ?? "",
    displayName: w.displayName || w.name || "",
    code: w.code ?? undefined,
    shortName: w.shortName ?? undefined,
    numerator: w.numerator ?? undefined,
    denominator: w.denominator ?? undefined,
    annualized: w.annualized ?? undefined,
    indicatorType: type?.id == null || typeof type.factor !== "number"
      ? undefined
      : { id: type.id, name: type.name ?? "", factor: type.factor },
    indicatorGroups: idNames(w.indicatorGroups),
    created: w.created ?? undefined,
    lastUpdated: w.lastUpdated ?? undefined,
  }];
}

// ============================================================================
// Data elements
// ============================================================================

// dataSetElements[dataSet[periodType]] feeds the eligibility check.
const DATA_ELEMENT_FIELDS = [
  "id",
  "name",
  "displayName",
  "code",
  "shortName",
  "aggregationType",
  "domainType",
  "valueType",
  "categoryCombo[id,name,isDefault,categoryOptionCombos[id,name,displayName]]",
  "dataElementGroups[id,name]",
  "dataSetElements[dataSet[id,periodType]]",
  "created",
  "lastUpdated",
] as const;

export async function getDataElementsFromDHIS2(
  options: FetchOptions,
  query: Query,
): Promise<DHIS2DataElement[]> {
  const response = await getDHIS2<{
    dataElements: DataElementWire[] | null | undefined;
  }>(
    "/api/dataElements.json",
    options,
    buildParams(DATA_ELEMENT_FIELDS, query),
  );
  return (response.dataElements ?? []).flatMap(toDataElement);
}

export function searchDataElementsFromDHIS2(
  options: FetchOptions,
  query: string,
  additionalFilters: string[] | undefined = undefined,
): Promise<DHIS2DataElement[]> {
  return getDataElementsFromDHIS2(options, {
    filter: [...(additionalFilters ?? []), ...ilikeFilters(query)],
    paging: true,
    rootJunction: "OR",
  });
}

// ============================================================================
// Indicators
// ============================================================================

const INDICATOR_FIELDS = [
  "id",
  "name",
  "displayName",
  "code",
  "shortName",
  "numerator",
  "denominator",
  "annualized",
  "indicatorType[id,name,factor]",
  "indicatorGroups[id,name]",
  "created",
  "lastUpdated",
] as const;

export async function getIndicatorsFromDHIS2(
  options: FetchOptions,
  query: Query,
): Promise<DHIS2Indicator[]> {
  const response = await getDHIS2<{
    indicators: IndicatorWire[] | null | undefined;
  }>(
    "/api/indicators.json",
    options,
    buildParams(INDICATOR_FIELDS, query),
  );
  return (response.indicators ?? []).flatMap(toIndicator);
}

export function searchIndicatorsFromDHIS2(
  options: FetchOptions,
  query: string,
): Promise<DHIS2Indicator[]> {
  return getIndicatorsFromDHIS2(options, {
    filter: ilikeFilters(query),
    paging: true,
    rootJunction: "OR",
  });
}

// ============================================================================
// Combined search
// ============================================================================

// The query is split on comma, semicolon or newline; every term is searched
// in parallel across both endpoints and the results merged, deduped by id.
export async function searchAllIndicatorsAndDataElements(
  options: FetchOptions,
  query: string,
  includeDataElements: boolean,
  includeIndicators: boolean,
): Promise<{
  dataElements: DHIS2DataElement[];
  indicators: DHIS2Indicator[];
}> {
  const terms = query
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const perTerm = await Promise.all(
    terms.map((term) =>
      Promise.all([
        includeDataElements
          ? searchDataElementsFromDHIS2(options, term)
          : Promise.resolve<DHIS2DataElement[]>([]),
        includeIndicators
          ? searchIndicatorsFromDHIS2(options, term)
          : Promise.resolve<DHIS2Indicator[]>([]),
      ])
    ),
  );
  return {
    dataElements: dedupeById(perTerm.flatMap(([elements]) => elements)),
    indicators: dedupeById(perTerm.flatMap(([, indicators]) => indicators)),
  };
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) {
      return false;
    }
    seen.add(row.id);
    return true;
  });
}
