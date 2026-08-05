import {
  encodeRawCsvHeader,
  t3,
  type HfaCsvMappingParams,
  type HfaDedupOverride,
  type HfaDuplicateGroup,
  type HfaDuplicatePreview,
} from "lib";
import {
  AlertComponentProps,
  Button,
  Input,
  ModalContainer,
  RadioGroup,
  Select,
  StateHolderFormError,
  StepperChipsWithTitles,
  createFormAction,
  getSelectOptions,
  getStepper,
} from "panther";
import { For, Show, createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { TempFileUpload, type TempUpload } from "~/components/_temp_file_upload";
import { instanceState } from "~/state/instance/t1_store";

export type HfaWizardResult = { launched: true };

type StepKind = "upload" | "mappings" | "duplicates" | "review";

const STEPS: StepKind[] = ["upload", "mappings", "duplicates", "review"];

// The HFA import wizard (PLAN_DHIS2_IMPORTER_CONSOLIDATION B7): a modal with
// client-local state — nothing persists server-side before launch except the
// two token-keyed temp uploads. Launch inserts a run row; abandoning this
// wizard is a no-op by construction.
export function HfaWizard(p: AlertComponentProps<object, HfaWizardResult>) {
  const [csvUpload, setCsvUpload] = createSignal<TempUpload | undefined>(
    undefined,
  );
  const [xlsFormUpload, setXlsFormUpload] = createSignal<
    TempUpload | undefined
  >(undefined);
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [parseError, setParseError] = createSignal<string>("");
  const [preview, setPreview] = createSignal<HfaDuplicatePreview | undefined>(
    undefined,
  );
  const [previewError, setPreviewError] = createSignal<string>("");
  const [scanning, setScanning] = createSignal<boolean>(false);

  const [mappings, setMappings] = createStore<HfaCsvMappingParams>({
    facilityIdColumn: "",
    timePoint: "",
    rowFilters: [],
    dedupStrategy: "first",
    dedupOverrides: [],
  });

  // Both files must be present before the headers can be parsed (the parse
  // call also validates the XLSForm's sheets).
  async function parseIfReady() {
    const csv = csvUpload();
    const xlsForm = xlsFormUpload();
    setHeaders([]);
    setParseError("");
    if (!csv || !xlsForm) {
      return;
    }
    const res = await serverActions.parseDatasetHfaCsvHeaders({
      csvUploadToken: csv.token,
      xlsFormUploadToken: xlsForm.token,
    });
    if (res.success) {
      setHeaders(res.data.headers.map((v, i) => encodeRawCsvHeader(i, v)));
    } else {
      setParseError(res.err);
    }
  }

  // Editing the facility column or any filter invalidates the duplicate
  // structure the picks were made against.
  function resetDownstream() {
    setPreview(undefined);
    setPreviewError("");
    setMappings("dedupOverrides", []);
  }

  // A new CSV means new headers, so every column choice made against the old
  // ones is stale — clear them rather than launching with a dangling column.
  function resetColumnChoices() {
    resetDownstream();
    setMappings({ facilityIdColumn: "", rowFilters: [] });
  }

  const csvHeaders = () => headers();

  const timePointOptions = () =>
    [...instanceState.hfaTimePoints]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((tp) => ({
        value: tp.label,
        label: `${tp.label} (${tp.periodId.slice(0, 4)}-${tp.periodId.slice(4, 6)})`,
      }));

  const mappingsComplete = () =>
    mappings.facilityIdColumn !== "" &&
    mappings.timePoint !== "" &&
    mappings.rowFilters.every((f) => f.column !== "" && f.value.trim() !== "");

  const stepperData = createMemo(() => ({
    uploadValid:
      csvUpload() !== undefined &&
      xlsFormUpload() !== undefined &&
      headers().length > 0,
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
      if (kind === "duplicates") {
        return { canGoPrev: true, canGoNext: true };
      }
      return { canGoPrev: true, canGoNext: false };
    },
  });

  const currentStepKind = () => STEPS[stepper.currentStep()];
  const isLastStep = () => currentStepKind() === "review";

  const stepLabels = [
    t3({ en: "Upload", fr: "Téléversement", pt: "Carregamento" }),
    t3({ en: "Mappings", fr: "Correspondances", pt: "Correspondências" }),
    t3({ en: "Duplicates", fr: "Doublons", pt: "Duplicados" }),
    t3({ en: "Review & launch", fr: "Vérifier et lancer", pt: "Rever e iniciar" }),
  ];

  // Leaving the mappings step scans the file for duplicate facilities; the
  // duplicates step is skipped entirely when there are none.
  async function goNextFromMappings() {
    const csv = csvUpload();
    if (!csv) {
      return;
    }
    setScanning(true);
    setPreviewError("");
    const res = await serverActions.previewDatasetHfaDuplicates({
      csvUploadToken: csv.token,
      facilityIdColumn: mappings.facilityIdColumn,
      rowFilters: structuredClone(unwrap(mappings.rowFilters)),
    });
    setScanning(false);
    if (!res.success) {
      setPreviewError(res.err);
      return;
    }
    setPreview(res.data);
    stepper.goNext();
    if (res.data.groups.length === 0) {
      stepper.goNext();
    }
  }

  function goPrevFromReview() {
    stepper.goPrev();
    if ((preview()?.groups.length ?? 0) === 0) {
      stepper.goPrev();
    }
  }

  function rulePick(group: HfaDuplicateGroup): number {
    return mappings.dedupStrategy === "first"
      ? group.rows[0]
      : group.rows[group.rows.length - 1];
  }

  function setPick(group: HfaDuplicateGroup, keepRow: number) {
    const withoutGroup = mappings.dedupOverrides.filter(
      (o) => o.facilityId !== group.facilityId,
    );
    setMappings(
      "dedupOverrides",
      keepRow === rulePick(group)
        ? withoutGroup
        : [...withoutGroup, { facilityId: group.facilityId, keepRow }],
    );
  }

  function setStrategy(dedupStrategy: "first" | "last") {
    setMappings({ dedupStrategy, dedupOverrides: [] as HfaDedupOverride[] });
  }

  const submit = createFormAction(
    async () => {
      const csv = csvUpload();
      const xlsForm = xlsFormUpload();
      if (!csv || !xlsForm) {
        return {
          success: false,
          err: t3({
            en: "You must upload both files",
            fr: "Vous devez téléverser les deux fichiers",
            pt: "Tem de carregar os dois ficheiros",
          }),
        };
      }
      return await serverActions.launchDatasetHfaCsvRun({
        config: {
          csvUploadToken: csv.token,
          xlsFormUploadToken: xlsForm.token,
          mappings: structuredClone(unwrap(mappings)),
        },
      });
    },
    async () => {
      p.close({ launched: true });
    },
  );

  return (
    <ModalContainer
      width="2xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">
            {t3({ en: "New HFA import", fr: "Nouvelle importation HFA", pt: "Nova importação HFA" })}
          </div>
          <StepperChipsWithTitles stepper={stepper} labels={stepLabels} />
        </div>
      }
      leftButtons={
        <Show when={stepper.currentStep() > 0}>
          <Button
            onClick={isLastStep() ? goPrevFromReview : stepper.goPrev}
            outline
          >
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
              <Button
                onClick={
                  currentStepKind() === "mappings"
                    ? goNextFromMappings
                    : stepper.goNext
                }
                disabled={!stepper.canGoNext() || scanning()}
              >
                {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
              </Button>
            }
          >
            <Button
              onClick={submit.click}
              state={submit.state()}
              intent="success"
            >
              {t3({ en: "Start import", fr: "Démarrer l'importation", pt: "Iniciar a importação" })}
            </Button>
          </Show>
        </>
      }
    >
      <div class="ui-pad ui-spy min-h-[24rem]">
        <Show when={currentStepKind() === "upload"}>
          <div class="ui-spy">
            <h3 class="font-700 text-lg">
              {t3({ en: "CSV Data File", fr: "Fichier de données CSV", pt: "Ficheiro de dados CSV" })}
            </h3>
            <TempFileUpload
              buttonLabel={t3({ en: "Upload csv file", fr: "Téléverser un fichier CSV", pt: "Carregar um ficheiro CSV" })}
              value={csvUpload()}
              onUploaded={(next) => {
                setCsvUpload(next);
                resetColumnChoices();
                void parseIfReady();
              }}
              allowedFileTypes={[".csv"]}
            />
            <h3 class="font-700 text-lg">
              {t3({ en: "XLSForm Questionnaire File", fr: "Fichier questionnaire XLSForm", pt: "Ficheiro de questionário XLSForm" })}
            </h3>
            <TempFileUpload
              buttonLabel={t3({ en: "Upload XLSForm file", fr: "Téléverser un fichier XLSForm", pt: "Carregar um ficheiro XLSForm" })}
              value={xlsFormUpload()}
              onUploaded={(next) => {
                setXlsFormUpload(next);
                resetDownstream();
                void parseIfReady();
              }}
              allowedFileTypes={[".xlsx"]}
            />
            <Show when={parseError()}>
              <div class="text-danger text-sm">{parseError()}</div>
            </Show>
          </div>
        </Show>

        <Show when={currentStepKind() === "mappings"}>
          <div class="ui-spy">
            <div>
              <h3 class="font-700 mb-2 text-lg">
                {t3({ en: "Facility ID Column", fr: "Colonne ID établissement", pt: "Coluna do ID do estabelecimento" })}
              </h3>
              <div class="w-80">
                <Select
                  label={t3({ en: "Select the column containing facility IDs", fr: "Sélectionnez la colonne contenant les ID des établissements", pt: "Selecione a coluna que contém os ID dos estabelecimentos" })}
                  options={getSelectOptions(csvHeaders())}
                  value={mappings.facilityIdColumn}
                  onChange={(val) => {
                    resetDownstream();
                    setMappings("facilityIdColumn", val);
                  }}
                  fullWidth
                />
              </div>
            </div>
            <div>
              <h3 class="font-700 mb-2 text-lg">
                {t3({ en: "Time Point", fr: "Point temporel", pt: "Ponto temporal" })}
              </h3>
              <div class="w-96">
                <Select
                  label={t3({ en: "Select the time point this data belongs to", fr: "Sélectionnez le point temporel auquel ces données appartiennent", pt: "Selecione o ponto temporal a que estes dados pertencem" })}
                  options={timePointOptions()}
                  value={mappings.timePoint}
                  onChange={(val) => setMappings("timePoint", val)}
                  fullWidth
                />
              </div>
            </div>
            <div>
              <h3 class="font-700 mb-2 text-lg">
                {t3({ en: "Row Filter (optional)", fr: "Filtre de lignes (facultatif)", pt: "Filtro de linhas (opcional)" })}
              </h3>
              <div class="text-base-content-muted mb-3 text-sm">
                {t3({ en: "Rows failing any condition are dropped before duplicate handling — for example, keep only surveyed facilities by requiring the consent column to equal 1. Values are compared as exact text (1 does not match 1.0).", fr: "Les lignes ne satisfaisant pas toutes les conditions sont supprimées avant le traitement des doublons — par exemple, ne conservez que les établissements enquêtés en exigeant que la colonne de consentement soit égale à 1. Les valeurs sont comparées comme du texte exact (1 ne correspond pas à 1.0).", pt: "As linhas que não cumpram qualquer condição são eliminadas antes do tratamento dos duplicados — por exemplo, mantenha apenas os estabelecimentos inquiridos exigindo que a coluna de consentimento seja igual a 1. Os valores são comparados como texto exato (1 não corresponde a 1.0)." })}
              </div>
              <div class="ui-spy-sm">
                <For each={mappings.rowFilters}>
                  {(filter, i) => (
                    <div class="ui-gap-sm flex items-center">
                      <div class="w-80">
                        <Select
                          options={getSelectOptions(csvHeaders())}
                          value={filter.column}
                          onChange={(val) => {
                            resetDownstream();
                            setMappings("rowFilters", i(), "column", val);
                          }}
                          placeholder={t3({ en: "Select column", fr: "Sélectionnez une colonne", pt: "Selecione uma coluna" })}
                          fullWidth
                        />
                      </div>
                      <Select<"equals" | "not_equals">
                        options={[
                          { value: "equals", label: t3({ en: "equals", fr: "égal à", pt: "igual a" }) },
                          { value: "not_equals", label: t3({ en: "does not equal", fr: "différent de", pt: "diferente de" }) },
                        ]}
                        value={filter.op}
                        onChange={(val) => {
                          resetDownstream();
                          setMappings("rowFilters", i(), "op", val);
                        }}
                      />
                      <Input
                        value={filter.value}
                        onChange={(val) => {
                          resetDownstream();
                          setMappings("rowFilters", i(), "value", val);
                        }}
                        placeholder={t3({ en: "Value", fr: "Valeur", pt: "Valor" })}
                      />
                      <Button
                        iconName="trash"
                        onClick={() => {
                          resetDownstream();
                          setMappings("rowFilters", (prev) =>
                            prev.filter((_, idx) => idx !== i()),
                          );
                        }}
                      />
                    </div>
                  )}
                </For>
                <Button
                  iconName="plus"
                  onClick={() => {
                    resetDownstream();
                    setMappings("rowFilters", [
                      ...mappings.rowFilters,
                      { column: "", op: "equals", value: "" },
                    ]);
                  }}
                >
                  {t3({ en: "Add condition", fr: "Ajouter une condition", pt: "Adicionar uma condição" })}
                </Button>
              </div>
            </div>
            <Show when={previewError()}>
              <div class="text-danger text-sm">{previewError()}</div>
            </Show>
          </div>
        </Show>

        <Show when={currentStepKind() === "duplicates"}>
          <Show when={preview()} keyed>
            {(data) => (
              <div class="ui-spy">
                <div class="text-base-content-muted text-sm">
                  {t3({
                    en: "Facilities with several rows after filtering: pick which row to keep for each. Row numbers count data rows from 1 in file order (the header row is excluded — add 1 to find the row in a spreadsheet).",
                    fr: "Établissements ayant plusieurs lignes après filtrage : choisissez la ligne à conserver pour chacun. Les numéros de ligne comptent les lignes de données à partir de 1 dans l'ordre du fichier (ligne d'en-tête exclue — ajoutez 1 pour retrouver la ligne dans un tableur).",
                    pt: "Estabelecimentos com várias linhas após a filtragem: escolha a linha a manter para cada um. Os números de linha contam as linhas de dados a partir de 1 na ordem do ficheiro (linha de cabeçalho excluída — adicione 1 para encontrar a linha numa folha de cálculo).",
                  })}
                </div>
                <Show when={data.nRowsFilteredOut > 0}>
                  <div class="text-base-content-muted text-sm">
                    {t3({ en: "Rows removed by filter", fr: "Lignes supprimées par le filtre", pt: "Linhas removidas pelo filtro" })}
                    : {data.nRowsFilteredOut}
                  </div>
                </Show>
                <div class="ui-gap-sm flex items-center">
                  <span class="text-base-content-muted text-sm">
                    {t3({ en: "Quick-set all picks:", fr: "Réglage rapide de tous les choix :", pt: "Definição rápida de todas as escolhas:" })}
                  </span>
                  <Button size="sm" outline onClick={() => setStrategy("first")}>
                    {t3({ en: "First row", fr: "Première ligne", pt: "Primeira linha" })}
                  </Button>
                  <Button size="sm" outline onClick={() => setStrategy("last")}>
                    {t3({ en: "Last row", fr: "Dernière ligne", pt: "Última linha" })}
                  </Button>
                </div>
                <div class="ui-spy-sm">
                  <For each={data.groups}>
                    {(group) => {
                      const selected = () => {
                        const override = mappings.dedupOverrides.find(
                          (o) => o.facilityId === group.facilityId,
                        );
                        return String(override?.keepRow ?? rulePick(group));
                      };
                      return (
                        <div class="ui-gap flex items-center">
                          <div class="w-40 flex-none font-mono">
                            {group.facilityId}
                          </div>
                          <RadioGroup
                            value={selected()}
                            options={group.rows.map((r) => ({
                              value: String(r),
                              label: `${t3({ en: "Row", fr: "Ligne", pt: "Linha" })} ${r}`,
                            }))}
                            onChange={(val) => setPick(group, Number(val))}
                            horizontal
                          />
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            )}
          </Show>
        </Show>

        <Show when={currentStepKind() === "review"}>
          <div class="ui-spy-sm text-sm">
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({ en: "Data file", fr: "Fichier de données", pt: "Ficheiro de dados" })}
              </div>
              <div class="flex-1 font-mono">{csvUpload()?.fileName ?? ""}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({ en: "XLSForm file", fr: "Fichier XLSForm", pt: "Ficheiro XLSForm" })}
              </div>
              <div class="flex-1 font-mono">
                {xlsFormUpload()?.fileName ?? ""}
              </div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({ en: "Columns in file", fr: "Colonnes du fichier", pt: "Colunas no ficheiro" })}
              </div>
              <div class="flex-1 font-mono">{headers().length}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({ en: "Time point", fr: "Point temporel", pt: "Ponto temporal" })}
              </div>
              <div class="flex-1 font-mono">{mappings.timePoint}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({ en: "Facility id column", fr: "Colonne ID établissement", pt: "Coluna do ID do estabelecimento" })}
              </div>
              <div class="flex-1 font-mono">{mappings.facilityIdColumn}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({ en: "Row filters", fr: "Filtres de lignes", pt: "Filtros de linhas" })}
              </div>
              <div class="flex-1 font-mono">{mappings.rowFilters.length}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({ en: "Duplicate facilities", fr: "Établissements en double", pt: "Estabelecimentos duplicados" })}
              </div>
              <div class="flex-1 font-mono">
                {preview()?.groups.length ?? 0}
                {mappings.dedupOverrides.length > 0
                  ? ` (${mappings.dedupOverrides.length} ${t3({ en: "manual", fr: "manuel(s)", pt: "manual(is)" })})`
                  : ""}
              </div>
            </div>
            <div>
              {t3({
                en: "This replaces all existing data for the selected time point. Staging validates every row; a fully clean file integrates automatically, while dropped rows hold the import for your review before anything is merged.",
                fr: "Ceci remplace toutes les données existantes du point temporel sélectionné. La préparation valide chaque ligne ; un fichier entièrement valide s'intègre automatiquement, tandis que des lignes rejetées mettent l'importation en attente de votre vérification avant toute fusion.",
                pt: "Isto substitui todos os dados existentes do ponto temporal selecionado. A preparação valida todas as linhas; um ficheiro totalmente válido integra-se automaticamente, enquanto linhas rejeitadas colocam a importação em espera para a sua revisão antes de qualquer fusão.",
              })}
            </div>
          </div>
          <StateHolderFormError state={submit.state()} />
        </Show>
      </div>
    </ModalContainer>
  );
}
