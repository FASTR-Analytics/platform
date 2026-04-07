import { ItemsHolderStructure, t3, TC } from "lib";
import { Csv, StateHolder, StateHolderWrapper, TableFromCsv } from "panther";
import { createEffect, createMemo, createSignal } from "solid-js";
import { instanceState } from "~/state/instance_state";
import { getStructureItemsFromCacheOrFetch } from "~/state/instance_data_caches";

type Props = {
  onCsvReady?: (csv: Csv<any>) => void;
};

export function StructureWithCsv(p: Props) {
  const [structureItems, seStructureItems] = createSignal<
    StateHolder<ItemsHolderStructure>
  >({
    status: "loading",
    msg: t3(TC.fetchingData),
  });

  async function attemptGetStructureItems() {
    seStructureItems({
      status: "loading",
      msg: t3(TC.fetchingData),
    });
    const lastUpdated = instanceState.structureLastUpdated;
    if (!lastUpdated) {
      seStructureItems({ status: "error", err: "No structure data" });
      return;
    }
    const maxAA = instanceState.maxAdminArea;
    const fcHash = Object.values(instanceState.facilityColumns).sort().join("_");
    const res = await getStructureItemsFromCacheOrFetch(lastUpdated, maxAA, fcHash);
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
    attemptGetStructureItems();
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
