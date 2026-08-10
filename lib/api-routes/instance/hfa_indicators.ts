import { z } from "zod";
import type {
  HfaDictionaryForValidation,
  HfaIndicator,
  HfaIndicatorCode,
  HfaIndicatorCategory,
  HfaIndicatorServiceCategory,
  HfaIndicatorSubCategory,
  HfaIndicatorVariantCode,
  HfaIndicatorVariantGroup,
  HfaIndicatorVariantItem,
  HfaWorkbookImportResult,
} from "../../types/mod.ts";
import {
  HFA_INDICATOR_NAME_REGEX,
  HFA_VARIANT_ITEM_ID_REGEX,
  isReservedHfaVarName,
} from "../../hfa_r_code_analysis.ts";
import { route } from "../route-utils.ts";

const hfaIndicatorCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaIndicatorSubCategorySchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaIndicatorServiceCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaIndicatorVariantGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaVariantItemIdSchema = z
  .string()
  .regex(
    HFA_VARIANT_ITEM_ID_REGEX,
    "item id must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 characters)",
  );

const hfaIndicatorVariantItemSchema = z.object({
  id: hfaVariantItemIdSchema,
  groupId: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaIndicatorVariantCodeSchema = z.object({
  varName: z.string(),
  timePoint: z.string(),
  itemId: z.string(),
  rCode: z.string(),
});

const RESERVED_VAR_NAME_MESSAGE =
  "varName is a reserved word (an R function or operator used in indicator code, or a column the analysis script generates) — choose a different name";

const hfaVarNameShapeSchema = z
  .string()
  .regex(
    HFA_INDICATOR_NAME_REGEX,
    "varName must start with a letter and contain only letters, digits, and underscores (max 64 characters)",
  );

const hfaVarNameSchema = hfaVarNameShapeSchema.refine(
  (n) => !isReservedHfaVarName(n),
  RESERVED_VAR_NAME_MESSAGE,
);

// Shape only. The update paths identify the row by oldVarName and varName is
// immutable there (hfa_indicator_code's FK has no ON UPDATE CASCADE), so the
// body carries the stored name back unchanged. Applying the reserved-word rule
// to it would lock every indicator whose name predates the rule out of all
// edits — and fail a whole bulk batch atomically. A genuine rename is still
// checked, by withRenameRule below.
const hfaIndicatorEditSchema = z.object({
  varName: hfaVarNameShapeSchema,
  categoryId: z.string().nullable(),
  subCategoryId: z.string().nullable(),
  serviceCategoryIds: z.array(z.string()),
  shortLabel: z.string(),
  definition: z.string(),
  type: z.enum(["binary", "numeric"]),
  aggregation: z.enum(["sum", "avg"]),
  sortOrder: z.number(),
  hasSyntaxError: z.boolean(),
  codeConsistent: z.boolean(),
  variantGroupId: z.string().nullable(),
});

// Creation paths: a name entering the dictionary must also clear the reserved set.
const hfaIndicatorSchema = hfaIndicatorEditSchema.extend({
  varName: hfaVarNameSchema,
});

function withRenameRule<
  T extends z.ZodType<{ oldVarName: string; indicator: { varName: string } }>,
>(schema: T) {
  return schema.refine(
    (b) =>
      b.indicator.varName === b.oldVarName ||
      !isReservedHfaVarName(b.indicator.varName),
    { message: RESERVED_VAR_NAME_MESSAGE, path: ["indicator", "varName"] },
  );
}

const hfaIndicatorCodeSchema = z.object({
  varName: z.string(),
  timePoint: z.string(),
  rCode: z.string(),
  rFilterCode: z.string().optional(),
});

const hfaWorkbookImportSchema = z.object({
  categories: z.array(z.object({ id: z.string(), label: z.string() })),
  subCategories: z.array(z.object({ id: z.string(), categoryId: z.string(), label: z.string() })),
  serviceCategories: z.array(z.object({ id: z.string(), label: z.string() })),
  variantGroups: z.array(z.object({ id: z.string(), label: z.string() })),
  variantItems: z.array(z.object({ id: hfaVariantItemIdSchema, groupId: z.string(), label: z.string() })),
  indicators: z.array(z.object({
    varName: hfaVarNameSchema,
    categoryId: z.string().nullable(),
    subCategoryId: z.string().nullable(),
    serviceCategoryIds: z.array(z.string()),
    shortLabel: z.string(),
    definition: z.string(),
    type: z.enum(["binary", "numeric"]),
    aggregation: z.enum(["sum", "avg"]),
    variantGroupId: z.string().nullable(),
  })),
  code: z.array(hfaIndicatorCodeSchema),
  variantCode: z.array(hfaIndicatorVariantCodeSchema),
  replaceAll: z.boolean(),
});

const idBodySchema = z.object({ id: z.string() });
const orderedIdsBodySchema = z.object({ orderedIds: z.array(z.string()) });

export const hfaIndicatorRouteRegistry = {
  // Categories
  getHfaIndicatorCategories: route({
    path: "/hfa-indicator-categories",
    method: "GET",
    response: {} as HfaIndicatorCategory[],
  }),
  createHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories",
    method: "POST",
    body: z.object({ category: hfaIndicatorCategorySchema }),
  }),
  updateHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories/update",
    method: "POST",
    body: z.object({ oldId: z.string(), category: hfaIndicatorCategorySchema }),
  }),
  deleteHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories/delete",
    method: "POST",
    body: idBodySchema,
  }),
  reorderHfaIndicatorCategories: route({
    path: "/hfa-indicator-categories/reorder",
    method: "POST",
    body: orderedIdsBodySchema,
  }),
  // Sub-categories
  getHfaIndicatorSubCategories: route({
    path: "/hfa-indicator-sub-categories",
    method: "GET",
    response: {} as HfaIndicatorSubCategory[],
  }),
  createHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories",
    method: "POST",
    body: z.object({ subCategory: hfaIndicatorSubCategorySchema }),
  }),
  updateHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories/update",
    method: "POST",
    body: z.object({ oldId: z.string(), subCategory: hfaIndicatorSubCategorySchema }),
  }),
  deleteHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories/delete",
    method: "POST",
    body: idBodySchema,
  }),
  reorderHfaIndicatorSubCategories: route({
    path: "/hfa-indicator-sub-categories/reorder",
    method: "POST",
    body: z.object({ categoryId: z.string(), orderedIds: z.array(z.string()) }),
  }),
  // Service categories
  getHfaIndicatorServiceCategories: route({
    path: "/hfa-indicator-service-categories",
    method: "GET",
    response: {} as HfaIndicatorServiceCategory[],
  }),
  createHfaIndicatorServiceCategory: route({
    path: "/hfa-indicator-service-categories",
    method: "POST",
    body: z.object({ serviceCategory: hfaIndicatorServiceCategorySchema }),
  }),
  updateHfaIndicatorServiceCategory: route({
    path: "/hfa-indicator-service-categories/update",
    method: "POST",
    body: z.object({ oldId: z.string(), serviceCategory: hfaIndicatorServiceCategorySchema }),
  }),
  deleteHfaIndicatorServiceCategory: route({
    path: "/hfa-indicator-service-categories/delete",
    method: "POST",
    body: idBodySchema,
  }),
  reorderHfaIndicatorServiceCategories: route({
    path: "/hfa-indicator-service-categories/reorder",
    method: "POST",
    body: orderedIdsBodySchema,
  }),
  // Variant groups
  getHfaIndicatorVariantGroups: route({
    path: "/hfa-indicator-variant-groups",
    method: "GET",
    response: {} as HfaIndicatorVariantGroup[],
  }),
  createHfaIndicatorVariantGroup: route({
    path: "/hfa-indicator-variant-groups",
    method: "POST",
    body: z.object({ group: hfaIndicatorVariantGroupSchema }),
  }),
  updateHfaIndicatorVariantGroup: route({
    path: "/hfa-indicator-variant-groups/update",
    method: "POST",
    body: z.object({ oldId: z.string(), group: hfaIndicatorVariantGroupSchema }),
  }),
  deleteHfaIndicatorVariantGroup: route({
    path: "/hfa-indicator-variant-groups/delete",
    method: "POST",
    body: idBodySchema,
  }),
  reorderHfaIndicatorVariantGroups: route({
    path: "/hfa-indicator-variant-groups/reorder",
    method: "POST",
    body: orderedIdsBodySchema,
  }),
  // Variant items
  getHfaIndicatorVariantItems: route({
    path: "/hfa-indicator-variant-items",
    method: "GET",
    response: {} as HfaIndicatorVariantItem[],
  }),
  createHfaIndicatorVariantItem: route({
    path: "/hfa-indicator-variant-items",
    method: "POST",
    body: z.object({ item: hfaIndicatorVariantItemSchema }),
  }),
  updateHfaIndicatorVariantItem: route({
    path: "/hfa-indicator-variant-items/update",
    method: "POST",
    body: z.object({ oldId: z.string(), item: hfaIndicatorVariantItemSchema }),
  }),
  deleteHfaIndicatorVariantItem: route({
    path: "/hfa-indicator-variant-items/delete",
    method: "POST",
    body: idBodySchema,
  }),
  reorderHfaIndicatorVariantItems: route({
    path: "/hfa-indicator-variant-items/reorder",
    method: "POST",
    body: z.object({ groupId: z.string(), orderedIds: z.array(z.string()) }),
  }),
  // Indicators
  getHfaIndicators: route({
    path: "/hfa-indicators",
    method: "GET",
    response: {} as HfaIndicator[],
  }),
  createHfaIndicator: route({
    path: "/hfa-indicators",
    method: "POST",
    body: z.object({ indicator: hfaIndicatorSchema }),
  }),
  updateHfaIndicator: route({
    path: "/hfa-indicators/update",
    method: "POST",
    body: withRenameRule(
      z.object({ oldVarName: z.string(), indicator: hfaIndicatorEditSchema }),
    ),
  }),
  updateHfaIndicatorsBulk: route({
    path: "/hfa-indicators/update-bulk",
    method: "POST",
    body: z.object({
      updates: z.array(
        withRenameRule(
          z.object({ oldVarName: z.string(), indicator: hfaIndicatorEditSchema }),
        ),
      ).min(1),
    }),
  }),
  deleteHfaIndicators: route({
    path: "/hfa-indicators/delete",
    method: "POST",
    body: z.object({ varNames: z.array(z.string()) }),
  }),
  batchUploadHfaIndicators: route({
    path: "/hfa-indicators/batch",
    method: "POST",
    body: z.object({
      indicators: z.array(hfaIndicatorSchema),
      code: z.array(hfaIndicatorCodeSchema),
      replaceAll: z.boolean(),
    }),
  }),
  importHfaIndicatorsWorkbook: route({
    path: "/hfa-indicators/import-workbook",
    method: "POST",
    body: hfaWorkbookImportSchema,
    response: {} as HfaWorkbookImportResult,
  }),
  getHfaIndicatorCode: route({
    path: "/hfa-indicators/code",
    method: "POST",
    body: z.object({ varName: z.string() }),
    response: {} as HfaIndicatorCode[],
  }),
  getAllHfaIndicatorCode: route({
    path: "/hfa-indicators/code/all",
    method: "GET",
    response: {} as HfaIndicatorCode[],
  }),
  getHfaIndicatorVariantCode: route({
    path: "/hfa-indicators/variant-code",
    method: "POST",
    body: z.object({ varName: z.string() }),
    response: {} as HfaIndicatorVariantCode[],
  }),
  getAllHfaIndicatorVariantCode: route({
    path: "/hfa-indicators/variant-code/all",
    method: "GET",
    response: {} as HfaIndicatorVariantCode[],
  }),
  saveHfaIndicatorFull: route({
    path: "/hfa-indicators/save-full",
    method: "POST",
    body: withRenameRule(
      z.object({
        oldVarName: z.string(),
        indicator: hfaIndicatorEditSchema,
        code: z.array(z.object({
          timePoint: z.string(),
          rCode: z.string(),
          rFilterCode: z.string().optional(),
        })),
        variantCode: z.array(z.object({
          timePoint: z.string(),
          itemId: z.string(),
          rCode: z.string(),
        })),
        hasSyntaxError: z.boolean(),
        codeConsistent: z.boolean(),
      }),
    ),
  }),
  getHfaDictionaryForValidation: route({
    path: "/hfa-indicators/dictionary",
    method: "GET",
    response: {} as HfaDictionaryForValidation,
  }),
  bulkUpdateHfaIndicatorValidation: route({
    path: "/hfa-indicators/bulk-update-validation",
    method: "POST",
    body: z.object({
      updates: z.array(z.object({
        varName: z.string(),
        hasSyntaxError: z.boolean(),
        codeConsistent: z.boolean(),
      })),
    }),
  }),
} as const;
