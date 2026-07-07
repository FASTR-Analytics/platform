// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GraphModel } from "./types_model.ts";
import { buildGraphIndex, findCycle } from "./_internal/graph_index.ts";

export type ValidationIssueCode =
  | "duplicate-id"
  | "dangling-ref"
  | "group-cycle"
  | "cycle";

export type ValidationIssue = {
  severity: "error" | "warning";
  code: ValidationIssueCode;
  message: string;
  ids?: string[];
};

export type ValidationReport = {
  ok: boolean;
  issues: ValidationIssue[];
};

export function validate(model: GraphModel): ValidationReport {
  const issues: ValidationIssue[] = [];

  checkDuplicateIds(issues, "node", model.nodes.map((n) => n.id));
  checkDuplicateIds(issues, "edge", model.edges.map((e) => e.id));
  checkDuplicateIds(issues, "lane", (model.lanes ?? []).map((l) => l.id));
  checkDuplicateIds(issues, "group", (model.groups ?? []).map((g) => g.id));

  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const laneIds = new Set((model.lanes ?? []).map((l) => l.id));
  const groupIds = new Set((model.groups ?? []).map((g) => g.id));

  for (const edge of model.edges) {
    for (const endpoint of [edge.from, edge.to]) {
      if (!nodeIds.has(endpoint)) {
        issues.push({
          severity: "error",
          code: "dangling-ref",
          message: `Edge "${edge.id}" references unknown node "${endpoint}"`,
          ids: [edge.id, endpoint],
        });
      }
    }
  }

  for (const node of model.nodes) {
    if (node.laneId !== undefined && !laneIds.has(node.laneId)) {
      issues.push({
        severity: "error",
        code: "dangling-ref",
        message: `Node "${node.id}" references unknown lane "${node.laneId}"`,
        ids: [node.id, node.laneId],
      });
    }
    if (node.groupId !== undefined && !groupIds.has(node.groupId)) {
      issues.push({
        severity: "error",
        code: "dangling-ref",
        message: `Node "${node.id}" references unknown group "${node.groupId}"`,
        ids: [node.id, node.groupId],
      });
    }
  }

  for (const group of model.groups ?? []) {
    if (group.parentId !== undefined && !groupIds.has(group.parentId)) {
      issues.push({
        severity: "error",
        code: "dangling-ref",
        message:
          `Group "${group.id}" references unknown parent "${group.parentId}"`,
        ids: [group.id, group.parentId],
      });
    }
  }
  checkGroupParentCycles(issues, model);
  checkConstraintRefs(issues, model, nodeIds);

  const cycle = findCycle(buildGraphIndex(model));
  if (cycle !== undefined) {
    issues.push({
      severity: "warning",
      code: "cycle",
      message: `Edge graph contains a cycle: ${cycle.join(" → ")}`,
      ids: cycle.slice(0, -1),
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

function checkDuplicateIds(
  issues: ValidationIssue[],
  kind: string,
  ids: string[],
): void {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const id of ids) {
    if (seen.has(id) && !reported.has(id)) {
      reported.add(id);
      issues.push({
        severity: "error",
        code: "duplicate-id",
        message: `Duplicate ${kind} id "${id}"`,
        ids: [id],
      });
    }
    seen.add(id);
  }
}

function checkGroupParentCycles(
  issues: ValidationIssue[],
  model: GraphModel,
): void {
  const parentById = new Map<string, string | undefined>();
  for (const group of model.groups ?? []) {
    if (!parentById.has(group.id)) {
      parentById.set(group.id, group.parentId);
    }
  }
  const reported = new Set<string>();
  for (const startId of parentById.keys()) {
    const chain = new Set<string>();
    let current: string | undefined = startId;
    while (current !== undefined && parentById.has(current)) {
      if (chain.has(current)) {
        if (!reported.has(current)) {
          reported.add(current);
          issues.push({
            severity: "error",
            code: "group-cycle",
            message: `Group parent chain cycles at "${current}"`,
            ids: [current],
          });
        }
        break;
      }
      chain.add(current);
      current = parentById.get(current);
    }
  }
}

function checkConstraintRefs(
  issues: ValidationIssue[],
  model: GraphModel,
  nodeIds: Set<string>,
): void {
  const constraints = model.constraints;
  if (constraints === undefined) {
    return;
  }
  const referenced: string[] = [
    ...(constraints.sameLayer ?? []).flat(),
    ...(constraints.sequence ?? []).flat(),
    ...(constraints.align ?? []).flat(),
  ];
  const reported = new Set<string>();
  for (const id of referenced) {
    if (!nodeIds.has(id) && !reported.has(id)) {
      reported.add(id);
      issues.push({
        severity: "warning",
        code: "dangling-ref",
        message: `Constraint references unknown node "${id}"`,
        ids: [id],
      });
    }
  }
}
