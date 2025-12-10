import { TOOL_DEFINITIONS, type ModuleId } from "lib";
import { serverActions } from "~/server_actions";

export function getToolHandlers(
  projectId: string,
): Record<string, (input: unknown) => Promise<string>> {
  return {
    [TOOL_DEFINITIONS.GET_MODULE_INFORMATION.name]: async () => {
      const res = await serverActions.getModulesList({
        projectId,
      });
      if (!res.success) throw new Error(res.err);
      return res.data;
    },
    [TOOL_DEFINITIONS.GET_MODULE_R_SCRIPT.name]: async (input: unknown) => {
      const { id } = input as { id: ModuleId };
      const res = await serverActions.getScript({
        projectId,
        module_id: id,
      });
      if (!res.success) throw new Error(res.err);
      return res.data.script;
    },
    [TOOL_DEFINITIONS.GET_MODULE_LOG.name]: async (input: unknown) => {
      const { id } = input as { id: ModuleId };
      const res = await serverActions.getLogs({
        projectId,
        module_id: id,
      });
      if (!res.success) throw new Error(res.err);
      return res.data.logs;
    },
    [TOOL_DEFINITIONS.GET_VISUALIZATIONS_AND_METADATA.name]: async () => {
      const res = await serverActions.getVisualizationsList({
        projectId,
      });
      if (!res.success) throw new Error(res.err);
      return res.data;
    },
    [TOOL_DEFINITIONS.GET_DATA_FOR_ONE_VISUALIZATION.name]: async (
      input: unknown,
    ) => {
      const { id } = input as { id: string };
      const res = await serverActions.getVisualizationDataForAI({
        projectId,
        po_id: id,
      });
      if (!res.success) throw new Error(res.err);
      return res.data;
    },
    [TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.name]: () => {
      return Promise.resolve("User has seen these visualizations");
    },
    [TOOL_DEFINITIONS.CREATE_SLIDE.name]: () => {
      return Promise.resolve("Slide has been created and shown to user");
    },
  };
}
