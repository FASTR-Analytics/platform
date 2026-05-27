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
  assertNotUndefined,
  createArray,
  type HeaderItem,
  type HeaderSortFunc,
  type JsonArray,
  type JsonArrayItem,
  resolveSortFunc,
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

  // Build structured axes from raw JSON
  const colAxis = buildStructuredAxis(
    jsonArray,
    valueProps,
    colGroupProp,
    colProp,
    labelReplacements,
  );
  const rowAxis = buildStructuredAxis(
    jsonArray,
    valueProps,
    rowGroupProp,
    rowProp,
    labelReplacements,
  );

  // Sort each axis independently
  const sortedColAxis = sortStructuredAxis(
    colAxis,
    resolveSortFunc(sort?.colGroup),
    resolveSortFunc(sort?.col),
  );
  const sortedRowAxis = sortStructuredAxis(
    rowAxis,
    resolveSortFunc(sort?.rowGroup),
    resolveSortFunc(sort?.row),
  );

  // Flatten to ColGroup[]/RowGroup[] and build index mappings
  const { colGroups, colComboToIndex, totalCols } = flattenToColGroups(
    sortedColAxis,
  );
  const { rowGroups, rowComboToIndex, totalRows } = flattenToRowGroups(
    sortedRowAxis,
  );

  // Initialize and fill the data array
  const aoa: string[][] = createArray(
    totalRows,
    () => createArray(totalCols, UNDEFINED_PLACEHOLDER),
  );

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
// Types
///////////////////////////////////////////////////////////////////////////////

type StructuredAxisGroup = {
  header: HeaderItem | undefined;
  items: (HeaderItem | undefined)[];
};

type StructuredAxis = StructuredAxisGroup[];

///////////////////////////////////////////////////////////////////////////////
// Helper functions
///////////////////////////////////////////////////////////////////////////////

const UNDEFINED_PLACEHOLDER = "___";

function buildStructuredAxis(
  jsonArray: JsonArray,
  valueProps: string[],
  groupProp: string | undefined,
  itemProp: string | undefined,
  labelReplacements: Record<string, string> | undefined,
): StructuredAxis {
  // Collect unique (groupId, itemId) pairs preserving insertion order
  const groupToItems = new Map<string | undefined, Set<string | undefined>>();

  for (const vp of valueProps) {
    for (const obj of jsonArray) {
      const groupId = resolveId(groupProp, vp, obj);
      const itemId = resolveId(itemProp, vp, obj);

      let itemSet = groupToItems.get(groupId);
      if (!itemSet) {
        itemSet = new Set();
        groupToItems.set(groupId, itemSet);
      }
      itemSet.add(itemId);
    }
  }

  // Convert to structured axis with HeaderItems. Undefined ids are kept as
  // undefined entries so rows with missing dimension values still get a bucket
  // (and don't silently disappear in fillDataArray).
  const axis: StructuredAxis = [];
  for (const [groupId, itemIds] of groupToItems) {
    const groupHeader = toHeaderItem(groupId, labelReplacements);
    const items: (HeaderItem | undefined)[] = [];
    for (const itemId of itemIds) {
      items.push(toHeaderItem(itemId, labelReplacements));
    }
    axis.push({ header: groupHeader, items });
  }

  return axis;
}

function toHeaderItem(
  id: string | undefined,
  labelReplacements: Record<string, string> | undefined,
): HeaderItem | undefined {
  if (id === undefined) return undefined;
  return { id, label: labelReplacements?.[id] ?? id };
}

function resolveId(
  prop: string | undefined,
  valueProp: string,
  obj: JsonArrayItem,
): string | undefined {
  if (prop === "--v") return valueProp;
  if (prop === undefined) return undefined;
  const val = obj[prop];
  return val === undefined || val === null ? undefined : String(val);
}

function sortStructuredAxis(
  axis: StructuredAxis,
  groupSortFunc: HeaderSortFunc | undefined,
  itemSortFunc: HeaderSortFunc | undefined,
): StructuredAxis {
  // Sort items within each group. Undefined items go last regardless of the
  // configured sort func (they have no id/label to compare).
  const withSortedItems = axis.map((group) => ({
    header: group.header,
    items: itemSortFunc
      ? [...group.items].sort(sortWithUndefinedLast(itemSortFunc))
      : group.items,
  }));

  // Sort groups. Undefined-headed groups go last for the same reason.
  if (groupSortFunc) {
    withSortedItems.sort((a, b) => {
      const cmp = sortWithUndefinedLast(groupSortFunc);
      return cmp(a.header, b.header);
    });
  }

  return withSortedItems;
}

function sortWithUndefinedLast(
  fn: HeaderSortFunc,
): (a: HeaderItem | undefined, b: HeaderItem | undefined) => number {
  return (a, b) => {
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return fn(a, b);
  };
}

function flattenToColGroups(axis: StructuredAxis): {
  colGroups: ColGroup[];
  colComboToIndex: Map<string, number>;
  totalCols: number;
} {
  const colGroups: ColGroup[] = [];
  const colComboToIndex = new Map<string, number>();
  let index = 0;

  for (const group of axis) {
    const cols: ColGroup["cols"] = group.items.map((item) => {
      const comboKey = makeComboKey(group.header?.id, item?.id);
      colComboToIndex.set(comboKey, index);
      return { id: item?.id, label: item?.label, index: index++ };
    });

    colGroups.push({
      id: group.header?.id,
      label: group.header?.label,
      cols,
    });
  }

  return { colGroups, colComboToIndex, totalCols: index };
}

function flattenToRowGroups(axis: StructuredAxis): {
  rowGroups: RowGroup[];
  rowComboToIndex: Map<string, number>;
  totalRows: number;
} {
  const rowGroups: RowGroup[] = [];
  const rowComboToIndex = new Map<string, number>();
  let index = 0;

  for (const group of axis) {
    const rows: RowGroup["rows"] = group.items.map((item) => {
      const comboKey = makeComboKey(group.header?.id, item?.id);
      rowComboToIndex.set(comboKey, index);
      return { id: item?.id, label: item?.label, index: index++ };
    });

    rowGroups.push({
      id: group.header?.id,
      label: group.header?.label,
      rows,
    });
  }

  return { rowGroups, rowComboToIndex, totalRows: index };
}

function makeComboKey(
  groupId: string | undefined,
  itemId: string | undefined,
): string {
  const g = groupId ?? UNDEFINED_PLACEHOLDER;
  const i = itemId ?? UNDEFINED_PLACEHOLDER;
  return `${g}:::${i}`;
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

      const colGroupId = resolveId(colGroupProp, vp, obj);
      const colItemId = resolveId(colProp, vp, obj);
      const rowGroupId = resolveId(rowGroupProp, vp, obj);
      const rowItemId = resolveId(rowProp, vp, obj);

      const colCombo = makeComboKey(colGroupId, colItemId);
      const rowCombo = makeComboKey(rowGroupId, rowItemId);

      const colIndex = colComboToIndex.get(colCombo);
      const rowIndex = rowComboToIndex.get(rowCombo);

      assertNotUndefined(
        colIndex,
        `Missing col combo in index: ${colCombo}`,
      );
      assertNotUndefined(
        rowIndex,
        `Missing row combo in index: ${rowCombo}`,
      );

      assert(
        aoa[rowIndex][colIndex] === UNDEFINED_PLACEHOLDER,
        `Duplicate value at col=${colCombo} row=${rowCombo}`,
      );
      aoa[rowIndex][colIndex] = String(obj[vp]);
    }
  }
}
