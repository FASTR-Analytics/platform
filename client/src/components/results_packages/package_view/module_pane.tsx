import {
  t3,
  type InstalledModuleSummary,
  type PackageScope,
  type RunAuthoringContext,
  type RunDetail,
} from "lib";
import { Button, formatFileSize, getEditorWrapper } from "panther";
import { For, Show, createMemo } from "solid-js";
import { ScopePicker, type ScopeSelection } from "~/components/_shared/mod.ts";
import {
  canViewPackageContents,
  canViewPackageLogs,
  runOutputFileHref,
} from "./status";
import { ViewLogs } from "./view_logs";
import { ViewScript } from "./view_script";
import { ModuleVisualizations } from "./visualizations";

type OpenEditor = ReturnType<typeof getEditorWrapper>["openEditor"];

// One module of a READY package, whole: the page scope picker, the module's
// default visualizations under that scope, then its settings, Script and
// Logs viewers and output files from the T2 detail. The module is named from
// the package's own manifest, so one that has left the registry still reads
// as itself.
export function ModulePane(p: {
  runId: string;
  module: InstalledModuleSummary;
  detailModule: RunDetail["modules"][number] | undefined;
  ctx: RunAuthoringContext;
  scope: PackageScope;
  selection: ScopeSelection;
  onChangeScope: (s: ScopeSelection) => void;
  openEditor: OpenEditor;
}) {
  const presets = createMemo(() => {
    const metricIds = new Set(
      p.ctx.metrics.filter((m) => m.moduleId === p.module.id).map((m) => m.id),
    );
    return p.ctx.presets.filter((preset) => metricIds.has(preset.metricId));
  });

  function openViewer(element: typeof ViewScript | typeof ViewLogs): void {
    void p.openEditor({
      element,
      props: {
        runId: p.runId,
        moduleId: p.module.id,
        moduleLabel: p.module.label,
      },
    });
  }

  return (
    <div class="ui-spy">
      <div class="font-700 text-lg">{p.module.label}</div>
      <ScopePicker selection={p.selection} onChange={p.onChangeScope} />
      <ModuleVisualizations
        presets={presets()}
        ctx={p.ctx}
        scope={p.scope}
        openEditor={p.openEditor}
      />
      <div class="ui-spy-sm">
        <div class="ui-text-caption font-700">
          {t3({ en: "Settings", fr: "Paramètres", pt: "Definições" })}
        </div>
        <Show
          when={p.detailModule?.settings.length}
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
            <For each={p.detailModule?.settings}>
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
            <Button size="sm" outline onClick={() => openViewer(ViewScript)}>
              {t3({ en: "Script", fr: "Script", pt: "Script" })}
            </Button>
          </Show>
          <Show when={canViewPackageLogs()}>
            <Button size="sm" outline onClick={() => openViewer(ViewLogs)}>
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
          when={p.detailModule?.files.length}
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
            <For each={p.detailModule?.files}>
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
                    href={runOutputFileHref(p.runId, p.module.id, file.name)}
                    download={file.name}
                  />
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
