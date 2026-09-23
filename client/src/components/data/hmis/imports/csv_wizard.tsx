import {
  autoSelectHmisCsvMapping,
  definitionDataId,
  encodeRawCsvHeader,
  hasRows,
  t3,
  type DatasetHmisCsvRunLaunchInput,
  type DatasetHmisImportRunSummary,
  type HmisCsvColumns,
  type HmisCsvIndicatorScan,
  type HmisCsvMapping,
  type HmisIndicator,
} from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  Query,
  Select,
  SelectSearch,
  StepperChipsWithTitles,
  createFormAction,
  getSelectOptions,
  getStepper,
  toNum0,
  type SelectOption,
} from "panther";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { FileUploadSelector } from "~/components/_shared/mod.ts";

export type CsvWizardProps = {
  runsQuery: Query<DatasetHmisImportRunSummary[]>;
};

export type CsvWizardResult = { landedTab: "current" };

type StepKind = "upload" | "columns" | "mapping" | "review";

const STEPS: StepKind[] = ["upload", "columns", "mapping", "review"];

const _HMIS_SQL_COL_NAMES: (keyof HmisCsvColumns)[] = [
  "facility_id",
  "data_id",
  "period_id",
  "count",
];

// What the Columns step calls each of the file's four columns. The
// indicator column holds what the file calls each series; the Mapping step
// points each distinct value at an indicator (PLAN_A6 §2).
const COLUMN_LABELS: Record<keyof HmisCsvColumns, () => string> = {
  facility_id: () =>
    t3({ en: "Facility id", fr: "Identifiant de l'établissement", pt: "ID do estabelecimento" }),
  data_id: () => t3({ en: "Indicator", fr: "Indicateur", pt: "Indicador" }),
  period_id: () => t3({ en: "Period (yyyymm)", fr: "Période (aaaamm)", pt: "Período (aaaamm)" }),
  count: () => t3({ en: "Count", fr: "Valeur", pt: "Contagem" }),
};

// The mapping as the user edits it: a value is mapped onto an indicator's
// data id, skipped, or not yet decided. Auto-selection seeds the first two;
// the launch refuses while any value is undecided.
type MappingChoice =
  | { kind: "indicator"; dataId: string }
  | { kind: "skip" }
  | { kind: "unresolved" };

const SKIP = "__skip__";

// What the Mapping step needs from the server: the file's distinct values
// and the dictionary, loaded together when the step is entered.
type MappingInputs = {
  scan: HmisCsvIndicatorScan;
  indicators: HmisIndicator[];
};

// The CSV import wizard (PLAN_DHIS2_IMPORTER_CONSOLIDATION A7, PLAN_A6 §2):
// a modal with client-local state: the file input is an ordinary instance
// asset (uploaded or picked), so nothing persists server-side before
// launch. The Mapping step scans the file for every distinct value in the
// indicator column and the user points each at an existing indicator or
// skips it; the mapping rides the launch payload with the pin the scan
// read. Launch inserts a run row; abandoning this wizard is a no-op by
// construction.
export function CsvWizard(
  p: AlertComponentProps<CsvWizardProps, CsvWizardResult>,
) {
  const [fileName, setFileName] = createSignal<string>("");
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [headersError, setHeadersError] = createSignal<string>("");
  const [columns, setColumnsStore] = createStore<HmisCsvColumns>({
    facility_id: "",
    data_id: "",
    period_id: "",
    count: "",
  });
  const [mappingInputs, setMappingInputs] = createSignal<MappingInputs>();
  const [mappingError, setMappingError] = createSignal<string>("");
  const [mapping, setMapping] = createStore<Record<string, MappingChoice>>({});

  // The choices store is only ever read for the current scan's values, so
  // entries a previous scan left behind are inert and need no clearing.
  function resetMapping() {
    setMappingInputs(undefined);
    setMappingError("");
  }

  // A changed file or column invalidates the scan: the Mapping step reads
  // the file again when it is next entered.
  function setColumns(key: keyof HmisCsvColumns, value: string) {
    setColumnsStore(key, value);
    resetMapping();
  }

  // Direct callback, not an effect on the signal: re-uploading the same name
  // leaves the signal value unchanged, and only the callback re-parses the
  // new bytes.
  async function onFileSelected(next: string) {
    setFileName(next);
    setHeaders([]);
    setHeadersError("");
    setColumnsStore({
      facility_id: "",
      data_id: "",
      period_id: "",
      count: "",
    });
    resetMapping();
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

  // The scan and the dictionary, loaded when the Mapping step is entered
  // and seeded into the mapping by auto-selection once.
  let scanRequestId = 0;
  async function loadMappingInputs() {
    const requestId = ++scanRequestId;
    setMappingError("");
    const [scanRes, dictionaryRes] = await Promise.all([
      serverActions.scanDatasetHmisCsvIndicatorValues({
        fileName: fileName(),
        columns: unwrap(columns),
      }),
      serverActions.getIndicators({}),
    ]);
    if (requestId !== scanRequestId) return;
    if (!scanRes.success) {
      setMappingError(scanRes.err);
      return;
    }
    if (!dictionaryRes.success) {
      setMappingError(dictionaryRes.err);
      return;
    }
    const indicators = dictionaryRes.data.indicators;
    const values = scanRes.data.values.map((v) => v.value);
    const seeded = autoSelectHmisCsvMapping(values, indicators);
    setMapping(
      Object.fromEntries(
        values.map((value) => {
          const target = seeded[value];
          return [
            value,
            target === null
              ? ({ kind: "unresolved" } satisfies MappingChoice)
              : ({ kind: "indicator", dataId: target } satisfies MappingChoice),
          ];
        }),
      ),
    );
    setMappingInputs({ scan: scanRes.data, indicators });
  }

  const choices = createMemo(() => {
    const inputs = mappingInputs();
    if (inputs === undefined) return [];
    return inputs.scan.values.map((v) => ({
      ...v,
      choice: mapping[v.value] ?? ({ kind: "unresolved" } satisfies MappingChoice),
    }));
  });
  const mappedCount = () => choices().filter((c) => c.choice.kind === "indicator").length;
  const skippedCount = () => choices().filter((c) => c.choice.kind === "skip").length;
  const unresolvedCount = () => choices().filter((c) => c.choice.kind === "unresolved").length;

  // Two values may not map onto the same indicator in one import (ruling
  // 3): the indicators chosen more than once.
  const chosenTwice = createMemo(() => {
    const uses = new Map<string, number>();
    for (const c of choices()) {
      if (c.choice.kind !== "indicator") continue;
      uses.set(c.choice.dataId, (uses.get(c.choice.dataId) ?? 0) + 1);
    }
    return new Set([...uses].filter(([, n]) => n > 1).map(([id]) => id));
  });

  const mappingComplete = () =>
    mappingInputs() !== undefined && unresolvedCount() === 0 &&
    chosenTwice().size === 0 && mappedCount() > 0;

  const stepperData = createMemo(() => ({
    uploadValid: fileName() !== "" && headers().length > 0,
    columnsValid: columnsComplete(),
    mappingValid: mappingComplete(),
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
      if (kind === "mapping") {
        return { canGoPrev: true, canGoNext: data.mappingValid };
      }
      return { canGoPrev: true, canGoNext: false };
    },
  });

  const currentStepKind = () => STEPS[stepper.currentStep()];
  const isLastStep = () => currentStepKind() === "review";

  // The scan runs when the Mapping step is entered with nothing loaded and
  // no refusal showing; a refusal waits for the user's retry, which only
  // clears it, so this effect is the one caller.
  createEffect(() => {
    const step = currentStepKind();
    const loaded = mappingInputs() !== undefined;
    const refused = mappingError() !== "";
    if (step === "mapping" && !loaded && !refused) {
      void loadMappingInputs();
    }
  });

  const stepLabels = [
    t3({ en: "Upload", fr: "Téléversement", pt: "Carregamento" }),
    t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
    t3({ en: "Mapping", fr: "Correspondance", pt: "Correspondência" }),
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

  function launchInput(): DatasetHmisCsvRunLaunchInput | undefined {
    const inputs = mappingInputs();
    if (inputs === undefined || !mappingComplete()) return undefined;
    const result: HmisCsvMapping = {};
    for (const c of choices()) {
      result[c.value] = c.choice.kind === "indicator" ? c.choice.dataId : null;
    }
    return {
      fileName: fileName(),
      pin: inputs.scan.pin,
      columns: structuredClone(unwrap(columns)),
      mapping: result,
    };
  }

  const submit = createFormAction(
    async () => {
      const config = launchInput();
      if (config === undefined) {
        return {
          success: false,
          err: t3({
            en: "Every value in the indicator column must be mapped or skipped.",
            fr: "Chaque valeur de la colonne d'indicateur doit être associée ou ignorée.",
            pt: "Cada valor da coluna de indicador tem de ser associado ou ignorado.",
          }),
        };
      }
      return runActive()
        ? await serverActions.enqueueDatasetHmisCsvRun({ config })
        : await serverActions.launchDatasetHmisCsvRun({ config });
    },
    async () => {
      await p.runsQuery.silentFetch();
      p.close({ landedTab: "current" });
    },
  );

  return (
    <ModalContainer
      width="4xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="ui-text-heading">
            {t3({ en: "Upload CSV file", fr: "Téléverser un fichier CSV", pt: "Carregar um ficheiro CSV" })}
          </div>
          <StepperChipsWithTitles stepper={stepper} labels={stepLabels} />
        </div>
      }
      onCancel={() => p.close(undefined)}
      actions={[
        ...(stepper.currentStep() > 0
          ? [
              {
                label: t3({ en: "Back", fr: "Retour", pt: "Voltar" }),
                onClick: stepper.goPrev,
                outline: true,
              },
            ]
          : []),
        ...(isLastStep()
          ? [
              {
                label: ctaLabel(),
                onClick: submit.click,
                state: submit.state(),
              },
            ]
          : [
              {
                label: t3({ en: "Next", fr: "Suivant", pt: "Seguinte" }),
                onClick: stepper.goNext,
                disabled: !stepper.canGoNext(),
              },
            ]),
      ]}
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

        <Show when={currentStepKind() === "mapping"}>
          <MappingStep
            inputs={mappingInputs()}
            error={mappingError()}
            choices={choices()}
            chosenTwice={chosenTwice()}
            mappedCount={mappedCount()}
            skippedCount={skippedCount()}
            unresolvedCount={unresolvedCount()}
            onChoose={(value, choice) => setMapping(value, choice)}
            onRetry={() => setMappingError("")}
          />
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
            <div class="flex items-baseline">
              <div class="w-56 flex-none">{t3({ en: "Mapping", fr: "Correspondance", pt: "Correspondência" })}</div>
              <div class="flex-1">{mappingCountsText(mappedCount(), skippedCount())}</div>
            </div>
            <div>
              {t3({
                en: "Staging validates every row (periods, counts, facilities) and writes each row under the indicator its value is mapped to; rows under skipped values are dropped and counted. A fully clean file integrates automatically; rows dropped for any other reason hold the import for your review before anything is merged.",
                fr: "La préparation valide chaque ligne (périodes, valeurs, établissements) et range chaque ligne sous l'indicateur auquel sa valeur est associée ; les lignes sous des valeurs ignorées sont rejetées et comptées. Un fichier entièrement valide s'intègre automatiquement ; des lignes rejetées pour toute autre raison mettent l'importation en attente de votre vérification avant toute fusion.",
                pt: "A preparação valida todas as linhas (períodos, valores, estabelecimentos) e guarda cada linha sob o indicador a que o seu valor está associado; as linhas sob valores ignorados são descartadas e contadas. Um ficheiro totalmente válido integra-se automaticamente; linhas rejeitadas por qualquer outra razão colocam a importação em espera para a sua revisão antes de qualquer fusão.",
              })}
            </div>
            <Show when={queueNotice()} keyed>
              {(notice) => (
                <div class="ui-pad bg-base-200 rounded border">{notice}</div>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}

function mappingCountsText(mapped: number, skipped: number): string {
  return t3({
    en: `${toNum0(mapped)} values mapped, ${toNum0(skipped)} skipped`,
    fr: `${toNum0(mapped)} valeurs associées, ${toNum0(skipped)} ignorées`,
    pt: `${toNum0(mapped)} valores associados, ${toNum0(skipped)} ignorados`,
  });
}

// One row per distinct value the file says, with its row count and a
// picker over the indicators that have rows, seeded by auto-selection.
function MappingStep(p: {
  inputs: MappingInputs | undefined;
  error: string;
  choices: { value: string; rowCount: number; choice: MappingChoice }[];
  chosenTwice: Set<string>;
  mappedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  onChoose: (value: string, choice: MappingChoice) => void;
  onRetry: () => void;
}) {
  const options = createMemo<SelectOption<string>[]>(() => [
    { value: SKIP, label: t3({ en: "Skip this value", fr: "Ignorer cette valeur", pt: "Ignorar este valor" }) },
    ...(p.inputs?.indicators ?? [])
      .filter((i) => hasRows(i.definition.type))
      .map((i) => ({
        value: definitionDataId(i.definition) ?? "",
        label: `${i.indicator_common_label} (${i.indicator_common_id})`,
      })),
  ]);
  const indicatorById = createMemo(() => {
    const byDataId = new Map<string, HmisIndicator>();
    for (const i of p.inputs?.indicators ?? []) {
      const dataId = definitionDataId(i.definition);
      if (dataId !== null) byDataId.set(dataId, i);
    }
    return byDataId;
  });
  const selectValue = (choice: MappingChoice): string | undefined =>
    choice.kind === "indicator" ? choice.dataId : choice.kind === "skip" ? SKIP : undefined;

  return (
    <div class="ui-spy-sm">
      <div class="ui-text-caption">
        {t3({
          en: "Every distinct value in the file's indicator column, with the number of rows that say it. Point each at the indicator its rows belong to, or skip it. A value is pre-selected when it matches an indicator's id, or a DHIS2 element's DHIS2 id. An indicator that does not exist yet is created in the indicator manager first; nothing here is remembered for the next import.",
          fr: "Chaque valeur distincte de la colonne d'indicateur du fichier, avec le nombre de lignes qui la portent. Associez chacune à l'indicateur auquel ses lignes appartiennent, ou ignorez-la. Une valeur est présélectionnée lorsqu'elle correspond à l'identifiant d'un indicateur, ou à l'identifiant DHIS2 d'un élément DHIS2. Un indicateur qui n'existe pas encore se crée d'abord dans le gestionnaire d'indicateurs ; rien ici n'est mémorisé pour l'importation suivante.",
          pt: "Cada valor distinto da coluna de indicador do ficheiro, com o número de linhas que o dizem. Associe cada um ao indicador a que as suas linhas pertencem, ou ignore-o. Um valor fica pré-selecionado quando corresponde ao ID de um indicador, ou ao ID DHIS2 de um elemento DHIS2. Um indicador que ainda não existe cria-se primeiro no gestor de indicadores; nada aqui é lembrado para a importação seguinte.",
        })}
      </div>
      <Show when={p.error}>
        <div class="text-danger text-sm">{p.error}</div>
        <Button onClick={p.onRetry} outline>
          {t3({ en: "Try again", fr: "Réessayer", pt: "Tentar de novo" })}
        </Button>
      </Show>
      <Show when={!p.error && p.inputs === undefined}>
        <div class="text-sm">
          {t3({ en: "Reading the file...", fr: "Lecture du fichier...", pt: "A ler o ficheiro..." })}
        </div>
      </Show>
      <Show when={p.inputs !== undefined}>
        <div class="text-sm">
          {mappingCountsText(p.mappedCount, p.skippedCount)}
          <Show when={p.unresolvedCount > 0}>
            <span class="text-danger ml-2">
              {t3({
                en: `${toNum0(p.unresolvedCount)} not yet decided`,
                fr: `${toNum0(p.unresolvedCount)} pas encore décidées`,
                pt: `${toNum0(p.unresolvedCount)} ainda por decidir`,
              })}
            </span>
          </Show>
          <Show when={p.mappedCount === 0 && p.unresolvedCount === 0}>
            <span class="text-danger ml-2">
              {t3({
                en: "Every value is skipped, so nothing would be imported.",
                fr: "Chaque valeur est ignorée ; rien ne serait importé.",
                pt: "Todos os valores estão ignorados, pelo que nada seria importado.",
              })}
            </span>
          </Show>
        </div>
        <Show when={p.chosenTwice.size > 0}>
          <div class="text-danger text-sm">
            {t3({
              en: "One import maps one value onto an indicator. Chosen more than once:",
              fr: "Une importation associe une seule valeur à un indicateur. Choisis plus d'une fois :",
              pt: "Uma importação associa um único valor a um indicador. Escolhidos mais de uma vez:",
            })}{" "}
            {[...p.chosenTwice]
              .map((dataId) => indicatorById().get(dataId)?.indicator_common_id ?? dataId)
              .join(", ")}
          </div>
        </Show>
        <div class="ui-spy-sm">
          <For each={p.choices}>
            {(row) => (
              <div class="ui-gap-sm flex items-center">
                <div class="w-[40%] flex-none">
                  <span class="font-mono">{row.value}</span>
                  <span class="text-base-content-muted ml-2 text-xs">
                    {toNum0(row.rowCount)} {t3({ en: "rows", fr: "lignes", pt: "linhas" })}
                  </span>
                </div>
                <div class="flex-1">
                  <SelectSearch
                    options={options()}
                    value={selectValue(row.choice)}
                    placeholder={t3({ en: "Choose an indicator or skip", fr: "Choisir un indicateur ou ignorer", pt: "Escolher um indicador ou ignorar" })}
                    onChange={(v) =>
                      p.onChoose(
                        row.value,
                        v === SKIP ? { kind: "skip" } : { kind: "indicator", dataId: v },
                      )}
                    invalidMsg={row.choice.kind === "indicator" && p.chosenTwice.has(row.choice.dataId)
                      ? t3({ en: "Chosen more than once", fr: "Choisi plus d'une fois", pt: "Escolhido mais de uma vez" })
                      : undefined}
                    fullWidth
                  />
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
