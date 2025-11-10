import { ReportItemConfig, getStartingReportItemPlaceholder, t2, T } from "lib";
import {
  LabelHolder,
  Select,
  getSelectOptions,
  getWithElementMovedToNext,
  getWithElementMovedToPrev,
} from "panther";
import { For, Setter, Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { t } from "lib";

type Props = {
  projectId: string;
  tempReportItemConfig: ReportItemConfig;
  setTempReportItemConfig: SetStoreFunction<ReportItemConfig>;
  selectedRowCol: number[];
  setSelectedRowCol: Setter<number[]>;
};

export function ReportItemEditorPanelContentBox(p: Props) {
  async function addRow() {
    p.setTempReportItemConfig("freeform", "content", (prev) => {
      return [...prev, [getStartingReportItemPlaceholder()]];
    });
    p.setSelectedRowCol([
      p.tempReportItemConfig.freeform.content.length - 1,
      0,
    ]);
  }

  async function addCol(iRow: number) {
    p.setTempReportItemConfig("freeform", "content", iRow, (prev) => {
      return [...prev, getStartingReportItemPlaceholder()];
    });
    p.setSelectedRowCol([
      iRow,
      (p.tempReportItemConfig.freeform.content.at(iRow)?.length ?? 1) - 1,
    ]);
  }

  async function moveRow(upOrDown: "up" | "down") {
    const iRow = p.selectedRowCol[0];
    const iCol = p.selectedRowCol[1];
    p.setTempReportItemConfig("freeform", "content", (prev) => {
      if (upOrDown === "up") {
        return getWithElementMovedToPrev(prev, iRow);
      } else {
        return getWithElementMovedToNext(prev, iRow);
      }
    });
    p.setSelectedRowCol((prev) => {
      if (upOrDown === "up") {
        return [Math.max(0, iRow - 1), prev[1]];
      } else {
        return [
          Math.min(
            p.tempReportItemConfig.freeform.content.length - 1,
            iRow + 1,
          ),
          prev[1],
        ];
      }
    });
  }

  async function moveCol(leftOrRight: "left" | "right") {
    const iRow = p.selectedRowCol[0];
    const iCol = p.selectedRowCol[1];
    p.setTempReportItemConfig("freeform", "content", iRow, (prev) => {
      if (leftOrRight === "left") {
        return getWithElementMovedToPrev(prev, iCol);
      } else {
        return getWithElementMovedToNext(prev, iCol);
      }
    });
    p.setSelectedRowCol((prev) => {
      if (leftOrRight === "left") {
        return [iRow, Math.max(0, iCol - 1)];
      } else {
        return [
          iRow,
          Math.min(
            (p.tempReportItemConfig.freeform.content[iRow]?.length ?? 1) - 1,
            iRow + 1,
          ),
        ];
      }
    });
  }

  async function deleteRow(iRow: number) {
    p.setSelectedRowCol([0, 0]);
    p.setTempReportItemConfig("freeform", "content", (prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.toSpliced(iRow, 1);
    });
  }

  async function deleteSelectedCol() {
    const iRow = p.selectedRowCol[0];
    const iCol = p.selectedRowCol[1];
    p.setSelectedRowCol([iRow, 0]);
    p.setTempReportItemConfig("freeform", "content", iRow, (prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.toSpliced(iCol, 1);
    });
  }

  const canDeleteSelectedCol = () => {
    const iRow = p.selectedRowCol[0];
    const iCol = p.selectedRowCol[1];
    return p.tempReportItemConfig.freeform.content[iRow]?.length > 1;
  };

  const isSelected = (iRow: number, iCol: number) => {
    return p.selectedRowCol[0] === iRow && p.selectedRowCol[1] === iCol;
  };

  const selectedItem = () => {
    const iRow = p.selectedRowCol[0];
    const iCol = p.selectedRowCol[1];
    return p.tempReportItemConfig.freeform.content.at(iRow)?.at(iCol);
  };

  async function updateSpan(span: number | undefined) {
    const [iRow, iCol] = p.selectedRowCol;
    p.setTempReportItemConfig("freeform", "content", iRow, iCol, "span", span);
  }

  return (
    <div class="ui-pad">
      <LabelHolder label="Layout">
        <div class="ui-spy-sm rounded border border-base-300 p-3">
          <For each={p.tempReportItemConfig.freeform.content}>
            {(row, i_row) => {
              return (
                <div class="ui-gap-sm flex">
                  <For each={row}>
                    {(col, i_col) => {
                      return (
                        <div
                          class="ui-hoverable ui-pad-sm flex h-12 w-0 flex-1 items-center justify-center truncate rounded border bg-neutral text-sm text-base-100 data-[selected=true]:bg-base-content"
                          onClick={() =>
                            p.setSelectedRowCol([i_row(), i_col()])
                          }
                          data-selected={isSelected(i_row(), i_col())}
                        >
                          {col.span ?? "Auto"}
                        </div>
                      );
                    }}
                  </For>
                  <div class="flex flex-col justify-center">
                    <span
                      class="cursor-pointer text-sm text-success hover:underline"
                      onClick={() => addCol(i_row())}
                    >
                      {t2(T.FRENCH_UI_STRINGS.add_col)}
                    </span>
                    <Show
                      when={p.tempReportItemConfig.freeform.content.length > 1}
                    >
                      <span
                        class="cursor-pointer text-sm text-danger hover:underline"
                        onClick={() => deleteRow(i_row())}
                      >
                        {t2(T.FRENCH_UI_STRINGS.del_row)}
                      </span>
                    </Show>
                  </div>
                  <Show
                    when={
                      p.tempReportItemConfig.freeform.content.length > 1 &&
                      i_row() === p.selectedRowCol[0]
                    }
                    fallback={
                      <div class="">
                        <span class="pointer-events-none bg-base-100 px-2 opacity-0">
                          &uarr;
                        </span>
                      </div>
                    }
                  >
                    <div class="flex flex-col justify-center gap-1">
                      <span
                        class="ui-hoverable cursor-pointer rounded bg-base-200 px-2 text-sm text-base-content"
                        onClick={() => moveRow("up")}
                      >
                        &uarr;
                      </span>
                      <span
                        class="ui-hoverable cursor-pointer rounded bg-base-200 px-2 text-sm text-base-content"
                        onClick={() => moveRow("down")}
                      >
                        &darr;
                      </span>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
          <div class="flex flex-col">
            <Show
              when={canDeleteSelectedCol() && selectedItem()}
              fallback={
                <div class="">
                  <span
                    class="cursor-pointer text-sm text-success hover:underline"
                    onClick={addRow}
                  >
                    {t2(T.FRENCH_UI_STRINGS.add_row)}
                  </span>
                </div>
              }
              keyed
            >
              {(keyedItem) => {
                return (
                  <div class="ui-spy-sm">
                    <div class="ui-gap flex items-start justify-start">
                      <div class="">
                        <span
                          class="cursor-pointer text-sm text-success hover:underline"
                          onClick={addRow}
                        >
                          {t2(T.FRENCH_UI_STRINGS.add_row)}
                        </span>
                        <br />
                        <span
                          class="cursor-pointer text-sm text-danger hover:underline"
                          onClick={deleteSelectedCol}
                        >
                          {t2(T.FRENCH_UI_STRINGS.delete_selected_col)}
                        </span>
                      </div>
                    </div>
                    <div class="ui-gap flex items-start">
                      <LabelHolder label={t2(T.FRENCH_UI_STRINGS.move_col)}>
                        <div class="flex gap-1">
                          <span
                            class="ui-hoverable cursor-pointer rounded bg-base-200 px-2 py-1 text-sm text-base-content"
                            onClick={() => moveCol("left")}
                          >
                            &larr;
                          </span>
                          <span
                            class="ui-hoverable cursor-pointer rounded bg-base-200 px-2 py-1 text-sm text-base-content"
                            onClick={() => moveCol("right")}
                          >
                            &rarr;
                          </span>
                        </div>
                      </LabelHolder>
                      <div class="flex-1">
                        <Select
                          label={t2(T.FRENCH_UI_STRINGS.col_span)}
                          options={getSelectOptions([
                            "1",
                            "2",
                            "3",
                            "4",
                            "5",
                            "6",
                            "7",
                            "8",
                            "9",
                            "10",
                            "11",
                            "12",
                            "Auto",
                          ])}
                          value={
                            keyedItem.span === undefined
                              ? "Auto"
                              : String(keyedItem.span)
                          }
                          onChange={(v) =>
                            updateSpan(v === "Auto" ? undefined : Number(v))
                          }
                          fullWidth
                        />
                      </div>
                    </div>
                  </div>
                );
              }}
            </Show>
          </div>
        </div>
      </LabelHolder>
    </div>
  );
}
