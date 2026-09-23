import {
  deriveConfigFromVizPreset,
  familiesOffered,
  getModuleFamilyLabel,
  primaryModuleMetrics,
  type DatasetType,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  type RunAuthoringContext,
  type VizPreset,
} from "lib";
import { FrameTop, getLanguage, TabsNavigation } from "panther";
import { createMemo, Show } from "solid-js";
import { unwrap } from "solid-js/store";
import { VisualizationEditor } from "~/components/_shared/figure_editor/mod.ts";
import { EmptyState } from "../_shared/mod.ts";
import { exploreFamily, setExploreFamily } from "~/state/t4_ui";

type FamilyPrimary = {
  family: DatasetType;
  // The family's one default: the primary module's first ready metric by id,
  // or its first metric by id when none is ready, so the stamped reason shows.
  metric: MetricWithStatus | undefined;
};

function familiesInPackage(ctx: RunAuthoringContext): FamilyPrimary[] {
  return familiesOffered(ctx).map((family) => {
    const metrics = primaryModuleMetrics(family, ctx);
    return {
      family,
      metric: metrics.find((m) => m.status === "ready") ?? metrics[0],
    };
  });
}

// A preset's config as the picker derives it, cloned to plain data first
// because the authoring context may be a Solid store.
function presetConfig(preset: VizPreset): PresentationObjectConfig {
  return deriveConfigFromVizPreset(
    structuredClone(unwrap(preset)),
    getLanguage(),
  );
}

// The Visualization tab: a family tab and that family's one default
// visualization open in the figure editor, inline and read-only, so the user
// reshapes it with the same panel a product uses.
export function Visualization(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
}) {
  const families = createMemo(() => familiesInPackage(p.ctx));
  const activeFamily = createMemo((): DatasetType | undefined => {
    const offered = families();
    return offered.some((f) => f.family === exploreFamily())
      ? exploreFamily()
      : offered[0]?.family;
  });
  const active = () => families().find((f) => f.family === activeFamily());

  return (
    <Show
      when={active()}
      keyed
      fallback={
        <div class="ui-pad">
          <EmptyState kind="no_primary_module" />
        </div>
      }
    >
      {(primary) => (
        <FrameTop
          panelChildren={
            <TabsNavigation
              items={families().map((f) => ({
                id: f.family,
                label: getModuleFamilyLabel(f.family),
              }))}
              value={primary.family}
              onChange={setExploreFamily}
              insetRail
            />
          }
        >
          <FamilyDefault ctx={p.ctx} scope={p.scope} primary={primary} />
        </FrameTop>
      )}
    </Show>
  );
}

// The family's default open in the editor. The editor is keyed on the pair
// and the metric, so a package, scope or family change remounts it on a
// fresh copy of the preset.
function FamilyDefault(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  primary: FamilyPrimary;
}) {
  const ready = (): MetricWithStatus | undefined =>
    p.primary.metric?.status === "ready" ? p.primary.metric : undefined;
  const key = () => {
    const metric = ready();
    return metric === undefined
      ? undefined
      : `${p.scope.runId}|${p.scope.adminArea2 ?? ""}|${metric.id}`;
  };

  return (
    <Show
      when={key()}
      keyed
      fallback={
        <div class="ui-pad">
          <EmptyState kind="no_metric" reason={p.primary.metric?.statusReason} />
        </div>
      }
    >
      {(_key: string) => {
        const metric = ready()!;
        const preset = metric.vizPresets?.[0];
        return (
          <Show
            when={preset}
            keyed
            fallback={
              <div class="ui-pad">
                <EmptyState kind="no_preset" />
              </div>
            }
          >
            {(keyedPreset) => (
              <VisualizationEditor
                label={metric.label}
                scope={p.scope}
                metric={metric}
                configSnapshot={presetConfig(keyedPreset)}
                authoringContext={p.ctx}
                viewOnly
                inline
                close={() => {}}
              />
            )}
          </Show>
        );
      }}
    </Show>
  );
}
