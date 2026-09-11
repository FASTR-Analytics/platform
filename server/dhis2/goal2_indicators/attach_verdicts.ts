// Shapes search results for the dictionary: each data element carries its
// source verdict (ruling 6) and each indicator its decomposition (ruling 8),
// with every operand judged through its element on the live server.

import type {
  DHIS2DataElement,
  DHIS2Indicator,
  Dhis2DataElementSearchItem,
  Dhis2IndicatorSearchItem,
} from "lib";
import type { FetchOptions } from "../common/base_fetcher.ts";
import { parseDhis2Indicator } from "./decompose_indicator.ts";
import { getDataElementsFromDHIS2 } from "./get_indicators_from_dhis2.ts";
import {
  getDhis2OperandVerdict,
  getDhis2SourceVerdict,
} from "./source_eligibility.ts";

const ID_FILTER_CHUNK_SIZE = 100;

export function withSourceVerdicts(
  elements: DHIS2DataElement[],
): Dhis2DataElementSearchItem[] {
  return elements.map((element) => ({
    ...element,
    verdict: getDhis2SourceVerdict(element),
  }));
}

// `known` are elements already fetched with the default field list (the
// combined search's own data-element results), so only the operands they do
// not cover cost a request.
export async function withDecompositions(
  options: FetchOptions,
  indicators: DHIS2Indicator[],
  known: DHIS2DataElement[] = [],
): Promise<Dhis2IndicatorSearchItem[]> {
  const parses = indicators.map((indicator) =>
    parseDhis2Indicator({
      numerator: indicator.numerator,
      denominator: indicator.denominator,
      annualized: indicator.annualized,
      factor: indicator.indicatorType?.factor,
    })
  );
  const elementsById = new Map(known.map((e) => [e.id, e]));
  const missing = new Set<string>();
  for (const parse of parses) {
    if (!parse.accepted) continue;
    for (const operand of parse.operands) {
      if (!elementsById.has(operand.data_element_id)) {
        missing.add(operand.data_element_id);
      }
    }
  }
  for (const element of await getDataElementsByIds(options, [...missing])) {
    elementsById.set(element.id, element);
  }
  return indicators.map((indicator, i) => {
    const parse = parses[i];
    const operands = parse.accepted
      ? parse.operands.map((operand) => ({
        ...operand,
        verdict: getDhis2OperandVerdict(
          elementsById.get(operand.data_element_id),
        ),
      }))
      : [];
    return {
      ...indicator,
      decomposition: {
        accepted: parse.accepted && operands.every((o) => o.verdict.accepted),
        parse,
        operands,
      },
    };
  });
}

async function getDataElementsByIds(
  options: FetchOptions,
  ids: string[],
): Promise<DHIS2DataElement[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_FILTER_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + ID_FILTER_CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      getDataElementsFromDHIS2(options, {
        filter: [`id:in:[${chunk.join(",")}]`],
        paging: false,
      })
    ),
  );
  return results.flat();
}
