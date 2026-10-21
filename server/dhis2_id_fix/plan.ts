// The pure planner of the DHIS2 id repair. It reads facts the gatherer
// collected (the dictionary, the row spans, the dispatcher's route per DHIS2
// element, the decomposed formulas and their operands' elements) and returns
// the plan the apply writes. No read and no write here, so `apply` can
// recompute the plan from live facts and compare it to the file it was given.

import {
  describeDhis2ElementRefusal,
  describeDhis2ParseRefusal,
  type DHIS2DataElement,
  dhis2ElementName,
  type Dhis2IndicatorDecomposition,
  type Dhis2ParsedOperand,
  type ExpressionNode,
  generateIndicatorId,
  type HmisIndicator,
  type IndicatorFormat,
  isSpecialIndicatorId,
  parseIndicatorExpression,
  renameIdentifiers,
  writeIndicatorExpression,
} from "lib";
import type { ElementRoute } from "../worker_routines/import_hmis_data_dhis2/dispatch.ts";

export type Dhis2IdFixRowSpan = {
  count: number;
  firstPeriodId: number | null;
  lastPeriodId: number | null;
};

export type Dhis2IdFixElement = Pick<
  DHIS2DataElement,
  "name" | "categoryCombo"
>;

// Keyed by data id (`rows`, `routes`, `formulas`) or by data element id
// (`elements`). `routes` covers every DHIS2 element of the dictionary;
// `formulas` covers every data id routed `dhis2_indicator`; `elements` covers
// every accepted operand's element. A data id with no rows is absent from
// `rows`.
export type Dhis2IdFixFacts = {
  dhis2Url: string;
  indicators: HmisIndicator[];
  rows: Record<string, Dhis2IdFixRowSpan>;
  routes: Record<string, ElementRoute>;
  formulas: Record<string, Dhis2IndicatorDecomposition>;
  elements: Record<string, Dhis2IdFixElement>;
};

export type Dhis2IdFixCreatedElement = {
  indicatorId: string;
  label: string;
  dataId: string;
  sortOrder: number;
};

export type Dhis2IdFixSumRewrite = { sumId: string; members: string[] };

export type Dhis2IdFixOutcome =
  | { outcome: "retarget"; newDataId: string; dhis2Label: string }
  | { outcome: "to_sum"; members: string[] }
  | {
    outcome: "to_calculated";
    expression: string;
    formatAs: IndicatorFormat;
  }
  | { outcome: "to_uploaded"; reason: string };

export type Dhis2IdFixAction =
  & { indicatorId: string; dataId: string; rows: Dhis2IdFixRowSpan }
  & Dhis2IdFixOutcome;

// `sumRewrites` is one entry per Sum of the dictionary that names an
// indicator a to_sum or to_calculated action retypes, with that Sum's whole
// member list as it will be after every action, so two actions touching the
// same Sum cannot disagree. An empty list is a Sum the apply must refuse.
export type Dhis2IdFixPlan = {
  dhis2Url: string;
  plannedAt: string;
  elementsChecked: number;
  elementsHealthy: number;
  createdElements: Dhis2IdFixCreatedElement[];
  actions: Dhis2IdFixAction[];
  sumRewrites: Dhis2IdFixSumRewrite[];
};

export type Dhis2FormulaShape =
  | { kind: "single"; operand: string }
  | { kind: "sum"; operands: string[] }
  | { kind: "other" };

const byCodeUnit = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

// A chain of `+` over identifiers, or undefined where any other node sits.
function plusChain(node: ExpressionNode): string[] | undefined {
  if (node.kind === "identifier") return [node.name];
  if (node.kind !== "binary" || node.op !== "+") return undefined;
  const left = plusChain(node.left);
  const right = plusChain(node.right);
  return left !== undefined && right !== undefined
    ? [...left, ...right]
    : undefined;
}

// Single and sum are the shapes whose value is a count the app can hold as
// rows (single) or compute as a Sum: a `+` chain over distinct operands,
// over the literal 1, at factor 1. A repeated operand is `2 × A`, which is
// not a sum of members, so it reads as other.
export function readDhis2FormulaShape(
  parse: { expression: string; format_as: IndicatorFormat },
): Dhis2FormulaShape {
  if (parse.format_as !== "number") return { kind: "other" };
  const node = parseIndicatorExpression(parse.expression);
  if (
    node.kind !== "binary" || node.op !== "/" ||
    node.right.kind !== "number" || node.right.value !== 1
  ) {
    return { kind: "other" };
  }
  const terms = plusChain(node.left);
  if (terms === undefined) return { kind: "other" };
  if (terms.length === 1) return { kind: "single", operand: terms[0] };
  const distinct = new Set(terms);
  return distinct.size === terms.length
    ? { kind: "sum", operands: terms }
    : { kind: "other" };
}

// A Sum's members once the retyped indicators among them are gone: a
// to_sum's members stand in for it, a to_calculated is dropped. Undefined
// when the Sum names none of them.
export function rewriteSumMembers(
  members: string[],
  retyped: ReadonlyMap<string, Dhis2IdFixOutcome>,
): string[] | undefined {
  const next = new Set<string>();
  let touched = false;
  for (const member of members) {
    const outcome = retyped.get(member);
    if (outcome === undefined) {
      next.add(member);
      continue;
    }
    touched = true;
    if (outcome.outcome === "to_sum") {
      for (const inner of outcome.members) next.add(inner);
    }
  }
  return touched ? [...next].sort(byCodeUnit) : undefined;
}

type Diagnosis =
  | { kind: "uploaded"; reason: string }
  | {
    kind: "formula";
    shape: Dhis2FormulaShape;
    expression: string;
    formatAs: IndicatorFormat;
    operands: Map<string, Dhis2ParsedOperand>;
  };

function diagnose(
  facts: Dhis2IdFixFacts,
  dataId: string,
  route: ElementRoute,
): Diagnosis {
  if (route.kind === "unknown" && route.reason === "not_found") {
    return { kind: "uploaded", reason: "not in DHIS2" };
  }
  const formula = facts.formulas[dataId];
  if (formula === undefined) {
    throw new Error(`No decomposition in the facts for formula ${dataId}`);
  }
  if (!formula.parse.accepted) {
    return {
      kind: "uploaded",
      reason: `its formula is refused: ${
        describeDhis2ParseRefusal(formula.parse.refusal).en
      }`,
    };
  }
  for (const operand of formula.operands) {
    if (!operand.verdict.accepted) {
      return {
        kind: "uploaded",
        reason: `its operand ${operand.data_id} is refused: ${
          describeDhis2ElementRefusal(operand.verdict.refusal).en
        }`,
      };
    }
  }
  return {
    kind: "formula",
    shape: readDhis2FormulaShape(formula.parse),
    expression: formula.parse.expression,
    formatAs: formula.parse.format_as,
    operands: new Map(formula.parse.operands.map((o) => [o.data_id, o])),
  };
}

export function planDhis2IdFix(
  facts: Dhis2IdFixFacts,
  plannedAt: string,
): Dhis2IdFixPlan {
  const existingIds = new Set(
    facts.indicators.map((i) => i.indicator_common_id),
  );
  const holders = new Map<string, string>();
  let maxSortOrder = 0;
  for (const i of facts.indicators) {
    maxSortOrder = Math.max(maxSortOrder, i.sort_order);
    if (
      i.definition.type === "uploaded" ||
      i.definition.type === "dhis2_element"
    ) {
      holders.set(i.definition.data_id, i.indicator_common_id);
    }
  }

  const broken: {
    indicator: HmisIndicator;
    dataId: string;
    diagnosis: Diagnosis;
  }[] = [];
  let elementsChecked = 0;
  let healthy = 0;
  for (const indicator of facts.indicators) {
    if (indicator.definition.type !== "dhis2_element") continue;
    elementsChecked++;
    const dataId = indicator.definition.data_id;
    const route = facts.routes[dataId];
    if (route === undefined) {
      throw new Error(`No route in the facts for DHIS2 element ${dataId}`);
    }
    if (route.kind === "dvs") {
      healthy++;
      continue;
    }
    broken.push({
      indicator,
      dataId,
      diagnosis: diagnose(facts, dataId, route),
    });
  }
  broken.sort((a, b) =>
    byCodeUnit(a.indicator.indicator_common_id, b.indicator.indicator_common_id)
  );

  const elementName = (operand: Dhis2ParsedOperand): string => {
    const element = facts.elements[operand.data_element_id];
    if (element === undefined) {
      throw new Error(`No element in the facts for operand ${operand.data_id}`);
    }
    return dhis2ElementName(element, operand.data_id);
  };
  const createdElements: Dhis2IdFixCreatedElement[] = [];
  const holderOrCreated = (operand: Dhis2ParsedOperand): string => {
    const holder = holders.get(operand.data_id);
    if (holder !== undefined) return holder;
    const label = elementName(operand);
    const indicatorId = generateIndicatorId({
      label,
      fallbackId: operand.data_id,
      existingIds,
    });
    existingIds.add(indicatorId);
    holders.set(operand.data_id, indicatorId);
    maxSortOrder++;
    createdElements.push({
      indicatorId,
      label,
      dataId: operand.data_id,
      sortOrder: maxSortOrder,
    });
    return indicatorId;
  };

  // Retargets first, so a single-operand formula keeps its rows under the
  // operand instead of a sum or ratio formula processed earlier creating an
  // element for the same operand. Among several single-operand formulas over
  // one operand, the first by indicator id retargets and the rest name it.
  const outcomes = new Map<string, Dhis2IdFixOutcome>();
  for (const b of broken) {
    const d = b.diagnosis;
    if (d.kind !== "formula" || d.shape.kind !== "single") continue;
    if (holders.has(d.shape.operand)) continue;
    const operand = d.operands.get(d.shape.operand)!;
    holders.set(operand.data_id, b.indicator.indicator_common_id);
    outcomes.set(b.indicator.indicator_common_id, {
      outcome: "retarget",
      newDataId: operand.data_id,
      dhis2Label: elementName(operand),
    });
  }
  for (const b of broken) {
    const id = b.indicator.indicator_common_id;
    if (outcomes.has(id)) continue;
    const d = b.diagnosis;
    if (d.kind === "uploaded") {
      outcomes.set(id, { outcome: "to_uploaded", reason: d.reason });
      continue;
    }
    const members = (operandIds: string[]) =>
      [...new Set(operandIds.map((o) => holderOrCreated(d.operands.get(o)!)))]
        .sort(byCodeUnit);
    switch (d.shape.kind) {
      case "single":
        outcomes.set(id, {
          outcome: "to_sum",
          members: members([d.shape.operand]),
        });
        break;
      case "sum":
        outcomes.set(id, {
          outcome: "to_sum",
          members: members(d.shape.operands),
        });
        break;
      case "other": {
        if (isSpecialIndicatorId(id)) {
          outcomes.set(id, {
            outcome: "to_uploaded",
            reason: "a special id must stay a count",
          });
          break;
        }
        const mapping: Record<string, string> = {};
        for (const operand of d.operands.values()) {
          mapping[operand.data_id] = holderOrCreated(operand);
        }
        outcomes.set(id, {
          outcome: "to_calculated",
          expression: writeIndicatorExpression(
            renameIdentifiers(parseIndicatorExpression(d.expression), mapping),
          ),
          formatAs: d.formatAs,
        });
      }
    }
  }

  const actions: Dhis2IdFixAction[] = broken.map((b) => ({
    indicatorId: b.indicator.indicator_common_id,
    dataId: b.dataId,
    rows: facts.rows[b.dataId] ??
      { count: 0, firstPeriodId: null, lastPeriodId: null },
    ...outcomes.get(b.indicator.indicator_common_id)!,
  }));

  const retyped = new Map<string, Dhis2IdFixOutcome>();
  for (const a of actions) {
    if (a.outcome === "to_sum" || a.outcome === "to_calculated") {
      retyped.set(a.indicatorId, a);
    }
  }
  const sumRewrites: Dhis2IdFixSumRewrite[] = [];
  for (const i of facts.indicators) {
    if (i.definition.type !== "sum") continue;
    const members = rewriteSumMembers(i.definition.members, retyped);
    if (members !== undefined) {
      sumRewrites.push({ sumId: i.indicator_common_id, members });
    }
  }
  sumRewrites.sort((a, b) => byCodeUnit(a.sumId, b.sumId));

  return {
    dhis2Url: facts.dhis2Url,
    plannedAt,
    elementsChecked,
    elementsHealthy: healthy,
    createdElements,
    actions,
    sumRewrites,
  };
}
