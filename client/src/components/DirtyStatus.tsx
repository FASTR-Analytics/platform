import { DirtyOrRunStatus, t3 } from "lib";
import { capitalizeFirstLetter, type Intent } from "panther";
import { createMemo, Show } from "solid-js";
import { projectState } from "~/state/project/t1_store";

export function ProjectRunStatus() {
  return (
    <Show when={projectState.anyRunning}>
      <div
        class="ui-intent-fill ui-intent-outline data-[running=true]:ui-running bg-base-100 font-400 inline-flex flex-none select-none items-center justify-center whitespace-nowrap rounded border px-3 py-1.5 align-middle text-sm leading-none text-white data-[width=true]:w-full data-[border=false]:border-transparent data-[border=true]:border-[currentColor]"
        data-intent={"neutral"}
        data-outline={true}
        data-border={false}
        data-running={projectState.anyRunning}
      >
        {t3({ en: "Running", fr: "En cours d'exécution" })}
      </div>
    </Show>
  );
}

type Props = {
  id: string;
  moduleDirtyStates: Record<string, DirtyOrRunStatus>;
};

export function DirtyStatus(p: Props) {
  const rawStatus = createMemo(() => p.moduleDirtyStates[p.id]);
  const ds = createMemo(() => getDirtyOrRunStatus(p.id, p.moduleDirtyStates));
  const intent = createMemo<Intent>(() => {
    const s = rawStatus();
    if (s === "error") {
      return "danger";
    }
    if (s === "ready") {
      return "success";
    }
    return "neutral";
  });
  return (
    <div
      class="ui-intent-fill ui-intent-outline data-[running=true]:ui-running font-400 inline-flex flex-none select-none items-center justify-center whitespace-nowrap rounded border border-[currentColor] px-3 py-1.5 align-middle text-sm leading-none data-[width=true]:w-full"
      data-intent={intent()}
      data-outline={true}
      data-running={rawStatus() === "running"}
    >
      {ds()}
    </div>
  );
}

export function getDirtyOrRunStatus(
  id: string,
  moduleDirtyStates: Record<string, DirtyOrRunStatus>,
): string {
  const s = moduleDirtyStates[id];
  if (!s) {
    return t3({ en: "Bad status", fr: "Statut invalide" });
  }
  if (s === "queued") {
    return t3({ en: "Pending", fr: "En attente" });
  }
  if (s === "ready") {
    return t3({ en: "Ready", fr: "Prêt" });
  }
  if (s === "running") {
    return t3({ en: "Running", fr: "En cours d'exécution" });
  }
  if (s === "error") {
    return t3({ en: "Error", fr: "Erreur" });
  }
  return capitalizeFirstLetter(s);
}

export function isReady(
  id: string,
  moduleDirtyStates: Record<string, DirtyOrRunStatus>,
): boolean {
  return moduleDirtyStates[id] === "ready";
}
