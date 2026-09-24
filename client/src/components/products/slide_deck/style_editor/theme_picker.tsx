import { SLIDE_DECK_THEMES, t3, type SlideDeckConfig, type SlideDeckTheme } from "lib";
import { For } from "solid-js";
import { PresetCard } from "./preset_card.tsx";
import { ContentSlideMiniPreview } from "./style_preview.tsx";
import { slideDeckThemeCaption, slideDeckThemeLabel } from "./theme_labels.ts";

type ThemePickerProps = {
  value: SlideDeckTheme;
  // The rest of the deck config, so each card previews THIS deck's footer text
  // under the candidate theme rather than a generic slide.
  config: SlideDeckConfig;
  onChange: (theme: SlideDeckTheme) => void;
};

// The whole of deck styling, in one control. It replaced six pickers (colour,
// font, layout, cover treatment, freeform treatment, overlay) whose product was
// tens of thousands of combinations; a theme is one of eleven considered points
// in that space, and the card shows the point rather than describing it.
export function ThemePicker(p: ThemePickerProps) {
  const configForTheme = (theme: SlideDeckTheme): SlideDeckConfig => ({
    ...p.config,
    theme,
  });

  return (
    <div>
      <div class="ui-label">{t3({ en: "Theme", fr: "Thème", pt: "Tema" })}</div>
      <div class="flex flex-wrap gap-3">
        <For each={SLIDE_DECK_THEMES}>
          {(theme) => (
            <PresetCard
              name={slideDeckThemeLabel(theme)}
              caption={slideDeckThemeCaption(theme)}
              selected={p.value === theme}
              onClick={() => p.onChange(theme)}
            >
              <ContentSlideMiniPreview config={configForTheme(theme)} />
            </PresetCard>
          )}
        </For>
      </div>
    </div>
  );
}
