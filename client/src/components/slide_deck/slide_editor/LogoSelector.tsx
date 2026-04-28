import { t3 } from "lib";
import { LabelHolder, MultiSelect, TimSortableVertical } from "panther";
import { createEffect, Show } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { FASTR_LOGOS } from "~/generate_slide_deck/convert_slide_to_page_inputs";

type Props = {
  // label: string;
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

type LogoItem = { id: string };

export function LogoSelector(p: Props) {
  const [items, setItems] = createStore<LogoItem[]>(
    p.values.map((v) => ({ id: v })),
  );

  createEffect(() => {
    const newItems = p.values.map((v) => ({ id: v }));
    setItems(newItems);
  });

  const handleSetItems: SetStoreFunction<LogoItem[]> = (...args: any[]) => {
    (setItems as any)(...args);
    const currentIds = items.map((item) => item.id);
    p.onChange(currentIds);
  };

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
          <TimSortableVertical items={items} setItems={handleSetItems}>
            {(item) => (
              <span class="text-base-content/70 text-xs">
                {getLogoLabel(item.id)}
              </span>
            )}
          </TimSortableVertical>
        </div>
      </Show>
    </>
  );
}
