import {
  getValidatedModuleId,
  t3,
  type RunDetail,
  type RunListingItem,
} from "lib";
import {
  Button,
  Card,
  StateHolderWrapper,
  formatFileSize,
  getEditorWrapper,
  type StateHolder,
} from "panther";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  type JSX,
} from "solid-js";
import { getRunDetailFromCacheOrFetch } from "~/state/instance/t2_runs";
import { instanceState } from "~/state/instance/t1_store";
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

// One READY results package, as it is explored ANYWHERE — the instance
// catalogue's detail pane and a project's Results package tab mount this
// same component (Tim's ruling 2026-08-18: what a package contains is a
// function of the runId alone, so it is read through one run-keyed mount and
// rendered by one view). Header (label, pin, status, provenance) + the
// per-module cards: settings, Script/Logs viewers, files with download.
//
// The hosts add only their own chrome through the slots: the catalogue puts
// pin/unpin/delete in `headerActions` and renders generating/failed runs
// itself (a project is attached only once a run is ready, so this view is
// ready-only by construction); the project tab puts its scope warning in
// `headerNote`. A project's tab and the catalogue therefore show a package
// identically — the only reason to look at both is to check.
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
        moduleId: getValidatedModuleId(moduleId),
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

  const detailError = () => {
    const d = detail();
    return d.status === "error" ? d.err : undefined;
  };

  // A ready run whose manifest cannot be read (unreadable bytes, or written
  // by a newer server on a mixed-version fleet) must not lose the
  // script/log viewers — they are exactly what diagnoses it. Fall back to
  // the summary's module list, which lives in the DB row.
  return (
    <Switch>
      <Match when={detailError()} keyed>
        {(err) => (
          <div class="ui-spy-sm">
            <div class="text-danger text-sm">{err}</div>
            <For each={p.run.summary?.moduleIds ?? []}>
              {(moduleId) => (
                <div class="ui-gap-sm flex items-center text-sm">
                  <div class="w-64 truncate">{moduleLabel(moduleId)}</div>
                  <ViewerButtons
                    moduleId={moduleId}
                    openViewer={p.openViewer}
                  />
                </div>
              )}
            </For>
          </div>
        )}
      </Match>
      <Match when={detailError() === undefined}>
        <StateHolderWrapper state={detail()} noPad>
          {(keyedDetail) => (
            <div class="ui-spy">
              <For each={keyedDetail.modules}>
                {(mod) => (
                  <ModuleCard
                    runId={p.run.id}
                    module={mod}
                    openViewer={p.openViewer}
                  />
                )}
              </For>
            </div>
          )}
        </StateHolderWrapper>
      </Match>
    </Switch>
  );
}

// Script/Logs open the shared viewers; each is offered only to a caller the
// server would let through (status.tsx helpers).
export function ViewerButtons(p: { moduleId: string; openViewer: OpenViewer }) {
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
    </>
  );
}

function ModuleCard(p: {
  runId: string;
  module: RunDetail["modules"][number];
  openViewer: OpenViewer;
}) {
  return (
    <Card
      header={moduleLabel(p.module.moduleId)}
      headerRight={
        <div class="ui-gap-sm flex items-center">
          <ViewerButtons
            moduleId={p.module.moduleId}
            openViewer={p.openViewer}
          />
        </div>
      }
      footer={
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
                    href={runOutputFileHref(
                      p.runId,
                      getValidatedModuleId(p.module.moduleId),
                      file.name,
                    )}
                    download={file.name}
                  >
                    {t3({
                      en: "Download",
                      fr: "Télécharger",
                      pt: "Transferir",
                    })}
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>
      }
    >
      <Show
        when={p.module.settings.length > 0}
        fallback={
          <div class="text-base-content-muted text-sm">
            {t3({
              en: "No parameters configured",
              fr: "Aucun paramètre configuré",
              pt: "Nenhum parâmetro configurado",
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
    </Card>
  );
}

// A failed run's errorDetail can be a wall of text (module-resolution or R
// errors) — clamp it to a few lines, expandable on demand. Display-only:
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
// disk it holds — read off the run's own record, not the viewer's
// relationship to it.
export function ResultsPackageProvenanceLine(p: { run: RunListingItem }) {
  return (
    <div class="ui-text-caption">
      {new Date(p.run.createdAt).toLocaleString()}
      {p.run.createdBy !== null ? ` · ${p.run.createdBy}` : ""}
      {p.run.provenance === "synthetic-backfill"
        ? ` · ${t3({
            en: "created from existing project results",
            fr: "créé à partir des résultats existants du projet",
            pt: "criado a partir dos resultados existentes do projeto",
          })}`
        : ""}
      {p.run.summary?.diskSizeBytes != null
        ? ` · ${formatFileSize(p.run.summary.diskSizeBytes, 1)}`
        : ""}
    </div>
  );
}
