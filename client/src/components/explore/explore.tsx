import {
  getModuleFamilyLabel,
  t3,
  TC,
  type DatasetType,
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
import {
  ScopePicker,
  storedValueFromScopeSelection,
  type ScopeSelection,
} from "~/components/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { exploreFamily, setExploreFamily } from "~/state/t4_ui";
import { familiesInPackage } from "./explore_query";
import { FamilyView } from "./family_view";

// The Explore tab's page: one package at one scope, a family tab, the
// family's scorecard and a per-indicator detail. Read-only: every read goes
// through the run-keyed authoring context and figure-data caches, and nothing
// here is written anywhere. The package starts at the pin (else the newest
// ready package) and the scope national on every mount; neither is stored,
// so a deleted package can never be a stored default. The family tab
// persists in t4_ui.
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

  const [selection, setSelection] = createSignal<ScopeSelection>({
    mode: "national",
  });
  const [adminArea2, setAdminArea2] = createSignal<string | null>(null);
  function changeScope(next: ScopeSelection): void {
    setSelection(next);
    const stored = storedValueFromScopeSelection(next);
    if (stored !== undefined) setAdminArea2(stored);
  }

  return (
    <FrameTop
      panelChildren={
        <div class="h-full w-full">
          <HeadingBar
            heading={t3({ en: "Explore", fr: "Explorer", pt: "Explorar" })}
          />
        </div>
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
          <PackageExplorer
            runId={runId}
            onChangePackage={setChosenPackageId}
            selection={selection()}
            onChangeScope={changeScope}
            scope={{ runId, adminArea2: adminArea2() }}
          />
        )}
      </Show>
    </FrameTop>
  );
}

function PackageExplorer(p: {
  runId: string;
  onChangePackage: (runId: string) => void;
  selection: ScopeSelection;
  onChangeScope: (s: ScopeSelection) => void;
  scope: PackageScope;
}) {
  const context = createQuery(
    () => getRunAuthoringContextFromCacheOrFetch(p.runId),
    t3(TC.loading),
  );

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-gap flex flex-wrap items-start">
        <Select
          label={t3({
            en: "Results package",
            fr: "Paquet de résultats",
            pt: "Pacote de resultados",
          })}
          value={p.runId}
          options={instanceState.readyPackages.map((pkg) => ({
            value: pkg.id,
            label: pkg.label,
          }))}
          onChange={p.onChangePackage}
        />
        <ScopePicker selection={p.selection} onChange={p.onChangeScope} />
      </div>
      <StateHolderWrapper state={context.state()} noPad>
        {(ctx: RunAuthoringContext) => <FamilyTabs ctx={ctx} scope={p.scope} />}
      </StateHolderWrapper>
    </div>
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
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "This package has no primary module, so there are no results to explore. Generate a package that includes one.",
            fr: "Ce paquet n'a aucun module principal, il n'y a donc aucun résultat à explorer. Générez un paquet qui en inclut un.",
            pt: "Este pacote não tem nenhum módulo principal, pelo que não há resultados para explorar. Gere um pacote que inclua um.",
          })}
        </div>
      }
    >
      {(primary) => (
        <div class="ui-spy">
          <TabsNavigation
            items={families().map((f) => ({
              id: f.family,
              label: getModuleFamilyLabel(f.family),
            }))}
            value={primary.family}
            onChange={setExploreFamily}
          />
          <FamilyView ctx={p.ctx} scope={p.scope} primary={primary} />
        </div>
      )}
    </Show>
  );
}
