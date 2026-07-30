import {
  getValidatedModuleId,
  t3,
  type RunListingItem,
  type RunProgress,
} from "lib";
import { Button, getEditorWrapper } from "panther";
import { For, Show } from "solid-js";
import type { PackageInternalsSource } from "./internals_source";
import { ModuleProgressChip, formatBytes, moduleLabel } from "./status";
import { ViewFiles } from "./view_files";
import { ViewLogs } from "./view_logs";
import { ViewScript } from "./view_script";

// What a results package CONTAINS, rendered identically wherever a package
// is explored — the instance catalogue and a project's Results package tab
// (PLAN_RESULTS_RUNS: exploring a package is one capability, built once and
// mounted twice). Everything here answers a question whose answer lives
// INSIDE the run directory, which is why it is the same view for both: who
// is looking changes the chrome around it, not the package.
//
// The chrome each surface adds for itself: the instance catalogue brings the
// run list, generate, guarded delete, disk size and the attached-projects
// column; the project tab brings the "in use" marker and (item 4) the attach
// picker.

export function ResultsPackageContents(p: {
  run: RunListingItem;
  // Live progress for a generating run, from whichever SSE channel the host
  // surface listens on (instance for the catalogue, project for the tab).
  liveProgress: RunProgress | undefined;
  // Latest R line for a module of THIS run. A lookup rather than a map so
  // each surface keeps its own store shape — the catalogue keys by
  // run+module because two generations can be visible at once, a project
  // only ever watches its own.
  latestRLine: (moduleId: string) => string | undefined;
  // How this surface reaches the package's internals, and which of them it
  // may offer. The routes are permission-guarded server-side; the source's
  // flags only decide whether a button appears, so a caller without access
  // sees no button rather than one that fails. Each kind of content has its
  // own permission (Tim's ruling 2026-07-30), which is why this is three
  // flags rather than one.
  internals: PackageInternalsSource;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  const progress = () => p.liveProgress ?? p.run.progress;

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

  return (
    <>
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
                </div>
              )}
            </For>
          </div>
        )}
      </Show>

      <Show when={p.run.status === "generating" && progress()} keyed>
        {(keyedProgress) => (
          <div class="ui-spy-sm">
            <div class="ui-gap-sm flex flex-wrap">
              <For each={keyedProgress.moduleOrder}>
                {(moduleId) => (
                  <ModuleProgressChip
                    label={moduleLabel(moduleId)}
                    status={keyedProgress.moduleStatus[moduleId] ?? "pending"}
                  />
                )}
              </For>
            </div>
            <Show when={keyedProgress.currentModuleId} keyed>
              {(currentModuleId) => (
                <div class="text-base-content-muted truncate font-mono text-xs">
                  {p.latestRLine(currentModuleId) ?? "..."}
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>

      <Show when={p.run.status === "failed"}>
        <div class="text-danger text-sm">
          {progress()?.errorDetail ??
            t3({
              en: "Generation failed",
              fr: "Échec de la génération",
              pt: "Falha na geração",
            })}
        </div>
      </Show>
    </>
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
    <div class="text-base-content-muted text-xs">
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
        ? ` · ${formatBytes(p.run.summary.diskSizeBytes)}`
        : ""}
    </div>
  );
}
