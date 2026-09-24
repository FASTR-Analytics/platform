import { runStageLabel, t3, type RunProgress } from "lib";
import { Button } from "panther";
import { For, Show, createSignal } from "solid-js";
import {
  canViewPackageContents,
  canViewPackageLogs,
  moduleLabel,
} from "./status";
import { ViewFiles } from "./view_files";
import { ViewLogs } from "./view_logs";
import { ViewScript } from "./view_script";
import type { OpenEditor } from "./visualizations";

type Viewer = typeof ViewScript | typeof ViewLogs | typeof ViewFiles;

// A FAILED package's body: the error detail, then each started module's
// script, log and the partial workspace's files (via the listing route,
// since there is no manifest). A pending module never got a workspace, so
// it is not listed. Named from the registry, the only name a failed run has.
export function FailedDetail(p: {
  runId: string;
  progress: RunProgress | null;
  openEditor: OpenEditor;
}) {
  const started = () =>
    p.progress?.moduleOrder.filter(
      (id) => (p.progress?.moduleStatus[id] ?? "pending") !== "pending",
    ) ?? [];
  // The stage the run died in, above its error. A stored `ended` is the
  // transform's stamp on a run that recorded no stage, not a place it died.
  const stage = () =>
    p.progress === null || p.progress.stage.kind === "ended"
      ? null
      : runStageLabel(p.progress);

  function openViewer(element: Viewer, moduleId: string): void {
    void p.openEditor({
      element,
      props: {
        runId: p.runId,
        moduleId,
        moduleLabel: moduleLabel(moduleId),
      },
    });
  }

  return (
    <div class="ui-spy">
      <ErrorDetail
        stage={stage()}
        errorDetail={p.progress?.errorDetail ?? null}
      />
      <For each={started()}>
        {(moduleId) => (
          <div class="ui-gap-sm flex items-center text-sm">
            <div class="w-64 truncate">{moduleLabel(moduleId)}</div>
            <Show when={canViewPackageContents()}>
              <Button
                size="sm"
                outline
                onClick={() => openViewer(ViewScript, moduleId)}
              >
                {t3({ en: "Script", fr: "Script", pt: "Script" })}
              </Button>
            </Show>
            <Show when={canViewPackageLogs()}>
              <Button
                size="sm"
                outline
                onClick={() => openViewer(ViewLogs, moduleId)}
              >
                {t3({ en: "Logs", fr: "Journaux", pt: "Registos" })}
              </Button>
            </Show>
            <Show when={canViewPackageContents()}>
              <Button
                size="sm"
                outline
                onClick={() => openViewer(ViewFiles, moduleId)}
              >
                {t3({ en: "Files", fr: "Fichiers", pt: "Ficheiros" })}
              </Button>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}

// A failed run's errorDetail can be a wall of text (module-resolution or R
// errors): clamp it to a few lines, expandable on demand. Display-only:
// the stored detail stays intact.
const ERROR_CLAMP_CHARS = 280;

function ErrorDetail(p: { stage: string | null; errorDetail: string | null }) {
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
      <Show when={p.stage} keyed>
        {(stage) => <div class="font-700">{stage}</div>}
      </Show>
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
