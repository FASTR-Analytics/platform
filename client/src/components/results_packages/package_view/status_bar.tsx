import {
  MODULE_FAMILY_ORDER,
  compareModules,
  getModuleFamilyLabel,
  runProgressSteps,
  runStageLabel,
  t3,
  type RunAuthoringContext,
  type RunCatalogItem,
  type RunModuleProgressStatus,
  type RunPopulation,
  type RunProgress,
} from "lib";
import { ProgressBar } from "panther";
import { For, Show, createMemo, type JSX } from "solid-js";
import { PRODUCT_TYPE_REGISTRY } from "~/components/products/mod.ts";
import { getAdminAreaLabelForLevel } from "~/state/instance/_util_disaggregation_label";
import { ModuleProgressChip, moduleLabel } from "./status";

type ModuleChip = {
  id: string;
  label: string;
  status: RunModuleProgressStatus;
  active: boolean;
};
type ChipGroup = { heading: string | undefined; modules: ModuleChip[] };

// The package's facts, one bar between the heading and the tabs for every
// status: while generating, a busy progress bar with the stage sentence
// (SYSTEM_08 "The stage"); how each module ran (from `run.progress`, stored
// at publish, so a ready package has them too), the live R line while an R
// script runs, which products use it, and the population stamp.
//
// The active chip is the pipeline's current module, whatever its status, so
// a reused module's copy shows activity too; only a generating run has one.
//
// Chips are grouped under a family label only for a ready package, whose
// authoring context carries each module's family; a generating or failed
// run has no manifest, and the registry declares no family (SYSTEM_08), so
// its chips stay flat in execution order and are named from the registry.
export function StatusBar(p: {
  run: RunCatalogItem;
  progress: RunProgress | null;
  latestRLine: (moduleId: string) => string | undefined;
  ctx: RunAuthoringContext | undefined;
}) {
  const bar = createMemo(() => {
    const progress = p.progress;
    if (progress === null) return undefined;
    const { done, total } = runProgressSteps(progress);
    return { percent: (done / total) * 100, label: runStageLabel(progress) };
  });
  const groups = createMemo((): ChipGroup[] => {
    const progress = p.progress;
    if (progress === null) return [];
    const status = (id: string) => progress.moduleStatus[id] ?? "pending";
    const active = (id: string) =>
      p.run.status === "generating" && id === progress.currentModuleId;
    const ctx = p.ctx;
    if (ctx === undefined) {
      return [
        {
          heading: undefined,
          modules: progress.moduleOrder.map((id) => ({
            id,
            label: moduleLabel(id),
            status: status(id),
            active: active(id),
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
            active: active(m.id),
          })),
        },
      ];
    });
  });

  return (
    <div class="ui-pad ui-spy-sm border-b text-sm">
      <Show when={p.run.status === "generating" && bar() !== undefined}>
        <ProgressBar
          small
          busy
          progressFrom0To100={bar()?.percent ?? 0}
          progressMsg={bar()?.label}
        />
      </Show>
      <Show when={groups().length > 0}>
        <Row label={t3({ en: "Modules", fr: "Modules", pt: "Módulos" })}>
          <div class="ui-gap-sm flex flex-wrap items-center">
            <For each={groups()}>
              {(group) => (
                <>
                  <Show when={group.heading} keyed>
                    {(heading) => (
                      <span class="ui-text-caption font-700">{heading}</span>
                    )}
                  </Show>
                  <For each={group.modules}>
                    {(mod) => (
                      <ModuleProgressChip
                        label={mod.label}
                        status={mod.status}
                        active={mod.active}
                      />
                    )}
                  </For>
                </>
              )}
            </For>
          </div>
        </Row>
      </Show>
      <Show
        when={
          p.run.status === "generating" && p.progress?.stage.kind === "module"
            ? p.progress.stage.moduleId
            : undefined
        }
        keyed
      >
        {(moduleId) => (
          <Row label={t3({ en: "Running", fr: "En cours", pt: "A correr" })}>
            <div class="ui-text-caption truncate font-mono">
              {p.latestRLine(moduleId) ?? "..."}
            </div>
          </Row>
        )}
      </Show>
      <Row
        label={t3({ en: "In use by", fr: "Utilisé par", pt: "Em uso por" })}
        data-tour="instance-results-packages-usage"
      >
        <Show
          when={p.run.attachedProducts.length > 0}
          fallback={
            <span class="text-base-content-muted">
              {t3({
                en: "No deck or report",
                fr: "Aucune présentation ni aucun rapport",
                pt: "Nenhuma apresentação nem relatório",
              })}
            </span>
          }
        >
          {p.run.attachedProducts
            .map(
              (product) =>
                `${product.label} (${PRODUCT_TYPE_REGISTRY[product.type].label()})`,
            )
            .join(", ")}
        </Show>
      </Row>
      <Show
        when={p.ctx?.population?.active ? p.ctx.population : undefined}
        keyed
      >
        {(population) => (
          <Row
            label={t3({ en: "Population", fr: "Population", pt: "População" })}
          >
            <PopulationFacts population={population} />
          </Row>
        )}
      </Show>
    </div>
  );
}

function Row(p: {
  label: string;
  children: JSX.Element;
  "data-tour"?: string;
}) {
  return (
    <div class="ui-gap flex items-start" data-tour={p["data-tour"]}>
      <div class="ui-text-caption w-24 flex-none pt-0.5">{p.label}</div>
      <div class="min-w-0 flex-1">{p.children}</div>
    </div>
  );
}

// The manifest's population stamp (SYSTEM_08 "population.csv"): what the
// package's rate indicators were computed over. Rendered only when a formula
// named a population, so an instance that never uses one sees nothing.
function PopulationFacts(p: { population: RunPopulation }) {
  const level = () =>
    t3(getAdminAreaLabelForLevel(p.population.adminAreaLevel));
  return (
    <div>
      <div>
        {t3({
          en: `${level()} level`,
          fr: `Niveau : ${level()}`,
          pt: `Nível: ${level()}`,
        })}
      </div>
      <Show
        when={p.population.coverage}
        keyed
        fallback={
          <div class="text-base-content-muted">
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
              <div>
                <span class="text-base-content-muted">{c.populationType}</span>
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
