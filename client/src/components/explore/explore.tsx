import {
  getModuleFamilyLabel,
  t3,
  TC,
  type DatasetType,
  type MetricWithStatus,
  type PackageScope,
  type RunAuthoringContext,
} from "lib";
import {
  createQuery,
  FrameTop,
  HeadingBar,
  Select,
  StateHolderWrapper,
  TabsNavigation,
} from "panther";
import { createMemo, createSignal, Show } from "solid-js";
import { VisualizationEditor } from "~/components/_shared/figure_editor/mod.ts";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { exploreFamily, setExploreFamily } from "~/state/t4_ui";
import { familiesInPackage, presetConfig, type FamilyPrimary } from "./explore_query";

const NATIONAL = "__national__";

// The Explore tab's page: one package at one scope, a family tab, and that
// family's one default visualization open in the figure editor, inline and
// read-only, so the user reshapes it with the same panel a product uses.
// The package starts at the pin (else the newest ready package) and the
// scope national on every mount; neither is stored, so a deleted package can
// never be a stored default. The family tab persists in t4_ui. Nothing here
// is written anywhere.
export function Explore() {
  const [chosenPackageId, setChosenPackageId] = createSignal<string | null>(
    null,
  );
  const packageId = createMemo((): string | undefined => {
    const packages = instanceState.readyPackages;
    const chosen = chosenPackageId();
    if (chosen !== null && packages.some((p) => p.id === chosen)) return chosen;
    const pinned = instanceState.pinnedRunId;
    if (pinned !== null && packages.some((p) => p.id === pinned)) return pinned;
    return packages.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      ?.id;
  });
  const [adminArea2, setAdminArea2] = createSignal<string | null>(null);
  const areas = createQuery<string[]>(() => serverActions.listAdminArea2s({}));
  const areaOptions = createMemo(() => {
    const state = areas.state();
    const list = state.status === "ready" ? state.data : [];
    return [
      {
        value: NATIONAL,
        label: t3({ en: "National", fr: "National", pt: "Nacional" }),
      },
      ...list.map((a) => ({ value: a, label: a })),
    ];
  });

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({ en: "Explore", fr: "Explorer", pt: "Explorar" })}
        >
          <Show when={packageId()} keyed>
            {(runId) => (
              <div class="ui-gap-sm flex items-center">
                <Select
                  value={runId}
                  options={instanceState.readyPackages.map((pkg) => ({
                    value: pkg.id,
                    label: pkg.label,
                  }))}
                  onChange={setChosenPackageId}
                  size="sm"
                />
                <Select
                  value={adminArea2() ?? NATIONAL}
                  options={areaOptions()}
                  onChange={(v) => setAdminArea2(v === NATIONAL ? null : v)}
                  size="sm"
                />
              </div>
            )}
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={packageId()}
        keyed
        fallback={
          <div class="ui-pad text-base-content-muted text-sm">
            {t3({
              en: "No results package is ready yet. Generate one from the Results packages page.",
              fr: "Aucun paquet de résultats n'est encore prêt. Générez-en un depuis la page Paquets de résultats.",
              pt: "Ainda não há nenhum pacote de resultados pronto. Gere um na página Pacotes de resultados.",
            })}
          </div>
        }
      >
        {(runId) => (
          <PackageExplorer scope={{ runId, adminArea2: adminArea2() }} />
        )}
      </Show>
    </FrameTop>
  );
}

function PackageExplorer(p: { scope: PackageScope }) {
  const context = createQuery(
    () => getRunAuthoringContextFromCacheOrFetch(p.scope.runId),
    t3(TC.loading),
  );
  return (
    <StateHolderWrapper state={context.state()}>
      {(ctx: RunAuthoringContext) => <FamilyTabs ctx={ctx} scope={p.scope} />}
    </StateHolderWrapper>
  );
}

function FamilyTabs(p: { ctx: RunAuthoringContext; scope: PackageScope }) {
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
