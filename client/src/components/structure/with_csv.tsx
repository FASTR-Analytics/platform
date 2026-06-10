import { ItemsHolderStructure, t3, TC, type FacilityFamily } from "lib";
import { Csv, StateHolder, StateHolderWrapper, TableFromCsv } from "panther";
import { createEffect, createMemo, createSignal } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";
import { getStructureItemsFromCacheOrFetch } from "~/state/instance/t2_structure";

type Props = {
  family: FacilityFamily;
  onCsvReady?: (csv: Csv<any>) => void;
};

export function StructureWithCsv(p: Props) {
  const [structureItems, seStructureItems] = createSignal<
    StateHolder<ItemsHolderStructure>
  >({
    status: "loading",
    msg: t3(TC.fetchingData),
  });

  async function attemptGetStructureItems(lastUpdated: string, maxAA: number, fcHash: string) {
    seStructureItems({
      status: "loading",
      msg: t3(TC.fetchingData),
    });
    const res = await getStructureItemsFromCacheOrFetch(p.family, lastUpdated, maxAA, fcHash);
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
    const lastUpdated = instanceState.structureLastUpdated;
    const maxAA = instanceState.maxAdminArea;
    const fcHash = Object.values(instanceState.facilityColumns).sort().join("_");
    if (!lastUpdated) {
      seStructureItems({ status: "error", err: "No structure data" });
      return;
    }
    attemptGetStructureItems(lastUpdated, maxAA, fcHash);
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
