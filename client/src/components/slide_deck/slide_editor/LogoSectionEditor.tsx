import type { LogoSectionConfig, LogoSizeKey } from "lib";
import { t3 } from "lib";
import { Checkbox, Select } from "panther";
import { Show } from "solid-js";
import { LogoSelector } from "~/components/_shared/logo_selector";

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
              value={p.config.sizing?.size ?? "md"}
              onChange={(v) =>
                p.onChange({
                  ...p.config,
                  sizing: { ...p.config.sizing, size: v as LogoSizeKey },
                })
              }
            />
            <Show when={p.config.selected.length >= 2}>
              <Select
                label={t3({ en: "Spacing", fr: "Espacement" })}
                options={GAP_OPTIONS}
                value={p.config.sizing?.spacing ?? "md"}
                onChange={(v) =>
                  p.onChange({
                    ...p.config,
                    sizing: { ...p.config.sizing, spacing: v as LogoSizeKey },
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
