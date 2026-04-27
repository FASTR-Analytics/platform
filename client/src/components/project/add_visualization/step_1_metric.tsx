import {
  t3,
  groupMetricsByModule,
  type MetricWithStatus,
  type InstalledModuleSummary,
  type ModuleId,
  type MetricGroup,
} from "lib";
import { FrameLeft } from "panther";
import { createSignal, createMemo, For, Show } from "solid-js";
import { ModuleSidebar } from "./module_sidebar";
import { MetricCard } from "./metric_card";

type Props = {
  metrics: MetricWithStatus[];
  modules: InstalledModuleSummary[];
  selectedMetricId: string;
  onSelectMetric: (metricId: string) => void;
};

export function Step1Metric(p: Props) {
  const [selectedModule, setSelectedModule] = createSignal<ModuleId | "all">(
    "all",
  );

  const metricsByModule = createMemo(() =>
    groupMetricsByModule(p.metrics, p.modules),
  );

  const totalMetricCount = createMemo(
    () => p.metrics.filter((m) => m.status === "ready").length,
  );

  const filteredMetricGroups = createMemo((): MetricGroup[] => {
    const byModule = metricsByModule();
    const modFilter = selectedModule();

    if (modFilter === "all") {
      return byModule.flatMap((m) => m.metricGroups);
    }
    const mod = byModule.find((m) => m.moduleId === modFilter);
    return mod?.metricGroups ?? [];
  });

  return (
    <div class="h-full">
      <FrameLeft
        panelChildren={
          <div class="border-base-300 ui-pad h-full w-56 border-r">
            <ModuleSidebar
              metricsByModule={metricsByModule()}
              selectedModule={selectedModule()}
              onSelectModule={setSelectedModule}
              totalMetricCount={totalMetricCount()}
            />
          </div>
        }
      >
        <div class="ui-pad">
          <Show
            when={filteredMetricGroups().length > 0}
            fallback={
              <div class="text-neutral py-8 text-center">
                {t3({
                  en: "No metrics available",
                  fr: "Aucune métrique disponible",
                })}
              </div>
            }
          >
            <div class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
              <For each={filteredMetricGroups()}>
                {(group) => (
                  <MetricCard
                    metricGroup={group}
                    selectedMetricId={p.selectedMetricId}
                    onSelect={p.onSelectMetric}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </FrameLeft>
    </div>
  );
}
