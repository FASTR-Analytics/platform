import {
  MODULE_FAMILY_ORDER,
  compareModules,
  getModuleFamilyLabel,
  t3,
  type RunAuthoringContext,
  type RunCatalogItem,
  type RunModuleProgressStatus,
  type RunPopulation,
  type RunProgress,
} from "lib";
import { Button, Callout } from "panther";
import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import { PRODUCT_TYPE_REGISTRY } from "~/components/products/mod.ts";
import { getAdminAreaLabelForLevel } from "~/state/instance/_util_disaggregation_label";
import {
  ModuleProgressChip,
  canViewPackageContents,
  canViewPackageLogs,
  moduleLabel,
} from "./status";
import { ViewFiles } from "./view_files";
import { ViewLogs } from "./view_logs";
import { ViewScript } from "./view_script";
import type { OpenEditor } from "./visualizations";

type Viewer = typeof ViewScript | typeof ViewLogs | typeof ViewFiles;

type ModuleChip = {
  id: string;
  label: string;
  status: RunModuleProgressStatus;
};
type ChipGroup = { heading: string | undefined; modules: ModuleChip[] };

// The package's About tab, one shape for every status: the module chips
// from `run.progress` (stored at publish, so a ready package has them too),
// the live R line while generating, the error detail when failed, which
// products use it, the population stamp, and a failed package's
// started-module viewers.
//
// Chips are grouped under a family heading only for a ready package, whose
// authoring context carries each module's family; a generating or failed
// run has no manifest, and the registry declares no family (SYSTEM_08), so
// its chips stay flat in execution order and are named from the registry.
export function About(p: {
  run: RunCatalogItem;
  progress: RunProgress | null;
  latestRLine: (moduleId: string) => string | undefined;
  ctx: RunAuthoringContext | undefined;
  openEditor: OpenEditor;
}) {
  const groups = createMemo((): ChipGroup[] => {
    const progress = p.progress;
    if (progress === null) return [];
    const status = (id: string) => progress.moduleStatus[id] ?? "pending";
    const ctx = p.ctx;
    if (ctx === undefined) {
      return [
        {
          heading: undefined,
          modules: progress.moduleOrder.map((id) => ({
            id,
            label: moduleLabel(id),
            status: status(id),
          })),
        },
      ];
    }
    // The manifest's module list and `moduleOrder` are the same resolved
    // set, so every ready module has a status.
    const known = ctx.modules.toSorted(compareModules);
    return MODULE_FAMILY_ORDER.flatMap((family) => {
      const modules = known.filter((m) => m.family === family);
      if (modules.length === 0) return [];
      return [
        {
          heading: getModuleFamilyLabel(family),
          modules: modules.map((m) => ({
            id: m.id,
            label: m.label,
            status: status(m.id),
          })),
        },
      ];
    });
  });

  // A failed run's started modules keep their script, log and the partial
  // workspace's files (via the listing route, since there is no manifest);
  // a pending module never got a workspace. Named from the registry.
  function openViewer(element: Viewer, moduleId: string): void {
    void p.openEditor({
      element,
      props: {
        runId: p.run.id,
        moduleId,
        moduleLabel: moduleLabel(moduleId),
      },
    });
  }

  return (
    <div class="ui-spy">
      <Show when={p.run.status === "failed"}>
        <FailedErrorDetail errorDetail={p.progress?.errorDetail ?? null} />
      </Show>
      <For each={groups()}>
        {(group) => (
          <div class="ui-spy-sm">
            <Show when={group.heading} keyed>
              {(heading) => (
                <div class="ui-text-caption font-700">{heading}</div>
              )}
            </Show>
            <Switch>
              <Match when={p.run.status === "failed"}>
                <For each={group.modules}>
                  {(mod) => (
                    <div class="ui-gap-sm flex items-center text-sm">
                      <div class="flex w-64">
                        <ModuleProgressChip
                          label={mod.label}
                          status={mod.status}
                        />
                      </div>
                      <Show when={mod.status !== "pending"}>
                        <FailedModuleViewerButtons
                          moduleId={mod.id}
                          openViewer={openViewer}
                        />
                      </Show>
                    </div>
                  )}
                </For>
              </Match>
              <Match when={p.run.status !== "failed"}>
                <div class="ui-gap-sm flex flex-wrap">
                  <For each={group.modules}>
                    {(mod) => (
                      <ModuleProgressChip
                        label={mod.label}
                        status={mod.status}
                      />
                    )}
                  </For>
                </div>
              </Match>
            </Switch>
          </div>
        )}
      </For>
      <Show
        when={
          p.run.status === "generating"
            ? p.progress?.currentModuleId
            : undefined
        }
        keyed
      >
        {(currentModuleId) => (
          <div class="ui-text-caption truncate font-mono">
            {p.latestRLine(currentModuleId) ?? "..."}
          </div>
        )}
      </Show>
      <UsageLine run={p.run} />
      <Show
        when={p.ctx?.population?.active ? p.ctx.population : undefined}
        keyed
      >
        {(population) => <PopulationSection population={population} />}
      </Show>
    </div>
  );
}

function UsageLine(p: { run: RunCatalogItem }) {
  return (
    <Show
      when={p.run.attachedProducts.length > 0}
      fallback={
        <div
          class="ui-text-caption"
          data-tour="instance-results-packages-usage"
        >
          {t3({
            en: "Not used by any deck or report",
            fr: "Utilisé par aucune présentation ni aucun rapport",
            pt: "Não usado por nenhuma apresentação nem relatório",
          })}
        </div>
      }
    >
      <Callout data-tour="instance-results-packages-usage" noBorder>
        <span class="font-700">
          {t3({ en: "In use by", fr: "Utilisé par", pt: "Em uso por" })}:
        </span>{" "}
        {p.run.attachedProducts
          .map(
            (product) =>
              `${product.label} (${PRODUCT_TYPE_REGISTRY[product.type].label()})`,
          )
          .join(", ")}
      </Callout>
    </Show>
  );
}

// A failed run's errorDetail can be a wall of text (module-resolution or R
// errors): clamp it to a few lines, expandable on demand. Display-only:
// the stored detail stays intact.
const ERROR_CLAMP_CHARS = 280;

function FailedErrorDetail(p: { errorDetail: string | null }) {
  const [expanded, setExpanded] = createSignal(false);
  const detail = () =>
    p.errorDetail ??
    t3({
      en: "Generation failed",
      fr: "Échec de la génération",
      pt: "Falha na geração",
    });
  const isLong = () => detail().length > ERROR_CLAMP_CHARS;
  return (
    <div class="ui-spy-sm text-danger text-sm">
      <div class="whitespace-pre-wrap">
        {expanded() || !isLong()
          ? detail()
          : `${detail().slice(0, ERROR_CLAMP_CHARS)}…`}
      </div>
      <Show when={isLong()}>
        <Button
          size="sm"
          outline
          intent="danger"
          onClick={() => setExpanded(!expanded())}
        >
          {expanded()
            ? t3({ en: "Show less", fr: "Afficher moins", pt: "Mostrar menos" })
            : t3({ en: "Show more", fr: "Afficher plus", pt: "Mostrar mais" })}
        </Button>
      </Show>
    </div>
  );
}

function FailedModuleViewerButtons(p: {
  moduleId: string;
  openViewer: (element: Viewer, moduleId: string) => void;
}) {
  return (
    <>
      <Show when={canViewPackageContents()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewScript, p.moduleId)}
        >
          {t3({ en: "Script", fr: "Script", pt: "Script" })}
        </Button>
      </Show>
      <Show when={canViewPackageLogs()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewLogs, p.moduleId)}
        >
          {t3({ en: "Logs", fr: "Journaux", pt: "Registos" })}
        </Button>
      </Show>
      <Show when={canViewPackageContents()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewFiles, p.moduleId)}
        >
          {t3({ en: "Files", fr: "Fichiers", pt: "Ficheiros" })}
        </Button>
      </Show>
    </>
  );
}

// The manifest's population stamp (SYSTEM_08 "population.csv"): what the
// package's rate indicators were computed over. Rendered only when a formula
// named a population, so an instance that never uses one sees nothing.
function PopulationSection(p: { population: RunPopulation }) {
  const level = () =>
    t3(getAdminAreaLabelForLevel(p.population.adminAreaLevel));
  return (
    <div class="ui-spy-sm">
      <div class="ui-text-caption font-700">
        {t3({ en: "Population", fr: "Population", pt: "População" })}
      </div>
      <div class="ui-spy-sm">
        <div class="text-sm">
          <span class="text-base-content-muted">
            {t3({ en: "Level", fr: "Niveau", pt: "Nível" })}
          </span>
          {`: ${level()}`}
        </div>
        <Show
          when={p.population.coverage}
          keyed
          fallback={
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "Coverage not recorded for this package",
                fr: "Couverture non enregistrée pour ce paquet",
                pt: "Cobertura não registada para este pacote",
              })}
            </div>
          }
        >
          {(coverage) => (
            <For each={coverage}>
              {(c) => (
                <div class="text-sm">
                  <span class="text-base-content-muted">
                    {c.populationType}
                  </span>
                  {`: ${t3({
                    en: `${c.areasCovered} of ${c.areasTotal} areas`,
                    fr: `${c.areasCovered} zones sur ${c.areasTotal}`,
                    pt: `${c.areasCovered} de ${c.areasTotal} áreas`,
                  })}, ${coveredMonths(c.firstCoveredPeriodId, c.lastCoveredPeriodId)}`}
                </div>
              )}
            </For>
          )}
        </Show>
      </div>
    </div>
  );
}

// Period ids are YYYYMM in the instance's own calendar, so the id's digits
// are the month label.
function coveredMonths(first: number | null, last: number | null): string {
  if (first === null || last === null) {
    return t3({
      en: "no months covered",
      fr: "aucun mois couvert",
      pt: "nenhum mês coberto",
    });
  }
  return t3({
    en: `${formatPeriodId(first)} to ${formatPeriodId(last)}`,
    fr: `${formatPeriodId(first)} à ${formatPeriodId(last)}`,
    pt: `${formatPeriodId(first)} a ${formatPeriodId(last)}`,
  });
}

function formatPeriodId(periodId: number): string {
  return `${Math.floor(periodId / 100)}-${String(periodId % 100).padStart(2, "0")}`;
}
