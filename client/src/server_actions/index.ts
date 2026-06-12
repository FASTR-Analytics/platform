import type { ServerActionsType } from "lib";
import {
  prepareReportFiguresForTransmit,
  prepareSlideForTransmit,
  restoreReportFiguresAfterReceive,
  restoreSlideAfterReceive,
} from "lib";
import { createAllServerActions } from "./create_server_action";
export const _SERVER_HOST =
  process.env.NODE_ENV === "production" ? "" : "http://localhost:8000";

const baseActions = createAllServerActions();

export const serverActions = {
  ...baseActions,

  createSlide: (async (args) => {
    const preparedArgs = { ...args, slide: prepareSlideForTransmit((args as any).slide) };
    return await baseActions.createSlide(preparedArgs as any);
  }) as ServerActionsType["createSlide"],

  updateSlide: (async (args) => {
    const preparedArgs = { ...args, slide: prepareSlideForTransmit((args as any).slide) };
    return await baseActions.updateSlide(preparedArgs as any);
  }) as ServerActionsType["updateSlide"],

  getSlide: (async (args) => {
    const result = await baseActions.getSlide(args);
    if (result.success && (result.data as any)?.slide) {
      (result.data as any).slide = restoreSlideAfterReceive((result.data as any).slide);
    }
    return result;
  }) as ServerActionsType["getSlide"],

  getSlides: (async (args) => {
    const result = await baseActions.getSlides(args);
    if (result.success && Array.isArray(result.data)) {
      (result as any).data = (result.data as any[]).map((item: any) => ({
        ...item,
        slide: restoreSlideAfterReceive(item.slide),
      }));
    }
    return result;
  }) as ServerActionsType["getSlides"],

  // Report figures carry the same undefined-bearing figureInputs as slides —
  // round-trip them through the sentinel encode/decode (C1).
  getReportDetail: (async (args) => {
    const result = await baseActions.getReportDetail(args);
    if (result.success && (result.data as any)?.figures) {
      (result.data as any).figures = restoreReportFiguresAfterReceive((result.data as any).figures);
    }
    return result;
  }) as ServerActionsType["getReportDetail"],

  updateReportFigures: (async (args) => {
    const preparedArgs = {
      ...args,
      figures: prepareReportFiguresForTransmit((args as any).figures),
    };
    return await baseActions.updateReportFigures(preparedArgs as any);
  }) as ServerActionsType["updateReportFigures"],
};

