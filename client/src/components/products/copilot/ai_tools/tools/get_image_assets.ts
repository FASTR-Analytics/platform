import { createAITool } from "panther";
import { z } from "zod";
import { COPILOT_TOOL_VIEWS } from "lib";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { imageAssetFileNames } from "../../_shared/mod.ts";

// The instance's image assets. It reads no package, so it is an outer tool and its result carries
// no Source line.
export function getClientToolsForImageAssets() {
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "get_image_assets",
      availableIn: COPILOT_TOOL_VIEWS.get_image_assets,
      description:
        "List the file names of the instance's image assets: the files an image block or a content slide's image split panel can show. Call it only when an image is asked for. Assets are uploaded by users on the Assets page; no tool uploads one.",
      inputSchema: z.object({}),
      kind: "read",
      handler: () => {
        const files = imageAssetFileNames();
        return Promise.resolve(
          files.length === 0
            ? "The instance has no image assets. A user can upload one on the Assets page."
            : `Image assets (${files.length}):\n${files.join("\n")}`,
        );
      },
      inProgressLabel: () => "Listing image assets...",
      completionMessage: () => "Listed image assets",
    }),
  ];
}
