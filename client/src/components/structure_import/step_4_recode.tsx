import {
  t3,
  TC,
  _RECODABLE_FACILITY_COLUMNS,
  type FacilityFamily,
  type InstanceConfigFacilityColumns,
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

const _PAGE_SIZE = 100;

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
  pageOffset: number;
};

export function emptyRecodeUiState(): RecodeUiState {
  return {
    stagingNonce: undefined,
    column: undefined,
    checkedValues: [],
    autoChecked: false,
    assignments: {},
    customTargets: [],
    pageOffset: 0,
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

  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = createSignal<string>("");
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
    offset: number,
  ) {
    const runId = ++rowsRunId;
    setRowsState({ status: "loading", msg: t3(TC.fetchingData) });
    const res = await serverActions.getStructureStagedRecodeRows({
      family: p.family,
      column: col,
      values,
      offset,
      limit: _PAGE_SIZE,
    });
    if (runId !== rowsRunId) return;
    if (res.success === false) {
      setRowsState({ status: "error", err: res.err });
      return;
    }
    if (offset > 0 && res.data.total <= offset) {
      p.setUi("pageOffset", 0);
      return;
    }
    setRowsState({ status: "ready", data: res.data });
  }

  createEffect(() => {
    const col = column();
    const values = [...p.ui.checkedValues];
    const offset = p.ui.pageOffset;
    if (!col || values.length === 0) return;
    attemptGetRows(col, values, offset);
  });

  function onColumnChange(col: StructureRecodableColumn) {
    p.setUi("column", col);
    p.setUi("checkedValues", []);
    p.setUi("pageOffset", 0);
    setSelectedIds(new Set<string>());
  }

  function toggleValue(value: string, on: boolean) {
    const next = on
      ? [...p.ui.checkedValues, value]
      : p.ui.checkedValues.filter((v) => v !== value);
    p.setUi("checkedValues", next);
    p.setUi("pageOffset", 0);
    setSelectedIds(new Set<string>());
  }

  function setPageOffset(offset: number) {
    p.setUi("pageOffset", offset);
    setSelectedIds(new Set<string>());
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

  function applyBulkAssignment() {
    const col = column();
    const target = bulkTarget();
    if (!col || !target) return;
    p.setUi(
      "assignments",
      col,
      Object.fromEntries([...selectedIds()].map((fid) => [fid, target])),
    );
    setSelectedIds(new Set<string>());
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
      {
        key: "_select",
        header: "",
        render: (row) => (
          <Checkbox
            checked={selectedIds().has(row.facility_id)}
            onChange={(on) => {
              const next = new Set(selectedIds());
              if (on) {
                next.add(row.facility_id);
              } else {
                next.delete(row.facility_id);
              }
              setSelectedIds(next);
            }}
            label=""
          />
        ),
      },
      ...responseColumns.map(
        (c): TableColumn<Record<string, string>> => ({
          key: c,
          header: getStructureColumnLabel(c, p.facilityColumns),
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
          en: "Some files classify facilities with values like “Other”. Here you can reassign such values facility by facility before the import writes them. This step is optional — continue to the import if nothing needs reassigning.",
          fr: "Certains fichiers classent les établissements avec des valeurs comme « Autre ». Vous pouvez ici réassigner ces valeurs établissement par établissement avant que l'importation ne les écrive. Cette étape est facultative — passez à l'importation si rien n'est à réassigner.",
          pt: "Alguns ficheiros classificam os estabelecimentos com valores como «Outro». Aqui pode reatribuir esses valores estabelecimento a estabelecimento antes de a importação os escrever. Esta etapa é opcional — avance para a importação se nada precisar de reatribuição.",
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

          <StateHolderWrapper state={rowsState()}>
            {(rowsData) => (
              <div class="ui-spy-sm">
                <div class="ui-gap-sm flex items-center">
                  <Checkbox
                    checked={
                      rowsData.rows.length > 0 &&
                      rowsData.rows.every((r) =>
                        selectedIds().has(r.facility_id),
                      )
                    }
                    onChange={(on) => {
                      setSelectedIds(
                        on
                          ? new Set(rowsData.rows.map((r) => r.facility_id))
                          : new Set<string>(),
                      );
                    }}
                    label={t3({
                      en: "Select all on this page",
                      fr: "Tout sélectionner sur cette page",
                      pt: "Selecionar tudo nesta página",
                    })}
                  />
                  <Select
                    size="sm"
                    value={bulkTarget()}
                    options={targetSelectOptions()}
                    onChange={setBulkTarget}
                    placeholder={t3({
                      en: "Choose a value...",
                      fr: "Choisir une valeur...",
                      pt: "Escolher um valor...",
                    })}
                  />
                  <Button
                    size="sm"
                    onClick={applyBulkAssignment}
                    disabled={selectedIds().size === 0 || !bulkTarget()}
                  >
                    {t3({
                      en: "Assign selected",
                      fr: "Assigner la sélection",
                      pt: "Atribuir selecionados",
                    })}
                  </Button>
                </div>

                <Table
                  data={rowsData.rows}
                  columns={buildTableColumns(rowsData.columns)}
                  keyField="facility_id"
                  paddingY="compact"
                />

                <div class="ui-gap-sm flex items-center">
                  <Button
                    size="sm"
                    onClick={() =>
                      setPageOffset(Math.max(0, p.ui.pageOffset - _PAGE_SIZE))
                    }
                    disabled={p.ui.pageOffset === 0}
                  >
                    {t3({ en: "Previous", fr: "Précédent", pt: "Anterior" })}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setPageOffset(p.ui.pageOffset + _PAGE_SIZE)}
                    disabled={
                      p.ui.pageOffset + rowsData.rows.length >= rowsData.total
                    }
                  >
                    {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
                  </Button>
                  <div class="text-base-content-muted text-sm">
                    {t3({
                      en: `Showing ${toNum0(p.ui.pageOffset + 1)}–${toNum0(p.ui.pageOffset + rowsData.rows.length)} of ${toNum0(rowsData.total)}`,
                      fr: `Affichage de ${toNum0(p.ui.pageOffset + 1)}–${toNum0(p.ui.pageOffset + rowsData.rows.length)} sur ${toNum0(rowsData.total)}`,
                      pt: `A mostrar ${toNum0(p.ui.pageOffset + 1)}–${toNum0(p.ui.pageOffset + rowsData.rows.length)} de ${toNum0(rowsData.total)}`,
                    })}
                  </div>
                  <div class="text-sm">
                    {t3({
                      en: `${toNum0(assignedCount())} of ${toNum0(rowsData.total)} rows assigned`,
                      fr: `${toNum0(assignedCount())} sur ${toNum0(rowsData.total)} lignes assignées`,
                      pt: `${toNum0(assignedCount())} de ${toNum0(rowsData.total)} linhas atribuídas`,
                    })}
                  </div>
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
