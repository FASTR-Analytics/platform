import {
  t,
  t2,
  _POSSIBLE_MODULES,
  groupMetricsByLabel,
  type InstanceDetail,
  type MetricGroup,
  type MetricWithStatus,
  type ModuleId,
  type ProjectDetail,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openComponent,
} from "panther";
import { For, Show } from "solid-js";
import { VisualizationEditor } from "../visualization";
import { MetricDetailsModal } from "./metric_details_modal";
import { AddVisualization } from "./add_visualization";
import { useProjectDetail } from "~/components/project_runner/mod";

type Props = {
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

type MetricsByModule = {
  moduleId: ModuleId;
  moduleLabel: string;
  metricGroups: MetricGroup[];
};

export function ProjectMetrics(p: Props) {
  const projectDetail = useProjectDetail();
  function organizeMetrics(metrics: MetricWithStatus[]): MetricsByModule[] {
    const moduleMap = new Map<ModuleId, MetricWithStatus[]>();
    for (const metric of metrics) {
      if (!moduleMap.has(metric.moduleId)) {
        moduleMap.set(metric.moduleId, []);
      }
      moduleMap.get(metric.moduleId)!.push(metric);
    }

    const result: MetricsByModule[] = [];
    for (const possibleModule of _POSSIBLE_MODULES) {
      const moduleMetrics = moduleMap.get(possibleModule.id);
      if (moduleMetrics) {
        result.push({
          moduleId: possibleModule.id,
          moduleLabel: possibleModule.label,
          metricGroups: groupMetricsByLabel(moduleMetrics),
        });
      }
    }
    return result;
  }

  const organized = () => organizeMetrics(projectDetail.metrics);

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={t2("Metrics")}
          class="border-base-300"></HeadingBar>
      }
    >
      <div class="ui-pad ui-spy">
        <For each={organized()}>
          {(moduleGroup) => (
            <div class="ui-spy">
              <div class=" bg-primary/5 border-base-300 ui-pad-sm rounded border-l-4">
                <div class="font-700 text-lg">{moduleGroup.moduleLabel}</div>
                <div class="font-mono text-neutral text-xs">{moduleGroup.moduleId}</div>
              </div>
              <div class="ui-gap grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                <For each={moduleGroup.metricGroups}>
                  {(metricGroup) => (
                    <MetricGroupCard
                      metricGroup={metricGroup}
                      projectId={projectDetail.id}
                      projectDetail={projectDetail}
                      instanceDetail={p.instanceDetail}
                      isGlobalAdmin={p.isGlobalAdmin}
                      openProjectEditor={p.openProjectEditor}
                    />
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </FrameTop>
  );
}

type MetricGroupCardProps = {
  metricGroup: {
    label: string;
    variants: MetricWithStatus[];
  };
  projectId: string;
  projectDetail: ProjectDetail;
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

function MetricGroupCard(p: MetricGroupCardProps) {
  const firstMetric = p.metricGroup.variants[0];
  const hasVariants = p.metricGroup.variants.length > 1;

  async function showDetails(metric: MetricWithStatus) {
    await openComponent({
      element: MetricDetailsModal,
      props: { metric },
    });
  }

  async function visualize(metric: MetricWithStatus) {
    const res = await openComponent({
      element: AddVisualization,
      props: {
        projectId: p.projectId,
        isGlobalAdmin: p.isGlobalAdmin,
        preselectedMetric: metric,
      },
    });
    if (!res) {
      return;
    }

    await p.openProjectEditor({
      element: VisualizationEditor,
      props: {
        mode: "create" as const,
        projectId: p.projectId,
        label: res.label,
        resultsValue: res.resultsValue,
        config: res.config,
        instanceDetail: p.instanceDetail,
        projectDetail: p.projectDetail,
        isGlobalAdmin: p.isGlobalAdmin,
      },
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
                  <div class="ui-gap-sm flex">
                    <Button
                      onClick={() => visualize(variant)}
                      size="sm"
                      outline
                    >Visualize</Button>
                    <Button
                      onClick={() => showDetails(variant)}
                      size="sm"
                      outline
                      iconName="info"
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={!hasVariants}>
          <div class="ui-gap-sm flex items-center justify-between">
            <div class="font-mono text-neutral flex-1 text-xs">{firstMetric.id}</div>
            <div class="ui-gap-sm flex">
              <Button
                onClick={() => visualize(firstMetric)}
                size="sm"
                outline
              >Visualize</Button>
              <Button
                onClick={() => showDetails(firstMetric)}
                size="sm"
                outline
                iconName="info"
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
