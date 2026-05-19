import { t3 } from "lib";
import { Csv, StateHolderWrapper, TableFromCsv, timQuery } from "panther";
import { createMemo } from "solid-js";
import { serverActions } from "~/server_actions";

export function DataTab() {
  const data = timQuery(
    async () => serverActions.getDatasetIcehData({}),
    t3({ en: "Loading data...", fr: "Chargement des données..." })
  );

  return (
    <StateHolderWrapper state={data.state()}>
      {(rows) => {
        const csv = createMemo(() => Csv.fromObjects(rows));
        return (
          <div class="ui-pad h-full w-full">
            <TableFromCsv
              csv={csv()}
              knownTotalCount={rows.length}
              cellFormatter={(str) =>
                str === "null" || str === "undefined" ? "-" : str
              }
              alignText="left"
              unsorted
            />
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}
