import { z } from "zod";
import {
  hfaIndicatorCodeSchema,
  hfaIndicatorEditSchema,
  hfaIndicatorVariantCodeSchema,
} from "../api-routes/instance/hfa_indicators.ts";
import { AI_RECORD_PAGE_MAX } from "./read_bounds.ts";

// The HFA tools' contracts: see copilot_catalogue.ts.

// The most indicators or variables one details read takes.
export const AI_HFA_DETAILS_MAX = 20;

// The write tools' inputs derive from the route's schemas: a round of main
// code, a variant row, and the indicator's own fields.
const codeRoundSchema = z.strictObject(
  hfaIndicatorCodeSchema.omit({ indicatorId: true }).shape,
);
const variantRowSchema = z.strictObject(
  hfaIndicatorVariantCodeSchema.omit({ indicatorId: true }).shape,
);
const field = hfaIndicatorEditSchema.shape;

const updateEntrySchema = z.strictObject({
  indicatorId: z.string(),
  shortLabel: field.shortLabel.optional(),
  definition: field.definition.optional().describe("Long label."),
  type: field.type.optional(),
  aggregation: field.aggregation.optional(),
  categoryId: field.categoryId.optional().describe(
    "Category id, null to clear.",
  ),
  subCategoryId: field.subCategoryId.optional().describe(
    "Sub-category id within the category, null to clear.",
  ),
  serviceCategoryIds: field.serviceCategoryIds.optional().describe(
    "The full set of service-category ids.",
  ),
  variantGroupId: field.variantGroupId.optional().describe(
    "Variant group id, null to clear.",
  ),
  code: z.array(codeRoundSchema.partial({ code: true })).min(1).optional()
    .describe("Rounds to patch; a round not listed is kept."),
  variantCode: z.array(variantRowSchema).min(1).optional().describe(
    "Variant rows to set; an empty code removes the row.",
  ),
});

export type HfaCodeRoundInput = z.infer<typeof codeRoundSchema>;
export type HfaVariantRowInput = z.infer<typeof variantRowSchema>;
export type HfaIndicatorUpdateInput = z.infer<typeof updateEntrySchema>;

const patchSchema = z.strictObject({
  shortLabel: field.shortLabel.optional(),
  definition: field.definition.optional().describe("Long label."),
  type: field.type.optional(),
  aggregation: field.aggregation.optional(),
  categoryId: field.categoryId.optional().describe(
    "Category id, null to clear. Changing the category clears the sub-category unless one is given.",
  ),
  subCategoryId: field.subCategoryId.optional().describe(
    "Sub-category id within the category, null to clear.",
  ),
  serviceCategoryIds: field.serviceCategoryIds.optional().describe(
    "The full set of service-category ids.",
  ),
  variantGroupId: field.variantGroupId.optional().describe(
    "Variant group id, null to clear. Changing the group drops the previous group's variant code.",
  ),
  code: z.array(codeRoundSchema.partial({ code: true, filterCode: true }))
    .optional().describe(
      "Rounds to patch; a round not listed is kept. An omitted code or filter code is kept and an empty string clears it.",
    ),
  variantCode: z.array(
    z.strictObject(
      hfaIndicatorVariantCodeSchema.omit({ indicatorId: true }).shape,
    ),
  ).optional().describe(
    "Variant rows to set, for items of the group the patch leaves; an empty code removes the row.",
  ),
});

export const HFA_TOOL_CONTRACTS = {
  get_hfa_indicators: {
    description:
      `List HFA indicators, ${AI_RECORD_PAGE_MAX} a call, one line each: id, long label, type and aggregation, category, sub-category and service categories, variant group, rounds with code, round status and whether the rounds agree, under the taxonomy (categories, sub-categories, service categories, variant groups and items, each id: label), which the first page alone writes. The count line states how many indicators match the filters, how many exist, which are written and the offset of the next page. The ids it prints are what every other HFA tool takes. Filter rather than page through everything: the default workbook holds hundreds of indicators. Filtering by status also prints each round's issues. withCode ends each line with the main code and filter, printed once when every round holds the same; it says 'differs by round' when they differ, 'none' without code, and leaves out variant code: read those with get_hfa_indicator_details. The search reads labels and ids, not code: namesVariable finds the indicators whose code names given variables.`,
    kind: "read",
    inputSchema: z.strictObject({
      search: z.string().optional().describe(
        "Only indicators whose id, short and long labels and category, sub-category and service-category labels together contain every word of this text, in any order (case- and accent-insensitive).",
      ),
      categoryId: z.string().optional().describe(
        "Only indicators in this category id.",
      ),
      serviceCategoryId: z.string().optional().describe(
        "Only indicators that include this service-category id.",
      ),
      status: z.enum(["error", "warning", "inconsistent", "none"])
        .optional()
        .describe(
          "error: some round has an error. warning: some round has a warning and none an error. inconsistent: the rounds' code differs. none: no round has code.",
        ),
      missingCategory: z.boolean().optional().describe(
        "Only indicators with no category assigned.",
      ),
      missingShortLabel: z.boolean().optional().describe(
        "Only indicators with an empty short label.",
      ),
      namesVariable: z.array(z.string()).min(1).optional().describe(
        "Only indicators whose main, filter or variant code, in any round, names one of these ids (survey variables, or indicators).",
      ),
      withCode: z.boolean().optional().describe(
        "End each line with the main code and filter: once when the rounds agree, else 'differs by round', 'none' without code. Variant code is not shown.",
      ),
      offset: z.number().int().min(0).optional().describe(
        "Optional: how many of the matching indicators to skip. Each page names the offset of the next.",
      ),
    }),
  },

  get_hfa_indicator_details: {
    description:
      `Read HFA indicators in full, up to ${AI_HFA_DETAILS_MAX} per call: both labels, the measure, type and aggregation, categories, the variant group and its items, and per round the code, the filter, each item's variant code, the round status and its issues. Then, once for the whole set, every survey variable the code names (per round its label, type, options with their sentinel class, and the facility counts and values present) and every other indicator the code names (its code and status per round). Use it to judge whether an indicator's code measures what its labels say.`,
    kind: "read",
    inputSchema: z.strictObject({
      indicatorIds: z.array(z.string()).min(1).describe(
        "The indicator ids to read, as get_hfa_indicators prints them.",
      ),
    }),
  },

  get_hfa_variables: {
    description:
      `List the HFA survey variables, ${AI_RECORD_PAGE_MAX} a call, one line each: id, label and type, and per round it is in, how many indicators' code of that round names it. The count line states how many variables match the filters, how many exist, which are written and the offset of the next page. Filter rather than page through everything: a survey has hundreds of variables. To see a variable's options, counts and values, and which indicators name it, use get_hfa_variable_details.`,
    kind: "read",
    inputSchema: z.strictObject({
      search: z.string().optional().describe(
        "Only variables whose id and labels together contain every word of this text, in any order (case- and accent-insensitive).",
      ),
      timePoint: z.string().optional().describe(
        "Only variables in this round.",
      ),
      unusedOnly: z.boolean().optional().describe(
        "Only variables that no indicator's code names in some round they are in (in the given round, when one is given). Structural columns are never listed.",
      ),
      offset: z.number().int().min(0).optional().describe(
        "Optional: how many of the matching variables to skip. Each page names the offset of the next.",
      ),
    }),
  },

  get_hfa_variable_details: {
    description:
      `Read HFA survey variables in full, up to ${AI_HFA_DETAILS_MAX} per call: per round the label and type, the options (code: label, with the sentinel class of a don't-know, refused, other, not-applicable or question-specific code, and a mark on a text code, which the run reads as missing), the facilities with a row, blank and non-blank, the values present, and the indicators whose code names it. Read a variable here before comparing it to a code.`,
    kind: "read",
    inputSchema: z.strictObject({
      variableIds: z.array(z.string()).min(1).describe(
        "The survey variable ids to read.",
      ),
      timePoint: z.string().optional().describe(
        "Only this round.",
      ),
    }),
  },

  create_hfa_indicators: {
    description:
      'Create new HFA indicators, in a batch. For each: the long label (definition), an optional short label, type and aggregation (usually binary and avg, "% of facilities"), optional category, sub-category and service categories, an optional variant group, per-round code and an optional filter code (the code and filterCode fields) and, for a variant group, per-round code for each item. The app assigns each id and returns it. Every id is checked against the taxonomy and the rounds, and code with an error (syntax, unknown variable, a filter or variant code without code, a cycle) is refused before anything is proposed; a result-type mismatch is a warning. The user confirms the batch in a dialog.',
    kind: "write",
    inputSchema: z.strictObject({
      indicators: z.array(z.strictObject({
        definition: field.definition.describe(
          "Long label: the full descriptive text.",
        ),
        shortLabel: field.shortLabel.optional().describe(
          "Short label for dense charts.",
        ),
        type: field.type,
        aggregation: field.aggregation,
        categoryId: field.categoryId.optional(),
        subCategoryId: field.subCategoryId.optional().describe(
          "Must belong to the category.",
        ),
        serviceCategoryIds: field.serviceCategoryIds.optional(),
        variantGroupId: field.variantGroupId.optional(),
        code: z.array(codeRoundSchema).optional().describe(
          "Per-round code. Keep it identical across rounds unless the survey changed.",
        ),
        variantCode: z.array(variantRowSchema).optional().describe(
          "Per-round code for each item of the variant group; the round's filter applies to every item.",
        ),
      })).min(1),
    }),
  },

  update_hfa_indicators: {
    description:
      "Change existing HFA indicators, in a batch: any of the labels, type, aggregation, category, sub-category, service categories, variant group, per-round code and per-item variant code, in one call. Give only the fields to change. Code is patched: a round or variant row not listed is kept; in a listed round an omitted code or filter code is kept and an empty string clears it; clearing the code removes the round's code; a variant row with empty code is removed. Changing the category clears a sub-category that no longer fits; changing the variant group drops the previous group's variant code. Ids are checked against the taxonomy and the rounds, and code you write with an error is refused before anything is proposed. The user confirms the batch in a dialog.",
    kind: "write",
    inputSchema: z.strictObject({
      updates: z.array(updateEntrySchema).min(1),
    }),
  },

  delete_hfa_indicators: {
    description:
      "Permanently delete HFA indicators by indicator id (and their indicator code). Use with care.",
    kind: "write",
    inputSchema: z.strictObject({ indicatorIds: z.array(z.string()).min(1) }),
  },

  get_hfa_indicator_editor: {
    description:
      "Read the HFA indicator open in the code editor as its unsaved draft stands, in full: both labels, the measure, type and aggregation, categories, the variant group and its items, and per round the code, the filter, each item's variant code, the round status and its issues; then every survey variable and every other indicator the code names, once. Also names the round the user is looking at. Call this before update_hfa_indicator_editor.",
    kind: "read",
    inputSchema: z.strictObject({}),
  },

  update_hfa_indicator_editor: {
    description:
      "Change the HFA indicator open in the code editor. Provide only the fields to change (labels, type, aggregation, category, sub-category, service categories, variant group, per-round code and filter, per-item variant code); everything else is kept. The change lands in the editor's draft like the user's own edit, unsaved: the user keeps it with Save or discards it with Cancel. Ids, items and rounds are checked before anything changes. The result gives each round's status after the change. Call get_hfa_indicator_editor first.",
    kind: "write",
    inputSchema: patchSchema,
  },
} as const;
