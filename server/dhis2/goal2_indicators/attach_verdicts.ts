// Shapes search results for the dictionary: each data element carries its
// element verdict and each indicator its decomposition, with every operand
// judged through its element on the live server and named as DHIS2 names it.

import {
  type DHIS2DataElement,
  type Dhis2DataElementSearchItem,
  dhis2ElementName,
  type DHIS2Indicator,
  type Dhis2IndicatorParse,
  type Dhis2IndicatorSearchItem,
  type Dhis2ParsedOperand,
  mergeDhis2OperandSides,
  parseIndicatorExpression,
  renameIdentifiers,
  writeIndicatorExpression,
} from "lib";
import type { FetchOptions } from "../common/base_fetcher.ts";
import { parseDhis2Indicator } from "./decompose_indicator.ts";
import { getDataElementsByIds } from "./get_indicators_from_dhis2.ts";
import {
  getDhis2ElementVerdict,
  getDhis2OperandVerdict,
  isDefaultComboOf,
} from "./element_eligibility.ts";

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
      ? parse.operands.map((operand) => {
        const element = elementsById.get(operand.data_element_id);
        return {
          ...operand,
          verdict: getDhis2OperandVerdict(element, operand.data_id),
          label: element === undefined
            ? operand.data_id
            : dhis2ElementName(element, operand.data_id),
        };
      })
      : [];
    return {
      ...indicator,
      decomposition: {
        parse,
        operands,
        annualized: indicator.annualized === true,
      },
    };
  });
}

// An operand `uid.coc` whose combo is its element's default one
// (`isDefaultComboOf`) is the element itself. The fold keeps the bare id for
// both, so a formula written with the default combo creates no second
// element beside the bare one, and a formula naming both forms counts the
// element twice, as DHIS2 does. It runs before the operands are judged,
// so the operand verdict's default-combo refusal never reaches a formula.
// Folding two forms into one operand merges the sides they were named on.
export function foldDefaultCombos(
  parse: Dhis2IndicatorParse,
  elementsById: ReadonlyMap<string, Pick<DHIS2DataElement, "categoryCombo">>,
): Dhis2IndicatorParse {
  if (!parse.accepted) return parse;
  const isDefaultCombo = (operand: Dhis2ParsedOperand): boolean =>
    operand.category_option_combo_id !== undefined &&
    isDefaultComboOf(
      elementsById.get(operand.data_element_id),
      operand.category_option_combo_id,
    );
  if (!parse.operands.some(isDefaultCombo)) return parse;
  const mapping: Record<string, string> = {};
  const positionByDataId = new Map<string, number>();
  const operands: Dhis2ParsedOperand[] = [];
  for (const operand of parse.operands) {
    const folded = isDefaultCombo(operand)
      ? {
        data_id: operand.data_element_id,
        data_element_id: operand.data_element_id,
        side: operand.side,
      }
      : operand;
    mapping[operand.data_id] = folded.data_id;
    const position = positionByDataId.get(folded.data_id);
    if (position !== undefined) {
      operands[position] = {
        ...operands[position],
        side: mergeDhis2OperandSides(operands[position].side, folded.side),
      };
      continue;
    }
    positionByDataId.set(folded.data_id, operands.length);
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
