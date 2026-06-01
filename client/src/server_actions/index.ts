import type { APIResponseWithData, ProjectSummary } from "lib";
import {
  prepareReportFiguresForTransmit,
  prepareSlideForTransmit,
  restoreReportFiguresAfterReceive,
  restoreSlideAfterReceive,
} from "lib";
import { createAllServerActions } from "./create_server_action";
import { tryCatchServer } from "./try_catch_server";

export const _SERVER_HOST =
  process.env.NODE_ENV === "production" ? "" : "http://localhost:8000";

const baseActions = createAllServerActions();

export const serverActions = {
  ...baseActions,

  createSlide: async (args: any) => {
    const preparedArgs = { ...args, slide: prepareSlideForTransmit(args.slide) };
    return await baseActions.createSlide(preparedArgs);
  },

  updateSlide: async (args: any) => {
    const preparedArgs = { ...args, slide: prepareSlideForTransmit(args.slide) };
    return await baseActions.updateSlide(preparedArgs);
  },

  getSlide: async (args: any) => {
    const result = await baseActions.getSlide(args);
    if (result.success && result.data?.slide) {
      result.data.slide = restoreSlideAfterReceive(result.data.slide);
    }
    return result;
  },

  getSlides: async (args: any) => {
    const result = await baseActions.getSlides(args);
    if (result.success && Array.isArray(result.data)) {
      result.data = result.data.map((item: any) => ({
        ...item,
        slide: restoreSlideAfterReceive(item.slide),
      }));
    }
    return result;
  },

  // Report figures carry the same undefined-bearing figureInputs as slides —
  // round-trip them through the sentinel encode/decode (C1).
  getReportDetail: async (args: any) => {
    const result = await baseActions.getReportDetail(args);
    if (result.success && result.data?.figures) {
      result.data.figures = restoreReportFiguresAfterReceive(result.data.figures);
    }
    return result;
  },

  updateReportFigures: async (args: any) => {
    const preparedArgs = {
      ...args,
      figures: prepareReportFiguresForTransmit(args.figures),
    };
    return await baseActions.updateReportFigures(preparedArgs);
  },
};

export async function fetchMyProjects(): Promise<APIResponseWithData<ProjectSummary[]>> {
  return tryCatchServer<APIResponseWithData<ProjectSummary[]>>(
    `${_SERVER_HOST}/my_projects`,
    { method: "GET", credentials: "include" }
  );
}
