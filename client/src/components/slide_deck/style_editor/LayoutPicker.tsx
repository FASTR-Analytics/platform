import { For } from "solid-js";
import { getLayoutPresets, type LayoutPresetId } from "panther";
import { PresetCard } from "./PresetCard.tsx";

type LayoutPickerProps = {
  value: LayoutPresetId;
  onChange: (id: LayoutPresetId) => void;
  primaryColor: string;
};

function LayoutThumbnail(p: { layoutId: LayoutPresetId; primaryColor: string }) {
  const alignItems = () => {
    if (p.layoutId === "modern") return "items-end";
    if (p.layoutId === "corporate") return "items-start";
    return "items-center";
  };

  const justifyContent = () => {
    if (p.layoutId === "modern") return "justify-start";
    if (p.layoutId === "corporate") return "justify-start";
    return "justify-center";
  };

  const textAlign = () => {
    if (p.layoutId === "modern") return "text-left";
    if (p.layoutId === "corporate") return "text-left";
    return "text-center";
  };

  return (
    <div
      class={`h-full w-full flex p-2 ${alignItems()} ${justifyContent()}`}
      style={{ background: p.primaryColor }}
    >
      <div class={textAlign()}>
        <div class="h-1.5 bg-white/90 rounded" style={{ width: "32px" }} />
        <div class="h-1 bg-white/60 rounded mt-1" style={{ width: "20px" }} />
      </div>
    </div>
  );
}

export function LayoutPicker(p: LayoutPickerProps) {
  const presets = getLayoutPresets();

  return (
    <div>
      <div class="ui-label">Layout</div>
      <div class="flex gap-3">
        <For each={presets}>
          {(preset) => (
            <PresetCard
              name={preset.name}
              selected={p.value === preset.id}
              onClick={() => p.onChange(preset.id)}
            >
              <LayoutThumbnail layoutId={preset.id} primaryColor={p.primaryColor} />
            </PresetCard>
          )}
        </For>
      </div>
    </div>
  );
}
