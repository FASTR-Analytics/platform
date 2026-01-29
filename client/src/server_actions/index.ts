// Main export for server actions
import { createAllServerActionsV2 } from "./_internal/create-all-server-actions-v2";
import { prepareSlideForTransmit, restoreSlideAfterReceive } from "lib";

// Create base server actions
const baseActions = createAllServerActionsV2();

// Wrap slide endpoints with prepare/restore
export const serverActions = {
  ...baseActions,

  // Wrap createSlide to prepare before sending
  createSlide: async (args: any) => {
    const preparedArgs = { ...args, slide: prepareSlideForTransmit(args.slide) };
    return await baseActions.createSlide(preparedArgs);
  },

  // Wrap updateSlide to prepare before sending
  updateSlide: async (args: any) => {
    const preparedArgs = { ...args, slide: prepareSlideForTransmit(args.slide) };
    return await baseActions.updateSlide(preparedArgs);
  },

  // Wrap getSlide to restore after receiving
  getSlide: async (args: any) => {
    const result = await baseActions.getSlide(args);
    if (result.success && result.data?.slide) {
      result.data.slide = restoreSlideAfterReceive(result.data.slide);
    }
    return result;
  },

  // Wrap getSlides to restore after receiving
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
