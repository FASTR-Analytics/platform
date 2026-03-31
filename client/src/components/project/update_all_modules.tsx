import { t3, type InstalledModuleSummary } from "lib";
import { AlertComponentProps, Button, Checkbox, ModalContainer, ProgressBar } from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { moduleLatestCommits } from "~/state/ui";

type ModuleStatus = "pending" | "skipped" | "updating" | "done" | "error";

export function UpdateAllModules(
  p: AlertComponentProps<
    {
      projectId: string;
      modules: InstalledModuleSummary[];
    },
    undefined
  >,
) {
  const [preserveSettings, setPreserveSettings] = createSignal(true);
  const [running, setRunning] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [completedCount, setCompletedCount] = createSignal(0);

  function hasUpdate(mod: InstalledModuleSummary): boolean {
    const commits = moduleLatestCommits();
    if (!commits) return true;
    const entry = commits.find((c) => c.moduleId === mod.id);
    if (!entry) return false;
    if (!mod.installedGitRef) return true;
    return entry.latestCommit.sha !== mod.installedGitRef;
  }

  const modulesWithUpdates = () => p.modules.filter(hasUpdate);
  const modulesUpToDate = () => p.modules.filter((m) => !hasUpdate(m));

  const [statuses, setStatuses] = createSignal<Record<string, ModuleStatus>>(
    Object.fromEntries([
      ...modulesWithUpdates().map((m) => [m.id, "pending" as const]),
      ...modulesUpToDate().map((m) => [m.id, "skipped" as const]),
    ]),
  );

  async function start() {
    setRunning(true);
    const toUpdate = modulesWithUpdates();
    for (const mod of toUpdate) {
      setStatuses((prev) => ({ ...prev, [mod.id]: "updating" }));
      const res = await serverActions.updateModuleDefinition({
        projectId: p.projectId,
        module_id: mod.id,
        preserveSettings: preserveSettings(),
      });
      setStatuses((prev) => ({
        ...prev,
        [mod.id]: res.success ? "done" : "error",
      }));
      setCompletedCount((c) => c + 1);
    }
    setRunning(false);
    setDone(true);
  }

  const progressFrom0To100 = () => {
    const total = modulesWithUpdates().length;
    return total > 0 ? (completedCount() / total) * 100 : 100;
  };

  const statusIcon = (s: ModuleStatus) => {
    switch (s) {
      case "pending":
        return <span class="text-neutral">-</span>;
      case "skipped":
        return <span class="text-neutral text-xs">—</span>;
      case "updating":
        return <span class="text-primary animate-pulse">...</span>;
      case "done":
        return <span class="text-success">OK</span>;
      case "error":
        return <span class="text-danger">ERR</span>;
    }
  };

  const updateCount = () => modulesWithUpdates().length;

  return (
    <ModalContainer
      title={t3({ en: "Update all modules", fr: "Mettre à jour tous les modules" })}
      rightButtons={
        <Show
          when={done()}
          fallback={
            <>
              <Show when={updateCount() > 0 && !running()}>
                <Button onClick={start}>
                  {t3({ en: "Update", fr: "Mettre à jour" })} {updateCount()} {t3({ en: "modules", fr: "modules" })}
                </Button>
              </Show>
              <Show when={running()}>
                <Button disabled>
                  {t3({ en: "Updating...", fr: "Mise à jour..." })}
                </Button>
              </Show>
              <Show when={!running()}>
                <Button onClick={() => p.close(undefined)} intent="neutral" outline>
                  {t3({ en: "Cancel", fr: "Annuler" })}
                </Button>
              </Show>
            </>
          }
        >
          <Button onClick={() => p.close(undefined)}>{t3({ en: "Close", fr: "Fermer" })}</Button>
        </Show>
      }
    >
      <div class="ui-spy">
        <Show when={updateCount() === 0 && !running() && !done()}>
          <div class="text-neutral text-sm">
            {t3({ en: "All modules are up to date.", fr: "Tous les modules sont à jour." })}
          </div>
        </Show>
        <Show when={!running() && !done() && updateCount() > 0}>
          <Checkbox
            label={t3({ en: "Preserve settings", fr: "Conserver les paramètres" })}
            checked={preserveSettings()}
            onChange={setPreserveSettings}
          />
        </Show>
        <Show when={running() || done()}>
          <ProgressBar
            progressFrom0To100={progressFrom0To100()}
            small
            progressMsg={`${completedCount()} / ${updateCount()} ${t3({ en: "modules", fr: "modules" })}`}
          />
        </Show>
        <div class="flex flex-col gap-1">
          <For each={p.modules}>
            {(mod) => (
              <div class="flex items-center gap-3 text-sm">
                <div class="w-8 text-center font-mono text-xs">
                  {statusIcon(statuses()[mod.id])}
                </div>
                <div class={hasUpdate(mod) ? "" : "text-neutral"}>
                  {mod.label}
                </div>
                <Show when={!hasUpdate(mod) && !running() && !done()}>
                  <span class="text-neutral text-xs">
                    {t3({ en: "Up to date", fr: "À jour" })}
                  </span>
                </Show>
                <Show when={hasUpdate(mod) && !running() && !done()}>
                  <span class="text-warning text-xs font-500">
                    {t3({ en: "Update available", fr: "Mise à jour disponible" })}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </ModalContainer>
  );
}
