import { DirtyOrRunStatus, t2, T } from "lib";
import { capitalizeFirstLetter, type Intent } from "panther";
import { Show, createMemo } from "solid-js";
import { useAnyRunning } from "~/components/project_runner/mod";
import { t } from "lib";

type ProjectRunStatusProps = {
  // moduleDirtyStates: Record<string, DirtyOrRunStatus>;
};

export function ProjectRunStatus(p: ProjectRunStatusProps) {
  const anyRunning = createMemo(() => useAnyRunning());
  return (
    <Show when={anyRunning()}>
      <div
        class="ui-intent-fill ui-intent-outline data-[running=true]:ui-running bg-base-100 font-400 inline-flex flex-none select-none items-center justify-center whitespace-nowrap rounded border px-3 py-1.5 align-middle text-sm leading-none text-white data-[width=true]:w-full data-[border=false]:border-transparent data-[border=true]:border-[currentColor]"
        data-intent={"neutral"}
        data-outline={true}
        data-border={false}
        data-running={anyRunning()}
      >
        {t2(T.FRENCH_UI_STRINGS.running)}
      </div>
    </Show>
  );
}

type Props = {
  id: string;
  moduleDirtyStates: Record<string, DirtyOrRunStatus>;
};

export function DirtyStatus(p: Props) {
  const ds = createMemo(() => getDirtyOrRunStatus(p.id, p.moduleDirtyStates));
  const intent = createMemo<Intent>(() => {
    const goodDs = ds();
    if (goodDs === "Error") {
      return "danger";
    }
    if (goodDs === "Ready") {
      return "success";
    }
    return "neutral";
  });
  return (
    <div
      class="ui-intent-fill ui-intent-outline data-[running=true]:ui-running font-400 inline-flex flex-none select-none items-center justify-center whitespace-nowrap rounded border border-[currentColor] px-3 py-1.5 align-middle text-sm leading-none data-[width=true]:w-full"
      data-intent={intent()}
      data-outline={true}
      data-running={ds() === "Running"}
    >
      {t(ds())}
    </div>
  );
}

export function getDirtyOrRunStatus(
  id: string,
  moduleDirtyStates: Record<string, DirtyOrRunStatus>,
): string {
  const s = moduleDirtyStates[id];
  if (!s) {
    return t("Bad status");
  }
  if (s === "queued") {
    return t2(T.FRENCH_UI_STRINGS.pending);
  }
  return capitalizeFirstLetter(s);
}

export function isReady(
  id: string,
  moduleDirtyStates: Record<string, DirtyOrRunStatus>,
): boolean {
  return moduleDirtyStates[id] === "ready";
}
