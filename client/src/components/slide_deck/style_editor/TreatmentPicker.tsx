import { For } from "solid-js";
import {
  getTreatmentPresets,
  getKeyColorsFromPrimaryColor,
  getColor,
  type TreatmentPresetId,
} from "panther";
import { PresetCard } from "./PresetCard.tsx";

type TreatmentPickerProps = {
  value: TreatmentPresetId;
  onChange: (id: TreatmentPresetId) => void;
  primaryColor: string;
};

function TreatmentThumbnail(p: {
  treatmentId: TreatmentPresetId;
  primaryColor: string;
}) {
  const palette = () => getKeyColorsFromPrimaryColor(p.primaryColor);

  const headerStyle = (): { bg: string; border?: string } => {
    switch (p.treatmentId) {
      case "bold":
        return { bg: p.primaryColor };
      case "bordered":
        return { bg: getColor(palette().base100), border: p.primaryColor };
      default:
        return { bg: getColor(palette().base100) };
    }
  };

  const footerStyle = (): { bg: string } => {
    switch (p.treatmentId) {
      case "bordered":
      case "minimal":
        return { bg: getColor(palette().base100) };
      case "soft":
        return { bg: getColor(palette().base200) };
      default:
        return { bg: p.primaryColor };
    }
  };

  return (
    <div
      class="h-full w-full flex flex-col"
      style={{ background: getColor(palette().base100) }}
    >
      <div
        class="h-3 flex-none"
        style={{
          background: headerStyle().bg,
          "border-bottom": headerStyle().border ? `1px solid ${headerStyle().border}` : undefined,
        }}
      />
      <div class="flex-1" />
      <div class="h-2 flex-none" style={{ background: footerStyle().bg }} />
    </div>
  );
}

export function TreatmentPicker(p: TreatmentPickerProps) {
  const presets = getTreatmentPresets();

  return (
    <div>
      <div class="ui-label">Treatment</div>
      <div class="flex gap-3">
        <For each={presets}>
          {(preset) => (
            <PresetCard
              name={preset.name}
              selected={p.value === preset.id}
              onClick={() => p.onChange(preset.id)}
            >
              <TreatmentThumbnail
                treatmentId={preset.id}
                primaryColor={p.primaryColor}
              />
            </PresetCard>
          )}
        </For>
      </div>
    </div>
  );
}
