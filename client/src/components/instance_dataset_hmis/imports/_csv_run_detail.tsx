import { t3, type DatasetHmisImportRunSummary } from "lib";
import {
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createQuery,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { statusLabel } from "./_tab_history";
import { CsvStagingSummary } from "./_csv_staging_summary";

// History click-through for a CSV run: the run facts + the durable staging
// diagnostics. The version link (where one exists) is the History row's
// Version column; the versions detail view itself is unchanged.
export function CsvRunDetail(
  p: EditorComponentProps<{ run: DatasetHmisImportRunSummary }, undefined>,
) {
  const detail = createQuery(
    () => serverActions.getDatasetHmisImportRunDetail({ run_id: p.run.id }),
    t3({
      en: "Loading run detail...",
      fr: "Chargement du détail de l'importation...",
      pt: "A carregar o detalhe da importação...",
    }),
  );

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
              {t3({ en: "CSV import", fr: "Importation CSV", pt: "Importação CSV" })}
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
            <div class="w-56 flex-none">{t3({ en: "Status", fr: "Statut", pt: "Estado" })}</div>
            <div
              class={`flex-1 ${p.run.status === "error" ? "text-danger font-700" : ""}`}
            >
              {statusLabel(p.run.status)}
            </div>
          </div>
          {factRow(
            t3({ en: "File", fr: "Fichier", pt: "Ficheiro" }),
            p.run.csvFileName ?? "",
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
          {factRow(
            t3({ en: "Version", fr: "Version", pt: "Versão" }),
            p.run.versionId !== undefined ? `${p.run.versionId}` : "",
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

        <StateHolderWrapper state={detail.state()} noPad>
          {(keyedDetail) => (
            <Show when={keyedDetail.csvStagingResult} keyed>
              {(result) => <CsvStagingSummary result={result} />}
            </Show>
          )}
        </StateHolderWrapper>
      </div>
    </FrameTop>
  );
}
