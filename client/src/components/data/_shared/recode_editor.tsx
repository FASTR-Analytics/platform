import {
  type StructureRecodableColumn,
  type StructureRecodes,
  type StructureStagedColumnValues,
  type StructureStagedRecodeRows,
  t3,
} from "lib";
import {
  Button,
  Checkbox,
  Input,
  Select,
  type SelectOption,
  type StateHolder,
  StateHolderWrapper,
  Table,
  type TableColumn,
  toNum0,
} from "panther";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

// Mirrors lib/hfa_sentinel_classification.ts's "other" heuristic. Deliberately
// not imported: this is a UI suggestion, not a classification.
const OTHER_REGEX = /\bother\b|\bautre\b|\boutros?\b/i;

// The editor's working state. Hosts hold it above anything that remounts the
// editor, so a refetch never wipes the user's column, checks or targets.
export type RecodeEditorUi = {
  column: StructureRecodableColumn | undefined;
  checkedValues: string[]; // values marked for reassignment
  autoChecked: boolean; // OTHER_REGEX suggestion applied once
  customTargets: string[]; // user-added "new category" values
  contextColumns: string[]; // encoded headers of file columns to display
};

export function emptyRecodeEditorUi(): RecodeEditorUi {
  return {
    column: undefined,
    checkedValues: [],
    autoChecked: false,
    customTargets: [],
    contextColumns: [],
  };
}

// The column the editor shows: the chosen one while it is offered, else
// facility type, else the first offered.
export function currentRecodeColumn(
  chosen: StructureRecodableColumn | undefined,
  columns: StructureRecodableColumn[],
): StructureRecodableColumn | undefined {
  if (chosen && columns.includes(chosen)) {
    return chosen;
  }
  return columns.includes("facility_type") ? "facility_type" : columns.at(0);
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
  ui: RecodeEditorUi;
  onUiChange: (patch: Partial<RecodeEditorUi>) => void;
  columns: StructureRecodableColumn[];
  columnLabel: (column: string) => string;
  // The current column's distinct values, and the facilities holding the
  // checked ones: rows are keyed by facility_id, and carry each context
  // column under its encoded header.
  values: StateHolder<StructureStagedColumnValues>;
  rows: StateHolder<StructureStagedRecodeRows>;
  // The file's columns a user may add as display-only context; none offered
  // hides the picker.
  contextColumnOptions: SelectOption<string>[] | undefined;
  contextColumnLabel: (encodedHeader: string) => string;
  assignments: StructureRecodes;
  // "" returns the facility to its file value.
  onAssign: (
    column: StructureRecodableColumn,
    facilityId: string,
    value: string,
  ) => void;
};

// Per-facility value reassignment: pick a column, check the values to
// reassign, and give each facility holding them a target. Hosts offer at
// least one column.
export function RecodeEditor(p: Props) {
  const column = () => currentRecodeColumn(p.ui.column, p.columns);

  const [newCategory, setNewCategory] = createSignal<string>("");

  createEffect(() => {
    const values = p.values;
    const autoChecked = p.ui.autoChecked;
    const hasAssignments =
      Object.keys(normalizeRecodes(p.assignments)).length > 0;
    if (values.status !== "ready" || autoChecked) {
      return;
    }
    const suggested = values.data.values
      .map((v) => v.value)
      .filter((v) => OTHER_REGEX.test(v));
    p.onUiChange(
      hasAssignments || suggested.length === 0
        ? { autoChecked: true }
        : { autoChecked: true, checkedValues: suggested },
    );
  });

  function toggleValue(value: string, on: boolean) {
    p.onUiChange({
      checkedValues: on
        ? [...p.ui.checkedValues, value]
        : p.ui.checkedValues.filter((v) => v !== value),
    });
  }

  const targetValues = createMemo<string[]>(() => {
    const col = column();
    const values = p.values;
    const checkedValues = [...p.ui.checkedValues];
    const customTargets = [...p.ui.customTargets];
    const assignedTargets = col ? Object.values(p.assignments[col] ?? {}) : [];
    const out = new Set<string>();
    if (values.status === "ready") {
      for (const v of values.data.values) {
        if (v.value !== "" && !checkedValues.includes(v.value)) {
          out.add(v.value);
        }
      }
    }
    for (const v of customTargets) {
      out.add(v);
    }
    for (const v of assignedTargets) {
      if (v) {
        out.add(v);
      }
    }
    return [...out];
  });

  // Option object identity must be stable across recomputes: Select renders
  // options with a referentially-keyed <For>, so fresh objects for unchanged
  // values would recreate every <option> element, and removing the selected
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
    })
  );

  const unusedContextColumnOptions = () =>
    (p.contextColumnOptions ?? []).filter((o) =>
      !p.ui.contextColumns.includes(o.value)
    );

  function addContextColumn(ref: string) {
    if (ref && !p.ui.contextColumns.includes(ref)) {
      p.onUiChange({ contextColumns: [...p.ui.contextColumns, ref] });
    }
  }

  function addCustomTarget() {
    const v = newCategory().trim();
    if (!v) {
      return;
    }
    if (!p.ui.customTargets.includes(v)) {
      p.onUiChange({ customTargets: [...p.ui.customTargets, v] });
    }
    setNewCategory("");
  }

  const assignedCount = () => {
    const col = column();
    return col ? Object.keys(p.assignments[col] ?? {}).length : 0;
  };

  function blankAwareLabel(value: string): string {
    return value === ""
      ? t3({ en: "(blank)", fr: "(vide)", pt: "(em branco)" })
      : value;
  }

  function buildTableColumns(
    col: StructureRecodableColumn,
    responseColumns: string[],
  ): TableColumn<Record<string, string>>[] {
    return [
      ...responseColumns.map(
        (c): TableColumn<Record<string, string>> => ({
          key: c,
          header: p.columnLabel(c),
        }),
      ),
      ...p.ui.contextColumns.map(
        (ref): TableColumn<Record<string, string>> => ({
          key: ref,
          header: p.contextColumnLabel(ref),
          render: (row) => row[ref] ?? "",
        }),
      ),
      {
        key: "_assign",
        header: t3({ en: "Assign to", fr: "Réassigner à", pt: "Reatribuir a" }),
        render: (row) => (
          <Select
            size="sm"
            value={p.assignments[col]?.[row.facility_id] ?? ""}
            options={[keepAsIsOption, ...targetSelectOptions()]}
            onChange={(v) => p.onAssign(col, row.facility_id, v)}
          />
        ),
      },
    ];
  }

  return (
    <Show when={column()}>
      {(col) => (
        <div class="ui-spy">
          <Select
            value={col()}
            options={p.columns.map((c) => ({
              value: c,
              label: p.columnLabel(c),
            }))}
            onChange={(c) => p.onUiChange({ column: c, checkedValues: [] })}
            label={t3({ en: "Column", fr: "Colonne", pt: "Coluna" })}
          />

          <StateHolderWrapper state={p.values}>
            {(valuesData) => (
              <div class="ui-pad bg-base-200 ui-spy-sm rounded">
                <div class="ui-text-heading">
                  {t3({
                    en: "Which values need reassigning?",
                    fr: "Quelles valeurs faut-il réassigner ?",
                    pt: "Que valores precisam de reatribuição?",
                  })}
                </div>
                <For each={valuesData.values}>
                  {(v) => (
                    <Checkbox
                      checked={p.ui.checkedValues.includes(v.value)}
                      onChange={(on) => toggleValue(v.value, on)}
                      label={
                        <span>
                          {blankAwareLabel(v.value)}{" "}
                          <span class="text-base-content-muted text-sm">
                            ({toNum0(v.count)})
                          </span>
                        </span>
                      }
                    />
                  )}
                </For>
                <Show when={valuesData.truncated}>
                  <div class="text-danger text-sm">
                    {t3({
                      en:
                        "This column has more than 200 distinct values — only the 200 most frequent are shown and selectable.",
                      fr:
                        "Cette colonne compte plus de 200 valeurs distinctes — seules les 200 plus fréquentes sont affichées et sélectionnables.",
                      pt:
                        "Esta coluna tem mais de 200 valores distintos — apenas os 200 mais frequentes são mostrados e selecionáveis.",
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
                  en:
                    "Check one or more values above to list the affected facilities.",
                  fr:
                    "Cochez une ou plusieurs valeurs ci-dessus pour lister les établissements concernés.",
                  pt:
                    "Marque um ou mais valores acima para listar os estabelecimentos afetados.",
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

            <Show when={p.contextColumnOptions}>
              <div class="ui-gap-sm flex items-end">
                <Select
                  size="sm"
                  value={undefined}
                  options={unusedContextColumnOptions()}
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
                      onClick={() =>
                        p.onUiChange({
                          contextColumns: p.ui.contextColumns.filter((r) =>
                            r !== ref
                          ),
                        })}
                    >
                      {p.contextColumnLabel(ref)}
                    </Button>
                  )}
                </For>
              </div>
            </Show>

            <StateHolderWrapper state={p.rows}>
              {(rowsData) => (
                <div class="ui-spy-sm">
                  <Table
                    data={rowsData.rows}
                    columns={buildTableColumns(col(), rowsData.columns)}
                    keyField="facility_id"
                    paddingY="compact"
                    maxHeight="60vh"
                  />
                  <Show when={rowsData.total > rowsData.rows.length}>
                    <div class="text-danger text-sm">
                      {t3({
                        en: `Only the first ${
                          toNum0(rowsData.rows.length)
                        } of ${
                          toNum0(rowsData.total)
                        } facilities are shown — uncheck some values to narrow the list.`,
                        fr: `Seuls les ${
                          toNum0(rowsData.rows.length)
                        } premiers établissements sur ${
                          toNum0(rowsData.total)
                        } sont affichés — décochez des valeurs pour restreindre la liste.`,
                        pt: `Apenas os primeiros ${
                          toNum0(rowsData.rows.length)
                        } de ${
                          toNum0(rowsData.total)
                        } estabelecimentos são mostrados — desmarque alguns valores para restringir a lista.`,
                      })}
                    </div>
                  </Show>
                  <div class="text-sm">
                    {t3({
                      en: `${toNum0(assignedCount())} of ${
                        toNum0(rowsData.total)
                      } facilities assigned`,
                      fr: `${toNum0(assignedCount())} sur ${
                        toNum0(rowsData.total)
                      } établissements assignés`,
                      pt: `${toNum0(assignedCount())} de ${
                        toNum0(rowsData.total)
                      } estabelecimentos atribuídos`,
                    })}
                  </div>
                </div>
              )}
            </StateHolderWrapper>
          </Show>
        </div>
      )}
    </Show>
  );
}
