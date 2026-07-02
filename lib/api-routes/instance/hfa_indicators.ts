import { z } from "zod";
import type {
  HfaDictionaryForValidation,
  HfaIndicator,
  HfaIndicatorCode,
  HfaIndicatorCategory,
  HfaIndicatorServiceCategory,
  HfaIndicatorSubCategory,
  HfaWorkbookImportResult,
} from "../../types/mod.ts";
import { HFA_VAR_NAME_REGEX } from "../../hfa_r_code_analysis.ts";
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

const hfaVarNameSchema = z.string().regex(
  HFA_VAR_NAME_REGEX,
  "varName must start with a letter and contain only letters, digits, and underscores (max 64 characters)",
);

const hfaIndicatorSchema = z.object({
  varName: hfaVarNameSchema,
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
});

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
  indicators: z.array(z.object({
    varName: hfaVarNameSchema,
    categoryId: z.string().nullable(),
    subCategoryId: z.string().nullable(),
    serviceCategoryIds: z.array(z.string()),
    shortLabel: z.string(),
    definition: z.string(),
    type: z.enum(["binary", "numeric"]),
    aggregation: z.enum(["sum", "avg"]),
  })),
  code: z.array(hfaIndicatorCodeSchema),
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
    body: z.object({ oldVarName: z.string(), indicator: hfaIndicatorSchema }),
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
  updateHfaIndicatorCode: route({
    path: "/hfa-indicators/code/update",
    method: "POST",
    body: z.object({
      varName: z.string(),
      timePoint: z.string(),
      rCode: z.string(),
      rFilterCode: z.string().optional(),
    }),
  }),
  saveHfaIndicatorFull: route({
    path: "/hfa-indicators/save-full",
    method: "POST",
    body: z.object({
      oldVarName: z.string(),
      indicator: hfaIndicatorSchema,
      code: z.array(z.object({
        timePoint: z.string(),
        rCode: z.string(),
        rFilterCode: z.string().optional(),
      })),
      hasSyntaxError: z.boolean(),
      codeConsistent: z.boolean(),
    }),
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
