import {
  MODULE_REGISTRY,
  t3,
  type RunCatalogStatus,
  type RunModuleProgressStatus,
} from "lib";
import { Match, Show, Switch } from "solid-js";

// Results-package status display, shared by the instance catalogue and the
// project's Results package surface — the same run shown from two places
// must read identically.

export function moduleLabel(moduleId: string): string {
  const entry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  return entry === undefined ? moduleId : t3(entry.label);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function RunStatusBadge(p: { status: RunCatalogStatus }) {
  return (
    <Switch>
      <Match when={p.status === "generating"}>
        <div class="bg-neutral text-neutral-content rounded px-2 py-0.5 text-xs">
          {t3({ en: "Generating", fr: "En cours de génération", pt: "A gerar" })}
        </div>
      </Match>
      <Match when={p.status === "ready"}>
        <div class="bg-success text-success-content rounded px-2 py-0.5 text-xs">
          {t3({ en: "Ready", fr: "Prêt", pt: "Pronto" })}
        </div>
      </Match>
      <Match when={p.status === "failed"}>
        <div class="bg-danger text-danger-content rounded px-2 py-0.5 text-xs">
          {t3({ en: "Failed", fr: "Échoué", pt: "Falhou" })}
        </div>
      </Match>
      <Match when={p.status === "retired"}>
        <div class="bg-neutral text-neutral-content rounded px-2 py-0.5 text-xs">
          {t3({ en: "Retired", fr: "Retiré", pt: "Retirado" })}
        </div>
      </Match>
    </Switch>
  );
}

export function ModuleProgressChip(p: {
  label: string;
  status: RunModuleProgressStatus;
}) {
  return (
    <div
      class="rounded border px-2 py-0.5 text-xs"
      classList={{
        "text-base-content-muted": p.status === "pending",
        "border-primary text-primary": p.status === "running",
        "border-success text-success":
          p.status === "done" || p.status === "reused",
        "border-danger text-danger": p.status === "error",
      }}
    >
      {p.label}
      <Show when={p.status === "running"}>
        {" "}
        <span class="animate-pulse">●</span>
      </Show>
      <Show when={p.status === "reused"}>
        {" "}
        ({t3({ en: "reused", fr: "réutilisé", pt: "reutilizado" })})
      </Show>
    </div>
  );
}
