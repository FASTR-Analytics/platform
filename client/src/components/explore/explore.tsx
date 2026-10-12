import {
  ALL_DATA_SCOPE_ID,
  compareModules,
  type DatasetType,
  exploreViewKey,
  type FamilyQuery,
  getModuleFamilyLabel,
  type InstalledModuleSummary,
  MODULE_FAMILY_ORDER,
  type ModuleTier,
  type PackageScope,
  type RunAuthoringContext,
  type ScopeId,
  t3,
  TC,
  viewsForModule,
} from "lib";
import {
  AIToolFailure,
  createQuery,
  FrameTop,
  HeadingBar,
  type ListEntry,
  Select,
  SelectV2,
  StateHolderWrapper,
} from "panther";
import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  on,
  onCleanup,
  Show,
} from "solid-js";
import {
  createResolvedScope,
  instanceState,
  resolveScope,
} from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import {
  exploreFamily,
  exploreModules,
  explorePackageId,
  exploreQueries,
  exploreScopeId,
  exploreViewChoices,
  setExploreFamily,
  setExploreModule,
  setExplorePackageId,
  setExploreQuery,
  setExploreScopeId,
} from "~/state/t4_explore";
import { ScopeSelect } from "~/components/_shared/mod.ts";
import {
  copilotViewController,
  type ExploreContext,
  type ExploreSelection,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";
import { EmptyState } from "./_shared/mod.ts";
import {
  moduleHasReadyMetric,
  ModuleView,
  pickModuleView,
  pickViewType,
} from "./module_view";

function familiesInPackage(ctx: RunAuthoringContext): DatasetType[] {
  return MODULE_FAMILY_ORDER.filter((family) =>
    ctx.modules.some((m) => m.family === family)
  );
}

// The family's modules in module order (tier, then sortOrder).
function modulesInFamily(
  family: DatasetType,
  ctx: RunAuthoringContext,
): InstalledModuleSummary[] {
  return ctx.modules.filter((m) => m.family === family).toSorted(
    compareModules,
  );
}

// The stored choices resolved against the package: a choice the package
// cannot answer falls back to the first offered without being overwritten.
// The panes resolve through these, and so does the chat view's state, so the
// model is told what is on screen.
function resolveFamily(ctx: RunAuthoringContext): DatasetType | undefined {
  const families = familiesInPackage(ctx);
  return families.includes(exploreFamily()) ? exploreFamily() : families[0];
}

function resolveModule(
  ctx: RunAuthoringContext,
  family: DatasetType,
): InstalledModuleSummary | undefined {
  const modules = modulesInFamily(family, ctx);
  return modules.find((m) => m.id === exploreModules()[family]) ?? modules[0];
}

function resolveSelection(ctx: RunAuthoringContext): ExploreSelection {
  const family = resolveFamily(ctx);
  const module = family === undefined ? undefined : resolveModule(ctx, family);
  const view = module === undefined || !moduleHasReadyMetric(module, ctx)
    ? undefined
    : pickModuleView(module.id, viewsForModule(module, ctx));
  const key = module === undefined || view === undefined
    ? undefined
    : exploreViewKey(module.id, view.id);
  return {
    family,
    module,
    view,
    type: view === undefined || key === undefined
      ? undefined
      : pickViewType(view, key).type,
    query: family === undefined ? undefined : exploreQueries()[family],
    choices: key === undefined ? undefined : exploreViewChoices()[key],
  };
}

const TIERS: readonly ModuleTier[] = ["primary", "secondary"];

function tierLabel(tier: ModuleTier): string {
  return tier === "primary"
    ? t3({
      en: "Primary results",
      fr: "Résultats principaux",
      pt: "Resultados principais",
    })
    : t3({
      en: "Supporting analyses",
      fr: "Analyses complémentaires",
      pt: "Análises complementares",
    });
}

// The module select's entries: a header per tier the family has a module in.
function moduleEntries(modules: InstalledModuleSummary[]): ListEntry<string>[] {
  return TIERS.flatMap((tier): ListEntry<string>[] => {
    const inTier = modules.filter((m) => m.tier === tier);
    return inTier.length === 0 ? [] : [
      { header: tierLabel(tier) },
      ...inTier.map((m) => ({ id: m.id, label: m.label })),
    ];
  });
}

// The Explore page: one package at one scope, its families as tabs, each
// family's modules in a select on the pane's first row and the chosen
// module's views beneath.
// Every selection lives in t4_explore. The package falls back to the pin,
// else the newest ready package, whenever the chosen one is not ready.
// Nothing here is written anywhere.
//
// The page sets the chat's `explore` view (S13): its pair is the resolved
// package at the resolved scope, or ruling 7's reason while none is ready,
// and its state is what the panes resolve on that pair, read live once the
// package's authoring context is in.
export function Explore() {
  holdCopilotView();
  const packageId = createMemo((): string | undefined => {
    const packages = instanceState.readyPackages;
    const chosen = explorePackageId();
    if (chosen !== null && packages.some((p) => p.id === chosen)) return chosen;
    const pinned = instanceState.pinnedRunId;
    if (pinned !== null && packages.some((p) => p.id === pinned)) return pinned;
    return packages.toSorted((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )[0]
      ?.id;
  });
  // Explore reads through "All data" until a scope is chosen, and again
  // whenever the chosen one is gone.
  const scopeId = createMemo((): ScopeId => {
    const chosen = exploreScopeId();
    return instanceState.scopes.some((s) => s.id === chosen)
      ? chosen
      : ALL_DATA_SCOPE_ID;
  });

  const [ctx, setCtx] = createSignal<RunAuthoringContext>();
  const requireScope = () => {
    const runId = packageId();
    if (runId === undefined) {
      throw new AIToolFailure(
        "No results package is ready yet. An admin generates one under Results.",
      );
    }
    return resolveScope({ runId, scopeId: scopeId() });
  };
  const context: ExploreContext = {
    getScope: requireScope,
    getRunId: () => requireScope().runId,
    getSelection: () => {
      const loaded = ctx();
      return loaded === undefined ? undefined : resolveSelection(loaded);
    },
  };
  copilotViewController.setView("explore", undefined, context);

  return (
    <Show
      when={packageId()}
      keyed
      fallback={
        <div class="ui-pad text-base-content-muted text-sm">
          {t3({
            en:
              "No results package is ready yet. Generate one from the Results packages page.",
            fr:
              "Aucun paquet de résultats n'est encore prêt. Générez-en un depuis la page Paquets de résultats.",
            pt:
              "Ainda não há nenhum pacote de resultados pronto. Gere um na página Pacotes de resultados.",
          })}
        </div>
      }
    >
      {(runId) => (
        <PackageExplorer
          scope={{ runId, scopeId: scopeId() }}
          onContext={setCtx}
          controls={
            <div class="ui-gap-sm flex items-center">
              <Select
                value={runId}
                options={instanceState.readyPackages.map((pkg) => ({
                  value: pkg.id,
                  label: pkg.label,
                }))}
                onChange={setExplorePackageId}
                size="sm"
              />
              <ScopeSelect
                scopeId={scopeId()}
                onChange={setExploreScopeId}
                size="sm"
              />
            </div>
          }
        />
      )}
    </Show>
  );
}

// The heading bar's family tabs come from the package, so the bar renders
// them once the authoring context is in; the controls are there throughout.
function PackageExplorer(p: {
  scope: PackageScope;
  controls: JSX.Element;
  // The loaded authoring context, for the page's chat view state; undefined
  // while it loads and once this explorer unmounts.
  onContext: (ctx: RunAuthoringContext | undefined) => void;
}) {
  // createQuery reads once, so the scope and its definition re-read it here:
  // the family tabs and the module select follow the scope's module list.
  const resolvedScope = createResolvedScope(() => p.scope);
  const context = createQuery(
    () => getRunAuthoringContextFromCacheOrFetch(resolveScope(p.scope)),
    t3(TC.loading),
  );
  createEffect(on(resolvedScope, () => void context.fetch(), { defer: true }));
  createEffect(() => {
    const state = context.state();
    p.onContext(state.status === "ready" ? state.data : undefined);
  });
  onCleanup(() => p.onContext(undefined));
  const families = createMemo((): DatasetType[] => {
    const state = context.state();
    return state.status === "ready" ? familiesInPackage(state.data) : [];
  });
  const family = createMemo((): DatasetType | undefined => {
    const state = context.state();
    return state.status === "ready" ? resolveFamily(state.data) : undefined;
  });
  const tabs = () => {
    const value = family();
    return value === undefined ? undefined : {
      items: families().map((f) => ({ id: f, label: getModuleFamilyLabel(f) })),
      value,
      onChange: setExploreFamily,
    };
  };

  return (
    <FrameTop
      panelChildren={
        <HeadingBar compact tabs={tabs()}>
          {p.controls}
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={context.state()} loadingAndErrorPad="md">
        {(ctx: RunAuthoringContext) => (
          <Show
            when={family()}
            keyed
            fallback={
              <div class="ui-pad">
                <EmptyState kind="no_modules" />
              </div>
            }
          >
            {(f) => (
              <FamilyExplorer
                ctx={ctx}
                scope={p.scope}
                family={f}
                query={exploreQueries()[f]}
                setQuery={(q) => setExploreQuery(f, q)}
              />
            )}
          </Show>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}

// One family: the module select, built here where the family's modules and
// the resolved module are, and the chosen module's views. The stored choice
// is resolved against the package on every read; a module the package lacks
// falls back to the family's first.
function FamilyExplorer(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  query: FamilyQuery | undefined;
  setQuery: (query: FamilyQuery) => void;
}) {
  const modules = createMemo(() => modulesInFamily(p.family, p.ctx));
  const module = createMemo(() => resolveModule(p.ctx, p.family));

  return (
    <Show when={module()} keyed>
      {(m) => (
        <ModuleView
          ctx={p.ctx}
          scope={p.scope}
          family={p.family}
          module={m}
          moduleSelect={
            <div class="w-80 max-w-full">
              <SelectV2
                items={moduleEntries(modules())}
                value={m.id}
                onChange={(id) => setExploreModule(p.family, id)}
                fullWidth
              />
            </div>
          }
          query={p.query}
          setQuery={p.setQuery}
        />
      )}
    </Show>
  );
}
