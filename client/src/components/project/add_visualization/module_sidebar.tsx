import { t3, type MetricsByModule, type ModuleId } from "lib";
import { type ListItem, SelectList } from "panther";
import { createMemo } from "solid-js";

type Props = {
  metricsByModule: MetricsByModule[];
  selectedModule: ModuleId | "all";
  onSelectModule: (moduleId: ModuleId | "all") => void;
  totalMetricCount: number;
};

type ModuleItem = ListItem<ModuleId | "all", number>;

export function ModuleSidebar(p: Props) {
  const items = createMemo((): ModuleItem[] => {
    const allItem: ModuleItem = {
      id: "all",
      label: t3({ en: "All modules", fr: "Tous les modules", pt: "Todos os módulos" }),
      meta: p.totalMetricCount,
    };

    const moduleItems: ModuleItem[] = p.metricsByModule.map((mod) => ({
      id: mod.moduleId,
      label: mod.moduleLabel,
      meta: mod.metricGroups.reduce((sum, g) => sum + g.variants.length, 0),
    }));

    return [allItem, ...moduleItems];
  });

  return (
    <SelectList
      items={items()}
      value={p.selectedModule}
      onChange={p.onSelectModule}
      fullWidth
      renderItem={(item) => (
        <div class="flex items-center justify-between gap-2">
          <span class="truncate">{item.label}</span>
          <span class="text-neutral shrink-0 text-xs">{item.meta}</span>
        </div>
      )}
    />
  );
}
