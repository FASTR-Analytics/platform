import { AIToolFailure, createAITool } from "panther";
import {
  type AiDeckSettingsPatch,
  copilotToolContract,
  formatDeckSettingsForAI,
  LOGO_SECTIONS,
  type LogosConfig,
  type SlideDeckConfig,
  t3,
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
    ...copilotToolContract("update_deck_settings"),
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
    inProgressLabel: t3({
      en: "Updating the slide deck settings...",
      fr: "Mise à jour des paramètres de la présentation...",
      pt: "A atualizar as definições da apresentação...",
    }),
    successMessage: t3({
      en: "Updated the slide deck settings",
      fr: "Paramètres de la présentation mis à jour",
      pt: "Definições da apresentação atualizadas",
    }),
  });
}
