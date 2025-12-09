import { TOOL_DEFINITIONS, hmisTools } from "lib";
import { serverActions } from "~/server_actions";
import type { AITool } from "panther";
import { For } from "solid-js";
import { VisualizationPreview } from "./VisualizationPreview";
import { SlidePreview } from "./SlidePreview";

export function createProjectTools(projectId: string): AITool[] {
  return [
    {
      name: TOOL_DEFINITIONS.GET_MODULE_INFORMATION.name,
      description: hmisTools[0].description,
      input_schema: hmisTools[0].input_schema as AITool["input_schema"],
      handler: async () => {
        const res = await serverActions.getModulesList({ projectId });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
      inProgressLabel: TOOL_DEFINITIONS.GET_MODULE_INFORMATION.actionLabel,
    },
    {
      name: TOOL_DEFINITIONS.GET_MODULE_R_SCRIPT.name,
      description: hmisTools[1].description,
      input_schema: hmisTools[1].input_schema as AITool["input_schema"],
      handler: async (input: unknown) => {
        const { id } = input as { id: string };
        const res = await serverActions.getScript({
          projectId,
          module_id: id as any,
        });
        if (!res.success) throw new Error(res.err);
        return res.data.script;
      },
      inProgressLabel: TOOL_DEFINITIONS.GET_MODULE_R_SCRIPT.actionLabel,
    },
    {
      name: TOOL_DEFINITIONS.GET_MODULE_LOG.name,
      description: hmisTools[2].description,
      input_schema: hmisTools[2].input_schema as AITool["input_schema"],
      handler: async (input: unknown) => {
        const { id } = input as { id: string };
        const res = await serverActions.getLogs({
          projectId,
          module_id: id as any,
        });
        if (!res.success) throw new Error(res.err);
        return res.data.logs;
      },
      inProgressLabel: TOOL_DEFINITIONS.GET_MODULE_LOG.actionLabel,
    },
    {
      name: TOOL_DEFINITIONS.GET_VISUALIZATIONS_AND_METADATA.name,
      description: hmisTools[3].description,
      input_schema: hmisTools[3].input_schema as AITool["input_schema"],
      handler: async () => {
        const res = await serverActions.getVisualizationsList({ projectId });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
      inProgressLabel:
        TOOL_DEFINITIONS.GET_VISUALIZATIONS_AND_METADATA.actionLabel,
    },
    {
      name: TOOL_DEFINITIONS.GET_DATA_FOR_ONE_VISUALIZATION.name,
      description: hmisTools[4].description,
      input_schema: hmisTools[4].input_schema as AITool["input_schema"],
      handler: async (input: unknown) => {
        const { id } = input as { id: string };
        const res = await serverActions.getVisualizationDataForAI({
          projectId,
          po_id: id,
        });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
      inProgressLabel:
        TOOL_DEFINITIONS.GET_DATA_FOR_ONE_VISUALIZATION.actionLabel,
    },
    {
      name: TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.name,
      description: hmisTools[5].description,
      input_schema: hmisTools[5].input_schema as AITool["input_schema"],
      handler: async () => {
        return "User has seen these visualizations";
      },
      displayComponent: ((props: { input: { ids: string[] } }) => {
        const ids = props.input.ids;
        return (
          <div class="ui-gap grid w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
            <For each={ids}>
              {(id) => (
                <VisualizationPreview
                  projectId={projectId}
                  presentationObjectId={id}
                />
              )}
            </For>
          </div>
        );
      }) as AITool["displayComponent"],
      inProgressLabel: TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.actionLabel,
    },
    {
      name: TOOL_DEFINITIONS.CREATE_SLIDE.name,
      description: hmisTools[6].description,
      input_schema: hmisTools[6].input_schema as AITool["input_schema"],
      handler: async () => {
        return "Slide has been created and shown to user";
      },
      displayComponent: (props: { input: unknown }) => {
        return (
          <SlidePreview
            projectId={projectId}
            slideDataFromAI={props.input}
          />
        );
      },
      inProgressLabel: TOOL_DEFINITIONS.CREATE_SLIDE.actionLabel,
    },
  ];
}
