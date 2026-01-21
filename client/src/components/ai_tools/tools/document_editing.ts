import { createAITool, type TextEditorSelection } from "panther";
import { z } from "zod";

export function getToolForSelectedText(getSelection: () => TextEditorSelection) {
  return createAITool({
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
  });
}
