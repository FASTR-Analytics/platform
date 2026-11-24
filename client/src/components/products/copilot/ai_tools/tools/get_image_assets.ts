import { createAITool } from "panther";
import { copilotToolContract, t3 } from "lib";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { imageAssetFileNames } from "../../_shared/mod.ts";

// The instance's image assets. It reads no package, so it is an outer tool
// and its result carries no Source line.
export function getClientToolsForImageAssets() {
  return [
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("get_image_assets"),
      handler: () => {
        const files = imageAssetFileNames();
        return Promise.resolve(
          files.length === 0
            ? "The instance has no image assets. A user can upload one on the Assets page."
            : `Image assets (${files.length}):\n${files.join("\n")}`,
        );
      },
      inProgressLabel: t3({
        en: "Getting the image assets...",
        fr: "Récupération des ressources image...",
        pt: "A obter os recursos de imagem...",
      }),
      successMessage: t3({
        en: "Retrieved the image assets",
        fr: "Ressources image récupérées",
        pt: "Recursos de imagem obtidos",
      }),
    }),
  ];
}
