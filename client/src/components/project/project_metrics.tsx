import {
  t3,
  getPossibleModules,
  groupMetricsByLabel,
  type MetricGroup,
  type MetricWithStatus,
  type ModuleId,
  type ProjectState,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openComponent,
} from "panther";
import { For, Show } from "solid-js";
import { getInstanceCountryIso3 } from "~/state/instance/t1_store";
import { VisualizationEditor } from "../visualization";
import { MetricDetailsModal } from "./metric_details_modal";
import { AddVisualization } from "./add_visualization";
import { projectState } from "~/state/project/t1_store";
import { useAIProjectContext } from "~/components/project_ai/context";
import { snapshotForVizEditor } from "~/components/_editor_snapshot";

type Props = {
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
  function organizeMetrics(metrics: MetricWithStatus[]): MetricsByModule[] {
    const moduleMap = new Map<ModuleId, MetricWithStatus[]>();
    for (const metric of metrics) {
      if (!moduleMap.has(metric.moduleId)) {
        moduleMap.set(metric.moduleId, []);
      }
      moduleMap.get(metric.moduleId)!.push(metric);
    }

    const result: MetricsByModule[] = [];
    for (const possibleModule of getPossibleModules(getInstanceCountryIso3())) {
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

  const organized = () => organizeMetrics(projectState.metrics);

  return (
    <FrameTop
      panelChildren={
        <div class="h-full w-full" data-cursor-zone="header">
        <HeadingBar heading={t3({ en: "Metrics", fr: "Métriques", pt: "Métricas" })}
          ensureHeightAsIfButton></HeadingBar>
        </div>
      }
    >
      <div class="ui-pad ui-spy" data-page-cursor-surface>
        <For each={organized()}>
          {(moduleGroup) => (
            <div class="ui-spy">
              <div class="flex items-baseline gap-3 border-b pb-2">
                <div class="font-700 text-base">{moduleGroup.moduleLabel}</div>
                <div class="font-mono ui-text-caption">{moduleGroup.moduleId}</div>
              </div>
              <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
                <For each={moduleGroup.metricGroups}>
                  {(metricGroup) => (
                    <MetricGroupCard
                      metricGroup={metricGroup}
                      projectId={projectState.id}
                      projectState={projectState}
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
  projectState: ProjectState;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

function MetricGroupCard(p: MetricGroupCardProps) {
  const firstMetric = p.metricGroup.variants[0];
  const hasVariants = p.metricGroup.variants.length > 1;
  const { aiContext } = useAIProjectContext();

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
        preselectedMetric: metric,
        modules: p.projectState.projectModules,
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
        returnToContext: aiContext(),
        ...snapshotForVizEditor({
          projectState: p.projectState,
          resultsValue: res.resultsValue,
          config: res.config,
        }),
      },
    });
  }

  return (
    <div class="bg-base-100 rounded border">
      <div class="ui-pad-sm border-b">
        <div class="font-700">{p.metricGroup.label}</div>
        <Show when={firstMetric.aiDescription}>
          <div class="ui-text-caption mt-1">
            {t3(firstMetric.aiDescription!.summary)}
          </div>
        </Show>
        <Show when={hasVariants}>
          <div class="ui-text-caption mt-1">
            {p.metricGroup.variants.length} {t3({ en: "variants", fr: "variantes", pt: "variantes" })}
          </div>
        </Show>
      </div>
      <div class="ui-pad-sm ui-spy-sm">
        <div class="ui-gap-sm flex flex-wrap items-center">
          <div class="bg-primary-subtle text-primary-subtle-content rounded px-2 py-0.5 text-xs">
            {firstMetric.formatAs}
          </div>
          <div class="ui-text-caption">
            {t3({ en: "Period", fr: "Période", pt: "Período" })}: {firstMetric.mostGranularTimePeriodColumnInResultsFile ?? t3({ en: "none", fr: "aucune", pt: "nenhum" })}
          </div>
          <div class="ui-text-caption">
            {firstMetric.disaggregationOptions.length} {t3({ en: firstMetric.disaggregationOptions.length !== 1 ? "disaggs" : "disagg", fr: firstMetric.disaggregationOptions.length !== 1 ? "désagrég." : "désagrég.", pt: firstMetric.disaggregationOptions.length !== 1 ? "desagreg." : "desagreg." })}
          </div>
        </div>
        <Show when={hasVariants}>
          <div class="ui-spy-sm">
            <For each={p.metricGroup.variants}>
              {(variant) => (
                <div class="ui-pad-sm ui-gap-sm flex items-start justify-between rounded border">
                  <div class="flex-1">
                    <div class="font-700 text-sm">
                      {variant.variantLabel || t3({ en: "Default", fr: "Par défaut", pt: "Predefinição" })}
                    </div>
                    <div class="font-mono ui-text-caption">{variant.id}</div>
                  </div>
                  <div class="ui-gap-sm flex">
                    <Button
                      onClick={() => visualize(variant)}
                      size="sm"
                      outline
                    >{t3({ en: "Visualize", fr: "Visualiser", pt: "Visualizar" })}</Button>
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
            <div class="font-mono ui-text-caption flex-1">{firstMetric.id}</div>
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
