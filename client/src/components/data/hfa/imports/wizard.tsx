import {
  _RECODABLE_FACILITY_COLUMNS,
  decodeRawCsvHeader,
  encodeRawCsvHeader,
  findEncodedCsvHeader,
  findFirstEncodedCsvHeaderWithValues,
  getCountryLabel,
  hashStructureSchema,
  HFA_CORE_FACILITY_ID_COLUMNS,
  type HfaCsvMappingParams,
  type HfaDedupOverride,
  type HfaDuplicateGroup,
  type HfaDuplicatePreview,
  type HfaFacilityColumnGroup,
  type HfaFacilityColumns,
  type HfaFacilityColumnsPreview,
  type OptionalFacilityColumn,
  type StructureRecodableColumn,
  t3,
  TC,
} from "lib";
import {
  AlertComponentProps,
  Button,
  createFormAction,
  getSelectOptions,
  getStepper,
  Input,
  ModalContainer,
  plural,
  RadioGroup,
  Select,
  SelectSearch,
  type StateHolder,
  StepperChipsWithTitles,
} from "panther";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
  untrack,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { FileUploadSelector } from "~/components/_shared/mod.ts";
import {
  instanceState,
  structureSchemaForFamily,
} from "~/state/instance/t1_store";
import { getStructureItemsFromCacheOrFetch } from "~/state/instance/t2_structure";
import {
  createHfaFacilityChangesState,
  FacilityChangesStep,
} from "./facility_changes_step.tsx";
import { facilityColumnLabel } from "./facility_column_label.ts";
import {
  FacilityColumnsStep,
  hfaFacilityColumnsProblem,
  type HfaPrefills,
  type HfaPrefillSource,
  prefillHfaFacilityColumns,
} from "./facility_columns_step.tsx";

export type HfaWizardResult = { launched: true };

type StepKind =
  | "upload"
  | "mappings"
  | "facilityColumns"
  | "duplicates"
  | "changes"
  | "review";

const STEPS: StepKind[] = [
  "upload",
  "mappings",
  "facilityColumns",
  "duplicates",
  "changes",
  "review",
];

const EMPTY_FACILITY_COLUMNS: HfaFacilityColumns = {
  adminArea1: { value: "" },
  adminAreas: [],
  optional: {},
};

type PrefillInputs = {
  latest: HfaCsvMappingParams | null;
  adminArea1: { value: string; source: HfaPrefillSource };
};

function registryIsEmpty(): boolean {
  return (instanceState.structure?.hfa.facilities ?? 0) === 0;
}

// Level 1 is the registry's own value while it has facilities, else the
// instance's country.
async function getAdminArea1Prefill(): Promise<PrefillInputs["adminArea1"]> {
  const country = {
    value: getCountryLabel(instanceState.countryIso3 ?? ""),
    source: "country" as const,
  };
  const lastUpdated = instanceState.structureLastUpdated;
  if (registryIsEmpty() || !lastUpdated) {
    return country;
  }
  const res = await getStructureItemsFromCacheOrFetch(
    "hfa",
    lastUpdated,
    hashStructureSchema(structureSchemaForFamily("hfa")),
  );
  const value = res.success ? res.data.items.at(0)?.admin_area_1 : undefined;
  return value ? { value, source: "registry" } : country;
}

async function getPrefillInputs(): Promise<PrefillInputs> {
  const [latest, adminArea1] = await Promise.all([
    serverActions.getDatasetHfaLatestMappings({}),
    getAdminArea1Prefill(),
  ]);
  return { latest: latest.success ? latest.data : null, adminArea1 };
}

// The latest complete run's facility id column where this file has it with
// values, else the first questionnaire id column with values.
function prefillFacilityIdColumn(
  rawHeaders: string[],
  headersWithValues: string[],
  latest: HfaCsvMappingParams | null,
): { column: string; source: HfaPrefillSource } | undefined {
  const fromLatest = latest
    ? findEncodedCsvHeader(
      rawHeaders,
      decodeRawCsvHeader(latest.facilityIdColumn),
    )
    : "";
  if (fromLatest && headersWithValues.includes(fromLatest)) {
    return { column: fromLatest, source: "latest" };
  }
  const fromName = findFirstEncodedCsvHeaderWithValues(
    rawHeaders,
    HFA_CORE_FACILITY_ID_COLUMNS,
    headersWithValues,
  );
  return fromName ? { column: fromName, source: "name" } : undefined;
}

// The HFA import wizard: a modal with client-local state: the file inputs are
// ordinary instance assets (uploaded or picked), so nothing persists
// server-side before launch. Launch inserts a run row; abandoning this wizard
// is a no-op by construction.
export function HfaWizard(p: AlertComponentProps<object, HfaWizardResult>) {
  const [csvFileName, setCsvFileName] = createSignal<string>("");
  const [xlsFormFileName, setXlsFormFileName] = createSignal<string>("");
  const [rawHeaders, setRawHeaders] = createSignal<string[]>([]);
  const [parseError, setParseError] = createSignal<string>("");
  const [preview, setPreview] = createSignal<HfaDuplicatePreview | undefined>(
    undefined,
  );
  const [stepError, setStepError] = createSignal<string>("");
  const [scanning, setScanning] = createSignal<boolean>(false);
  const [prefills, setPrefills] = createSignal<HfaPrefills>({});
  const [columnsPreview, setColumnsPreview] = createSignal<
    StateHolder<HfaFacilityColumnsPreview>
  >({ status: "loading", msg: t3(TC.fetchingData) });

  const [mappings, setMappings] = createStore<HfaCsvMappingParams>({
    facilityIdColumn: "",
    timePoint: "",
    rowFilters: [],
    dedupStrategy: "first",
    dedupOverrides: [],
    facilityColumns: structuredClone(EMPTY_FACILITY_COLUMNS),
    facilityChanges: [],
    recodes: {},
  });

  const prefillInputs = getPrefillInputs();
  // A new CSV is pre-filled once its headers are parsed; a new XLSForm keeps
  // the column choices.
  let columnsNeedPrefill = true;

  const schema = () => structureSchemaForFamily("hfa");
  const headers = createMemo(() =>
    rawHeaders().map((v, i) => encodeRawCsvHeader(i, v))
  );

  // The scan every facility preview reads: the kept row of each facility,
  // through the facility columns.
  function scanBody() {
    return {
      csvFileName: csvFileName(),
      xlsFormFileName: xlsFormFileName(),
      facilityIdColumn: mappings.facilityIdColumn,
      rowFilters: structuredClone(unwrap(mappings.rowFilters)),
      dedupStrategy: mappings.dedupStrategy,
      dedupOverrides: structuredClone(unwrap(mappings.dedupOverrides)),
      facilityColumns: structuredClone(unwrap(mappings.facilityColumns)),
    };
  }

  const changes = createHfaFacilityChangesState((args) =>
    serverActions.previewDatasetHfaFacilityChanges({
      ...untrack(scanBody),
      timePoint: untrack(() => mappings.timePoint),
      facilityChanges: args.decisions,
      contextHeaders: args.contextHeaders,
    })
  );

  // Both files must be present before the headers can be parsed (the parse
  // call also validates the XLSForm's sheets).
  async function parseIfReady() {
    const csv = csvFileName();
    const xlsForm = xlsFormFileName();
    batch(() => {
      setRawHeaders([]);
      setParseError("");
    });
    if (!csv || !xlsForm) {
      return;
    }
    const res = await serverActions.parseDatasetHfaCsvHeaders({
      csvFileName: csv,
      xlsFormFileName: xlsForm,
    });
    const inputs = await prefillInputs;
    // A file changed while this parse was in flight: its headers belong to
    // files no longer selected, and the newer parse will supply the right ones.
    if (csv !== csvFileName() || xlsForm !== xlsFormFileName()) {
      return;
    }
    if (!res.success) {
      setParseError(res.err);
      return;
    }
    batch(() => {
      setRawHeaders(res.data.headers);
      let next: HfaPrefills = {};
      if (mappings.facilityIdColumn === "") {
        const id = prefillFacilityIdColumn(
          res.data.headers,
          res.data.headersWithValues,
          inputs.latest,
        );
        if (id) {
          setMappings("facilityIdColumn", id.column);
          next.facility_id = id.source;
        }
      }
      if (columnsNeedPrefill) {
        columnsNeedPrefill = false;
        const prefilled = prefillHfaFacilityColumns({
          rawHeaders: res.data.headers,
          latest: inputs.latest?.facilityColumns,
          schema: schema(),
          adminArea1: inputs.adminArea1,
        });
        setMappings("facilityColumns", reconcile(prefilled.facilityColumns));
        next = { ...next, ...prefilled.prefills };
      }
      setPrefills((prev) => ({ ...prev, ...next }));
    });
  }

  function clearPrefill(key: string) {
    setPrefills((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }

  let columnsRunId = 0;
  async function fetchColumnsPreview() {
    const runId = ++columnsRunId;
    setColumnsPreview({ status: "loading", msg: t3(TC.fetchingData) });
    const res = await serverActions.previewDatasetHfaFacilityColumns(
      scanBody(),
    );
    if (runId !== columnsRunId) {
      return;
    }
    setColumnsPreview(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  }

  // Editing the facility column or any filter invalidates the duplicate
  // structure the picks were made against, and every facility read after it.
  function resetDownstream() {
    batch(() => {
      setPreview(undefined);
      setStepError("");
      setMappings("dedupOverrides", []);
      changes.invalidate();
    });
  }

  // A new CSV means new headers, so every column choice made against the old
  // ones is stale: clear them rather than launching with a dangling column.
  function resetColumnChoices() {
    columnsNeedPrefill = true;
    batch(() => {
      resetDownstream();
      setPrefills({});
      setMappings({
        facilityIdColumn: "",
        rowFilters: [],
        facilityColumns: structuredClone(EMPTY_FACILITY_COLUMNS),
      });
      setMappings("recodes", reconcile({}));
    });
  }

  function setFacilityIdColumn(val: string) {
    batch(() => {
      resetDownstream();
      clearPrefill("facility_id");
      setMappings("facilityIdColumn", val);
    });
  }

  function setFacilityColumns(next: HfaFacilityColumns, editedPicker: string) {
    batch(() => {
      setMappings("facilityColumns", reconcile(next));
      clearPrefill(editedPicker);
      changes.invalidate();
    });
    if (editedPicker !== "admin_area_1") {
      void fetchColumnsPreview();
    }
  }

  // setStore with an object MERGES, so a copy-with-deleted-key would never
  // clear anything: deletion must be an explicit undefined write at the leaf.
  function setRecode(
    column: StructureRecodableColumn,
    facilityId: string,
    value: string,
  ) {
    if (value !== "") {
      setMappings("recodes", column, { [facilityId]: value });
    } else if (mappings.recodes[column]) {
      setMappings("recodes", column, facilityId, undefined as never);
    }
  }

  const timePointOptions = () =>
    [...instanceState.hfaTimePoints]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((tp) => ({
        value: tp.label,
        label: `${tp.label} (${tp.periodId.slice(0, 4)}-${
          tp.periodId.slice(4, 6)
        })`,
      }));

  const mappingsComplete = () =>
    mappings.facilityIdColumn !== "" &&
    mappings.timePoint !== "" &&
    mappings.rowFilters.every((f) => f.column !== "" && f.value.trim() !== "");

  const facilityColumnsProblem = () =>
    hfaFacilityColumnsProblem(
      mappings.facilityColumns,
      schema().adminDepth,
      registryIsEmpty(),
    );

  const stepperData = createMemo(() => ({
    uploadValid: csvFileName() !== "" &&
      xlsFormFileName() !== "" &&
      rawHeaders().length > 0,
    mappingsValid: mappingsComplete(),
    facilityColumnsValid: facilityColumnsProblem() === undefined,
    changesValid: changes.review() !== undefined &&
      changes.problem() === undefined,
  }));

  const stepper = getStepper(stepperData, {
    initialStep: 0,
    minStep: 0,
    maxStep: STEPS.length - 1,
    getValidation: (step, data) => {
      switch (STEPS[step]) {
        case "upload":
          return { canGoPrev: false, canGoNext: data.uploadValid };
        case "mappings":
          return { canGoPrev: true, canGoNext: data.mappingsValid };
        case "facilityColumns":
          return { canGoPrev: true, canGoNext: data.facilityColumnsValid };
        case "duplicates":
          return { canGoPrev: true, canGoNext: true };
        case "changes":
          return { canGoPrev: true, canGoNext: data.changesValid };
        case "review":
          return { canGoPrev: true, canGoNext: false };
      }
    },
  });

  const currentStepKind = () => STEPS[stepper.currentStep()];
  const isLastStep = () => currentStepKind() === "review";

  // The kept rows depend on the duplicate picks made after this step, so the
  // preview is read again on every visit.
  createEffect(on(currentStepKind, (kind) => {
    setStepError("");
    if (kind === "facilityColumns") {
      void untrack(fetchColumnsPreview);
    }
  }));

  const stepLabels = [
    t3({ en: "Upload", fr: "Téléversement", pt: "Carregamento" }),
    t3({ en: "Mappings", fr: "Correspondances", pt: "Correspondências" }),
    t3({ en: "Facilities", fr: "Établissements", pt: "Estabelecimentos" }),
    t3({ en: "Duplicates", fr: "Doublons", pt: "Duplicados" }),
    t3({ en: "Changes", fr: "Modifications", pt: "Alterações" }),
    t3({
      en: "Review & launch",
      fr: "Vérifier et lancer",
      pt: "Rever e iniciar",
    }),
  ];

  async function scanDuplicates() {
    setScanning(true);
    setStepError("");
    const res = await serverActions.previewDatasetHfaDuplicates({
      csvFileName: csvFileName(),
      facilityIdColumn: mappings.facilityIdColumn,
      rowFilters: structuredClone(unwrap(mappings.rowFilters)),
    });
    batch(() => {
      setScanning(false);
      if (!res.success) {
        setStepError(res.err);
        return;
      }
      setPreview(res.data);
      stepper.goNext();
    });
  }

  async function loadChanges() {
    setScanning(true);
    setStepError("");
    const err = await changes.load(
      structuredClone(unwrap(mappings.facilityColumns)),
      rawHeaders(),
    );
    batch(() => {
      setScanning(false);
      if (err !== undefined) {
        setStepError(err);
        return;
      }
      stepper.goNext();
    });
  }

  // The decisions ride the mappings from here: every change decided, and the
  // recodes only on the cells the import writes from the file.
  function commitChanges() {
    batch(() => {
      setMappings("facilityChanges", changes.decisions());
      setMappings(
        "recodes",
        reconcile(changes.prunedRecodes(unwrap(mappings.recodes))),
      );
      stepper.goNext();
    });
  }

  // The Next button's action for the current step. Facility reads run on the
  // way forward, so a step is never shown over reads of stale choices.
  function goNext() {
    if (!stepper.canGoNext() || scanning()) {
      return;
    }
    switch (currentStepKind()) {
      case "facilityColumns":
        void scanDuplicates();
        return;
      case "duplicates":
        void loadChanges();
        return;
      case "changes":
        commitChanges();
        return;
      default:
        stepper.goNext();
    }
  }

  // Chip clicks must never bypass a step's reads: only current+1 is ever
  // clickable forward, so it runs exactly the Next button's action.
  function onStepClick(step: number) {
    const current = stepper.currentStep();
    if (step < current) {
      stepper.setCurrentStep(step);
    } else if (step === current + 1) {
      goNext();
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
    batch(() => {
      changes.invalidate();
      setMappings(
        "dedupOverrides",
        keepRow === rulePick(group)
          ? withoutGroup
          : [...withoutGroup, { facilityId: group.facilityId, keepRow }],
      );
    });
  }

  function setStrategy(dedupStrategy: "first" | "last") {
    batch(() => {
      changes.invalidate();
      setMappings({ dedupStrategy, dedupOverrides: [] as HfaDedupOverride[] });
    });
  }

  const submit = createFormAction(
    async () => {
      const csv = csvFileName();
      const xlsForm = xlsFormFileName();
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
          csvFileName: csv,
          xlsFormFileName: xlsForm,
          mappings: structuredClone(unwrap(mappings)),
        },
      });
    },
    async () => {
      p.close({ launched: true });
    },
  );

  const mappedFacilityColumns = () => [
    ...mappings.facilityColumns.adminAreas.map((a) => ({
      label: facilityColumnLabel(`admin_area_${a.level}`),
      headers: a,
    })),
    ...Object.entries(mappings.facilityColumns.optional).map((
      [column, headers],
    ) => ({
      label: facilityColumnLabel(column as OptionalFacilityColumn),
      headers,
    })),
  ];

  const changeCounts = () => {
    const counts = new Map<
      HfaFacilityColumnGroup,
      { taken: number; kept: number }
    >();
    for (const d of mappings.facilityChanges) {
      const c = counts.get(d.column) ?? { taken: 0, kept: 0 };
      const nOther = d.exceptions.length;
      const nMain = d.facilityIds.length - nOther;
      const taken = d.decision === "take" ? nMain : nOther;
      counts.set(d.column, {
        taken: c.taken + taken,
        kept: c.kept + d.facilityIds.length - taken,
      });
    }
    return [...counts].map(([column, c]) => ({ column, ...c }));
  };

  const nRecodes = () =>
    _RECODABLE_FACILITY_COLUMNS.reduce(
      (sum, c) => sum + Object.keys(mappings.recodes[c] ?? {}).length,
      0,
    );

  return (
    <ModalContainer
      width="2xl"
      topPanel={
        <div class="flex items-center justify-between">
          <div class="ui-text-heading">
            {t3({
              en: "New HFA import",
              fr: "Nouvelle importation HFA",
              pt: "Nova importação HFA",
            })}
          </div>
          <StepperChipsWithTitles
            stepper={stepper}
            labels={stepLabels}
            onStepClick={onStepClick}
          />
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
              label: t3({
                en: "Start import",
                fr: "Démarrer l'importation",
                pt: "Iniciar a importação",
              }),
              onClick: submit.click,
              state: submit.state(),
            },
          ]
          : [
            {
              label: t3({ en: "Next", fr: "Suivant", pt: "Seguinte" }),
              onClick: goNext,
              disabled: !stepper.canGoNext() || scanning(),
            },
          ]),
      ]}
    >
      <div class="ui-spy min-h-[24rem]">
        <Show when={currentStepKind() === "upload"}>
          <div class="ui-spy">
            <h3 class="ui-text-heading">
              {t3({
                en: "CSV Data File",
                fr: "Fichier de données CSV",
                pt: "Ficheiro de dados CSV",
              })}
            </h3>
            <FileUploadSelector
              buttonLabel={t3({
                en: "Upload csv file",
                fr: "Téléverser un fichier CSV",
                pt: "Carregar um ficheiro CSV",
              })}
              selectLabel={t3({
                en: "Or select an existing file",
                fr: "Ou sélectionnez un fichier existant",
                pt: "Ou selecione um ficheiro existente",
              })}
              filter={(a) => a.isCsv}
              value={csvFileName()}
              onChange={(next) => {
                setCsvFileName(next);
                resetColumnChoices();
                void parseIfReady();
              }}
              allowedFileTypes={[".csv"]}
            />
            <h3 class="ui-text-heading">
              {t3({
                en: "XLSForm Questionnaire File",
                fr: "Fichier questionnaire XLSForm",
                pt: "Ficheiro de questionário XLSForm",
              })}
            </h3>
            <FileUploadSelector
              buttonLabel={t3({
                en: "Upload XLSForm file",
                fr: "Téléverser un fichier XLSForm",
                pt: "Carregar um ficheiro XLSForm",
              })}
              selectLabel={t3({
                en: "Or select an existing file",
                fr: "Ou sélectionnez un fichier existant",
                pt: "Ou selecione um ficheiro existente",
              })}
              filter={(a) => a.isXlsx}
              value={xlsFormFileName()}
              onChange={(next) => {
                setXlsFormFileName(next);
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
              <h3 class="ui-text-heading mb-2">
                {t3({
                  en: "Facility ID Column",
                  fr: "Colonne ID établissement",
                  pt: "Coluna do ID do estabelecimento",
                })}
              </h3>
              <div class="w-80">
                <SelectSearch
                  label={t3({
                    en: "Select the column containing facility IDs",
                    fr:
                      "Sélectionnez la colonne contenant les ID des établissements",
                    pt:
                      "Selecione a coluna que contém os ID dos estabelecimentos",
                  })}
                  options={getSelectOptions(headers())}
                  value={mappings.facilityIdColumn}
                  onChange={setFacilityIdColumn}
                  fullWidth
                />
              </div>
              <Show when={prefills().facility_id}>
                <div class="text-base-content-muted text-sm">
                  {prefills().facility_id === "latest"
                    ? t3({
                      en: "From the latest import",
                      fr: "De la dernière importation",
                      pt: "Da última importação",
                    })
                    : t3({
                      en: "The first questionnaire id column with values",
                      fr:
                        "La première colonne d'identifiant du questionnaire qui contient des valeurs",
                      pt:
                        "A primeira coluna de identificador do questionário com valores",
                    })}
                </div>
              </Show>
            </div>
            <div>
              <h3 class="ui-text-heading mb-2">
                {t3({
                  en: "Time Point",
                  fr: "Point temporel",
                  pt: "Ponto temporal",
                })}
              </h3>
              <div class="w-96">
                <Select
                  label={t3({
                    en: "Select the time point this data belongs to",
                    fr:
                      "Sélectionnez le point temporel auquel ces données appartiennent",
                    pt:
                      "Selecione o ponto temporal a que estes dados pertencem",
                  })}
                  options={timePointOptions()}
                  value={mappings.timePoint}
                  onChange={(val) =>
                    batch(() => {
                      changes.invalidate();
                      setMappings("timePoint", val);
                    })}
                  fullWidth
                />
              </div>
            </div>
            <div>
              <h3 class="ui-text-heading mb-2">
                {t3({
                  en: "Row Filter (optional)",
                  fr: "Filtre de lignes (facultatif)",
                  pt: "Filtro de linhas (opcional)",
                })}
              </h3>
              <div class="text-base-content-muted mb-3 text-sm">
                {t3({
                  en:
                    "Rows failing any condition are dropped before duplicate handling — for example, keep only surveyed facilities by requiring the consent column to equal 1. Values are compared as exact text (1 does not match 1.0).",
                  fr:
                    "Les lignes ne satisfaisant pas toutes les conditions sont supprimées avant le traitement des doublons — par exemple, ne conservez que les établissements enquêtés en exigeant que la colonne de consentement soit égale à 1. Les valeurs sont comparées comme du texte exact (1 ne correspond pas à 1.0).",
                  pt:
                    "As linhas que não cumpram qualquer condição são eliminadas antes do tratamento dos duplicados — por exemplo, mantenha apenas os estabelecimentos inquiridos exigindo que a coluna de consentimento seja igual a 1. Os valores são comparados como texto exato (1 não corresponde a 1.0).",
                })}
              </div>
              <div class="ui-spy-sm">
                <For each={mappings.rowFilters}>
                  {(filter, i) => (
                    <div class="ui-gap-sm flex items-center">
                      <div class="w-80">
                        <SelectSearch
                          options={getSelectOptions(headers())}
                          value={filter.column}
                          onChange={(val) => {
                            resetDownstream();
                            setMappings("rowFilters", i(), "column", val);
                          }}
                          placeholder={t3({
                            en: "Select column",
                            fr: "Sélectionnez une colonne",
                            pt: "Selecione uma coluna",
                          })}
                          fullWidth
                        />
                      </div>
                      <Select<"equals" | "not_equals">
                        options={[
                          {
                            value: "equals",
                            label: t3({
                              en: "equals",
                              fr: "égal à",
                              pt: "igual a",
                            }),
                          },
                          {
                            value: "not_equals",
                            label: t3({
                              en: "does not equal",
                              fr: "différent de",
                              pt: "diferente de",
                            }),
                          },
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
                        placeholder={t3({
                          en: "Value",
                          fr: "Valeur",
                          pt: "Valor",
                        })}
                      />
                      <Button
                        iconName="trash"
                        onClick={() => {
                          resetDownstream();
                          setMappings(
                            "rowFilters",
                            (prev) => prev.filter((_, idx) => idx !== i()),
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
                  {t3({
                    en: "Add condition",
                    fr: "Ajouter une condition",
                    pt: "Adicionar uma condição",
                  })}
                </Button>
              </div>
            </div>
          </div>
        </Show>

        <Show when={currentStepKind() === "facilityColumns"}>
          <FacilityColumnsStep
            encodedHeaders={headers()}
            schema={schema()}
            facilityColumns={mappings.facilityColumns}
            prefills={prefills()}
            registryIsEmpty={registryIsEmpty()}
            preview={columnsPreview()}
            onChange={setFacilityColumns}
          />
          <Show when={facilityColumnsProblem()}>
            {(problem) => <div class="text-danger text-sm">{problem()}</div>}
          </Show>
        </Show>

        <Show when={currentStepKind() === "duplicates"}>
          <Show when={preview()} keyed>
            {(data) => (
              <div class="ui-spy">
                <Show
                  when={data.groups.length > 0}
                  fallback={
                    <div>
                      {t3({
                        en:
                          "No facility has more than one row after filtering. There is nothing to resolve.",
                        fr:
                          "Aucun établissement n'a plus d'une ligne après filtrage. Il n'y a rien à résoudre.",
                        pt:
                          "Nenhum estabelecimento tem mais de uma linha após a filtragem. Não há nada a resolver.",
                      })}
                    </div>
                  }
                >
                  <div class="text-base-content-muted text-sm">
                    {t3({
                      en:
                        "Facilities with several rows after filtering: pick which row to keep for each. Row numbers count data rows from 1 in file order (the header row is excluded — add 1 to find the row in a spreadsheet).",
                      fr:
                        "Établissements ayant plusieurs lignes après filtrage : choisissez la ligne à conserver pour chacun. Les numéros de ligne comptent les lignes de données à partir de 1 dans l'ordre du fichier (ligne d'en-tête exclue — ajoutez 1 pour retrouver la ligne dans un tableur).",
                      pt:
                        "Estabelecimentos com várias linhas após a filtragem: escolha a linha a manter para cada um. Os números de linha contam as linhas de dados a partir de 1 na ordem do ficheiro (linha de cabeçalho excluída — adicione 1 para encontrar a linha numa folha de cálculo).",
                    })}
                  </div>
                </Show>
                <Show when={data.nRowsFilteredOut > 0}>
                  <div class="text-base-content-muted text-sm">
                    {t3({
                      en: "Rows removed by filter",
                      fr: "Lignes supprimées par le filtre",
                      pt: "Linhas removidas pelo filtro",
                    })}
                    : {data.nRowsFilteredOut}
                  </div>
                </Show>
                <Show when={data.groups.length > 0}>
                  <div class="ui-gap-sm flex items-center">
                    <span class="text-base-content-muted text-sm">
                      {t3({
                        en: "Quick-set all picks:",
                        fr: "Réglage rapide de tous les choix :",
                        pt: "Definição rápida de todas as escolhas:",
                      })}
                    </span>
                    <Button
                      size="sm"
                      outline
                      onClick={() => setStrategy("first")}
                    >
                      {t3({
                        en: "First row",
                        fr: "Première ligne",
                        pt: "Primeira linha",
                      })}
                    </Button>
                    <Button
                      size="sm"
                      outline
                      onClick={() => setStrategy("last")}
                    >
                      {t3({
                        en: "Last row",
                        fr: "Dernière ligne",
                        pt: "Última linha",
                      })}
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
                                label: `${
                                  t3({ en: "Row", fr: "Ligne", pt: "Linha" })
                                } ${r}`,
                              }))}
                              onChange={(val) => setPick(group, Number(val))}
                              horizontal
                            />
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </Show>

        <Show when={currentStepKind() === "changes"}>
          <FacilityChangesStep
            state={changes}
            facilityColumns={mappings.facilityColumns}
            encodedHeaders={headers()}
            facilityIdColumn={mappings.facilityIdColumn}
            recodes={mappings.recodes}
            onAssign={setRecode}
          />
          <Show when={changes.problem()}>
            {(problem) => <div class="text-danger text-sm">{problem()}</div>}
          </Show>
        </Show>

        <Show when={stepError()}>
          <div class="text-danger text-sm">{stepError()}</div>
        </Show>

        <Show when={currentStepKind() === "review"}>
          <div class="ui-spy-sm text-sm">
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({
                  en: "Data file",
                  fr: "Fichier de données",
                  pt: "Ficheiro de dados",
                })}
              </div>
              <div class="flex-1 font-mono">{csvFileName()}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({
                  en: "XLSForm file",
                  fr: "Fichier XLSForm",
                  pt: "Ficheiro XLSForm",
                })}
              </div>
              <div class="flex-1 font-mono">{xlsFormFileName()}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({
                  en: "Columns in file",
                  fr: "Colonnes du fichier",
                  pt: "Colunas no ficheiro",
                })}
              </div>
              <div class="flex-1">{rawHeaders().length}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({
                  en: "Time point",
                  fr: "Point temporel",
                  pt: "Ponto temporal",
                })}
              </div>
              <div class="flex-1">{mappings.timePoint}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({
                  en: "Facility id column",
                  fr: "Colonne ID établissement",
                  pt: "Coluna do ID do estabelecimento",
                })}
              </div>
              <div class="flex-1 font-mono">{mappings.facilityIdColumn}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({
                  en: "Row filters",
                  fr: "Filtres de lignes",
                  pt: "Filtros de linhas",
                })}
              </div>
              <div class="flex-1">{mappings.rowFilters.length}</div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {t3({
                  en: "Duplicate facilities",
                  fr: "Établissements en double",
                  pt: "Estabelecimentos duplicados",
                })}
              </div>
              <div class="flex-1">
                {preview()?.groups.length ?? 0}
                {mappings.dedupOverrides.length > 0
                  ? ` (${mappings.dedupOverrides.length} ${
                    plural(mappings.dedupOverrides.length, {
                      one: t3({ en: "manual", fr: "manuel", pt: "manual" }),
                      other: t3({ en: "manual", fr: "manuels", pt: "manuais" }),
                    })
                  })`
                  : ""}
              </div>
            </div>
            <div class="flex items-baseline">
              <div class="w-56 flex-none">
                {facilityColumnLabel("admin_area_1")}
              </div>
              <div class="flex-1">
                {mappings.facilityColumns.adminArea1.value}
              </div>
            </div>
            <For each={mappedFacilityColumns()}>
              {(c) => (
                <div class="flex items-baseline">
                  <div class="w-56 flex-none">{c.label}</div>
                  <div class="flex-1 font-mono">
                    {c.headers.header}
                    {c.headers.correctionHeader
                      ? ` (${
                        t3({
                          en: "corrected by",
                          fr: "corrigée par",
                          pt: "corrigida por",
                        })
                      } ${c.headers.correctionHeader})`
                      : ""}
                  </div>
                </div>
              )}
            </For>
            <Show when={changes.review()}>
              {(review) => (
                <div class="flex items-baseline">
                  <div class="w-56 flex-none">
                    {t3({
                      en: "New facilities",
                      fr: "Nouveaux établissements",
                      pt: "Novos estabelecimentos",
                    })}
                  </div>
                  <div class="flex-1">{review().preview.match.new}</div>
                </div>
              )}
            </Show>
            <For each={changeCounts()}>
              {(c) => (
                <div class="flex items-baseline">
                  <div class="w-56 flex-none">
                    {t3({
                      en: `Changes: ${facilityColumnLabel(c.column)}`,
                      fr: `Modifications : ${facilityColumnLabel(c.column)}`,
                      pt: `Alterações: ${facilityColumnLabel(c.column)}`,
                    })}
                  </div>
                  <div class="flex-1">
                    {t3({
                      en: `${c.taken} taken, ${c.kept} kept`,
                      fr: `${c.taken} prises, ${c.kept} conservées`,
                      pt: `${c.taken} aceites, ${c.kept} mantidas`,
                    })}
                  </div>
                </div>
              )}
            </For>
            <Show when={nRecodes() > 0}>
              <div class="flex items-baseline">
                <div class="w-56 flex-none">
                  {t3({
                    en: "Reassigned values",
                    fr: "Valeurs réassignées",
                    pt: "Valores reatribuídos",
                  })}
                </div>
                <div class="flex-1">{nRecodes()}</div>
              </div>
            </Show>
            <div>
              {t3({
                en:
                  "This replaces all existing data for the selected time point and writes the new facilities and the changes you took to the HFA facility list. A file whose every row has a facility id, and whose new facilities all have complete admin areas, integrates automatically; otherwise the import waits for your review before anything is written.",
                fr:
                  "Ceci remplace toutes les données existantes du point temporel sélectionné et écrit les nouveaux établissements et les modifications que vous avez prises dans la liste des établissements HFA. Un fichier dont chaque ligne a un identifiant d'établissement, et dont les nouveaux établissements ont tous des unités administratives complètes, s'intègre automatiquement ; sinon, l'importation attend votre vérification avant toute écriture.",
                pt:
                  "Isto substitui todos os dados existentes do ponto temporal selecionado e escreve os novos estabelecimentos e as alterações que aceitou na lista de estabelecimentos HFA. Um ficheiro em que todas as linhas têm um identificador de estabelecimento, e cujos novos estabelecimentos têm todos zonas administrativas completas, integra-se automaticamente; caso contrário, a importação aguarda a sua revisão antes de qualquer escrita.",
              })}
            </div>
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}
