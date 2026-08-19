import {
  deriveConfigFromVizPreset,
  getLanguage,
  t3,
  type MetricWithStatus,
  type PackageScope,
} from "lib";
import { createMemo } from "solid-js";
import { PresetSelector } from "./preset_preview";

type Props = {
  scope: PackageScope;
  metric: MetricWithStatus;
  selectedPresetId: string | undefined;
  onSelectPreset: (presetId: string) => void;
};

export function Step2Preset(p: Props) {
  // deriveConfigFromVizPreset is the ONE preset -> config derivation; the
  // Explore gallery reaches the same configs through the authoring context's
  // already-derived presets, so the two surfaces cannot drift.
  const presets = createMemo(() =>
    (p.metric.vizPresets ?? []).map((preset) => ({
      id: preset.id,
      label: t3(preset.label),
      description: t3(preset.description),
      config: deriveConfigFromVizPreset(preset, getLanguage()),
    })),
  );

  return (
    <div class="ui-pad">
      <PresetSelector
        scope={p.scope}
        metric={p.metric}
        presets={presets()}
        selectedId={p.selectedPresetId}
        onSelect={p.onSelectPreset}
      />
    </div>
  );
}
