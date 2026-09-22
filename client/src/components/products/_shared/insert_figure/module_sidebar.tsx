import {
  MODULE_FAMILY_ORDER,
  t3,
  type DatasetType,
  type MetricsByModule,
} from "lib";
import { type ListEntry, type ListItem, SelectList } from "panther";
import { createMemo } from "solid-js";

// Module identity here is read-plane: a plain string from the attached
// package's manifest (PLAN_1a §0 clause 3). "Primary results" (the primary
// modules' metrics of every family in the package) opens first, then "All
// modules", then the modules under a family heading in module order.
type Props = {
  metricsByModule: MetricsByModule[];
  selectedModule: string;
  onSelectModule: (moduleId: string) => void;
  totalMetricCount: number;
};

type ModuleItem = ListItem<string, number>;

const FAMILY_LABELS: Record<DatasetType, () => string> = {
  hmis: () => t3({ en: "HMIS", fr: "HMIS", pt: "HMIS" }),
  hfa: () => t3({ en: "HFA", fr: "FOSA", pt: "HFA" }),
  iceh: () => t3({ en: "ICEH", fr: "ICEH", pt: "ICEH" }),
};

function metricCount(mod: MetricsByModule): number {
  return mod.metricGroups.reduce((sum, g) => sum + g.variants.length, 0);
}

export function ModuleSidebar(p: Props) {
  const items = createMemo((): ListEntry<string, number>[] => {
    const primaryItem: ModuleItem = {
      id: "primary",
      label: t3({
        en: "Primary results",
        fr: "Résultats principaux",
        pt: "Resultados principais",
      }),
      meta: p.metricsByModule
        .filter((m) => m.tier === "primary")
        .reduce((sum, m) => sum + metricCount(m), 0),
    };
    const allItem: ModuleItem = {
      id: "all",
      label: t3({ en: "All modules", fr: "Tous les modules", pt: "Todos os módulos" }),
      meta: p.totalMetricCount,
    };

    const familySections = MODULE_FAMILY_ORDER.flatMap((family) => {
      const mods = p.metricsByModule.filter((m) => m.family === family);
      if (mods.length === 0) return [];
      return [
        { header: FAMILY_LABELS[family]() },
        ...mods.map<ModuleItem>((mod) => ({
          id: mod.moduleId,
          label: mod.moduleLabel,
          meta: metricCount(mod),
        })),
      ];
    });

    return [primaryItem, allItem, ...familySections];
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
          <span class="ui-text-caption shrink-0">{item.meta}</span>
        </div>
      )}
    />
  );
}
