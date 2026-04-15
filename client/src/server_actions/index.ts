import { prepareSlideForTransmit, restoreSlideAfterReceive } from "lib";
import { createAllServerActions } from "./create_server_action";

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
};
