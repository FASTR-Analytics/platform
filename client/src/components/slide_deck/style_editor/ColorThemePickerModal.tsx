import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  getColorPresets,
  validateBrandColor,
  type ColorPreset,
} from "@timroberton/panther";
import { Button } from "panther";
import { BRAND_PRESETS, t3, type BrandPresetId } from "lib";
import type { AllPresetId, ColorTheme, SlideDeckConfig } from "lib";
import { ContentSlideMiniPreview } from "./StylePreview.tsx";
import { normalizeHex } from "./color_theme_utils.ts";

type ColorThemePickerModalProps = {
  value: ColorTheme;
  config: SlideDeckConfig;
  onChange: (theme: ColorTheme) => void;
  onClose: () => void;
};

// Cards are bespoke markup rather than the shared PresetCard because PresetCard
// is a <button> and the Custom card has to host a text input — a nested
// interactive control inside a button is invalid HTML and swallows clicks.
// PresetCard also fixes w-24, which is far too narrow to read a content slide.
const CARD_WIDTH = "w-52";

export function ColorThemePickerModal(p: ColorThemePickerModalProps) {
  // "custom" is the synthetic brand-color preset, never a selectable card
  const corePresets = getColorPresets().filter(
    (cp): cp is ColorPreset & { id: Exclude<ColorPreset["id"], "custom"> } =>
      cp.id !== "custom",
  );

  const [customHex, setCustomHex] = createSignal(
    p.value.type === "custom" ? p.value.primary : "",
  );

  const isCustomActive = () => p.value.type === "custom";
  const isPresetSelected = (id: AllPresetId) =>
    p.value.type === "preset" && p.value.id === id;

  const customValidation = () => {
    const hex = customHex();
    if (!hex) {
      return {
        valid: false,
        reason: t3({
          en: "Enter a hex color",
          fr: "Saisissez une couleur hexadécimale",
          pt: "Introduza uma cor hexadecimal",
        }),
      } as const;
    }
    return validateBrandColor(normalizeHex(hex));
  };

  // A plain snapshot per card: the preview only varies by colorTheme, and
  // building a new object avoids touching the caller's store.
  function configForTheme(theme: ColorTheme): SlideDeckConfig {
    return { ...p.config, colorTheme: theme };
  }

  function selectPreset(id: AllPresetId) {
    p.onChange({ type: "preset", id });
    p.onClose();
  }

  // Custom does NOT close on apply: the point of the modal is comparing, and
  // the user needs to see their color rendered before committing to it.
  function applyCustom() {
    const hex = normalizeHex(customHex());
    setCustomHex(hex);
    if (validateBrandColor(hex).valid) {
      p.onChange({ type: "custom", primary: hex });
    }
  }

  onMount(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        p.onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  });

  function ThemeCard(props: {
    name: string;
    selected: boolean;
    theme: ColorTheme;
    onSelect: () => void;
    children?: import("solid-js").JSX.Element;
  }) {
    return (
      <div
        class={`flex ${CARD_WIDTH} cursor-pointer flex-col rounded border p-2 text-left`}
        classList={{ "border-primary border-2": props.selected }}
        onClick={props.onSelect}
      >
        <div class="relative mb-1 aspect-video overflow-hidden rounded border">
          <ContentSlideMiniPreview config={configForTheme(props.theme)} />
        </div>
        <div class="text-center text-sm">{props.name}</div>
        {props.children}
      </div>
    );
  }

  return (
    <Portal mount={document.body}>
      <div class="fixed inset-0 z-[100] flex items-center justify-center">
        <div
          class="absolute inset-0 bg-black/40"
          onClick={() => p.onClose()}
        />
        <div class="bg-base-100 relative flex max-h-[85vh] max-w-[90vw] flex-col rounded shadow-lg">
          <div class="border-b px-6 py-5 leading-none">
            <h2 class="ui-text-heading leading-none">
              {t3({
                en: "Color theme",
                fr: "Thème de couleurs",
                pt: "Tema de cores",
              })}
            </h2>
          </div>

          <div class="ui-spy overflow-y-auto px-6 py-5">
            <div>
              <div class="ui-text-caption mb-1">
                {t3({
                  en: "Standard colors",
                  fr: "Couleurs standard",
                  pt: "Cores padrão",
                })}
              </div>
              <div class="ui-gap-sm flex flex-wrap">
                <For each={corePresets}>
                  {(preset) => (
                    <ThemeCard
                      name={preset.name}
                      selected={isPresetSelected(preset.id)}
                      theme={{ type: "preset", id: preset.id }}
                      onSelect={() => selectPreset(preset.id)}
                    />
                  )}
                </For>
              </div>
            </div>

            <Show when={BRAND_PRESETS.length > 0}>
              <div>
                <div class="ui-text-caption mb-1">
                  {t3({
                    en: "Special colors",
                    fr: "Couleurs spéciales",
                    pt: "Cores especiais",
                  })}
                </div>
                <div class="ui-gap-sm flex flex-wrap">
                  <For each={BRAND_PRESETS}>
                    {(preset) => (
                      <ThemeCard
                        name={preset.name}
                        selected={isPresetSelected(preset.id as BrandPresetId)}
                        theme={{
                          type: "preset",
                          id: preset.id as BrandPresetId,
                        }}
                        onSelect={() => selectPreset(preset.id as BrandPresetId)}
                      />
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <div>
              <div class="ui-text-caption mb-1">
                {t3({
                  en: "Custom",
                  fr: "Personnalisé",
                  pt: "Personalizado",
                })}
              </div>
              <div class="ui-gap-sm flex flex-wrap">
                <ThemeCard
                  name={t3({
                    en: "Custom",
                    fr: "Personnalisé",
                    pt: "Personalizado",
                  })}
                  selected={isCustomActive()}
                  theme={
                    customValidation().valid
                      ? { type: "custom", primary: normalizeHex(customHex()) }
                      : p.value
                  }
                  onSelect={applyCustom}
                >
                  <div
                    class="mt-1 flex flex-col items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      class="w-24 rounded border px-2 py-1 text-center font-mono text-sm"
                      classList={{ "border-danger": !customValidation().valid }}
                      placeholder="#000000"
                      value={customHex()}
                      onInput={(e) => setCustomHex(e.currentTarget.value)}
                      onBlur={applyCustom}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyCustom();
                      }}
                    />
                    <Show when={!customValidation().valid}>
                      <span class="text-danger text-xs">
                        {(customValidation() as { reason: string }).reason}
                      </span>
                    </Show>
                  </div>
                </ThemeCard>
              </div>
            </div>
          </div>

          <div class="ui-gap-sm flex items-center justify-end border-t px-6 py-5">
            <Button onClick={() => p.onClose()}>
              {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
