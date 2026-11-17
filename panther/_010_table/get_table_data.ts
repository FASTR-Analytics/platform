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
  createDimensionMember,
  type DimensionMember,
  getDimensionId,
  type JsonArray,
  type JsonArrayItem,
  type MemberSortConfig,
  sortDimensionMembers,
  validateDimensionProps,
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
  const dimensionProps = {
    col: colProp,
    row: rowProp,
    colGroup: colGroupProp,
    rowGroup: rowGroupProp,
  };
  validateDimensionProps(jsonArray, dimensionProps);

  const col = promoteGroupPropIfNoMemberProp(
    colGroupProp,
    colProp,
    sort?.colGroup,
    sort?.col,
  );
  const row = promoteGroupPropIfNoMemberProp(
    rowGroupProp,
    rowProp,
    sort?.rowGroup,
    sort?.row,
  );

  // Build each side's structured dimensions from raw JSON
  const colDataDimensions = buildStructuredDataDimensions(
    jsonArray,
    valueProps,
    col.groupProp,
    col.memberProp,
    labelReplacements,
  );
  const rowDataDimensions = buildStructuredDataDimensions(
    jsonArray,
    valueProps,
    row.groupProp,
    row.memberProp,
    labelReplacements,
  );

  // Sort each side independently
  const sortedColDataDimensions = sortStructuredDataDimensions(
    colDataDimensions,
    col.groupSort,
    col.memberSort,
  );
  const sortedRowDataDimensions = sortStructuredDataDimensions(
    rowDataDimensions,
    row.groupSort,
    row.memberSort,
  );

  // Flatten to groups and build index mappings
  const {
    groups: colGroups,
    comboToIndex: colComboToIndex,
    total: totalCols,
  } = flattenDataDimensions(sortedColDataDimensions);
  const {
    groups: rowGroups,
    comboToIndex: rowComboToIndex,
    total: totalRows,
  } = flattenDataDimensions(sortedRowDataDimensions);

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
    col.memberProp,
    row.groupProp,
    row.memberProp,
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
    cols: col.memberProp === undefined ? undefined : {
      dimension: col.memberProp,
      groupDimension: col.groupProp,
      groups: colGroups.map(({ id, label, members }) => ({
        id,
        label,
        cols: members,
      })),
    },
    rows: row.memberProp === undefined ? undefined : {
      dimension: row.memberProp,
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

type StructuredDataDimensionsGroup = {
  groupMember: DimensionMember | undefined;
  members: (DimensionMember | undefined)[];
};

type StructuredDataDimensions = StructuredDataDimensionsGroup[];

type PromotedDimensionProps = {
  groupProp: string | "--v" | undefined;
  memberProp: string | "--v" | undefined;
  groupSort: MemberSortConfig | undefined;
  memberSort: MemberSortConfig | undefined;
};

///////////////////////////////////////////////////////////////////////////////
// Helper functions
///////////////////////////////////////////////////////////////////////////////

const UNDEFINED_PLACEHOLDER = "___";

// A group prop with no member prop produces exactly one blank member per group
// (see buildStructuredDataDimensions) — a group-header tier over an empty member tier.
// Promoting the group values into the member prop collapses that to an
// ordinary flat member dimension, carrying over whatever sort was configured for
// the group.
function promoteGroupPropIfNoMemberProp(
  groupProp: string | "--v" | undefined,
  memberProp: string | "--v" | undefined,
  groupSort: MemberSortConfig | undefined,
  memberSort: MemberSortConfig | undefined,
): PromotedDimensionProps {
  if (memberProp !== undefined || groupProp === undefined) {
    return { groupProp, memberProp, groupSort, memberSort };
  }
  return {
    groupProp: undefined,
    memberProp: groupProp,
    groupSort: undefined,
    memberSort: memberSort ?? groupSort,
  };
}

function buildStructuredDataDimensions(
  jsonArray: JsonArray,
  valueProps: string[],
  groupProp: string | undefined,
  memberProp: string | undefined,
  labelReplacements: Record<string, string> | undefined,
): StructuredDataDimensions {
  // Collect unique (groupId, memberId) pairs preserving insertion order
  const memberIdsByGroupId = new Map<
    string | undefined,
    Set<string | undefined>
  >();

  for (const vp of valueProps) {
    for (const obj of jsonArray) {
      const groupId = resolveId(groupProp, vp, obj);
      const memberId = resolveId(memberProp, vp, obj);

      let memberIds = memberIdsByGroupId.get(groupId);
      if (!memberIds) {
        memberIds = new Set();
        memberIdsByGroupId.set(groupId, memberIds);
      }
      memberIds.add(memberId);
    }
  }

  // An undefined id is the lone position of a side with no member prop.
  const dimensions: StructuredDataDimensions = [];
  for (const [groupId, memberIds] of memberIdsByGroupId) {
    const groupMember = toOptionalMember(groupId, labelReplacements);
    const members: (DimensionMember | undefined)[] = [];
    for (const memberId of memberIds) {
      members.push(toOptionalMember(memberId, labelReplacements));
    }
    dimensions.push({ groupMember, members });
  }

  return dimensions;
}

function toOptionalMember(
  id: string | undefined,
  labelReplacements: Record<string, string> | undefined,
): DimensionMember | undefined {
  return id === undefined
    ? undefined
    : createDimensionMember(id, labelReplacements);
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

function sortStructuredDataDimensions(
  dimensions: StructuredDataDimensions,
  groupSort: MemberSortConfig | undefined,
  memberSort: MemberSortConfig | undefined,
): StructuredDataDimensions {
  const groups = dimensions.map((group) => ({
    groupMember: group.groupMember,
    members: sortOptionalMembers(group.members, memberSort),
  }));
  const groupByMemberId = new Map(groups.map((g) => [g.groupMember?.id, g]));
  return sortOptionalMembers(groups.map((g) => g.groupMember), groupSort).map(
    (member) => {
      const group = groupByMemberId.get(member?.id);
      assertNotUndefined(group);
      return group;
    },
  );
}

// An undefined member is the lone position of a dimension with no prop, so it never
// sits beside a defined one.
function sortOptionalMembers(
  members: (DimensionMember | undefined)[],
  sort: MemberSortConfig | undefined,
): (DimensionMember | undefined)[] {
  const defined = members.filter((h): h is DimensionMember => h !== undefined);
  return defined.length === members.length
    ? sortDimensionMembers(defined, sort)
    : members;
}

type FlatDataDimensionsGroup = {
  id: string | undefined;
  label: string | undefined;
  members: { id: string; label: string | undefined; index: number }[];
};

// Members of an absent dimension (no member prop) have no id; the caller drops such
// a dimension, keeping only its index mapping.
function flattenDataDimensions(dimensions: StructuredDataDimensions): {
  groups: FlatDataDimensionsGroup[];
  comboToIndex: Map<string, number>;
  total: number;
} {
  const groups: FlatDataDimensionsGroup[] = [];
  const comboToIndex = new Map<string, number>();
  let index = 0;

  for (const group of dimensions) {
    const members: FlatDataDimensionsGroup["members"] = [];
    for (const member of group.members) {
      comboToIndex.set(makeComboKey(group.groupMember?.id, member?.id), index);
      if (member !== undefined) {
        members.push({ id: member.id, label: member.label, index });
      }
      index++;
    }
    groups.push({
      id: group.groupMember?.id,
      label: group.groupMember?.label,
      members,
    });
  }

  return { groups, comboToIndex, total: index };
}

function makeComboKey(
  groupId: string | undefined,
  memberId: string | undefined,
): string {
  const g = groupId ?? UNDEFINED_PLACEHOLDER;
  const i = memberId ?? UNDEFINED_PLACEHOLDER;
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
      const colMemberId = resolveId(colProp, vp, obj);
      const rowGroupId = resolveId(rowGroupProp, vp, obj);
      const rowMemberId = resolveId(rowProp, vp, obj);

      const colCombo = makeComboKey(colGroupId, colMemberId);
      const rowCombo = makeComboKey(rowGroupId, rowMemberId);

      const i_col = colComboToIndex.get(colCombo);
      const i_row = rowComboToIndex.get(rowCombo);

      assertNotUndefined(
        i_col,
        `Missing col combo in index: ${colCombo}`,
      );
      assertNotUndefined(
        i_row,
        `Missing row combo in index: ${rowCombo}`,
      );

      assert(
        aoa[i_row][i_col] === UNDEFINED_PLACEHOLDER,
        `Duplicate value at col=${colCombo} row=${rowCombo}`,
      );
      aoa[i_row][i_col] = String(obj[vp]);

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
        nMatrix[i_row][i_col] = Number.isFinite(nNum) ? nNum : undefined;
      }
    }
  }
}
