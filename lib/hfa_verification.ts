import { z } from "zod";
import {
  createHfaIndicatorDetailsFormatter,
  formatHfaIndicatorListForAI,
  formatHfaVariableListForAI,
  type HfaIndicatorsForAIInput,
} from "./ai_tools/format_hfa_indicators_for_ai.ts";
import { getHfaIndicatorsGuidance } from "./hfa_indicator_guidance.ts";
import {
  HFA_VERIFICATION_MODEL_RULE_IDS,
  HFA_VERIFICATION_RULE_GROUPS,
  HFA_VERIFICATION_RULES,
  hfaVerificationRule,
  type HfaVerificationRuleGroup,
} from "./hfa_verification_rules.ts";
import type { Language } from "./translate/mod.ts";
import type {
  HfaIndicatorEditorPatch,
  HfaVerificationFinding,
  HfaVerificationNewFinding,
} from "./types/mod.ts";

// What the HFA indicator verification sends to the model and takes back: one
// call per indicator, the instruction block and the context block as system
// text and the indicator as the message; and, for one indicator in the code
// editor, the fix call over the same two blocks.

export const hfaVerificationNewFindingSchema = z.object({
  rule: z.enum(HFA_VERIFICATION_MODEL_RULE_IDS).describe(
    "The id of the one rule the indicator breaks.",
  ),
  timePoint: z.string().nullable().describe(
    "The round the finding is about, or null for the whole indicator.",
  ),
  message: z.string().describe("What is wrong."),
  suggestion: z.string().nullable().describe(
    "What to change, with the corrected code or label where there is one.",
  ),
}) satisfies z.ZodType<HfaVerificationNewFinding>;

export const hfaVerificationOutputSchema = z.object({
  findings: z.array(hfaVerificationNewFindingSchema),
});

const nullableCode = z.string().nullable();

// Every field null when the edit leaves it as it is.
export const hfaFixOutputSchema = z.object({
  shortLabel: z.string().nullable(),
  definition: z.string().nullable().describe("The long label."),
  type: z.enum(["binary", "numeric"]).nullable(),
  aggregation: z.enum(["sum", "avg"]).nullable(),
  categoryId: z.string().nullable(),
  subCategoryId: z.string().nullable(),
  serviceCategoryIds: z.array(z.string()).nullable(),
  variantGroupId: z.string().nullable(),
  code: z.array(z.object({
    timePoint: z.string(),
    code: nullableCode.describe('Null keeps the code; "" clears it.'),
    filterCode: nullableCode.describe('Null keeps the filter; "" clears it.'),
  })).nullable().describe("Only the rounds the edit changes."),
  variantCode: z.array(z.object({
    timePoint: z.string(),
    itemId: z.string(),
    code: z.string().describe('"" removes the row.'),
  })).nullable().describe("Only the variant rows the edit changes."),
  note: z.string().describe("One sentence saying what the edit does."),
});

export type HfaFixOutput = z.infer<typeof hfaFixOutputSchema>;

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fr: "French",
  pt: "Portuguese",
};

// The guidance and the model rules; the same text for every indicator and
// every run of an instance, so it is part of each indicator's input hash.
export function buildHfaVerificationInstructionBlock(
  language: Language,
): string {
  const groups = Object.keys(
    HFA_VERIFICATION_RULE_GROUPS,
  ) as HfaVerificationRuleGroup[];
  const ruleLines = groups.flatMap((group) => {
    const rules = HFA_VERIFICATION_RULES.filter((r) =>
      r.checker === "model" && r.group === group
    );
    return rules.length === 0 ? [] : [
      "",
      `### ${HFA_VERIFICATION_RULE_GROUPS[group].en}`,
      ...rules.map((r) => `- \`${r.id}\`: ${r.text.en}`),
    ];
  });
  return [
    "# Checking an HFA indicator",
    "You check one HFA indicator against the rules below and report each rule it breaks. The next system block lists every indicator of the instance with its code, and every survey variable. The user message holds the indicator in full: its labels, type and aggregation, categories, and per round its code, filter, variant code, status and issues; then every variable and every other indicator its code names.",
    "",
    getHfaIndicatorsGuidance(),
    "",
    "## The rules",
    "The app already checks that the code is well formed, that every name in it is known, that a filter or variant code has indicator code, that indicators do not name each other in a loop, and that the code's result fits the type. Those issues are listed under each round of the message: do not report them.",
    ...ruleLines,
    "",
    "## What to return",
    "- A finding names the one rule it breaks, by its id, in `rule`.",
    "- At most one finding per rule and round. A finding about several variables, values or items names them all in its message.",
    "- `timePoint` is the round the finding is about, as the message names it, or null for a finding about the whole indicator.",
    "- `message` says what is wrong. `suggestion` says what to change, with the corrected code or label where there is one, or is null.",
    `- Write every text you return in ${LANGUAGE_NAMES[language]}.`,
    "- The message may end with findings the user dismissed. They have been judged: do not report them again.",
    "- Return no finding for an indicator that is right.",
  ].join("\n");
}

function buildHfaVerificationContextBlock(
  read: HfaIndicatorsForAIInput,
): string {
  const variableIds = new Set(
    read.dictionary.timePoints.flatMap((tp) =>
      tp.variables.map((v) => v.variableId)
    ),
  );
  return [
    "# The instance's HFA indicators and survey variables",
    "",
    "## Indicators",
    formatHfaIndicatorListForAI(read, read.indicators, {
      withIssues: false,
      withCode: true,
    }),
    "",
    "## Survey variables",
    formatHfaVariableListForAI(read, [...variableIds]),
  ].join("\n");
}

export function buildHfaVerificationBlocks(
  read: HfaIndicatorsForAIInput,
  language: Language,
): { instructionBlock: string; contextBlock: string } {
  return {
    instructionBlock: buildHfaVerificationInstructionBlock(language),
    contextBlock: buildHfaVerificationContextBlock(read),
  };
}

function dismissedSection(dismissed: HfaVerificationFinding[]): string {
  return [
    "## Findings the user dismissed",
    ...dismissed.map((f) =>
      `- \`${f.rule}\`, ${
        f.timePoint === null ? "whole indicator" : `round ${f.timePoint}`
      }: ${f.message}`
    ),
  ].join("\n");
}

// Per indicator of `read`, the message sent and the message hashed: the
// hashed one is built without display rows, so a data upload changes no
// hash, and without the dismissed section, so a dismissal changes none.
export function buildHfaVerificationMessages(
  read: HfaIndicatorsForAIInput,
  dismissedByIndicator: ReadonlyMap<string, HfaVerificationFinding[]>,
): Map<string, { message: string; hashedMessage: string }> {
  const formatHashed = createHfaIndicatorDetailsFormatter({
    ...read,
    displayRows: undefined,
  });
  const formatSent = read.displayRows === undefined
    ? formatHashed
    : createHfaIndicatorDetailsFormatter(read);
  return new Map(read.indicators.map((ind) => {
    const id = ind.indicatorId;
    const hashedMessage = formatHashed([id]);
    const body = formatSent === formatHashed ? hashedMessage : formatSent([id]);
    const dismissed = dismissedByIndicator.get(id) ?? [];
    return [id, {
      message: dismissed.length === 0
        ? body
        : `${body}\n\n${dismissedSection(dismissed)}`,
      hashedMessage,
    }];
  }));
}

// SHA-256 hex. The model id is not an ingredient: a new model re-checks
// through Verify all, not by marking every indicator changed.
export async function hfaVerificationInputHash(
  instructionBlock: string,
  hashedMessage: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${instructionBlock}\u0000${hashedMessage}`),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// The fix call's message: the indicator in full, its open findings with
// their rules' text, and what to return.
export function buildHfaFixMessage(
  read: HfaIndicatorsForAIInput,
  indicatorId: string,
  findings: HfaVerificationFinding[],
): string {
  return [
    createHfaIndicatorDetailsFormatter(read)([indicatorId]),
    "",
    "## Open findings",
    ...findings.map((f) =>
      `- \`${f.rule}\` (${hfaVerificationRule(f.rule).text.en}), ${
        f.timePoint === null ? "whole indicator" : `round ${f.timePoint}`
      }: ${f.message}${
        f.suggestion === null ? "" : ` Suggestion: ${f.suggestion}`
      }`
    ),
    "",
    "## The edit",
    `Return one edit of indicator ${indicatorId} that resolves these findings. Leave every field the edit does not change null. List only the rounds and the variant rows the edit changes. Name categories, sub-categories, service categories, variant groups and items by the ids the taxonomy lists, and never clear a category, sub-category or variant group. In \`note\`, say in one sentence what the edit does.`,
  ].join("\n");
}

export function fixToPatch(output: HfaFixOutput): HfaIndicatorEditorPatch {
  const patch: HfaIndicatorEditorPatch = {};
  if (output.shortLabel !== null) patch.shortLabel = output.shortLabel;
  if (output.definition !== null) patch.definition = output.definition;
  if (output.type !== null) patch.type = output.type;
  if (output.aggregation !== null) patch.aggregation = output.aggregation;
  if (output.categoryId !== null) patch.categoryId = output.categoryId;
  if (output.subCategoryId !== null) patch.subCategoryId = output.subCategoryId;
  if (output.serviceCategoryIds !== null) {
    patch.serviceCategoryIds = output.serviceCategoryIds;
  }
  if (output.variantGroupId !== null) {
    patch.variantGroupId = output.variantGroupId;
  }
  if (output.code !== null) {
    patch.code = output.code.map((r) => ({
      timePoint: r.timePoint,
      ...(r.code === null ? {} : { code: r.code }),
      ...(r.filterCode === null ? {} : { filterCode: r.filterCode }),
    }));
  }
  if (output.variantCode !== null) patch.variantCode = output.variantCode;
  return patch;
}
