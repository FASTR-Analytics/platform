import type {
  HfaDictionaryForValidation,
  HfaIndicator,
  HfaIndicatorCode,
  HfaIndicatorCategory,
  HfaIndicatorSubCategory,
  HfaWorkbookImport,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

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
    body: {} as { category: HfaIndicatorCategory },
  }),

  updateHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories/update",
    method: "POST",
    body: {} as { oldId: string; category: HfaIndicatorCategory },
  }),

  deleteHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories/delete",
    method: "POST",
    body: {} as { id: string },
  }),

  reorderHfaIndicatorCategories: route({
    path: "/hfa-indicator-categories/reorder",
    method: "POST",
    body: {} as { orderedIds: string[] },
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
    body: {} as { subCategory: HfaIndicatorSubCategory },
  }),

  updateHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories/update",
    method: "POST",
    body: {} as { oldId: string; subCategory: HfaIndicatorSubCategory },
  }),

  deleteHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories/delete",
    method: "POST",
    body: {} as { id: string },
  }),

  reorderHfaIndicatorSubCategories: route({
    path: "/hfa-indicator-sub-categories/reorder",
    method: "POST",
    body: {} as { categoryId: string; orderedIds: string[] },
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
    body: {} as { indicator: HfaIndicator },
  }),

  updateHfaIndicator: route({
    path: "/hfa-indicators/update",
    method: "POST",
    body: {} as { oldVarName: string; indicator: HfaIndicator },
  }),

  deleteHfaIndicators: route({
    path: "/hfa-indicators/delete",
    method: "POST",
    body: {} as { varNames: string[] },
  }),

  batchUploadHfaIndicators: route({
    path: "/hfa-indicators/batch",
    method: "POST",
    body: {} as {
      indicators: HfaIndicator[];
      code: HfaIndicatorCode[];
      replaceAll: boolean;
    },
  }),

  importHfaIndicatorsWorkbook: route({
    path: "/hfa-indicators/import-workbook",
    method: "POST",
    body: {} as HfaWorkbookImport,
  }),

  getHfaIndicatorCode: route({
    path: "/hfa-indicators/code",
    method: "POST",
    body: {} as { varName: string },
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
    body: {} as { varName: string; timePoint: string; rCode: string; rFilterCode: string | undefined },
  }),

  saveHfaIndicatorFull: route({
    path: "/hfa-indicators/save-full",
    method: "POST",
    body: {} as {
      oldVarName: string;
      indicator: HfaIndicator;
      code: { timePoint: string; rCode: string; rFilterCode: string | undefined }[];
      hasSyntaxError: boolean;
      codeConsistent: boolean;
    },
  }),

  getHfaDictionaryForValidation: route({
    path: "/hfa-indicators/dictionary",
    method: "GET",
    response: {} as HfaDictionaryForValidation,
  }),

  bulkUpdateHfaIndicatorValidation: route({
    path: "/hfa-indicators/bulk-update-validation",
    method: "POST",
    body: {} as {
      updates: { varName: string; hasSyntaxError: boolean; codeConsistent: boolean }[];
    },
  }),
} as const;
