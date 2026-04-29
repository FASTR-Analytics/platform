import { For } from "solid-js";
import { getLayoutPresets, type LayoutPresetId } from "panther";
import { PresetCard } from "./PresetCard.tsx";

type LayoutPickerProps = {
  value: LayoutPresetId;
  onChange: (id: LayoutPresetId) => void;
};

const THUMBNAIL_COLOR = "#64748b";

function LayoutThumbnail(p: { layoutId: LayoutPresetId }) {
  const alignItems = () => {
    if (p.layoutId === "modern") return "items-end";
    if (p.layoutId === "corporate" || p.layoutId === "split") return "items-start";
    return "items-center";
  };

  const justifyContent = () => {
    if (p.layoutId === "modern") return "justify-start";
    if (p.layoutId === "corporate" || p.layoutId === "split") return "justify-start";
    return "justify-center";
  };

  const innerAlign = () => {
    if (p.layoutId === "modern") return "items-start";
    if (p.layoutId === "corporate" || p.layoutId === "split") return "items-start";
    return "items-center";
  };

  const hasSplit = () => p.layoutId === "split";

  return (
    <div class="h-full w-full flex" style={{ background: THUMBNAIL_COLOR }}>
      {hasSplit() && (
        <div class="h-full" style={{ width: "30%", background: "rgba(255,255,255,0.15)" }} />
      )}
      <div class={`flex-1 flex p-2 ${alignItems()} ${justifyContent()}`}>
        <div class={`flex flex-col ${innerAlign()}`}>
          <div class="h-1.5 bg-white/90 rounded" style={{ width: "32px" }} />
          <div class="h-1 bg-white/60 rounded mt-1" style={{ width: "20px" }} />
        </div>
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
              <LayoutThumbnail layoutId={preset.id} />
            </PresetCard>
          )}
        </For>
      </div>
    </div>
  );
}
