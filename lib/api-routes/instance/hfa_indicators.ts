import type { HfaDictionaryForValidation, HfaIndicator, HfaIndicatorCode } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const hfaIndicatorRouteRegistry = {
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
