import { t3, type HfaImportRunSummary } from "lib";
import { EditorComponentProps, FrameTop, HeadingBar } from "panther";
import { Show } from "solid-js";
import { HfaStagingSummary } from "./_staging_summary";
import { hfaRunStatusLabel } from "./_status_label";

// History click-through for an HFA run: the run facts + the durable staging
// diagnostics (the run row is HFA's only import record — invariant 4).
export function HfaRunDetail(
  p: EditorComponentProps<{ run: HfaImportRunSummary }, undefined>,
) {
  function factRow(label: string, value: string) {
    return (
      <div class="flex items-baseline">
        <div class="w-56 flex-none">{label}</div>
        <div class="min-w-0 flex-1 wrap-break-word">{value}</div>
      </div>
    );
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={
            <>
              {t3({ en: "HFA import", fr: "Importation HFA", pt: "Importação HFA" })}
              <span class="font-400 ml-4">
                {new Date(p.run.startedAt).toLocaleString()}
              </span>
            </>
          }
        />
      }
    >
      <div class="ui-pad ui-spy h-full w-full overflow-auto">
        <div class="ui-pad ui-spy-sm rounded border text-sm">
          <div class="font-700 text-base">
            {t3({ en: "Run summary", fr: "Résumé de l'importation", pt: "Resumo da importação" })}
          </div>
          <div class="flex items-baseline">
            <div class="w-56 flex-none">
              {t3({ en: "Status", fr: "Statut", pt: "Estado" })}
            </div>
            <div
              class={`flex-1 ${p.run.status === "error" ? "text-danger font-700" : ""}`}
            >
              {hfaRunStatusLabel(p.run.status)}
            </div>
          </div>
          {factRow(
            t3({ en: "Time point", fr: "Point temporel", pt: "Ponto temporal" }),
            p.run.timePoint,
          )}
          {factRow(
            t3({ en: "File", fr: "Fichier", pt: "Ficheiro" }),
            p.run.csvFileName,
          )}
          {factRow(
            t3({ en: "Started", fr: "Démarrée", pt: "Iniciada" }),
            new Date(p.run.startedAt).toLocaleString(),
          )}
          {factRow(
            t3({ en: "Ended", fr: "Terminée", pt: "Terminada" }),
            p.run.endedAt ? new Date(p.run.endedAt).toLocaleString() : "",
          )}
          {factRow(
            t3({ en: "Triggered by", fr: "Déclenchée par", pt: "Iniciada por" }),
            p.run.triggeredBy ?? "",
          )}
        </div>

        <Show when={p.run.error}>
          <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border">
            <div class="font-700">
              {t3({ en: "Run error", fr: "Erreur de l'importation", pt: "Erro da importação" })}
            </div>
            <div class="text-sm wrap-break-word">{p.run.error}</div>
          </div>
        </Show>

        <Show when={p.run.diagnostics} keyed>
          {(result) => <HfaStagingSummary result={result} />}
        </Show>
      </div>
    </FrameTop>
  );
}
