import {
  csvIndicatorValueFromCell,
  HMIS_CSV_MAX_DISTINCT_INDICATOR_VALUES,
  type HmisCsvColumns,
  type HmisCsvIndicatorValue,
  throwIfErrWithData,
} from "lib";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";

// The scan behind the wizard's mapping step (PLAN_A6 ruling 4): every
// distinct value the file's indicator column says, derived from the cell
// exactly as the stage leg derives it, with its row count, sorted by
// descending row count. An empty cell is no value: staging drops that row
// as missing a required field. Above the cap the scan refuses with the
// count and the column, since a mapping the user cannot complete is worse
// than a refusal and that many values almost always means the wrong column.
export async function scanHmisCsvIndicatorValues(args: {
  csvFilePath: string;
  columns: HmisCsvColumns;
}): Promise<HmisCsvIndicatorValue[]> {
  const resComponents = await getCsvStreamComponents(args.csvFilePath);
  throwIfErrWithData(resComponents);
  const { encodedHeaderToIndexMap, processRows } = resComponents.data;
  const dataIdIndex = getCsvColumnIndex(
    encodedHeaderToIndexMap,
    args.columns as unknown as Record<string, string>,
    "data_id",
  );
  const counts = new Map<string, number>();
  await processRows((row) => {
    const value = csvIndicatorValueFromCell(row[dataIdIndex] ?? "");
    if (value === "") return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  if (counts.size > HMIS_CSV_MAX_DISTINCT_INDICATOR_VALUES) {
    throw new Error(
      `The indicator column (${args.columns.data_id}) has ${counts.size} distinct values, more than the ${HMIS_CSV_MAX_DISTINCT_INDICATOR_VALUES} an import can map. Check that the right column was chosen.`,
    );
  }
  return [...counts]
    .map(([value, rowCount]) => ({ value, rowCount }))
    .sort((a, b) => b.rowCount - a.rowCount || a.value.localeCompare(b.value));
}
