// Shapes search results for the dictionary: each data element carries its
// element verdict and each indicator its decomposition,
// with every operand judged through its element on the live server.

import {
  type DHIS2DataElement,
  type Dhis2DataElementSearchItem,
  type DHIS2Indicator,
  type Dhis2IndicatorParse,
  type Dhis2IndicatorSearchItem,
  type Dhis2ParsedOperand,
  parseIndicatorExpression,
  renameIdentifiers,
  writeIndicatorExpression,
} from "lib";
import type { FetchOptions } from "../common/base_fetcher.ts";
import { parseDhis2Indicator } from "./decompose_indicator.ts";
import { getDataElementsFromDHIS2 } from "./get_indicators_from_dhis2.ts";
import {
  getDhis2ElementVerdict,
  getDhis2OperandVerdict,
} from "./element_eligibility.ts";

const ID_FILTER_CHUNK_SIZE = 100;

export function withElementVerdicts(
  elements: DHIS2DataElement[],
): Dhis2DataElementSearchItem[] {
  return elements.map((element) => ({
    ...element,
    verdict: getDhis2ElementVerdict(element),
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
    const parse = foldDefaultCombos(parses[i], elementsById);
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

// An operand `uid.coc` whose combo is the element's default combo is the
// element itself: the default category combo has that one combo, so both
// forms name the same series. The fold keeps the bare id for both, so a
// formula written with the default combo creates no second element beside
// the bare one, and a formula naming both forms counts the element twice,
// as DHIS2 does.
export function foldDefaultCombos(
  parse: Dhis2IndicatorParse,
  elementsById: ReadonlyMap<string, Pick<DHIS2DataElement, "categoryCombo">>,
): Dhis2IndicatorParse {
  if (!parse.accepted) return parse;
  const isDefaultCombo = (operand: Dhis2ParsedOperand): boolean => {
    const coc = operand.category_option_combo_id;
    const combo = elementsById.get(operand.data_element_id)?.categoryCombo;
    return coc !== undefined && combo?.isDefault === true &&
      (combo.categoryOptionCombos ?? []).some((c) => c.id === coc);
  };
  if (!parse.operands.some(isDefaultCombo)) return parse;
  const mapping: Record<string, string> = {};
  const seen = new Set<string>();
  const operands: Dhis2ParsedOperand[] = [];
  for (const operand of parse.operands) {
    const folded = isDefaultCombo(operand)
      ? {
        data_id: operand.data_element_id,
        data_element_id: operand.data_element_id,
      }
      : operand;
    mapping[operand.data_id] = folded.data_id;
    if (seen.has(folded.data_id)) continue;
    seen.add(folded.data_id);
    operands.push(folded);
  }
  return {
    ...parse,
    operands,
    expression: writeIndicatorExpression(
      renameIdentifiers(parseIndicatorExpression(parse.expression), mapping),
    ),
  };
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
