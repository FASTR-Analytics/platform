import {
  getModuleIdForMetric,
  ResultsValue,
  t,
  t2,
  _POSSIBLE_MODULES,
  type ModuleId,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  openComponent,
  StateHolderWrapper,
  timQuery,
} from "panther";
import { For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { MetricDetailsModal } from "./metric_details_modal";

type Props = {
  projectId: string;
};

type MetricsByModule = {
  moduleId: ModuleId;
  moduleLabel: string;
  metricGroups: {
    label: string;
    variants: ResultsValue[];
  }[];
};

export function ProjectMetrics(p: Props) {
  const metricsQuery = timQuery(
    () => serverActions.getAllMetrics({ projectId: p.projectId }),
    t("Loading metrics..."),
  );

  function organizeMetrics(metrics: ResultsValue[]): MetricsByModule[] {
    const moduleMap = new Map<ModuleId, Map<string, ResultsValue[]>>();

    for (const metric of metrics) {
      const moduleId = getModuleIdForMetric(metric.id);

      if (!moduleMap.has(moduleId)) {
        moduleMap.set(moduleId, new Map());
      }

      const labelMap = moduleMap.get(moduleId)!;
      const label = metric.label;

      if (!labelMap.has(label)) {
        labelMap.set(label, []);
      }

      labelMap.get(label)!.push(metric);
    }

    const result: MetricsByModule[] = [];

    for (const possibleModule of _POSSIBLE_MODULES) {
      const labelMap = moduleMap.get(possibleModule.id);
      if (labelMap) {
        const metricGroups = Array.from(labelMap.entries()).map(([label, variants]) => ({
          label,
          variants: variants.sort((a, b) => {
            const aVariant = a.variantLabel || "";
            const bVariant = b.variantLabel || "";
            return aVariant.localeCompare(bVariant);
          }),
        }));

        result.push({
          moduleId: possibleModule.id,
          moduleLabel: possibleModule.label,
          metricGroups,
        });
      }
    }

    return result;
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={t2("Metrics menu")}></HeadingBar>
      }
    >
      <StateHolderWrapper state={metricsQuery.state()}>
        {(metrics) => {
          const organized = organizeMetrics(metrics);
          return (
            <div class="ui-pad ui-spy">
              <For each={organized}>
                {(moduleGroup) => (
                  <div class="ui-spy">
                    <div class="border-primary bg-primary/5 border-base-300 ui-pad-sm rounded border-l-4">
                      <div class="font-700 text-lg">{moduleGroup.moduleLabel}</div>
                      <div class="font-mono text-neutral text-xs">{moduleGroup.moduleId}</div>
                    </div>
                    <div class="ui-gap grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                      <For each={moduleGroup.metricGroups}>
                        {(metricGroup) => (
                          <MetricGroupCard metricGroup={metricGroup} />
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}

type MetricGroupCardProps = {
  metricGroup: {
    label: string;
    variants: ResultsValue[];
  };
};

function MetricGroupCard(p: MetricGroupCardProps) {
  const firstMetric = p.metricGroup.variants[0];
  const hasVariants = p.metricGroup.variants.length > 1;

  async function showDetails(metric: ResultsValue) {
    await openComponent({
      element: MetricDetailsModal,
      props: { metric },
    });
  }

  return (
    <div class="border-base-300 bg-base-100 rounded border">
      <div class="ui-pad-sm border-base-300 border-b">
        <div class="font-700">{p.metricGroup.label}</div>
        <Show when={firstMetric.aiDescription}>
          <div class="text-neutral mt-1 text-xs">
            {t2(firstMetric.aiDescription!.summary)}
          </div>
        </Show>
        <Show when={hasVariants}>
          <div class="text-neutral mt-1 text-xs">
            {p.metricGroup.variants.length} variants
          </div>
        </Show>
      </div>
      <div class="ui-pad-sm ui-spy-sm">
        <div class="ui-gap-sm flex flex-wrap items-center">
          <div class="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs">
            {firstMetric.formatAs}
          </div>
          <div class="text-neutral text-xs">
            {firstMetric.periodOptions.length} period{firstMetric.periodOptions.length !== 1 ? "s" : ""}
          </div>
          <div class="text-neutral text-xs">
            {firstMetric.disaggregationOptions.length} disagg{firstMetric.disaggregationOptions.length !== 1 ? "s" : ""}
          </div>
        </div>
        <Show when={hasVariants}>
          <div class="ui-spy-sm">
            <For each={p.metricGroup.variants}>
              {(variant) => (
                <div class="border-base-300 ui-pad-sm ui-gap-sm flex items-start justify-between rounded border">
                  <div class="flex-1">
                    <div class="font-700 text-sm">
                      {variant.variantLabel || t("Default")}
                    </div>
                    <div class="font-mono text-neutral text-xs">{variant.id}</div>
                  </div>
                  <Button
                    onClick={() => showDetails(variant)}
                    size="sm"
                    outline
                    iconName="info"
                  />
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={!hasVariants}>
          <div class="ui-gap-sm flex items-center justify-between">
            <div class="font-mono text-neutral flex-1 text-xs">{firstMetric.id}</div>
            <Button
              onClick={() => showDetails(firstMetric)}
              size="sm"
              outline
              iconName="info"
            />
          </div>
        </Show>
      </div>
    </div>
  );
}
