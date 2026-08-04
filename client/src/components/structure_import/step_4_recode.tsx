import {
  t3,
  TC,
  _RECODABLE_FACILITY_COLUMNS,
  encodeRawCsvHeader,
  type CsvDetails,
  type FacilityFamily,
  type InstanceConfigFacilityColumns,
  type StructureColumnMappings,
  type StructureRecodableColumn,
  type StructureRecodes,
  type StructureStagedColumnValues,
  type StructureStagedRecodeRows,
  type StructureStagingResult,
} from "lib";
import {
  Button,
  Checkbox,
  Input,
  Select,
  StateHolderFormError,
  StateHolderWrapper,
  Table,
  createFormAction,
  toNum0,
  type StateHolder,
  type TableColumn,
} from "panther";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal } from "solid-js";
import { unwrap, type SetStoreFunction } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { getStructureColumnLabel } from "./_column_labels";

// No pagination: reassignment only makes sense for low-cardinality values, so
// all affected rows load at once and the table scrolls in a capped container.
const _ROW_LIMIT = 1000;

// Mirrors lib/hfa_sentinel_classification.ts's "other" heuristic. Deliberately
// not imported: this is a UI suggestion, not a classification.
const OTHER_REGEX = /\bother\b|\bautre\b|\boutros?\b/i;

// Hoisted into StructureUploadAttemptForm: the keyed StateHolderWrapper
// remounts this whole step on every attempt refetch (including the one our
// own save triggers), so working state held here would be wiped.
export type RecodeUiState = {
  stagingNonce: string | undefined; // state belongs to this staging run
  column: StructureRecodableColumn | undefined;
  checkedValues: string[]; // values marked for reassignment
  autoChecked: boolean; // OTHER_REGEX suggestion applied once
  assignments: StructureRecodes; // working copy, incl. unsaved edits
  customTargets: string[]; // user-added "new category" values
  contextColumns: string[]; // encoded refs of extra file columns to display
};

export function emptyRecodeUiState(): RecodeUiState {
  return {
    stagingNonce: undefined,
    column: undefined,
    checkedValues: [],
    autoChecked: false,
    assignments: {},
    customTargets: [],
    contextColumns: [],
  };
}

export function normalizeRecodes(recodes: StructureRecodes): StructureRecodes {
  const out: StructureRecodes = {};
  for (const [col, map] of Object.entries(recodes)) {
    if (map && Object.keys(map).length > 0) {
      out[col as StructureRecodableColumn] = map;
    }
  }
  return out;
}

type Props = {
  ui: RecodeUiState;
  setUi: SetStoreFunction<RecodeUiState>;
  family: FacilityFamily;
  step3Result: StructureStagingResult;
  recodes: StructureRecodes | undefined;
  facilityColumns: InstanceConfigFacilityColumns;
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

  const column = (): StructureRecodableColumn | undefined => {
    if (p.ui.column && columnOptions().includes(p.ui.column)) {
      return p.ui.column;
    }
    return columnOptions().includes("facility_type")
      ? "facility_type"
      : columnOptions().at(0);
  };

  const [newCategory, setNewCategory] = createSignal<string>("");
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(
    JSON.stringify(normalizeRecodes(unwrap(p.ui.assignments))) !==
      JSON.stringify(normalizeRecodes(p.recodes ?? {})),
  );

  // Distinct values of the selected column, with counts (with_csv.tsx pattern:
  // createQuery is one-shot by design, these queries react to the column).
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
    if (res.success === false) {
      setValuesState({ status: "error", err: res.err });
      return;
    }
    if (!p.ui.autoChecked) {
      const noSavedRecodes =
        Object.keys(normalizeRecodes(p.recodes ?? {})).length === 0;
      if (noSavedRecodes) {
        const suggested = res.data.values
          .map((v) => v.value)
          .filter((v) => OTHER_REGEX.test(v));
        if (suggested.length > 0) {
          p.setUi("checkedValues", suggested);
        }
      }
      p.setUi("autoChecked", true);
    }
    setValuesState({ status: "ready", data: res.data });
  }

  createEffect(() => {
    const col = column();
    if (!col) return;
    attemptGetValues(col);
  });

  // Affected rows (deduped, integrate's winners), reacting to
  // column/checkedValues/pageOffset.
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
    if (res.success === false) {
      setRowsState({ status: "error", err: res.err });
      return;
    }
    setRowsState({ status: "ready", data: res.data });
  }

  createEffect(() => {
    const col = column();
    const values = [...p.ui.checkedValues];
    const contextColumns = [...p.ui.contextColumns];
    if (!col || values.length === 0) return;
    attemptGetRows(col, values, contextColumns);
  });

  function onColumnChange(col: StructureRecodableColumn) {
    p.setUi("column", col);
    p.setUi("checkedValues", []);
  }

  function toggleValue(value: string, on: boolean) {
    const next = on
      ? [...p.ui.checkedValues, value]
      : p.ui.checkedValues.filter((v) => v !== value);
    p.setUi("checkedValues", next);
  }

  const targetValues = createMemo<string[]>(() => {
    const col = column();
    const vs = valuesState();
    const out = new Set<string>();
    if (vs.status === "ready") {
      for (const v of vs.data.values) {
        if (v.value === "" || p.ui.checkedValues.includes(v.value)) continue;
        out.add(v.value);
      }
    }
    for (const v of p.ui.customTargets) {
      out.add(v);
    }
    if (col) {
      for (const v of Object.values(p.ui.assignments[col] ?? {})) {
        if (v) out.add(v);
      }
    }
    return [...out];
  });

  // Option object identity must be stable across recomputes: Select renders
  // options with a referentially-keyed <For>, so fresh objects for unchanged
  // values would recreate every <option> element — and removing the selected
  // option resets the native select back to its first entry.
  const keepAsIsOption = {
    value: "",
    label: t3({
      en: "— keep as is —",
      fr: "— conserver tel quel —",
      pt: "— manter como está —",
    }),
  };
  const targetOptionCache = new Map<string, { value: string; label: string }>();
  const targetSelectOptions = createMemo(() =>
    targetValues().map((value) => {
      let opt = targetOptionCache.get(value);
      if (!opt) {
        opt = { value, label: value };
        targetOptionCache.set(value, opt);
      }
      return opt;
    }),
  );

  // Unmapped file columns offerable as display-only context in the table
  const contextColumnOptions = createMemo(() => {
    if (!p.csvDetails || !p.columnMappings) return [];
    const mappedRefs = new Set(
      Object.values(p.columnMappings).filter(
        (v): v is string => typeof v === "string",
      ),
    );
    return p.csvDetails.headers
      .map((header, i) => ({ value: encodeRawCsvHeader(i, header), label: header }))
      .filter(
        (o) => !mappedRefs.has(o.value) && !p.ui.contextColumns.includes(o.value),
      );
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

  function addContextColumn(ref: string) {
    if (!ref || p.ui.contextColumns.includes(ref)) return;
    p.setUi("contextColumns", [...p.ui.contextColumns, ref]);
  }

  function removeContextColumn(ref: string) {
    p.setUi(
      "contextColumns",
      p.ui.contextColumns.filter((r) => r !== ref),
    );
  }

  function addCustomTarget() {
    const v = newCategory().trim();
    if (!v) return;
    if (!p.ui.customTargets.includes(v)) {
      p.setUi("customTargets", [...p.ui.customTargets, v]);
    }
    setNewCategory("");
  }

  // setStore with an object MERGES, so a copy-with-deleted-key would never
  // clear anything: deletion must be an explicit undefined write at the leaf.
  function setAssignment(facilityId: string, value: string) {
    const col = column();
    if (!col) return;
    if (value === "") {
      if (p.ui.assignments[col]) {
        p.setUi("assignments", col, facilityId, undefined as never);
      }
    } else {
      p.setUi("assignments", col, { [facilityId]: value });
    }
    setNeedsSaving(true);
  }

  const assignedCount = () => {
    const col = column();
    return col ? Object.keys(p.ui.assignments[col] ?? {}).length : 0;
  };

  const hasAnyAssignments = () =>
    Object.values(p.ui.assignments).some(
      (m) => m && Object.keys(m).length > 0,
    );

  function blankAwareLabel(value: string): string {
    return value === ""
      ? t3({ en: "(blank)", fr: "(vide)", pt: "(em branco)" })
      : value;
  }

  function buildTableColumns(
    responseColumns: string[],
  ): TableColumn<Record<string, string>>[] {
    return [
      ...responseColumns.map(
        (c): TableColumn<Record<string, string>> => ({
          key: c,
          header: getStructureColumnLabel(c, p.facilityColumns),
        }),
      ),
      ...p.ui.contextColumns.map(
        (ref): TableColumn<Record<string, string>> => ({
          key: ref,
          header: contextColumnLabel(ref),
          render: (row) => row[ref] ?? "",
        }),
      ),
      {
        key: "_assign",
        header: t3({ en: "Assign to", fr: "Réassigner à", pt: "Reatribuir a" }),
        render: (row) => (
          <Select
            size="sm"
            value={p.ui.assignments[column()!]?.[row.facility_id] ?? ""}
            options={[keepAsIsOption, ...targetSelectOptions()]}
            onChange={(v) => setAssignment(row.facility_id, v)}
          />
        ),
      },
    ];
  }

  const save = createFormAction(
    async () => {
      const stagingNonce = p.step3Result.stagingNonce;
      if (!stagingNonce) {
        return {
          success: false,
          err: t3({
            en: "This upload was staged before value reassignment existed — re-stage the data to use this feature.",
            fr: "Ce téléversement a été préparé avant l'existence de la réassignation des valeurs — relancez la préparation pour utiliser cette fonctionnalité.",
            pt: "Este carregamento foi preparado antes de existir a reatribuição de valores — repita a preparação para usar esta funcionalidade.",
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
      <div class="font-700 text-lg">
        {t3({
          en: "Review and reassign values",
          fr: "Vérifier et réassigner les valeurs",
          pt: "Rever e reatribuir valores",
        })}
      </div>
      <div class="text-base-content text-sm">
        {t3({
          en: "Some files classify facilities with values like “Other”. Here you can reassign such values facility by facility before the import writes them. Counts and rows are shown per facility — duplicate rows in your file are already resolved exactly as the import will resolve them. This step is optional — continue to the import if nothing needs reassigning.",
          fr: "Certains fichiers classent les établissements avec des valeurs comme « Autre ». Vous pouvez ici réassigner ces valeurs établissement par établissement avant que l'importation ne les écrive. Les décomptes et les lignes sont présentés par établissement — les lignes en double de votre fichier sont déjà résolues exactement comme l'importation les résoudra. Cette étape est facultative — passez à l'importation si rien n'est à réassigner.",
          pt: "Alguns ficheiros classificam os estabelecimentos com valores como «Outro». Aqui pode reatribuir esses valores estabelecimento a estabelecimento antes de a importação os escrever. As contagens e as linhas são apresentadas por estabelecimento — as linhas duplicadas do seu ficheiro já estão resolvidas exatamente como a importação as resolverá. Esta etapa é opcional — avance para a importação se nada precisar de reatribuição.",
        })}
      </div>

      <Show
        when={columnOptions().length > 0}
        fallback={
          <div class="text-base-content-muted text-sm">
            {t3({
              en: "None of the staged columns can be reassigned. Continue to the import.",
              fr: "Aucune des colonnes préparées ne peut être réassignée. Passez à l'importation.",
              pt: "Nenhuma das colunas preparadas pode ser reatribuída. Avance para a importação.",
            })}
          </div>
        }
      >
        <Select
          value={column()}
          options={columnOptions().map((c) => ({
            value: c,
            label: getStructureColumnLabel(c, p.facilityColumns),
          }))}
          onChange={onColumnChange}
          label={t3({ en: "Column", fr: "Colonne", pt: "Coluna" })}
        />

        <StateHolderWrapper state={valuesState()}>
          {(valuesData) => (
            <div class="ui-pad bg-base-200 ui-spy-sm rounded">
              <div class="font-700">
                {t3({
                  en: "Which values need reassigning?",
                  fr: "Quelles valeurs faut-il réassigner ?",
                  pt: "Que valores precisam de reatribuição?",
                })}
              </div>
              <For each={valuesData.values}>
                {(v) => (
                  <div class="ui-gap-sm flex items-center">
                    <Checkbox
                      checked={p.ui.checkedValues.includes(v.value)}
                      onChange={(on) => toggleValue(v.value, on)}
                      label={
                        <span>
                          {blankAwareLabel(v.value)}{" "}
                          <span class="text-base-content-muted font-mono text-sm">
                            ({toNum0(v.count)})
                          </span>
                        </span>
                      }
                    />
                  </div>
                )}
              </For>
              <Show when={valuesData.truncated}>
                <div class="text-danger text-sm">
                  {t3({
                    en: "This column has more than 200 distinct values — only the 200 most frequent are shown and selectable.",
                    fr: "Cette colonne compte plus de 200 valeurs distinctes — seules les 200 plus fréquentes sont affichées et sélectionnables.",
                    pt: "Esta coluna tem mais de 200 valores distintos — apenas os 200 mais frequentes são mostrados e selecionáveis.",
                  })}
                </div>
              </Show>
            </div>
          )}
        </StateHolderWrapper>

        <Show
          when={p.ui.checkedValues.length > 0}
          fallback={
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "Check one or more values above to list the affected facilities.",
                fr: "Cochez une ou plusieurs valeurs ci-dessus pour lister les établissements concernés.",
                pt: "Marque um ou mais valores acima para listar os estabelecimentos afetados.",
              })}
            </div>
          }
        >
          <div class="ui-gap-sm flex items-end">
            <Input
              value={newCategory()}
              onChange={setNewCategory}
              label={t3({
                en: "New category",
                fr: "Nouvelle catégorie",
                pt: "Nova categoria",
              })}
              size="sm"
            />
            <Button size="sm" onClick={addCustomTarget}>
              {t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
            </Button>
          </div>

          <Show when={p.csvDetails}>
            <div class="ui-gap-sm flex items-end">
              <Select
                size="sm"
                value={undefined}
                options={contextColumnOptions()}
                onChange={addContextColumn}
                label={t3({
                  en: "Show a column from your file",
                  fr: "Afficher une colonne de votre fichier",
                  pt: "Mostrar uma coluna do seu ficheiro",
                })}
                placeholder={t3({
                  en: "Choose a column...",
                  fr: "Choisir une colonne...",
                  pt: "Escolher uma coluna...",
                })}
              />
              <For each={p.ui.contextColumns}>
                {(ref) => (
                  <Button
                    size="sm"
                    iconName="x"
                    onClick={() => removeContextColumn(ref)}
                  >
                    {contextColumnLabel(ref)}
                  </Button>
                )}
              </For>
            </div>
          </Show>

          <StateHolderWrapper state={rowsState()}>
            {(rowsData) => (
              <div class="ui-spy-sm">
                <Table
                  data={rowsData.rows}
                  columns={buildTableColumns(rowsData.columns)}
                  keyField="facility_id"
                  paddingY="compact"
                  tableContentMaxHeight="60vh"
                />

                <Show when={rowsData.total > rowsData.rows.length}>
                  <div class="text-danger text-sm">
                    {t3({
                      en: `Only the first ${toNum0(rowsData.rows.length)} of ${toNum0(rowsData.total)} facilities are shown — uncheck some values to narrow the list.`,
                      fr: `Seuls les ${toNum0(rowsData.rows.length)} premiers établissements sur ${toNum0(rowsData.total)} sont affichés — décochez des valeurs pour restreindre la liste.`,
                      pt: `Apenas os primeiros ${toNum0(rowsData.rows.length)} de ${toNum0(rowsData.total)} estabelecimentos são mostrados — desmarque alguns valores para restringir a lista.`,
                    })}
                  </div>
                </Show>
                <div class="text-sm">
                  {t3({
                    en: `${toNum0(assignedCount())} of ${toNum0(rowsData.total)} facilities assigned`,
                    fr: `${toNum0(assignedCount())} sur ${toNum0(rowsData.total)} établissements assignés`,
                    pt: `${toNum0(assignedCount())} de ${toNum0(rowsData.total)} estabelecimentos atribuídos`,
                  })}
                </div>
              </div>
            )}
          </StateHolderWrapper>
        </Show>

        <Show when={!p.step3Result.stagingNonce}>
          <div class="text-danger text-sm">
            {t3({
              en: "This upload was staged before value reassignment existed — re-stage the data to use this feature.",
              fr: "Ce téléversement a été préparé avant l'existence de la réassignation des valeurs — relancez la préparation pour utiliser cette fonctionnalité.",
              pt: "Este carregamento foi preparado antes de existir a reatribuição de valores — repita a preparação para usar esta funcionalidade.",
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
            <Match when={true}>
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
