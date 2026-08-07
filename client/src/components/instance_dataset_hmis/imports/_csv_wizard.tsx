import {
  encodeRawCsvHeader,
  t3,
  type DatasetHmisCsvRunLaunchInput,
  type DatasetHmisImportRunSummary,
  type HmisCsvMappingParams,
} from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  Query,
  Select,
  StateHolderFormError,
  StepperChipsWithTitles,
  createFormAction,
  getSelectOptions,
  getStepper,
} from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { FileUploadSelector } from "~/components/_file_upload_selector";

export type CsvWizardProps = {
  runsQuery: Query<DatasetHmisImportRunSummary[]>;
};

export type CsvWizardResult = { landedTab: "current" };

type StepKind = "upload" | "mappings" | "review";

const STEPS: StepKind[] = ["upload", "mappings", "review"];

const _HMIS_SQL_COL_NAMES: (keyof HmisCsvMappingParams)[] = [
  "facility_id",
  "raw_indicator_id",
  "period_id",
  "count",
];

// The CSV import wizard (PLAN_DHIS2_IMPORTER_CONSOLIDATION A7): a modal with
// client-local state — the file input is an ordinary instance asset (uploaded
// or picked), so nothing persists server-side before launch. Launch inserts a
// run row; abandoning this wizard is a no-op by construction.
export function CsvWizard(
  p: AlertComponentProps<CsvWizardProps, CsvWizardResult>,
) {
  const [fileName, setFileName] = createSignal<string>("");
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [headersError, setHeadersError] = createSignal<string>("");
  const [mappings, setMappings] = createStore<HmisCsvMappingParams>({
    facility_id: "",
    raw_indicator_id: "",
    period_id: "",
    count: "",
  });

  // Direct callback, not an effect on the signal: re-uploading the same name
  // leaves the signal value unchanged, and only the callback re-parses the
  // new bytes.
  async function onFileSelected(next: string) {
    setFileName(next);
    setHeaders([]);
    setHeadersError("");
    setMappings({
      facility_id: "",
      raw_indicator_id: "",
      period_id: "",
      count: "",
    });
    const res = await serverActions.parseDatasetHmisCsvHeaders({
      fileName: next,
    });
    if (res.success) {
      setHeaders(res.data.headers.map((v, i) => encodeRawCsvHeader(i, v)));
    } else {
      setHeadersError(res.err);
    }
  }

  const mappingsComplete = () =>
    _HMIS_SQL_COL_NAMES.every((key) => mappings[key] !== "");

  const stepperData = createMemo(() => ({
    uploadValid: fileName() !== "" && headers().length > 0,
    mappingsValid: mappingsComplete(),
  }));

  const stepper = getStepper(stepperData, {
    initialStep: 0,
    minStep: 0,
    maxStep: STEPS.length - 1,
    getValidation: (step, data) => {
      const kind = STEPS[step];
      if (kind === "upload") {
        return { canGoPrev: false, canGoNext: data.uploadValid };
      }
      if (kind === "mappings") {
        return { canGoPrev: true, canGoNext: data.mappingsValid };
      }
      return { canGoPrev: true, canGoNext: false };
    },
  });

  const currentStepKind = () => STEPS[stepper.currentStep()];
  const isLastStep = () => currentStepKind() === "review";

  const stepLabels = [
    t3({ en: "Upload", fr: "Téléversement", pt: "Carregamento" }),
    t3({ en: "Mappings", fr: "Correspondances", pt: "Correspondências" }),
    t3({ en: "Review & launch", fr: "Vérifier et lancer", pt: "Rever e iniciar" }),
  ];

  // Live run state — reading the shell's polled query at render and submit
  // time keeps the Start-vs-Queue fork honest.
  const runActive = createMemo(() => {
    const s = p.runsQuery.state();
    return s.status === "ready" && s.data.some((r) => r.status === "running");
  });

  const queueNotice = () =>
    runActive()
      ? t3({
          en: "An import is currently running — this will start after it finishes.",
          fr: "Une importation est en cours — celle-ci démarrera une fois terminée.",
          pt: "Há uma importação em curso — esta começará assim que terminar.",
        })
      : undefined;

  const ctaLabel = () =>
    runActive()
      ? t3({ en: "Queue import", fr: "Mettre en file d'attente", pt: "Colocar em fila" })
      : t3({ en: "Start import", fr: "Démarrer l'importation", pt: "Iniciar a importação" });

  const submit = createFormAction(
    async () => {
      const selected = fileName();
      if (!selected) {
        return {
          success: false,
          err: t3({ en: "You must upload a file", fr: "Vous devez téléverser un fichier", pt: "Tem de carregar um ficheiro" }),
        };
      }
      const config: DatasetHmisCsvRunLaunchInput = {
        fileName: selected,
        mappings: structuredClone(unwrap(mappings)),
      };
      if (runActive()) {
        return await serverActions.enqueueDatasetHmisCsvRun({ config });
      }
      return await serverActions.launchDatasetHmisCsvRun({ config });
    },
    async () => {
      await p.runsQuery.silentFetch();
      p.close({ landedTab: "current" });
    },
  );

  return (
    <ModalContainer
      width="2xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">
            {t3({ en: "Upload CSV file", fr: "Téléverser un fichier CSV", pt: "Carregar um ficheiro CSV" })}
          </div>
          <StepperChipsWithTitles stepper={stepper} labels={stepLabels} />
        </div>
      }
      leftButtons={
        <Show when={stepper.currentStep() > 0}>
          <Button onClick={stepper.goPrev} outline>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </Show>
      }
      rightButtons={
        <>
          <Button onClick={() => p.close(undefined)} outline>
            {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
          </Button>
          <Show
            when={isLastStep()}
            fallback={
              <Button onClick={stepper.goNext} disabled={!stepper.canGoNext()}>
                {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
              </Button>
            }
          >
            <Button
              onClick={submit.click}
              state={submit.state()}
              intent="success"
            >
              {ctaLabel()}
            </Button>
          </Show>
        </>
      }
    >
      <div class="ui-pad ui-spy min-h-[24rem]">
        <Show when={currentStepKind() === "upload"}>
          <FileUploadSelector
            buttonLabel={t3({ en: "Upload csv file", fr: "Téléverser un fichier CSV", pt: "Carregar um ficheiro CSV" })}
            selectLabel={t3({ en: "Or select an existing file", fr: "Ou sélectionnez un fichier existant", pt: "Ou selecione um ficheiro existente" })}
            filter={(a) => a.isCsv}
            value={fileName()}
            onChange={(next) => void onFileSelected(next)}
            allowedFileTypes={[".csv"]}
          />
          <Show when={headersError()}>
            <div class="text-danger text-sm">{headersError()}</div>
          </Show>
        </Show>

        <Show when={currentStepKind() === "mappings"}>
          <div class="ui-spy-sm">
            {_HMIS_SQL_COL_NAMES.map((hmisSqlColName) => (
              <div class="flex items-center">
                <div class="w-[40%] flex-none">{hmisSqlColName}</div>
                <div class="flex-1">
                  <Select
                    options={getSelectOptions(headers())}
                    value={mappings[hmisSqlColName]}
                    onChange={(val) => setMappings(hmisSqlColName, val)}
                    fullWidth
                  />
                </div>
              </div>
            ))}
          </div>
        </Show>

        <Show when={currentStepKind() === "review"}>
          <div class="ui-spy-sm text-sm">
            <div class="flex items-baseline">
              <div class="w-56 flex-none">{t3({ en: "File", fr: "Fichier", pt: "Ficheiro" })}</div>
              <div class="flex-1 font-mono">{fileName()}</div>
            </div>
            {_HMIS_SQL_COL_NAMES.map((hmisSqlColName) => (
              <div class="flex items-baseline">
                <div class="w-56 flex-none">{hmisSqlColName}</div>
                <div class="flex-1 font-mono">{mappings[hmisSqlColName]}</div>
              </div>
            ))}
            <div>
              {t3({
                en: "Staging validates every row (periods, counts, facilities, indicators). A fully clean file integrates automatically; dropped rows hold the import for your review before anything is merged.",
                fr: "La préparation valide chaque ligne (périodes, valeurs, établissements, indicateurs). Un fichier entièrement valide s'intègre automatiquement ; des lignes rejetées mettent l'importation en attente de votre vérification avant toute fusion.",
                pt: "A preparação valida todas as linhas (períodos, valores, estabelecimentos, indicadores). Um ficheiro totalmente válido integra-se automaticamente; linhas rejeitadas colocam a importação em espera para a sua revisão antes de qualquer fusão.",
              })}
            </div>
            <Show when={queueNotice()} keyed>
              {(notice) => (
                <div class="ui-pad bg-base-200 rounded border">{notice}</div>
              )}
            </Show>
          </div>
          <StateHolderFormError state={submit.state()} />
        </Show>
      </div>
    </ModalContainer>
  );
}
