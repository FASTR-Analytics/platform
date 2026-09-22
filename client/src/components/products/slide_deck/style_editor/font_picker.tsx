import { type SlideFontFamily, SLIDE_FONTS, t3 } from "lib";
import { For } from "solid-js";

type Props = {
  value: SlideFontFamily | undefined;
  onChange: (v: SlideFontFamily) => void;
};

export function FontPicker(p: Props) {
  const selected = () => p.value ?? "International Inter";

  return (
    <div>
      <div class="ui-label">
        {t3({ en: "Font", fr: "Police", pt: "Tipo de letra" })}
      </div>
      <div class="flex gap-2">
        <For each={SLIDE_FONTS}>
          {(font) => (
            <button
              type="button"
              class={`cursor-pointer rounded border px-4 py-2 ${
                selected() === font.family
                  ? "border-primary bg-primary-subtle border-2"
                  : "ui-hoverable-base-100"
              }`}
              style={{ "font-family": font.family }}
              onClick={() => p.onChange(font.family)}
            >
              {font.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
