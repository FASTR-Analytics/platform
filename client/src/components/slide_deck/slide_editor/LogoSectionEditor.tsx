import type { LogoSectionConfig } from "lib";
import { t3 } from "lib";
import { Checkbox, Select } from "panther";
import { Show } from "solid-js";
import { LogoSelector } from "./LogoSelector.tsx";

type Props = {
  title: string;
  config: LogoSectionConfig;
  customLogos: string[];
  onChange: (config: LogoSectionConfig) => void;
};

const SIZE_OPTIONS = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const GAP_OPTIONS = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const SIZE_VALUES: Record<string, number> = {
  sm: 40000,
  md: 80000,
  lg: 160000,
  xl: 320000,
};

const GAP_VALUES: Record<string, number> = {
  sm: 20,
  md: 60,
  lg: 100,
  xl: 150,
};

function getSizeKey(targetArea: number | undefined): string {
  if (!targetArea) return "md";
  const entries = Object.entries(SIZE_VALUES);
  let closest = "md";
  let minDiff = Infinity;
  for (const [key, val] of entries) {
    const diff = Math.abs(val - targetArea);
    if (diff < minDiff) {
      minDiff = diff;
      closest = key;
    }
  }
  return closest;
}

function getGapKey(gapX: number | undefined): string {
  if (!gapX) return "md";
  const entries = Object.entries(GAP_VALUES);
  let closest = "md";
  let minDiff = Infinity;
  for (const [key, val] of entries) {
    const diff = Math.abs(val - gapX);
    if (diff < minDiff) {
      minDiff = diff;
      closest = key;
    }
  }
  return closest;
}

export function LogoSectionEditor(p: Props) {
  const hasLogos = () => p.config.selected.length > 0;

  return (
    <div class="ui-spy-sm overflow-hidden">
      <div class="text-base-content/70 font-700 mb-2 text-sm">{p.title}</div>
      <LogoSelector
        values={p.config.selected}
        customLogos={p.customLogos}
        onChange={(logos) => p.onChange({ ...p.config, selected: logos })}
      />
      <Show when={hasLogos()}>
        <div class="ui-spy-sm pt-2">
          <Checkbox
            label={t3({ en: "Show by default", fr: "Afficher par défaut" })}
            checked={p.config.showByDefault}
            onChange={(v) => p.onChange({ ...p.config, showByDefault: v })}
          />
          <div class="ui-gap-sm flex">
            <Select
              label={t3({ en: "Size", fr: "Taille" })}
              options={SIZE_OPTIONS}
              value={getSizeKey(p.config.sizing?.targetArea)}
              onChange={(v) =>
                p.onChange({
                  ...p.config,
                  sizing: { ...p.config.sizing, targetArea: SIZE_VALUES[v] },
                })
              }
            />
            <Show when={p.config.selected.length >= 2}>
              <Select
                label={t3({ en: "Spacing", fr: "Espacement" })}
                options={GAP_OPTIONS}
                value={getGapKey(p.config.sizing?.gapX)}
                onChange={(v) =>
                  p.onChange({
                    ...p.config,
                    sizing: { ...p.config.sizing, gapX: GAP_VALUES[v] },
                  })
                }
              />
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
