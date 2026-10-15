import {
  _RECODABLE_FACILITY_COLUMNS,
  type CsvDetails,
  encodeRawCsvHeader,
  type FacilityFamily,
  type StructureColumnMappings,
  type StructureRecodableColumn,
  type StructureRecodes,
  type StructureSchema,
  type StructureStagedColumnValues,
  type StructureStagedRecodeRows,
  type StructureStagingResult,
  t3,
  TC,
} from "lib";
import {
  Button,
  createFormAction,
  type StateHolder,
  StateHolderFormError,
} from "panther";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  Match,
  Show,
  Switch,
} from "solid-js";
import { type SetStoreFunction, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  currentRecodeColumn,
  emptyRecodeEditorUi,
  normalizeRecodes,
  RecodeEditor,
  type RecodeEditorUi,
} from "../../_shared/mod.ts";
import { getStructureColumnLabel } from "./column_labels";

// No pagination: reassignment only makes sense for low-cardinality values, so
// all affected rows load at once and the table scrolls in a capped container.
const _ROW_LIMIT = 1000;

// Hoisted into StructureUploadAttemptForm: the keyed StateHolderWrapper
// remounts this whole step on every attempt refetch (including the one our
// own save triggers), so working state held here would be wiped.
export type RecodeUiState = RecodeEditorUi & {
  stagingNonce: string | undefined; // state belongs to this staging run
  assignments: StructureRecodes; // working copy, incl. unsaved edits
};

export function emptyRecodeUiState(): RecodeUiState {
  return {
    ...emptyRecodeEditorUi(),
    stagingNonce: undefined,
    assignments: {},
  };
}

type Props = {
  ui: RecodeUiState;
  setUi: SetStoreFunction<RecodeUiState>;
  family: FacilityFamily;
  step3Result: StructureStagingResult;
  recodes: StructureRecodes | undefined;
  structureSchema: StructureSchema;
  // CSV sources only (undefined for DHIS2): enables showing extra, unmapped
  // file columns as display-only context in the rows table
  csvDetails: CsvDetails | undefined;
  columnMappings: StructureColumnMappings | undefined;
  silentFetch: () => Promise<void>;
  goNext: () => void;
};

export function Step4Recode(p: Props) {
  const columnOptions = createMemo(() => {
    const staged = p.step3Result.stagedOptionalColumns ?? [];
    return _RECODABLE_FACILITY_COLUMNS.filter((c) => staged.includes(c));
  });

  const column = () => currentRecodeColumn(p.ui.column, columnOptions());

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(
    JSON.stringify(normalizeRecodes(unwrap(p.ui.assignments))) !==
      JSON.stringify(normalizeRecodes(p.recodes ?? {})),
  );

  // with_csv.tsx pattern: createQuery is one-shot by design, these queries
  // react to the column, the checked values and the context columns.
  const [valuesState, setValuesState] = createSignal<
    StateHolder<StructureStagedColumnValues>
  >({ status: "loading", msg: t3(TC.fetchingData) });

  let valuesRunId = 0;
  async function attemptGetValues(col: StructureRecodableColumn) {
    const runId = ++valuesRunId;
    setValuesState({ status: "loading", msg: t3(TC.fetchingData) });
    const res = await serverActions.getStructureStagedColumnValues({
      family: p.family,
      column: col,
    });
    if (runId !== valuesRunId) return;
    setValuesState(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  }

  createEffect(() => {
    const col = column();
    if (col) {
      attemptGetValues(col);
    }
  });

  // Affected rows (deduped, integrate's winners).
  const [rowsState, setRowsState] = createSignal<
    StateHolder<StructureStagedRecodeRows>
  >({ status: "loading", msg: t3(TC.fetchingData) });

  let rowsRunId = 0;
  async function attemptGetRows(
    col: StructureRecodableColumn,
    values: string[],
    contextColumns: string[],
  ) {
    const runId = ++rowsRunId;
    setRowsState({ status: "loading", msg: t3(TC.fetchingData) });
    const res = await serverActions.getStructureStagedRecodeRows({
      family: p.family,
      column: col,
      values,
      offset: 0,
      limit: _ROW_LIMIT,
      csvContextColumns: contextColumns.length > 0 ? contextColumns : undefined,
    });
    if (runId !== rowsRunId) return;
    setRowsState(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  }

  createEffect(() => {
    const col = column();
    const values = [...p.ui.checkedValues];
    const contextColumns = [...p.ui.contextColumns];
    if (col && values.length > 0) {
      attemptGetRows(col, values, contextColumns);
    }
  });

  // Unmapped file columns offerable as display-only context in the table
  const contextColumnOptions = createMemo(() => {
    const csvDetails = p.csvDetails;
    const columnMappings = p.columnMappings;
    if (!csvDetails || !columnMappings) {
      return undefined;
    }
    const mappedRefs = new Set(
      Object.values(columnMappings).filter(
        (v): v is string => typeof v === "string",
      ),
    );
    return csvDetails.headers
      .map((header, i) => ({
        value: encodeRawCsvHeader(i, header),
        label: header,
      }))
      .filter((o) => !mappedRefs.has(o.value));
  });

  function contextColumnLabel(ref: string): string {
    const headers = p.csvDetails?.headers ?? [];
    for (let i = 0; i < headers.length; i++) {
      if (encodeRawCsvHeader(i, headers[i]) === ref) {
        return headers[i];
      }
    }
    return ref;
  }

  // setStore with an object MERGES, so a copy-with-deleted-key would never
  // clear anything: deletion must be an explicit undefined write at the leaf.
  function setAssignment(
    col: StructureRecodableColumn,
    facilityId: string,
    value: string,
  ) {
    batch(() => {
      if (value === "") {
        if (p.ui.assignments[col]) {
          p.setUi("assignments", col, facilityId, undefined as never);
        }
      } else {
        p.setUi("assignments", col, { [facilityId]: value });
      }
      setNeedsSaving(true);
    });
  }

  const hasAnyAssignments = () =>
    Object.keys(normalizeRecodes(p.ui.assignments)).length > 0;

  const save = createFormAction(
    async () => {
      const stagingNonce = p.step3Result.stagingNonce;
      if (!stagingNonce) {
        return {
          success: false,
          err: t3({
            en:
              "This upload was staged before value reassignment existed — re-stage the data to use this feature.",
            fr:
              "Ce téléversement a été préparé avant l'existence de la réassignation des valeurs — relancez la préparation pour utiliser cette fonctionnalité.",
            pt:
              "Este carregamento foi preparado antes de existir a reatribuição de valores — repita a preparação para usar esta funcionalidade.",
          }),
        };
      }
      return await serverActions.setStructureRecodes({
        family: p.family,
        recodes: normalizeRecodes(unwrap(p.ui.assignments)),
        stagingNonce,
      });
    },
    async () => {
      setNeedsSaving(false);
      await p.silentFetch();
      p.goNext();
    },
  );

  return (
    <div class="ui-spy ui-pad">
      <div class="ui-text-heading">
        {t3({
          en: "Review and reassign values",
          fr: "Vérifier et réassigner les valeurs",
          pt: "Rever e reatribuir valores",
        })}
      </div>
      <div class="text-base-content text-sm">
        {t3({
          en:
            "Some files classify facilities with values like “Other”. Here you can reassign such values facility by facility before the import writes them. Counts and rows are shown per facility — duplicate rows in your file are already resolved exactly as the import will resolve them. This step is optional — continue to the import if nothing needs reassigning.",
          fr:
            "Certains fichiers classent les établissements avec des valeurs comme « Autre ». Vous pouvez ici réassigner ces valeurs établissement par établissement avant que l'importation ne les écrive. Les décomptes et les lignes sont présentés par établissement — les lignes en double de votre fichier sont déjà résolues exactement comme l'importation les résoudra. Cette étape est facultative — passez à l'importation si rien n'est à réassigner.",
          pt:
            "Alguns ficheiros classificam os estabelecimentos com valores como «Outro». Aqui pode reatribuir esses valores estabelecimento a estabelecimento antes de a importação os escrever. As contagens e as linhas são apresentadas por estabelecimento — as linhas duplicadas do seu ficheiro já estão resolvidas exatamente como a importação as resolverá. Esta etapa é opcional — avance para a importação se nada precisar de reatribuição.",
        })}
      </div>

      <Show
        when={columnOptions().length > 0}
        fallback={
          <div class="text-base-content-muted text-sm">
            {t3({
              en:
                "None of the staged columns can be reassigned. Continue to the import.",
              fr:
                "Aucune des colonnes préparées ne peut être réassignée. Passez à l'importation.",
              pt:
                "Nenhuma das colunas preparadas pode ser reatribuída. Avance para a importação.",
            })}
          </div>
        }
      >
        <RecodeEditor
          ui={p.ui}
          onUiChange={(patch) => p.setUi(patch)}
          columns={columnOptions()}
          columnLabel={(c) => getStructureColumnLabel(c, p.structureSchema)}
          values={valuesState()}
          rows={rowsState()}
          contextColumnOptions={contextColumnOptions()}
          contextColumnLabel={contextColumnLabel}
          assignments={p.ui.assignments}
          onAssign={setAssignment}
        />

        <Show when={!p.step3Result.stagingNonce}>
          <div class="text-danger text-sm">
            {t3({
              en:
                "This upload was staged before value reassignment existed — re-stage the data to use this feature.",
              fr:
                "Ce téléversement a été préparé avant l'existence de la réassignation des valeurs — relancez la préparation pour utiliser cette fonctionnalité.",
              pt:
                "Este carregamento foi preparado antes de existir a reatribuição de valores — repita a preparação para usar esta funcionalidade.",
            })}
          </div>
        </Show>
        <StateHolderFormError state={save.state()} />
        <div class="ui-gap-sm flex">
          <Switch>
            <Match when={needsSaving()}>
              <Button
                onClick={save.click}
                intent="success"
                state={save.state()}
                iconName="save"
                disabled={!p.step3Result.stagingNonce}
              >
                {t3({
                  en: "Save and continue",
                  fr: "Sauvegarder et continuer",
                  pt: "Guardar e continuar",
                })}
              </Button>
            </Match>
            <Match when={!needsSaving()}>
              <div class="ui-gap-sm flex items-center">
                <Button intent="primary" onClick={() => p.goNext()}>
                  {t3({
                    en: "Continue to import",
                    fr: "Continuer vers l'importation",
                    pt: "Continuar para a importação",
                  })}
                </Button>
                <Show when={hasAnyAssignments()}>
                  <div class="text-success">
                    {t3({
                      en: "Reassignments saved",
                      fr: "Réassignations sauvegardées",
                      pt: "Reatribuições guardadas",
                    })}
                  </div>
                </Show>
              </div>
            </Match>
          </Switch>
        </div>
      </Show>
    </div>
  );
}
