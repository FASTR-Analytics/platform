import { getValidatedModuleId, t3, type RunListingItem } from "lib";
import { Button, formatFileSize, getEditorWrapper } from "panther";
import { For, Show, createSignal } from "solid-js";
import type { PackageInternalsSource } from "./internals_source";
import { moduleLabel } from "./status";
import { ViewFiles } from "./view_files";
import { ViewLogs } from "./view_logs";
import { ViewScript } from "./view_script";

// What a READY results package CONTAINS, as a project's Results package tab
// explores it (PLAN_RESULTS_RUNS: exploring a package is one capability;
// the instance catalogue's detail pane renders its own ready view plus the
// generating/failed branches, because only the catalogue ever shows a
// non-ready run — a project is attached only once the run is ready, so the
// package here is always ready by construction). Everything here answers a
// question whose answer lives INSIDE the run directory: who is looking
// changes the chrome around it, not the package.
//
// The chrome the project tab adds for itself: the "in use" marker and (item
// 4) the attach picker.

export function ResultsPackageContents(p: {
  run: RunListingItem;
  // How this surface reaches the package's internals, and which of them it
  // may offer. The routes are permission-guarded server-side; the source's
  // flags only decide whether a button appears, so a caller without access
  // sees no button rather than one that fails. Each kind of content has its
  // own permission (Tim's ruling 2026-07-30), which is why this is three
  // flags rather than one.
  internals: PackageInternalsSource;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  function openViewer(
    element: typeof ViewScript | typeof ViewLogs | typeof ViewFiles,
    moduleId: string,
  ): void {
    void p.openEditor({
      element,
      props: {
        source: p.internals,
        moduleId: getValidatedModuleId(moduleId),
        moduleLabel: moduleLabel(moduleId),
      },
    });
  }

  function viewerButtons(moduleId: string) {
    return (
      <>
        <Show when={p.internals.canViewScript}>
          <Button
            size="sm"
            outline
            onClick={() => openViewer(ViewScript, moduleId)}
          >
            {t3({ en: "Script", fr: "Script", pt: "Script" })}
          </Button>
        </Show>
        <Show when={p.internals.canViewLogs}>
          <Button
            size="sm"
            outline
            onClick={() => openViewer(ViewLogs, moduleId)}
          >
            {t3({ en: "Logs", fr: "Journaux", pt: "Registos" })}
          </Button>
        </Show>
        <Show when={p.internals.canViewFiles}>
          <Button
            size="sm"
            outline
            onClick={() => openViewer(ViewFiles, moduleId)}
          >
            {t3({ en: "Files", fr: "Fichiers", pt: "Ficheiros" })}
          </Button>
        </Show>
      </>
    );
  }

  return (
    <Show when={p.run.status === "ready" && p.run.summary} keyed>
      {(summary) => (
        <div class="ui-spy-sm">
          <div class="text-base-content-muted text-sm">
            {summary.moduleIds.length}{" "}
            {t3({ en: "modules", fr: "modules", pt: "módulos" })} ·{" "}
            {summary.metricCount}{" "}
            {t3({ en: "metrics", fr: "métriques", pt: "métricas" })}
          </div>
          <For each={summary.moduleIds}>
            {(moduleId) => (
              <div class="ui-gap-sm flex items-center text-sm">
                <div class="w-64 truncate">{moduleLabel(moduleId)}</div>
                {viewerButtons(moduleId)}
              </div>
            )}
          </For>
        </div>
      )}
    </Show>
  );
}

// A failed run's errorDetail can be a wall of text (module-resolution or R
// errors) — clamp it to a few lines, expandable on demand. Display-only:
// the stored detail stays intact. Exported for the instance catalogue's
// detail pane, which renders its own failed branch.
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

// The package's provenance line: when it was made, by whom, and how. Shared
// for the same reason as the contents above — it reads the run's own record,
// not the viewer's relationship to it. Disk size is optional because only
// the catalogue shows it (a project has no housekeeping decision to make).
export function ResultsPackageProvenanceLine(p: {
  run: RunListingItem;
  showDiskSize: boolean;
}) {
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
      {p.showDiskSize && p.run.summary?.diskSizeBytes != null
        ? ` · ${formatFileSize(p.run.summary.diskSizeBytes, 1)}`
        : ""}
    </div>
  );
}
