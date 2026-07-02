import { hashFacilityColumnsConfig, ItemsHolderStructure, t3, TC, type FacilityFamily } from "lib";
import { Csv, StateHolder, StateHolderWrapper, TableFromCsv } from "panther";
import { createEffect, createMemo, createSignal } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";
import { getStructureItemsFromCacheOrFetch } from "~/state/instance/t2_structure";

type Props = {
  family: FacilityFamily;
  onCsvReady?: (csv: Csv<any>) => void;
};

export function StructureWithCsv(p: Props) {
  const [structureItems, setStructureItems] = createSignal<
    StateHolder<ItemsHolderStructure>
  >({
    status: "loading",
    msg: t3(TC.fetchingData),
  });

  async function attemptGetStructureItems(lastUpdated: string, maxAA: number, fcHash: string) {
    setStructureItems({
      status: "loading",
      msg: t3(TC.fetchingData),
    });
    const res = await getStructureItemsFromCacheOrFetch(p.family, lastUpdated, maxAA, fcHash);
    if (res.success === false) {
      setStructureItems({ status: "error", err: res.err });
      return;
    }
    if (res.data.items.length === 0) {
      setStructureItems({
        status: "error",
        err: t3({ en: "No rows", fr: "Aucune ligne", pt: "Nenhuma linha" }),
      });
      return;
    }
    setStructureItems({
      status: "ready",
      data: res.data,
    });
  }

  createEffect(() => {
    const lastUpdated = instanceState.structureLastUpdated;
    const maxAA = instanceState.maxAdminArea;
    const fcHash = hashFacilityColumnsConfig(instanceState.facilityColumns);
    if (!lastUpdated) {
      setStructureItems({
        status: "error",
        err: t3({ en: "No structure data", fr: "Aucune donnée de structure", pt: "Nenhum dado de estrutura" }),
      });
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
