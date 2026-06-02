import { t3 } from "lib";
import { MultiSelect, SortableList } from "panther";
import { Show } from "solid-js";
import { FASTR_LOGOS } from "./fastr_logos";

type Props = {
  values: string[];
  customLogos: string[];
  onChange: (logos: string[]) => void;
};

function buildLogoOptions(customLogos: string[]) {
  return [
    ...FASTR_LOGOS.map((l) => ({ value: l.value, label: t3(l.label) })),
    ...customLogos.map((logo) => ({ value: logo, label: logo })),
  ];
}

function getLogoLabel(value: string): string {
  const fastr = FASTR_LOGOS.find((l) => l.value === value);
  if (fastr) return t3(fastr.label);
  return value;
}

export function LogoSelector(p: Props) {
  return (
    <>
      <div class="text-xs">
        <MultiSelect
          values={p.values}
          options={buildLogoOptions(p.customLogos)}
          onChange={p.onChange}
        />
      </div>
      <Show when={p.values.length > 1}>
        <div class="pt-2">
          <div class="text-neutral mb-1 text-xs">
            {t3({ en: "Order", fr: "Ordre" })}
          </div>
          <SortableList
            items={p.values.map((v) => ({ id: v }))}
            onReorder={(ids) => p.onChange(ids)}
          >
            {(item) => (
              <span class="text-base-content/70 text-xs">
                {getLogoLabel(item.id)}
              </span>
            )}
          </SortableList>
        </div>
      </Show>
    </>
  );
}
