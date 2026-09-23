import {
  deriveConfigFromVizPreset,
  getModuleFamilyLabel,
  MODULE_FAMILY_ORDER,
  t3,
  type DatasetType,
  type InstalledModuleSummary,
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
import { exploreFamily, setExploreFamily } from "~/state/t4_ui";

type FamilyPrimary = {
  family: DatasetType;
  module: InstalledModuleSummary;
  // The family's one default: the primary module's first ready metric by id,
  // or its first metric by id when none is ready, so the stamped reason shows.
  metric: MetricWithStatus | undefined;
};

// The families offered: those whose primary module is in the package, in
// family order.
function familiesInPackage(ctx: RunAuthoringContext): FamilyPrimary[] {
  return MODULE_FAMILY_ORDER.flatMap((family) => {
    const module = ctx.modules.find((m) =>
      m.family === family && m.tier === "primary"
    );
    if (module === undefined) return [];
    const metrics = ctx.metrics
      .filter((m) => m.moduleId === module.id)
      .toSorted((a, b) => a.id.localeCompare(b.id));
    return [{
      family,
      module,
      metric: metrics.find((m) => m.status === "ready") ?? metrics[0],
    }];
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
        <div class="ui-pad text-base-content-muted text-sm">
          {t3({
            en: "This package has no primary module, so there are no results to explore. Generate a package that includes one.",
            fr: "Ce paquet n'a aucun module principal, il n'y a donc aucun résultat à explorer. Générez un paquet qui en inclut un.",
            pt: "Este pacote não tem nenhum módulo principal, pelo que não há resultados para explorar. Gere um pacote que inclua um.",
          })}
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
        <div class="ui-pad text-base-content-muted text-sm">
          {p.primary.metric?.statusReason ??
            t3({
              en: "This module produced no metric in this package",
              fr: "Ce module n'a produit aucun indicateur dans ce paquet",
              pt: "Este módulo não produziu nenhuma métrica neste pacote",
            })}
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
              <div class="ui-pad text-base-content-muted text-sm">
                {t3({
                  en: "This metric declares no visualization preset",
                  fr: "Cet indicateur ne déclare aucune visualisation prédéfinie",
                  pt: "Esta métrica não declara nenhuma visualização predefinida",
                })}
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
