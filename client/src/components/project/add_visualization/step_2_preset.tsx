import { type MetricWithStatus } from "lib";
import { PresetSelector } from "../preset_preview";

type Props = {
  projectId: string;
  metric: MetricWithStatus;
  selectedPresetId: string | undefined;
  onSelectPreset: (presetId: string) => void;
};

export function Step2Preset(p: Props) {
  const presets = () => p.metric.vizPresets ?? [];

  return (
    <div class="ui-pad">
      <PresetSelector
        projectId={p.projectId}
        metric={p.metric}
        presets={presets()}
        selectedId={p.selectedPresetId}
        onSelect={p.onSelectPreset}
      />
    </div>
  );
}
