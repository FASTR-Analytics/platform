import { For } from "solid-js";
import { getTreatmentPresets, type TreatmentPresetId } from "panther";
import { PresetCard } from "./PresetCard.tsx";

const THUMBNAIL_PRIMARY = "#64748b";
const THUMBNAIL_BASE_100 = "#ffffff";
const THUMBNAIL_BASE_200 = "#e5e7eb";

type TreatmentPickerProps = {
  value: TreatmentPresetId;
  onChange: (id: TreatmentPresetId) => void;
  primaryColor: string;
};

function TreatmentThumbnail(p: { treatmentId: TreatmentPresetId }) {
  const headerStyle = (): { bg: string; border?: string } => {
    switch (p.treatmentId) {
      case "bold":
        return { bg: THUMBNAIL_PRIMARY };
      case "bordered":
        return { bg: THUMBNAIL_BASE_100, border: THUMBNAIL_PRIMARY };
      default:
        return { bg: THUMBNAIL_BASE_100 };
    }
  };

  const footerStyle = (): { bg: string } => {
    switch (p.treatmentId) {
      case "bordered":
      case "minimal":
      case "minimal-split":
        return { bg: THUMBNAIL_BASE_100 };
      case "soft":
        return { bg: THUMBNAIL_BASE_200 };
      default:
        return { bg: THUMBNAIL_PRIMARY };
    }
  };

  return (
    <div
      class="h-full w-full flex flex-col"
      style={{ background: THUMBNAIL_BASE_100 }}
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
              <TreatmentThumbnail treatmentId={preset.id} />
            </PresetCard>
          )}
        </For>
      </div>
    </div>
  );
}
