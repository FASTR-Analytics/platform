import { t3, type IcehUploadAttemptStatus, type IcehStagingResult } from "lib";
import { Show } from "solid-js";

type Props = {
  status: Extract<IcehUploadAttemptStatus, { status: "staging" }>;
  staged?: IcehStagingResult;
};

export function ProgressStaging(p: Props) {
  return (
    <div class="ui-pad">
      <h3 class="font-700 text-lg mb-4">
        {t3({ en: "Staging Data", fr: "Préparation des données", pt: "Preparação dos dados" })}
      </h3>

      <div class="mb-4">
        <div class="bg-neutral-light h-4 w-full overflow-hidden rounded">
          <div
            class="bg-primary h-full transition-all duration-300"
            style={{ width: `${p.status.progress}%` }}
          />
        </div>
        <p class="text-base-content-muted mt-1 text-sm">{p.status.progress}%</p>
      </div>

      <Show when={p.staged}>
        <div class="rounded border p-4">
          <h4 class="font-700 mb-2">
            {t3({ en: "Staging Results", fr: "Résultats de préparation", pt: "Resultados de preparação" })}
          </h4>
          <div class="text-sm">
            <p>
              <strong>{t3({ en: "Total rows:", fr: "Total des lignes :", pt: "Total de linhas:" })}</strong>{" "}
              {p.staged!.nRowsTotal.toLocaleString()}
            </p>
            <p>
              <strong>{t3({ en: "Valid rows:", fr: "Lignes valides :", pt: "Linhas válidas:" })}</strong>{" "}
              {p.staged!.nRowsValid.toLocaleString()}
            </p>
            <p>
              <strong>{t3({ en: "Skipped (missing estimate):", fr: "Ignorées (estimation manquante) :", pt: "Ignoradas (estimativa em falta):" })}</strong>{" "}
              {p.staged!.nRowsSkippedMissingEstimate.toLocaleString()}
            </p>
            <Show when={(p.staged!.nRowsSkippedUnknownStrat ?? 0) > 0}>
              <p>
                <strong>{t3({ en: "Skipped (unknown disaggregation):", fr: "Ignorées (désagrégation inconnue) :" })}</strong>{" "}
                {p.staged!.nRowsSkippedUnknownStrat!.toLocaleString()}
                <Show when={p.staged!.skippedUnknownStratSamples?.length}>
                  {" "}({t3({ en: "e.g.", fr: "p. ex." })}{" "}
                  {p.staged!.skippedUnknownStratSamples!.join(", ")})
                </Show>
              </p>
            </Show>
            <p>
              <strong>{t3({ en: "Indicators:", fr: "Indicateurs :", pt: "Indicadores:" })}</strong>{" "}
              {p.staged!.nIndicators}
            </p>
            <p>
              <strong>{t3({ en: "Disaggregators:", fr: "Désagrégateurs :", pt: "Desagregadores:" })}</strong>{" "}
              {p.staged!.nDisaggregators}
            </p>
          </div>
        </div>
      </Show>

      <p class="text-base-content-muted mt-4">
        {t3({
          en: "Processing data... Please wait.",
          fr: "Traitement des données... Veuillez patienter.",
          pt: "A processar os dados... Aguarde, por favor.",
        })}
      </p>
    </div>
  );
}
