// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ColGroup,
  isTableDataJson,
  isTableDataTransformed,
  type RowGroup,
  type TableData,
  type TableDataTransformed,
  type TableJsonDataConfig,
} from "./types.ts";
import {
  assert,
  createArray,
  type HeaderSortConfig,
  type JsonArray,
  type JsonArrayItem,
  sortAlphabetical,
} from "./deps.ts";

export function getTableDataTransformed(d: TableData): TableDataTransformed {
  if (isTableDataJson(d)) {
    return getTableDataJsonTransformed(d.jsonArray, d.jsonDataConfig);
  }
  if (isTableDataTransformed(d)) {
    return d;
  }
  throw new Error("Should not be possible");
}

function getTableDataJsonTransformed(
  jsonArray: JsonArray,
  jsonDataConfig: TableJsonDataConfig,
): TableDataTransformed {
  const {
    valueProps,
    colProp,
    rowProp,
    colGroupProp,
    rowGroupProp,
    labelReplacements,
    sort,
  } = jsonDataConfig;

  if (valueProps.length === 0) {
    throw new Error("Need at least one valueProp");
  }

  // Collect unique combinations using Sets for better performance.
  // Combos hold raw ids only (`groupId:::itemId`); labels are resolved later.
  const { colGroupCombos, rowGroupCombos } = collectUniqueCombos(
    jsonArray,
    valueProps,
    colGroupProp,
    colProp,
    rowGroupProp,
    rowProp,
  );

  const colCombosSorted = applyTableSort(colGroupCombos, sort?.col);
  const rowCombosSorted = applyTableSort(rowGroupCombos, sort?.row);

  const colGroups = createGroups(colCombosSorted, labelReplacements, "col");
  const rowGroups = createGroups(rowCombosSorted, labelReplacements, "row");

  // Create lookup maps for O(1) performance (keyed by sorted combo order)
  const colComboToIndex = new Map(
    colCombosSorted.map((combo, index) => [combo, index]),
  );
  const rowComboToIndex = new Map(
    rowCombosSorted.map((combo, index) => [combo, index]),
  );

  // Initialize the data array
  const aoa: string[][] = createArray(
    rowCombosSorted.length,
    () => createArray(colCombosSorted.length, UNDEFINED_PLACEHOLDER),
  );

  // Fill the data array
  fillDataArray(
    aoa,
    jsonArray,
    valueProps,
    colGroupProp,
    colProp,
    rowGroupProp,
    rowProp,
    colComboToIndex,
    rowComboToIndex,
  );

  // Replace undefined placeholders with dots
  const aoaWithMissing = aoa.map((row) =>
    row.map((cell) => (cell === UNDEFINED_PLACEHOLDER ? "." : cell))
  );

  return {
    isTransformed: true,
    colGroups,
    rowGroups,
    aoa: aoaWithMissing,
  };
}

///////////////////////////////////////////////////////////////////////////////
// Helper functions
///////////////////////////////////////////////////////////////////////////////

const UNDEFINED_PLACEHOLDER = "___";
const SEPARATOR = ":::";

// Table sorting operates on raw-id combo strings, so it supports `by-id` /
// `by-label` (alphabetical on the combo) and `{ byIdOrder }` (custom id order).
// `byLabelOrder` and arbitrary HeaderSortFunc are not expressible here — see
// PLAN_TABLE_SORTING.md for the planned structured per-axis sort.
function applyTableSort(
  combos: string[],
  sortConfig: HeaderSortConfig | undefined,
): string[] {
  if (sortConfig === undefined) {
    return combos;
  }
  const out = [...combos];
  if (typeof sortConfig === "object" && "byIdOrder" in sortConfig) {
    sortByCustomOrder(out, sortConfig.byIdOrder);
    return out;
  }
  if (sortConfig === "by-id" || sortConfig === "by-label") {
    sortAlphabetical(out);
    return out;
  }
  throw new Error(
    "Table sort supports 'by-id', 'by-label', or { byIdOrder }; " +
      "byLabelOrder and custom HeaderSortFunc are not supported for tables",
  );
}

function sortByCustomOrder(combos: string[], customOrder: string[]): void {
  // Pre-build index map for O(1) lookups instead of O(n) indexOf calls
  const orderIndexMap = new Map<string, number>(
    customOrder.map((item, index) => [item, index]),
  );

  // Helper to format priority with consistent padding
  const formatPriority = (index: number): string =>
    `$$$${index.toString().padStart(5, "0")}`;

  // Create a mapping of combo keys to their sort keys
  const sortKeyMap = new Map<string, string>();

  combos.forEach((combo) => {
    const [groupHeader, itemHeader] = combo.split(SEPARATOR);

    // Build sort key by concatenating group and item priorities
    const groupIndex = orderIndexMap.get(groupHeader);
    const groupSortKey = groupIndex !== undefined
      ? formatPriority(groupIndex)
      : groupHeader;

    const itemIndex = orderIndexMap.get(itemHeader);
    const itemSortKey = itemIndex !== undefined
      ? formatPriority(itemIndex)
      : itemHeader;

    sortKeyMap.set(combo, groupSortKey + SEPARATOR + itemSortKey);
  });

  // Sort using the pre-computed sort keys
  combos.sort((a, b) => {
    const sortKeyA = sortKeyMap.get(a)!;
    const sortKeyB = sortKeyMap.get(b)!;
    return sortKeyA.localeCompare(sortKeyB);
  });
}

function collectUniqueCombos(
  jsonArray: JsonArray,
  valueProps: string[],
  colGroupProp: string | undefined,
  colProp: string | undefined,
  rowGroupProp: string | undefined,
  rowProp: string | undefined,
): { colGroupCombos: string[]; rowGroupCombos: string[] } {
  const colComboSet = new Set<string>();
  const rowComboSet = new Set<string>();

  for (const vp of valueProps) {
    for (const obj of jsonArray) {
      colComboSet.add(getComboKey(colGroupProp, colProp, vp, obj));
      rowComboSet.add(getComboKey(rowGroupProp, rowProp, vp, obj));
    }
  }

  return {
    colGroupCombos: Array.from(colComboSet),
    rowGroupCombos: Array.from(rowComboSet),
  };
}

function createGroups(
  combos: string[],
  labelReplacements: Record<string, string> | undefined,
  groupType: "col",
): ColGroup[];
function createGroups(
  combos: string[],
  labelReplacements: Record<string, string> | undefined,
  groupType: "row",
): RowGroup[];
function createGroups(
  combos: string[],
  labelReplacements: Record<string, string> | undefined,
  groupType: "col" | "row",
): ColGroup[] | RowGroup[] {
  const groups: (ColGroup | RowGroup)[] = [];
  let currentGroupRaw = "";
  let currentGroupIndex = -1;

  combos.forEach((combo, index) => {
    const [groupRaw, itemRaw] = combo.split(SEPARATOR);

    if (groupRaw !== currentGroupRaw) {
      const groupId = groupRaw === UNDEFINED_PLACEHOLDER ? undefined : groupRaw;
      const groupLabel = groupId === undefined
        ? undefined
        : (labelReplacements?.[groupId] ?? groupId);
      if (groupType === "col") {
        groups.push({ id: groupId, label: groupLabel, cols: [] });
      } else {
        groups.push({ id: groupId, label: groupLabel, rows: [] });
      }
      currentGroupRaw = groupRaw;
      currentGroupIndex = groups.length - 1;
    }

    const itemId = itemRaw === UNDEFINED_PLACEHOLDER ? undefined : itemRaw;
    const itemLabel = itemId === undefined
      ? undefined
      : (labelReplacements?.[itemId] ?? itemId);
    const item = { id: itemId, label: itemLabel, index };

    if (groupType === "col") {
      (groups[currentGroupIndex] as ColGroup).cols.push(item);
    } else {
      (groups[currentGroupIndex] as RowGroup).rows.push(item);
    }
  });

  return groups as ColGroup[] | RowGroup[];
}

function fillDataArray(
  aoa: string[][],
  jsonArray: JsonArray,
  valueProps: string[],
  colGroupProp: string | undefined,
  colProp: string | undefined,
  rowGroupProp: string | undefined,
  rowProp: string | undefined,
  colComboToIndex: Map<string, number>,
  rowComboToIndex: Map<string, number>,
): void {
  for (const vp of valueProps) {
    for (const obj of jsonArray) {
      if (obj[vp] === null || obj[vp] === undefined) {
        continue;
      }

      const colCombo = getComboKey(colGroupProp, colProp, vp, obj);
      const rowCombo = getComboKey(rowGroupProp, rowProp, vp, obj);

      const colIndex = colComboToIndex.get(colCombo)!;
      const rowIndex = rowComboToIndex.get(rowCombo)!;

      assert(
        aoa[rowIndex][colIndex] === UNDEFINED_PLACEHOLDER,
        "Duplicate value",
      );
      aoa[rowIndex][colIndex] = String(obj[vp]);
    }
  }
}

function getComboKey(
  groupProp: string | undefined,
  prop: string | undefined,
  valueProp: string,
  obj: JsonArrayItem,
): string {
  const groupValue = groupProp === "--v"
    ? valueProp
    : obj[groupProp!] ?? UNDEFINED_PLACEHOLDER;
  const propValue = prop === "--v"
    ? valueProp
    : obj[prop!] ?? UNDEFINED_PLACEHOLDER;

  return `${groupValue}${SEPARATOR}${propValue}`;
}
