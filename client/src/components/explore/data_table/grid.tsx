import { t3 } from "lib";
import { DataGrid, type DataGridHit, type DataGridProps } from "panther";
import { createMemo, createSignal, Show } from "solid-js";

export type GridProps = Pick<
  DataGridProps,
  "columns" | "columnGroups" | "rows" | "cells"
>;

// A column's full name: its group's label first when it has one.
export function columnLabel(grid: GridProps, columnId: string): string {
  const column = grid.columns.find((c) => c.id === columnId);
  if (column === undefined) return columnId;
  const group = grid.columnGroups?.find((g) => g.id === column.groupId);
  return group === undefined ? column.label : `${group.label} · ${column.label}`;
}

export function Grid(p: {
  grid: GridProps;
  rowHeaderLabel: string;
  focusColumnId: string | null;
}) {
  const [hover, setHover] = createSignal<DataGridHit | null>(null);
  const rowLabels = createMemo(
    () => new Map(p.grid.rows.map((r) => [r.id, r.label])),
  );

  return (
    <div class="ui-gap-sm flex h-full flex-col">
      <div class="h-0 flex-1">
        <DataGrid
          columns={p.grid.columns}
          columnGroups={p.grid.columnGroups}
          rows={p.grid.rows}
          cells={p.grid.cells}
          rowHeaderLabel={p.rowHeaderLabel}
          fitToAvailableHeight
          onCellHover={setHover}
          focusColumnId={p.focusColumnId}
        />
      </div>
      <div class="ui-text-caption h-4 flex-none truncate">
        <Show when={hover()} keyed>
          {(hit) =>
            `${rowLabels().get(hit.rowId) ?? hit.rowId} · ${
              columnLabel(p.grid, hit.columnId)
            }: ${hit.cell?.text ?? "–"}`}
        </Show>
      </div>
    </div>
  );
}

export function GridMessage(p: {
  status: "no_data_available" | "too_many_cells" | "no_preset";
}) {
  return (
    <div class="text-base-content-muted text-sm">
      {p.status === "too_many_cells"
        ? t3({
          en: "This selection has too many values to show. Choose fewer indicators, or a coarser time grain.",
          fr: "Cette sélection contient trop de valeurs pour être affichée. Choisissez moins d'indicateurs ou un pas de temps plus large.",
          pt: "Esta seleção tem demasiados valores para mostrar. Escolha menos indicadores ou uma granularidade temporal maior.",
        })
        : p.status === "no_preset"
        ? t3({
          en: "This metric declares no visualization preset",
          fr: "Cet indicateur ne déclare aucune visualisation prédéfinie",
          pt: "Esta métrica não declara nenhuma visualização predefinida",
        })
        : t3({
          en: "No data for this selection",
          fr: "Aucune donnée pour cette sélection",
          pt: "Nenhum dado para esta seleção",
        })}
    </div>
  );
}
