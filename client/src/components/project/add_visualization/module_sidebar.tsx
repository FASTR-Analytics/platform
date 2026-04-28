import { t3, type MetricsByModule, type ModuleId } from "lib";
import { SelectList } from "panther";
import { createMemo } from "solid-js";

type Props = {
  metricsByModule: MetricsByModule[];
  selectedModule: ModuleId | "all";
  onSelectModule: (moduleId: ModuleId | "all") => void;
  totalMetricCount: number;
};

type ModuleOption = {
  value: ModuleId | "all";
  label: string;
  count: number;
};

export function ModuleSidebar(p: Props) {
  const options = createMemo((): ModuleOption[] => {
    const allOption: ModuleOption = {
      value: "all",
      label: t3({ en: "All modules", fr: "Tous les modules" }),
      count: p.totalMetricCount,
    };

    const moduleOptions: ModuleOption[] = p.metricsByModule.map((mod) => ({
      value: mod.moduleId,
      label: mod.moduleLabel,
      count: mod.metricGroups.reduce((sum, g) => sum + g.variants.length, 0),
    }));

    return [allOption, ...moduleOptions];
  });

  return (
    <SelectList
      options={options()}
      value={p.selectedModule}
      onChange={p.onSelectModule}
      fullWidth
      renderOption={(opt) => (
        <div class="flex items-center justify-between gap-2">
          <span class="truncate">{opt.label}</span>
          <span class="text-neutral shrink-0 text-xs">
            {(opt as ModuleOption).count}
          </span>
        </div>
      )}
    />
  );
}
