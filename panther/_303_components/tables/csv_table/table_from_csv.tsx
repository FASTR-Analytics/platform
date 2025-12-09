// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, Show } from "solid-js";
import { createArray, Csv, getSortedAlphabetical, toNum0 } from "../../deps.ts";

type Props = {
  csv: Csv<string>;
  knownTotalCount: number;
  unsorted?: boolean;
  cellFormatter?: (str: string) => string;
  alignText?: "left" | "center" | "right";
};

export function TableFromCsv(p: Props) {
  const sortedCsv = p.csv
    .selectRows((_, i_row) => i_row < 100)
    .selectCols(
      p.csv.nCols < 50
        ? p.csv.colHeaders
        : createArray(50, (i) => p.csv.colHeaders[i]),
    )
    .selectCols(
      p.unsorted ? p.csv.colHeaders : getSortedAlphabetical(p.csv.colHeaders),
    );

  const colHeaders = sortedCsv.colHeaders;
  const rowHeaders = sortedCsv.rowHeaders;
  const lastRowIndex = sortedCsv.nRows - 1;

  return (
    <div
      class="h-full w-full overflow-auto pb-10 pr-10 text-center data-[align=left]:text-left data-[align=right]:text-right"
      data-align={p.alignText}
    >
      <table class="ui-text-small border-separate border-spacing-0 font-mono">
        <thead class="bg-base-100 sticky top-0 z-50">
          <tr class="">
            <Show when={rowHeaders}>
              <th class="border-base-300 bg-base-100 sticky left-0 top-0 z-10 border-b border-r px-3 py-2">
              </th>
            </Show>
            <For each={colHeaders}>
              {(colHeader) => {
                return (
                  <th class="border-base-300 border-b border-r px-3 py-2 align-bottom">
                    {colHeader}
                  </th>
                );
              }}
            </For>
            <Show when={p.csv.nCols > 50}>
              <th class="font-400 whitespace-pre px-3 py-2 text-center">
                And {toNum0(p.csv.nCols - 50)} more columns...
              </th>
            </Show>
          </tr>
        </thead>
        <tbody>
          <For each={sortedCsv.aoa}>
            {(row, i_row) => {
              return (
                <tr class="">
                  <Show when={rowHeaders}>
                    <th
                      class="border-base-300 bg-base-100 sticky left-0 whitespace-nowrap border-r px-3 py-0.5 text-left data-[lastrow=true]:border-b data-[firstrow=true]:pt-2 data-[lastrow=true]:pb-2"
                      data-firstrow={i_row() === 0}
                      data-lastrow={i_row() === lastRowIndex}
                    >
                      {rowHeaders![i_row()]}
                    </th>
                  </Show>
                  <For each={row}>
                    {(cell) => {
                      return (
                        <td
                          class="border-base-300 col-span-1 whitespace-nowrap border-r px-3 py-0.5 data-[lastrow=true]:border-b data-[firstrow=true]:pt-2 data-[lastrow=true]:pb-2"
                          data-firstrow={i_row() === 0}
                          data-lastrow={i_row() === lastRowIndex}
                        >
                          {p.cellFormatter ? p.cellFormatter(cell) : cell}
                        </td>
                      );
                    }}
                  </For>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
      <Show
        when={p.knownTotalCount > 100}
        fallback={
          <div class="ui-text-small sticky left-0 px-3 py-2 text-left font-mono">
            {toNum0(p.knownTotalCount)} rows
          </div>
        }
      >
        <div class="ui-text-small sticky left-0 px-3 py-2 text-left font-mono">
          ...and {toNum0(p.knownTotalCount - 100)} more rows.{" "}
          {toNum0(p.knownTotalCount)} rows in total.
        </div>
      </Show>
    </div>
  );
}
