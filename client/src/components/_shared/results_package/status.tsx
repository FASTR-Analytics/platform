import {
  MODULE_REGISTRY,
  t3,
  type RunCatalogStatus,
  type RunModuleProgressStatus,
} from "lib";
import { Badge, type Intent } from "panther";
import { Show } from "solid-js";

// Results-package status display, shared by the instance catalogue and the
// project's Results package surface — the same run shown from two places
// must read identically.

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
      {p.label}
      <Show when={p.status === "running"}>
        {" "}
        <span class="animate-pulse">●</span>
      </Show>
      <Show when={p.status === "reused"}>
        {" "}
        ({t3({ en: "reused", fr: "réutilisé", pt: "reutilizado" })})
      </Show>
    </Badge>
  );
}
