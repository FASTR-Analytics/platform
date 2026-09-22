import { type MetricWithStatus, type PackageScope } from "lib";
import { PresetSelector, type PresetOption } from "./preset_preview";

type Props = {
  scope: PackageScope;
  metric: MetricWithStatus;
  presets: PresetOption[];
  selectedPresetId: string | undefined;
  onSelectPreset: (presetId: string) => void;
};

export function Step2Preset(p: Props) {
  return (
    <div class="ui-pad">
      <PresetSelector
        scope={p.scope}
        metric={p.metric}
        presets={p.presets}
        selectedId={p.selectedPresetId}
        onSelect={p.onSelectPreset}
      />
    </div>
  );
}
