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
  type JsonArray,
  type JsonArrayItem,
  sortAlphabetical,
  withAnyLabelReplacement,
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
    sortHeaders,
    labelReplacementsBeforeSorting,
    labelReplacementsAfterSorting,
  } = jsonDataConfig;

  if (valueProps.length === 0) {
    throw new Error("Need at least one valueProp");
  }

  // Collect unique combinations using Sets for better performance
  const { colGroupCombos, rowGroupCombos } = collectUniqueCombos(
    jsonArray,
    valueProps,
    colGroupProp,
    colProp,
    rowGroupProp,
    rowProp,
    labelReplacementsBeforeSorting,
  );

  // Sort if requested
  if (sortHeaders) {
    if (Array.isArray(sortHeaders)) {
      sortByCustomOrder(colGroupCombos, sortHeaders);
      sortByCustomOrder(rowGroupCombos, sortHeaders);
    } else {
      sortAlphabetical(colGroupCombos);
      sortAlphabetical(rowGroupCombos);
    }
  }

  const colGroups = createGroups(
    colGroupCombos,
    labelReplacementsAfterSorting,
    "col",
  );
  const rowGroups = createGroups(
    rowGroupCombos,
    labelReplacementsAfterSorting,
    "row",
  );

  // Create lookup maps for O(1) performance
  const colComboToIndex = new Map(
    colGroupCombos.map((combo, index) => [combo, index]),
  );
  const rowComboToIndex = new Map(
    rowGroupCombos.map((combo, index) => [combo, index]),
  );

  // Initialize the data array
  const aoa: string[][] = createArray(
    rowGroupCombos.length,
    () => createArray(colGroupCombos.length, UNDEFINED_PLACEHOLDER),
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
    labelReplacementsBeforeSorting,
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
  labelReplacements?: Record<string, string>,
): { colGroupCombos: string[]; rowGroupCombos: string[] } {
  const colComboSet = new Set<string>();
  const rowComboSet = new Set<string>();

  for (const vp of valueProps) {
    for (const obj of jsonArray) {
      const colCombo = getComboKey(
        colGroupProp,
        colProp,
        vp,
        obj,
        labelReplacements,
      );
      const rowCombo = getComboKey(
        rowGroupProp,
        rowProp,
        vp,
        obj,
        labelReplacements,
      );
      colComboSet.add(colCombo);
      rowComboSet.add(rowCombo);
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
  let currentGroupHeader = "";
  let currentGroupIndex = -1;

  combos.forEach((combo, index) => {
    const [groupHeader, itemHeader] = combo.split(SEPARATOR);

    if (groupHeader !== currentGroupHeader) {
      const groupLabel = processLabel(groupHeader, labelReplacements);
      if (groupType === "col") {
        groups.push({ label: groupLabel, cols: [] });
      } else {
        groups.push({ label: groupLabel, rows: [] });
      }
      currentGroupHeader = groupHeader;
      currentGroupIndex = groups.length - 1;
    }

    const itemLabel = processLabel(itemHeader, labelReplacements);
    const item = { label: itemLabel, index };

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
  labelReplacements?: Record<string, string>,
): void {
  for (const vp of valueProps) {
    for (const obj of jsonArray) {
      if (obj[vp] === null || obj[vp] === undefined) {
        continue;
      }

      const colCombo = getComboKey(
        colGroupProp,
        colProp,
        vp,
        obj,
        labelReplacements,
      );
      const rowCombo = getComboKey(
        rowGroupProp,
        rowProp,
        vp,
        obj,
        labelReplacements,
      );

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
  labelReplacements?: Record<string, string>,
): string {
  let groupValue = groupProp === "--v"
    ? valueProp
    : obj[groupProp!] ?? UNDEFINED_PLACEHOLDER;
  let propValue = prop === "--v"
    ? valueProp
    : obj[prop!] ?? UNDEFINED_PLACEHOLDER;

  // Apply label replacements if provided
  if (labelReplacements) {
    if (groupValue !== UNDEFINED_PLACEHOLDER) {
      groupValue =
        withAnyLabelReplacement(String(groupValue), labelReplacements) ??
          String(groupValue);
    }
    if (propValue !== UNDEFINED_PLACEHOLDER) {
      propValue =
        withAnyLabelReplacement(String(propValue), labelReplacements) ??
          String(propValue);
    }
  }

  return `${groupValue}${SEPARATOR}${propValue}`;
}

function processLabel(
  value: string,
  labelReplacements: Record<string, string> | undefined,
): string | undefined {
  return value === UNDEFINED_PLACEHOLDER
    ? undefined
    : withAnyLabelReplacement(value, labelReplacements);
}
