import { createAITool, type TextEditorSelection } from "panther";
import { z } from "zod";
import { createModuleTools } from "./tools/module_tools";
import { createResultsValueTools } from "./tools/results_value_tools";
import { createSlideTools } from "./tools/slide_tools";
import { createVisualizationTools } from "./tools/visualization_tools";

// Re-export viz pane tools for convenience
export { getToolsForVizPane } from "./tools/viz_pane_tools";

// For AI Report Editor - project-wide tools with DB persistence
export function getToolsForReportEditor(
  projectId: string,
  getSelection?: () => TextEditorSelection,
) {
  const tools = [
    ...createModuleTools(projectId),
    ...createResultsValueTools(projectId),
    ...createVisualizationTools(projectId),
    ...createSlideTools(projectId),
  ];

  // Add selection tool if getter is provided
  if (getSelection) {
    tools.push(
      createAITool({
        name: "get_selected_text",
        description:
          "Get the text that the user has currently selected in the report editor. Use this when the user refers to 'this text', 'the selected text', 'this paragraph', or asks you to work with text they've highlighted.",
        inputSchema: z.object({}),
        handler: async () => {
          const sel = getSelection();
          if (!sel) {
            return "No text is currently selected in the editor.";
          }
          const lineInfo =
            sel.fromLine === sel.toLine
              ? `Line ${sel.fromLine}`
              : `Lines ${sel.fromLine}-${sel.toLine}`;
          return `Selected text (${lineInfo}):\n\n${sel.text}`;
        },
      }),
    );
  }

  return tools;
}

// Backward compatibility alias
export const createProjectTools = getToolsForReportEditor;
