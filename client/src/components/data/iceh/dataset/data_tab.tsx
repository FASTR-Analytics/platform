import { t3, type IcehDataRow } from "lib";
import { Csv, TableFromCsv } from "panther";
import { createMemo } from "solid-js";

export function DataTab(p: { dataRows: IcehDataRow[] }) {
  const csv = createMemo(() => Csv.fromObjects(p.dataRows));

  return (
    <TableFromCsv
      csv={csv()}
      knownTotalCount={p.dataRows.length}
      cellFormatter={(str) =>
        str === "null" || str === "undefined" ? "-" : str
      }
      alignText="left"
      unsorted
    />
  );
}
