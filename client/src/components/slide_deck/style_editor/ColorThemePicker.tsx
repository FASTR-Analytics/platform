import { createSignal, For, Show } from"solid-js";
import {
 getColorPresets,
 validateBrandColor,
 type ColorPreset,
} from"@timroberton/panther";
import { BRAND_PRESETS, t3, type BrandPresetId } from"lib";
import type { ColorTheme, AllPresetId } from"lib";

type ColorThemePickerProps = {
 value: ColorTheme;
 onChange: (theme: ColorTheme) => void;
};

function normalizeHex(input: string): string {
 const stripped = input.trim().replace(/^#/,"");
 if (/^[0-9A-Fa-f]{6}$/.test(stripped)) {
 return`#${stripped}`;
  }
 if (/^[0-9A-Fa-f]{3}$/.test(stripped)) {
 return`#${stripped}`;
  }
 return input;
}

export function ColorThemePicker(p: ColorThemePickerProps) {
  //"custom"is the synthetic brand-color preset, never a picker swatch
 const corePresets = getColorPresets().filter(
    (cp): cp is ColorPreset & { id: Exclude<ColorPreset["id"],"custom"> } =>
 cp.id !=="custom",
  );

 const [customHex, setCustomHex] = createSignal(
 p.value.type ==="custom"? p.value.primary :"",
  );
 const [showCustomInput, setShowCustomInput] = createSignal(false);

 const isCustomActive = () => p.value.type ==="custom";
 const customColor = () =>
 p.value.type ==="custom"? p.value.primary : null;

 const validation = () => {
 const hex = customHex();
 if (!hex) {
 return {
 valid: false,
 reason: t3({
 en:"Enter a hex color",
 fr:"Saisissez une couleur hexadécimale",
 pt:"Introduza uma cor hexadecimal",
        }),
      } as const;
    }
 return validateBrandColor(normalizeHex(hex));
  };

 const isPresetSelected = (id: AllPresetId) =>
 p.value.type ==="preset"&& p.value.id === id;

 function selectPreset(id: AllPresetId) {
 p.onChange({ type:"preset", id });
 setShowCustomInput(false);
  }

 function clickCustomSwatch() {
 setShowCustomInput(true);
 if (customColor()) {
 setCustomHex(customColor()!);
    } else {
 p.onChange({ type:"custom", primary:""});
    }
  }

 function applyCustom() {
 const hex = normalizeHex(customHex());
 setCustomHex(hex);
 p.onChange({ type:"custom", primary: hex });
  }

 function CheckIcon() {
 return (
      <svg
 class="h-4 w-4 text-white drop-shadow"
 viewBox="0 0 20 20"
 fill="currentColor"
      >
        <path
 fill-rule="evenodd"
 d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
 clip-rule="evenodd"
        />
      </svg>
    );
  }

 function PresetSwatch(props: { preset: ColorPreset; id: AllPresetId }) {
 return (
      <button
 type="button"
 class="flex h-8 w-8 cursor-pointer items-center justify-center rounded border transition-transform hover:scale-110"
 classList={{
"border-base-content": isPresetSelected(props.id),
"border-transparent hover:border-border": !isPresetSelected(
 props.id,
          ),
        }}
 style={{ background: props.preset.swatch }}
 onClick={() => selectPreset(props.id)}
 title={props.preset.name}
      >
        <Show when={isPresetSelected(props.id)}>
          <CheckIcon />
        </Show>
      </button>
    );
  }

 return (
    <div>
      <div class="ui-label">
        {t3({ en:"Color theme", fr:"Thème de couleurs", pt:"Tema de cores"})}
      </div>
      <div class="ui-spy-sm">
        <div>
          <div class="ui-text-caption mb-1">
            {t3({ en:"Standard colors", fr:"Couleurs standard", pt:"Cores padrão"})}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <For each={corePresets}>
              {(preset) => <PresetSwatch preset={preset} id={preset.id} />}
            </For>
          </div>
        </div>
        <Show when={BRAND_PRESETS.length > 0}>
          <div>
            <div class="ui-text-caption mb-1">
              {t3({ en:"Special colors", fr:"Couleurs spéciales", pt:"Cores especiais"})}
            </div>
            <div class="flex flex-wrap gap-1.5">
              <For each={BRAND_PRESETS}>
                {(preset) => (
                  <PresetSwatch
 preset={preset}
 id={preset.id as BrandPresetId}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>
        <div>
          <div class="ui-text-caption mb-1">
            {t3({ en:"Custom", fr:"Personnalisé", pt:"Personalizado"})}
          </div>
          <div class="flex items-center gap-2">
            <button
 type="button"
 class="flex h-7 w-7 cursor-pointer items-center justify-center rounded border transition-transform hover:scale-110"
 classList={{
"border-base-content": isCustomActive(),
"border-transparent hover:border-border": !isCustomActive(),
              }}
 style={{
 background:
 isCustomActive() && validation().valid
                    ? customColor()!
                    :"#e5e5e5",
              }}
 onClick={clickCustomSwatch}
 title={t3({
 en:"Custom color",
 fr:"Couleur personnalisée",
 pt:"Cor personalizada",
              })}
            >
              <Show when={isCustomActive()}>
                <CheckIcon />
              </Show>
            </button>
            <Show when={showCustomInput() || isCustomActive()}>
              <input
 type="text"
 class="w-24 rounded border px-2 py-1 font-mono text-sm"
 classList={{
"border-danger": !validation().valid,
"": validation().valid,
                }}
 placeholder="#000000"
 value={customHex()}
 onInput={(e) => setCustomHex(e.currentTarget.value)}
 onBlur={applyCustom}
 onKeyDown={(e) => {
 if (e.key ==="Enter") applyCustom();
                }}
              />
              <Show when={!validation().valid}>
                <span class="text-danger text-xs">
                  {(validation() as { reason: string }).reason}
                </span>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
