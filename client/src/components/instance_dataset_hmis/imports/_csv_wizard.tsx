import {
  encodeRawCsvHeader,
  t3,
  type DatasetHmisCsvRunLaunchInput,
  type DatasetHmisImportRunSummary,
  type HmisCsvColumns,
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

type StepKind = "upload" | "columns" | "review";

const STEPS: StepKind[] = ["upload", "columns", "review"];

const _HMIS_SQL_COL_NAMES: (keyof HmisCsvColumns)[] = [
  "facility_id",
  "data_id",
  "period_id",
  "count",
];

// What the Columns step calls each of the file's four columns. The
// indicator column holds what the file calls each series: an indicator's
// file id or DHIS2 id, or the id of an indicator that has data (PLAN_A5
// ruling 6).
const COLUMN_LABELS: Record<keyof HmisCsvColumns, () => string> = {
  facility_id: () =>
    t3({ en: "Facility id", fr: "Identifiant de l'établissement", pt: "ID do estabelecimento" }),
  data_id: () =>
    t3({
      en: "Indicator (file id, DHIS2 id or indicator id)",
      fr: "Indicateur (identifiant du fichier, identifiant DHIS2 ou identifiant de l'indicateur)",
      pt: "Indicador (ID do ficheiro, ID DHIS2 ou ID do indicador)",
    }),
  period_id: () => t3({ en: "Period (yyyymm)", fr: "Période (aaaamm)", pt: "Período (aaaamm)" }),
  count: () => t3({ en: "Count", fr: "Valeur", pt: "Contagem" }),
};

// The CSV import wizard (PLAN_DHIS2_IMPORTER_CONSOLIDATION A7): a modal with
// client-local state: the file input is an ordinary instance asset (uploaded
// or picked), so nothing persists server-side before launch. Launch inserts a
// run row; abandoning this wizard is a no-op by construction.
export function CsvWizard(
  p: AlertComponentProps<CsvWizardProps, CsvWizardResult>,
) {
  const [fileName, setFileName] = createSignal<string>("");
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [headersError, setHeadersError] = createSignal<string>("");
  const [columns, setColumns] = createStore<HmisCsvColumns>({
    facility_id: "",
    data_id: "",
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
    setColumns({
      facility_id: "",
      data_id: "",
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

  const columnsComplete = () =>
    _HMIS_SQL_COL_NAMES.every((key) => columns[key] !== "");

  const stepperData = createMemo(() => ({
    uploadValid: fileName() !== "" && headers().length > 0,
    columnsValid: columnsComplete(),
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
      if (kind === "columns") {
        return { canGoPrev: true, canGoNext: data.columnsValid };
      }
      return { canGoPrev: true, canGoNext: false };
    },
  });

  const currentStepKind = () => STEPS[stepper.currentStep()];
  const isLastStep = () => currentStepKind() === "review";

  const stepLabels = [
    t3({ en: "Upload", fr: "Téléversement", pt: "Carregamento" }),
    t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
    t3({ en: "Review & launch", fr: "Vérifier et lancer", pt: "Rever e iniciar" }),
  ];

  // Live run state: reading the shell's polled query at render and submit
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
        columns: structuredClone(unwrap(columns)),
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

        <Show when={currentStepKind() === "columns"}>
          <div class="ui-spy-sm">
            {_HMIS_SQL_COL_NAMES.map((hmisSqlColName) => (
              <div class="flex items-center">
                <div class="w-[40%] flex-none">{COLUMN_LABELS[hmisSqlColName]()}</div>
                <div class="flex-1">
                  <Select
                    options={getSelectOptions(headers())}
                    value={columns[hmisSqlColName]}
                    onChange={(val) => setColumns(hmisSqlColName, val)}
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
                <div class="w-56 flex-none">{COLUMN_LABELS[hmisSqlColName]()}</div>
                <div class="flex-1 font-mono">{columns[hmisSqlColName]}</div>
              </div>
            ))}
            <div>
              {t3({
                en: "Staging validates every row (periods, counts, facilities, the indicator column). A value in the indicator column lands under the indicator whose file id or DHIS2 id it is, or under the indicator with data whose id it is. A fully clean file integrates automatically; dropped rows hold the import for your review before anything is merged, where unknown values can become Uploaded indicators, or be assigned to existing ones, and the file staged again.",
                fr: "La préparation valide chaque ligne (périodes, valeurs, établissements, colonne d'indicateur). Une valeur de la colonne d'indicateur est rangée sous l'indicateur dont elle est l'identifiant du fichier ou l'identifiant DHIS2, ou sous l'indicateur contenant des données dont elle est l'identifiant. Un fichier entièrement valide s'intègre automatiquement ; des lignes rejetées mettent l'importation en attente de votre vérification avant toute fusion, où les valeurs inconnues peuvent devenir des indicateurs téléversés, ou être attribuées à des indicateurs existants, et le fichier être préparé à nouveau.",
                pt: "A preparação valida todas as linhas (períodos, valores, estabelecimentos, coluna de indicador). Um valor da coluna de indicador fica sob o indicador de que é ID do ficheiro ou ID DHIS2, ou sob o indicador com dados de que é ID. Um ficheiro totalmente válido integra-se automaticamente; linhas rejeitadas colocam a importação em espera para a sua revisão antes de qualquer fusão, onde os valores desconhecidos podem tornar-se indicadores carregados, ou ser atribuídos a indicadores existentes, e o ficheiro ser preparado de novo.",
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
