// The facts the planner reads, gathered from the dictionary, the rows and
// live DHIS2 with the importer's own classification and decomposition code.
// The stored credentials are decrypted here, so this runs only where the
// app's encryption key is: inside the instance's app container.

import type { Sql } from "postgres";
import { type DHIS2DataElement, type DHIS2Indicator } from "lib";
import {
  type FetchOptions,
  getDataElementsFromDHIS2,
  getIndicatorsFromDHIS2,
  parseDhis2Indicator,
  withDecompositions,
} from "../dhis2/mod.ts";
import { getHmisIndicators } from "../db/instance/indicators.ts";
import { getStoredDhis2CredentialsDecrypted } from "../db/instance/instance_dhis2_credentials.ts";
import { classifyElements } from "../worker_routines/import_hmis_data_dhis2/dispatch.ts";
import type { Dhis2IdFixFacts, Dhis2IdFixRowSpan } from "./plan.ts";

// DHIS2 caps a filter's value list, so id lookups go in chunks.
const ID_FILTER_CHUNK_SIZE = 100;

async function fetchByIds<T>(
  ids: Iterable<string>,
  fetch: (filter: string) => Promise<T[]>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += ID_FILTER_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + ID_FILTER_CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map((chunk) => fetch(`id:in:[${chunk.join(",")}]`)),
  );
  return results.flat();
}

async function readRowSpans(
  mainDb: Sql,
  dataIds: string[],
): Promise<Record<string, Dhis2IdFixRowSpan>> {
  const rows = await mainDb<
    { data_id: string; count: number; first: number; last: number }[]
  >`
    SELECT data_id, COUNT(*)::int AS count,
      MIN(period_id) AS first, MAX(period_id) AS last
    FROM dataset_hmis
    WHERE data_id = ANY(${dataIds})
    GROUP BY data_id
  `;
  return Object.fromEntries(rows.map((r) => [r.data_id, {
    count: r.count,
    firstPeriodId: r.first,
    lastPeriodId: r.last,
  }]));
}

export async function gatherDhis2IdFixFacts(
  mainDb: Sql,
): Promise<Dhis2IdFixFacts> {
  const indicators = await getHmisIndicators(mainDb);
  const dataIds = indicators.flatMap((i) =>
    i.definition.type === "dhis2_element" ? [i.definition.data_id] : []
  );
  const rows = await readRowSpans(mainDb, dataIds);

  const credentials = await getStoredDhis2CredentialsDecrypted(mainDb);
  const options: FetchOptions = { dhis2Credentials: credentials };
  const routes = await classifyElements(dataIds, options);

  const formulaIds = dataIds.filter((id) => {
    const route = routes.get(id);
    return route?.kind === "unknown" && route.reason === "dhis2_indicator";
  });
  const dhis2Indicators: DHIS2Indicator[] = await fetchByIds(
    formulaIds,
    (filter) =>
      getIndicatorsFromDHIS2(options, { filter: [filter], paging: false }),
  );
  // The operands' elements are fetched once, for the names the plan writes,
  // and handed to the decomposition so it does not fetch them again.
  const operandElementIds = dhis2Indicators.flatMap((indicator) => {
    const parse = parseDhis2Indicator({
      numerator: indicator.numerator,
      denominator: indicator.denominator,
      annualized: indicator.annualized,
      factor: indicator.indicatorType?.factor,
    });
    return parse.accepted ? parse.operands.map((o) => o.data_element_id) : [];
  });
  const elements: DHIS2DataElement[] = await fetchByIds(
    operandElementIds,
    (filter) =>
      getDataElementsFromDHIS2(options, { filter: [filter], paging: false }),
  );
  const decomposed = await withDecompositions(
    options,
    dhis2Indicators,
    elements,
  );

  return {
    dhis2Url: credentials.url,
    indicators,
    rows,
    routes: Object.fromEntries(routes),
    formulas: Object.fromEntries(
      decomposed.map((d) => [d.id, d.decomposition]),
    ),
    elements: Object.fromEntries(
      elements.map((e) => [e.id, {
        name: e.name,
        categoryCombo: e.categoryCombo,
      }]),
    ),
  };
}
