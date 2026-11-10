// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  isTableDataJson,
  isTableDataTransformed,
  type TableData,
  type TableDataTransformed,
  type TableJsonDataConfig,
} from "./types.ts";
import {
  assert,
  assertNotUndefined,
  createArray,
  createHeaderItem,
  getDimensionId,
  type HeaderItem,
  type HeaderSortConfig,
  type JsonArray,
  type JsonArrayItem,
  sortHeaderItems,
  validateSlotDimensions,
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
  const slotProps = {
    col: colProp,
    row: rowProp,
    colGroup: colGroupProp,
    rowGroup: rowGroupProp,
  };
  validateSlotDimensions(jsonArray, slotProps);

  const col = promoteGroupPropIfNoItemProp(
    colGroupProp,
    colProp,
    sort?.colGroup,
    sort?.col,
  );
  const row = promoteGroupPropIfNoItemProp(
    rowGroupProp,
    rowProp,
    sort?.rowGroup,
    sort?.row,
  );

  // Build structured axes from raw JSON
  const colAxis = buildStructuredAxis(
    jsonArray,
    valueProps,
    col.groupProp,
    col.itemProp,
    labelReplacements,
  );
  const rowAxis = buildStructuredAxis(
    jsonArray,
    valueProps,
    row.groupProp,
    row.itemProp,
    labelReplacements,
  );

  // Sort each axis independently
  const sortedColAxis = sortStructuredAxis(
    colAxis,
    col.groupSort,
    col.itemSort,
  );
  const sortedRowAxis = sortStructuredAxis(
    rowAxis,
    row.groupSort,
    row.itemSort,
  );

  // Flatten to groups and build index mappings
  const {
    groups: colGroups,
    comboToIndex: colComboToIndex,
    total: totalCols,
  } = flattenAxis(sortedColAxis);
  const {
    groups: rowGroups,
    comboToIndex: rowComboToIndex,
    total: totalRows,
  } = flattenAxis(sortedRowAxis);

  // Initialize and fill the data array
  const aoa: string[][] = createArray(
    totalRows,
    () => createArray(totalCols, UNDEFINED_PLACEHOLDER),
  );
  const nMatrix = jsonDataConfig.nProps
    ? createArray(
      totalRows,
      () => createArray<number | undefined>(totalCols, () => undefined),
    )
    : undefined;

  fillDataArray(
    aoa,
    nMatrix,
    jsonArray,
    valueProps,
    jsonDataConfig.nProps,
    col.groupProp,
    col.itemProp,
    row.groupProp,
    row.itemProp,
    colComboToIndex,
    rowComboToIndex,
  );

  // Replace undefined placeholders with dots
  const aoaWithMissing = aoa.map((row) =>
    row.map((cell) => (cell === UNDEFINED_PLACEHOLDER ? "." : cell))
  );

  // An all-undefined matrix (nProps set but nothing resolved) carries no
  // information and would serialize as a dense null grid — drop it.
  const hasAnyN = nMatrix?.some((row) => row.some((v) => v !== undefined));

  return {
    isTransformed: true,
    cols: col.itemProp === undefined ? undefined : {
      dimension: col.itemProp,
      groupDimension: col.groupProp,
      groups: colGroups.map(({ id, label, members }) => ({
        id,
        label,
        cols: members,
      })),
    },
    rows: row.itemProp === undefined ? undefined : {
      dimension: row.itemProp,
      groupDimension: row.groupProp,
      groups: rowGroups.map(({ id, label, members }) => ({
        id,
        label,
        rows: members,
      })),
    },
    aoa: aoaWithMissing,
    liveDomainExcludeIds: jsonDataConfig.liveDomainExcludeIds,
    nMatrix: hasAnyN ? nMatrix : undefined,
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

type PromotedAxisProps = {
  groupProp: string | "--v" | undefined;
  itemProp: string | "--v" | undefined;
  groupSort: HeaderSortConfig | undefined;
  itemSort: HeaderSortConfig | undefined;
};

///////////////////////////////////////////////////////////////////////////////
// Helper functions
///////////////////////////////////////////////////////////////////////////////

const UNDEFINED_PLACEHOLDER = "___";

// A group prop with no item prop produces exactly one blank item per group
// (see buildStructuredAxis) — a group-header tier over an empty item tier.
// Promoting the group values into the item slot collapses that to an
// ordinary flat item axis, carrying over whatever sort was configured for
// the group.
function promoteGroupPropIfNoItemProp(
  groupProp: string | "--v" | undefined,
  itemProp: string | "--v" | undefined,
  groupSort: HeaderSortConfig | undefined,
  itemSort: HeaderSortConfig | undefined,
): PromotedAxisProps {
  if (itemProp !== undefined || groupProp === undefined) {
    return { groupProp, itemProp, groupSort, itemSort };
  }
  return {
    groupProp: undefined,
    itemProp: groupProp,
    groupSort: undefined,
    itemSort: itemSort ?? groupSort,
  };
}

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

  // An undefined id is the lone member of a slot with no prop.
  const axis: StructuredAxis = [];
  for (const [groupId, itemIds] of groupToItems) {
    const groupHeader = toOptionalHeaderItem(groupId, labelReplacements);
    const items: (HeaderItem | undefined)[] = [];
    for (const itemId of itemIds) {
      items.push(toOptionalHeaderItem(itemId, labelReplacements));
    }
    axis.push({ header: groupHeader, items });
  }

  return axis;
}

function toOptionalHeaderItem(
  id: string | undefined,
  labelReplacements: Record<string, string> | undefined,
): HeaderItem | undefined {
  return id === undefined ? undefined : createHeaderItem(id, labelReplacements);
}

function resolveId(
  prop: string | undefined,
  valueProp: string,
  obj: JsonArrayItem,
): string | undefined {
  if (prop === "--v") return valueProp;
  if (prop === undefined) return undefined;
  return getDimensionId(obj, prop);
}

function sortStructuredAxis(
  axis: StructuredAxis,
  groupSort: HeaderSortConfig | undefined,
  itemSort: HeaderSortConfig | undefined,
): StructuredAxis {
  const groups = axis.map((group) => ({
    header: group.header,
    items: sortOptionalHeaders(group.items, itemSort),
  }));
  const groupByHeaderId = new Map(groups.map((g) => [g.header?.id, g]));
  return sortOptionalHeaders(groups.map((g) => g.header), groupSort).map(
    (header) => {
      const group = groupByHeaderId.get(header?.id);
      assertNotUndefined(group);
      return group;
    },
  );
}

// An undefined header is the lone member of a slot with no prop, so it never
// sits beside a defined one.
function sortOptionalHeaders(
  headers: (HeaderItem | undefined)[],
  sort: HeaderSortConfig | undefined,
): (HeaderItem | undefined)[] {
  const defined = headers.filter((h): h is HeaderItem => h !== undefined);
  return defined.length === headers.length
    ? sortHeaderItems(defined, sort)
    : headers;
}

type FlatAxisGroup = {
  id: string | undefined;
  label: string | undefined;
  members: { id: string; label: string | undefined; index: number }[];
};

// Members of an absent axis (no item prop) have no id; the caller drops such
// an axis, keeping only its index mapping.
function flattenAxis(axis: StructuredAxis): {
  groups: FlatAxisGroup[];
  comboToIndex: Map<string, number>;
  total: number;
} {
  const groups: FlatAxisGroup[] = [];
  const comboToIndex = new Map<string, number>();
  let index = 0;

  for (const group of axis) {
    const members: FlatAxisGroup["members"] = [];
    for (const item of group.items) {
      comboToIndex.set(makeComboKey(group.header?.id, item?.id), index);
      if (item !== undefined) {
        members.push({ id: item.id, label: item.label, index });
      }
      index++;
    }
    groups.push({
      id: group.header?.id,
      label: group.header?.label,
      members,
    });
  }

  return { groups, comboToIndex, total: index };
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
  nMatrix: (number | undefined)[][] | undefined,
  jsonArray: JsonArray,
  valueProps: string[],
  nProps: Record<string, string> | undefined,
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

      const nProp = nProps?.[vp];
      if (nMatrix && nProp !== undefined) {
        // Numeric strings are accepted, mirroring the value path (JSON from
        // CSV/SQL drivers routinely stringifies numbers); "" is not a number.
        const nVal = obj[nProp];
        const nNum = typeof nVal === "number"
          ? nVal
          : typeof nVal === "string" && nVal.trim() !== ""
          ? Number(nVal)
          : NaN;
        nMatrix[rowIndex][colIndex] = Number.isFinite(nNum) ? nNum : undefined;
      }
    }
  }
}
