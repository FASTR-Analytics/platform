import { ItemsHolderStructure, t, t2, T } from "lib";
import { Csv, StateHolder, StateHolderWrapper, TableFromCsv } from "panther";
import { createEffect, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  onCsvReady?: (csv: Csv<any>) => void;
};

export function StructureWithCsv(p: Props) {
  const [structureItems, seStructureItems] = createSignal<
    StateHolder<ItemsHolderStructure>
  >({
    status: "loading",
    msg: t2(T.FRENCH_UI_STRINGS.fetching_data),
  });

  async function attemptGeStructureItems() {
    seStructureItems({
      status: "loading",
      msg: t2(T.FRENCH_UI_STRINGS.fetching_data),
    });
    const res = await serverActions.getStructureItems({});
    if (res.success === false) {
      seStructureItems({ status: "error", err: res.err });
      return;
    }
    if (res.data.items.length === 0) {
      seStructureItems({ status: "error", err: "No rows" });
      return;
    }
    seStructureItems({
      status: "ready",
      data: res.data,
    });
  }

  createEffect(() => {
    attemptGeStructureItems();
  });

  return (
    <StateHolderWrapper state={structureItems()}>
      {(keyedFacilitiesItems) => {
        const csv = createMemo(() => {
          const csvData = Csv.fromObjects(keyedFacilitiesItems.items);
          // Notify parent when CSV is ready
          if (p.onCsvReady) {
            p.onCsvReady(csvData);
          }
          return csvData;
        });
        return (
          <TableFromCsv
            csv={csv()}
            knownTotalCount={keyedFacilitiesItems.totalCount}
            cellFormatter={(str) =>
              str === "null" || str === "undefined" ? "." : str
            }
            alignText="left"
          />
        );
      }}
    </StateHolderWrapper>
  );
}
