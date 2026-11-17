import { AIToolFailure, createAITool } from "panther";
import {
  type AiDeckSettingsPatch,
  AiDeckSettingsPatchSchema,
  COPILOT_TOOL_VIEWS,
  formatDeckSettingsForAI,
  LOGO_SECTIONS,
  type LogosConfig,
  type SlideDeckConfig,
} from "lib";
import {
  copilotViewController,
  copilotViews,
} from "~/components/instance/copilot/mod.ts";
import { FASTR_LOGOS } from "~/generate_slide_deck/fastr_logos";
import { isDrawnLogo } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { imageAssetFileNames } from "../../_shared/mod.ts";

const BUILT_IN_LOGOS = FASTR_LOGOS.map((l) => ({
  value: l.value,
  label: l.label.en,
}));

export function formatDeckSettings(config: SlideDeckConfig): string {
  return formatDeckSettingsForAI(config, BUILT_IN_LOGOS);
}

// Every new custom logo is an image asset, and every selected logo is one the
// deck draws, so nothing the model selects is silently skipped. A custom logo
// the deck already holds is kept even if its asset is gone: logos are sent
// whole, and the user's entry must not block every other logo change.
function assertLogosDrawn(
  logos: LogosConfig,
  kept: readonly string[],
): void {
  const assets = imageAssetFileNames();
  const notAssets = logos.availableCustom.filter((f) =>
    !assets.includes(f) && !kept.includes(f)
  );
  if (notAssets.length > 0) {
    throw new AIToolFailure(
      `${
        notAssets.map((f) => JSON.stringify(f)).join(", ")
      } in logos.availableCustom ${
        notAssets.length === 1 ? "is not one" : "are not"
      } of the instance's image assets. Call get_image_assets for the file names. Nothing was changed.`,
    );
  }
  const undrawn = LOGO_SECTIONS.flatMap((section) =>
    logos[section].selected
      .filter((logo) => !isDrawnLogo(logo, logos.availableCustom))
      .map((logo) => `${JSON.stringify(logo)} in logos.${section}.selected`)
  );
  if (undrawn.length > 0) {
    throw new AIToolFailure(
      `${
        undrawn.join(", ")
      }: a selected logo must be a built-in logo or one of logos.availableCustom. Nothing was changed.`,
    );
  }
}

function toDeckConfigPatch(
  input: AiDeckSettingsPatch,
): Partial<SlideDeckConfig> {
  const patch: Partial<SlideDeckConfig> = {};
  if (input.logos !== undefined) patch.logos = input.logos;
  if (input.globalFooterText !== undefined) {
    patch.globalFooterText = input.globalFooterText ?? undefined;
  }
  if (input.useWatermark !== undefined) patch.useWatermark = input.useWatermark;
  if (input.watermarkText !== undefined) {
    patch.watermarkText = input.watermarkText;
  }
  return patch;
}

export function createUpdateDeckSettingsTool() {
  return createAITool({
    viewRegistry: copilotViews,
    name: "update_deck_settings",
    description:
      "Change the deck's settings: its logos, the footer text every content slide shows and the watermark. Name only the settings to change; logos is replaced whole, so send it as get_deck shows it with your changes. A custom logo must be one of the instance's image assets (get_image_assets lists them), and a selected logo must be a built-in logo or one of the deck's custom logos. The change shows on every slide at once and is saved. A slide's own logo setting (a cover's showLogos, a content slide's showHeaderLogos and showFooterLogos) is set with update_slide.",
    inputSchema: AiDeckSettingsPatchSchema,
    availableIn: COPILOT_TOOL_VIEWS.update_deck_settings,
    kind: "write",
    handler: async (input, view) => {
      const patch = toDeckConfigPatch(input);
      const fields = Object.keys(patch);
      if (fields.length === 0) {
        throw new AIToolFailure(
          "No setting named. Name at least one of logos, globalFooterText, useWatermark and watermarkText.",
        );
      }
      const current = view.context.getDeckConfig();
      if (patch.logos !== undefined) {
        assertLogosDrawn(patch.logos, current.logos.availableCustom);
      }
      const settings = formatDeckSettings({ ...current, ...patch });

      const res = await view.context.patchDeckConfig(patch);
      if (!res.success) throw new AIToolFailure(res.err);
      copilotViewController.markAIEdit(`product:${view.params.deckId}`);

      return `Updated the deck's ${
        fields.join(", ")
      }. Every slide shows it at once, and it is saved.\n\n${settings}`;
    },
    inProgressLabel: "Updating deck settings...",
    completionMessage: "Updated deck settings",
  });
}
