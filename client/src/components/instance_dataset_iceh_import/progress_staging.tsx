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
        {t3({ en: "Staging Data", fr: "Préparation des données" })}
      </h3>

      <div class="mb-4">
        <div class="bg-neutral-light h-4 w-full overflow-hidden rounded">
          <div
            class="bg-primary h-full transition-all duration-300"
            style={{ width: `${p.status.progress}%` }}
          />
        </div>
        <p class="text-neutral mt-1 text-sm">{p.status.progress}%</p>
      </div>

      <Show when={p.staged}>
        <div class="rounded border p-4">
          <h4 class="font-700 mb-2">
            {t3({ en: "Staging Results", fr: "Résultats de préparation" })}
          </h4>
          <div class="text-sm">
            <p>
              <strong>{t3({ en: "Total rows:", fr: "Total des lignes :" })}</strong>{" "}
              {p.staged!.nRowsTotal.toLocaleString()}
            </p>
            <p>
              <strong>{t3({ en: "Valid rows:", fr: "Lignes valides :" })}</strong>{" "}
              {p.staged!.nRowsValid.toLocaleString()}
            </p>
            <p>
              <strong>{t3({ en: "Skipped (missing estimate):", fr: "Ignorées (estimation manquante) :" })}</strong>{" "}
              {p.staged!.nRowsSkippedMissingEstimate.toLocaleString()}
            </p>
            <p>
              <strong>{t3({ en: "Indicators:", fr: "Indicateurs :" })}</strong>{" "}
              {p.staged!.nIndicators}
            </p>
            <p>
              <strong>{t3({ en: "Disaggregators:", fr: "Désagrégateurs :" })}</strong>{" "}
              {p.staged!.nDisaggregators}
            </p>
          </div>
        </div>
      </Show>

      <p class="text-neutral mt-4">
        {t3({
          en: "Processing data... Please wait.",
          fr: "Traitement des données... Veuillez patienter.",
        })}
      </p>
    </div>
  );
}
