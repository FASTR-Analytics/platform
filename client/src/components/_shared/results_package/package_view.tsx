import {
  t3,
  type RunDetail,
  type RunListingItem,
  type RunPopulation,
} from "lib";
import {
  Button,
  CollapsibleSection,
  StateHolderWrapper,
  formatFileSize,
  getEditorWrapper,
  type StateHolder,
} from "panther";
import { For, Show, createEffect, createSignal, type JSX } from "solid-js";
import { getRunDetailFromCacheOrFetch } from "~/state/instance/t2_runs";
import { instanceState } from "~/state/instance/t1_store";
import { getAdminAreaLabelForLevel } from "~/state/instance/_util_disaggregation_label";
import {
  PinnedBadge,
  RunStatusBadge,
  canViewPackageContents,
  canViewPackageLogs,
  moduleLabel,
  runOutputFileHref,
} from "./status";
import { ViewLogs } from "./view_logs";
import { ViewScript } from "./view_script";

// One READY results package, as it is explored ANYWHERE (Tim's ruling
// 2026-08-18: what a package contains is a function of the runId alone, so it
// is read through one run-keyed mount and rendered by one view). Header
// (label, pin, status, provenance) + the per-module collapsible sections:
// settings, Script/Logs viewers, files with download.
//
// Hosts add only their own chrome through the slots: the instance catalogue
// puts pin/unpin/delete in `headerActions` and renders generating/failed runs
// itself, so this view is ready-only by construction; `headerNote` carries
// whatever caveat the host needs above the module cards.
export function ResultsPackageView(p: {
  run: RunListingItem;
  headerActions?: JSX.Element;
  headerNote?: JSX.Element;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  const openViewer: OpenViewer = (element, moduleId) => {
    void p.openEditor({
      element,
      props: {
        runId: p.run.id,
        // Read plane: the id comes from the package's own manifest and is
        // read as text, so a module that has left the registry, or one from
        // a newer app, is still browsable (PLAN_1a §0 clause 3).
        moduleId,
        moduleLabel: moduleLabel(moduleId),
      },
    });
  };

  return (
    <div class="ui-spy">
      <div class="ui-spy-sm">
        <div class="ui-gap flex items-center">
          <div class="font-700 flex-1 truncate text-lg">{p.run.label}</div>
          <Show when={p.run.id === instanceState.pinnedRunId}>
            <PinnedBadge />
          </Show>
          <RunStatusBadge status={p.run.status} />
          {p.headerActions}
        </div>

        <ResultsPackageProvenanceLine run={p.run} />
      </div>

      {p.headerNote}

      <ReadyModulesSection run={p.run} openViewer={openViewer} />
    </div>
  );
}

type Viewer = typeof ViewScript | typeof ViewLogs;
type OpenViewer = (element: Viewer, moduleId: string) => void;

function ReadyModulesSection(p: {
  run: RunListingItem;
  openViewer: OpenViewer;
}) {
  // T2, immutable-by-identity (`state/instance/t2_runs.ts`): the run dir
  // never changes, so a revisit is a memory/IndexedDB hit. Hosts remount this
  // view keyed on the run, so each mount resolves once; the counter is the
  // mandatory stale-response guard for the same-mount case anyway.
  const [detail, setDetail] = createSignal<StateHolder<RunDetail>>({
    status: "loading",
  });
  let requestCounter = 0;
  createEffect(async () => {
    const runId = p.run.id;
    const requestId = ++requestCounter;
    const res = await getRunDetailFromCacheOrFetch(runId);
    if (requestId !== requestCounter) {
      return;
    }
    setDetail(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  });

  // A ready run whose manifest cannot be read (unreadable bytes, or written
  // by a newer server on a mixed-version fleet) must not lose the
  // script/log viewers: they are exactly what diagnoses it. Fall back to
  // the summary's module list, which lives in the DB row. Each viewer is
  // offered only to a caller the server would let through (status.tsx).
  return (
    <StateHolderWrapper
      state={detail()}
      noPad
      errorRenderer={(err) => (
        <div class="ui-spy-sm">
          <div class="text-danger text-sm">{err}</div>
          <For each={p.run.summary?.moduleIds ?? []}>
            {(moduleId) => (
              <div class="ui-gap-sm flex items-center text-sm">
                <div class="w-64 truncate">{moduleLabel(moduleId)}</div>
                <Show when={canViewPackageContents()}>
                  <Button
                    size="sm"
                    outline
                    onClick={() => p.openViewer(ViewScript, moduleId)}
                  >
                    {t3({ en: "Script", fr: "Script", pt: "Script" })}
                  </Button>
                </Show>
                <Show when={canViewPackageLogs()}>
                  <Button
                    size="sm"
                    outline
                    onClick={() => p.openViewer(ViewLogs, moduleId)}
                  >
                    {t3({ en: "Logs", fr: "Journaux", pt: "Registos" })}
                  </Button>
                </Show>
              </div>
            )}
          </For>
        </div>
      )}
    >
      {(keyedDetail) => (
        <div class="ui-spy">
          <Show
            when={
              keyedDetail.population?.active
                ? keyedDetail.population
                : undefined
            }
            keyed
          >
            {(population) => <PopulationSection population={population} />}
          </Show>
          <For each={keyedDetail.modules}>
            {(mod) => (
              <ModuleSection
                runId={p.run.id}
                module={mod}
                openViewer={p.openViewer}
              />
            )}
          </For>
        </div>
      )}
    </StateHolderWrapper>
  );
}

// The manifest's population stamp (SYSTEM_08 "population.csv"): what the
// package's rate indicators were computed over. Rendered only when a formula
// named a population, so an instance that never uses one sees nothing.
function PopulationSection(p: { population: RunPopulation }) {
  const level = () =>
    t3(getAdminAreaLabelForLevel(p.population.adminAreaLevel));
  return (
    <CollapsibleSection
      title={t3({ en: "Population", fr: "Population", pt: "População" })}
    >
      <div class="ui-pad ui-spy-sm">
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
    </CollapsibleSection>
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

function ModuleSection(p: {
  runId: string;
  module: RunDetail["modules"][number];
  openViewer: OpenViewer;
}) {
  return (
    <CollapsibleSection title={moduleLabel(p.module.moduleId)}>
      <div class="ui-pad ui-spy">
        <div class="ui-spy-sm">
          <div class="ui-text-caption font-700">
            {t3({ en: "Settings", fr: "Paramètres", pt: "Definições" })}
          </div>
          <Show
            when={p.module.settings.length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "This module has no settings",
                  fr: "Ce module n'a aucun paramètre",
                  pt: "Este módulo não tem definições",
                })}
              </div>
            }
          >
            <div class="ui-spy-sm">
              <For each={p.module.settings}>
                {(setting) => (
                  <div class="text-sm">
                    <span class="text-base-content-muted">{setting.label}</span>
                    {`: ${setting.value}`}
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
        <div class="ui-spy-sm">
          <div class="ui-text-caption font-700">
            {t3({
              en: "Script and logs",
              fr: "Script et journaux",
              pt: "Script e registos",
            })}
          </div>
          <div class="ui-gap-sm flex items-center">
            <Show when={canViewPackageContents()}>
              <Button
                size="sm"
                outline
                onClick={() => p.openViewer(ViewScript, p.module.moduleId)}
              >
                {t3({ en: "Script", fr: "Script", pt: "Script" })}
              </Button>
            </Show>
            <Show when={canViewPackageLogs()}>
              <Button
                size="sm"
                outline
                onClick={() => p.openViewer(ViewLogs, p.module.moduleId)}
              >
                {t3({ en: "Logs", fr: "Journaux", pt: "Registos" })}
              </Button>
            </Show>
          </div>
        </div>
        <div class="ui-spy-sm">
          <div class="ui-text-caption font-700">
            {t3({
              en: "Output files",
              fr: "Fichiers de sortie",
              pt: "Ficheiros de saída",
            })}
          </div>
          <Show
            when={p.module.files.length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No files",
                  fr: "Aucun fichier",
                  pt: "Nenhum ficheiro",
                })}
              </div>
            }
          >
            <div class="ui-spy-sm">
              <For each={p.module.files}>
                {(file) => (
                  <div class="ui-gap-sm flex items-center">
                    <div class="flex-1 truncate text-sm">{file.name}</div>
                    <div class="ui-text-caption">
                      {formatFileSize(file.sizeBytes, 1)}
                    </div>
                    <Button
                      size="sm"
                      outline
                      iconName="download"
                      ariaLabel={t3({
                        en: "Download",
                        fr: "Télécharger",
                        pt: "Transferir",
                      })}
                      href={runOutputFileHref(
                        p.runId,
                        p.module.moduleId,
                        file.name,
                      )}
                      download={file.name}
                    />
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </CollapsibleSection>
  );
}

// A failed run's errorDetail can be a wall of text (module-resolution or R
// errors): clamp it to a few lines, expandable on demand. Display-only:
// the stored detail stays intact. Used by the catalogue's failed branch, the
// one surface that renders a non-ready run.
const ERROR_CLAMP_CHARS = 280;

export function FailedErrorDetail(p: { errorDetail: string | null }) {
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

// The package's provenance line: when it was made, by whom, how, and how much
// disk it holds: read off the run's own record, not the viewer's
// relationship to it.
export function ResultsPackageProvenanceLine(p: { run: RunListingItem }) {
  return (
    <div class="ui-text-caption">
      {new Date(p.run.createdAt).toLocaleString()}
      {p.run.createdBy !== null ? ` · ${p.run.createdBy}` : ""}
      {p.run.provenance === "synthetic-backfill"
        ? ` · ${t3({
            en: "created from pre-existing results",
            fr: "créé à partir de résultats préexistants",
            pt: "criado a partir de resultados preexistentes",
          })}`
        : ""}
      {p.run.summary?.diskSizeBytes != null
        ? ` · ${formatFileSize(p.run.summary.diskSizeBytes, 1)}`
        : ""}
    </div>
  );
}
