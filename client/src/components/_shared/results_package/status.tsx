import {
  MODULE_REGISTRY,
  t3,
  type RunCatalogStatus,
  type RunModuleProgressStatus,
} from "lib";
import { Badge, type Intent } from "panther";
import { Show } from "solid-js";
import { _SERVER_HOST } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

// Results-package status display, shared by the instance catalogue and the
// project's Results package surface — the same run shown from two places
// must read identically.

// Who may explore what a package CONTAINS (Tim's ruling 2026-08-18): a
// package is instance-level data, so the instance data bits decide, whichever
// surface asks. Server guards are authoritative (routes/instance/
// run_generation.ts + the outputs download mount); these exist so a caller
// without access sees no button rather than one that 403s.
export function canViewPackageContents(): boolean {
  return (
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_view_data
  );
}

export function canViewPackageLogs(): boolean {
  return (
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_view_logs
  );
}

// The gated static mount for one raw output file (`<a download>` cannot send
// headers, so this is a plain URL under the same `can_view_data` guard).
export function runOutputFileHref(
  runId: string,
  moduleId: string,
  fileName: string,
): string {
  return `${_SERVER_HOST}/${runId}/outputs/${moduleId}/${
    encodeURIComponent(fileName)
  }?t=${Date.now()}`;
}

export function moduleLabel(moduleId: string): string {
  const entry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  return entry === undefined ? moduleId : t3(entry.label);
}

const RUN_STATUS_INTENT: Record<RunCatalogStatus, Intent> = {
  generating: "neutral",
  ready: "success",
  failed: "danger",
  retired: "neutral",
};

function runStatusLabel(status: RunCatalogStatus): string {
  switch (status) {
    case "generating":
      return t3({ en: "Generating", fr: "En cours de génération", pt: "A gerar" });
    case "ready":
      return t3({ en: "Ready", fr: "Prêt", pt: "Pronto" });
    case "failed":
      return t3({ en: "Failed", fr: "Échoué", pt: "Falhou" });
    case "retired":
      return t3({ en: "Retired", fr: "Retiré", pt: "Retirado" });
  }
}

export function RunStatusBadge(p: { status: RunCatalogStatus }) {
  return (
    <Badge intent={RUN_STATUS_INTENT[p.status]} variant="solid">
      {runStatusLabel(p.status)}
    </Badge>
  );
}

// The instance's pinned package (SYSTEM_08) — same mark wherever a
// package is listed: catalogue sidebar + detail, project card + picker.
export function PinnedBadge() {
  return (
    <Badge intent="primary" variant="solid">
      {t3({ en: "Pinned", fr: "Épinglé", pt: "Fixado" })}
    </Badge>
  );
}

const MODULE_PROGRESS_INTENT: Record<RunModuleProgressStatus, Intent> = {
  pending: "neutral",
  running: "primary",
  done: "success",
  reused: "success",
  error: "danger",
};

export function ModuleProgressChip(p: {
  label: string;
  status: RunModuleProgressStatus;
}) {
  return (
    <Badge intent={MODULE_PROGRESS_INTENT[p.status]}>
      <span class="inline-flex items-center gap-1">
        {p.label}
        <Show when={p.status === "running"}>
          <span class="animate-pulse">●</span>
        </Show>
        <Show when={p.status === "reused"}>
          <span>({t3({ en: "reused", fr: "réutilisé", pt: "reutilizado" })})</span>
        </Show>
      </span>
    </Badge>
  );
}
