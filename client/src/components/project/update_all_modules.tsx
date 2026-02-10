import { t3, type InstalledModuleSummary } from "lib";
import { AlertComponentProps, Button, Checkbox, ModalContainer, ProgressBar } from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type ModuleStatus = "pending" | "updating" | "done" | "error";

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
  const [rerunModule, setRerunModule] = createSignal(false);
  const [statuses, setStatuses] = createSignal<Record<string, ModuleStatus>>(
    Object.fromEntries(p.modules.map((m) => [m.id, "pending" as const])),
  );
  const [running, setRunning] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [completedCount, setCompletedCount] = createSignal(0);

  async function start() {
    setRunning(true);
    for (const mod of p.modules) {
      setStatuses((prev) => ({ ...prev, [mod.id]: "updating" }));
      const res = await serverActions.updateModuleDefinition({
        projectId: p.projectId,
        module_id: mod.id,
        preserveSettings: preserveSettings(),
        rerunModule: rerunModule(),
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

  const progressFrom0To100 = () => (completedCount() / p.modules.length) * 100;

  const statusIcon = (s: ModuleStatus) => {
    switch (s) {
      case "pending":
        return <span class="text-neutral">-</span>;
      case "updating":
        return <span class="text-primary animate-pulse">...</span>;
      case "done":
        return <span class="text-success">OK</span>;
      case "error":
        return <span class="text-danger">ERR</span>;
    }
  };

  return (
    <ModalContainer
      title={t3({ en: "Update all modules", fr: "Mettre à jour tous les modules" })}
      rightButtons={
        <Show
          when={done()}
          fallback={
            <Button onClick={start} disabled={running()}>
              {running() ? t3({ en: "Updating...", fr: "Mise à jour..." }) : t3({ en: "Start", fr: "Démarrer" })}
            </Button>
          }
        >
          <Button onClick={() => p.close(undefined)}>{t3({ en: "Close", fr: "Fermer" })}</Button>
        </Show>
      }
    >
      <div class="ui-spy">
        <Show when={!running() && !done()}>
          <div class="flex flex-col gap-2">
            <Checkbox
              label={t3({ en: "Preserve settings", fr: "Conserver les paramètres" })}
              checked={preserveSettings()}
              onChange={setPreserveSettings}
            />
            <Checkbox
              label={t3({ en: "Re-run modules after update", fr: "Relancer les modules après la mise à jour" })}
              checked={rerunModule()}
              onChange={setRerunModule}
            />
          </div>
        </Show>
        <Show when={running() || done()}>
          <ProgressBar
            progressFrom0To100={progressFrom0To100()}
            small
            progressMsg={`${completedCount()} / ${p.modules.length} ${t3({ en: "modules", fr: "modules" })}`}
          />
        </Show>
        <div class="flex flex-col gap-2">
          <For each={p.modules}>
            {(mod) => (
              <div class="flex items-center gap-3 text-sm">
                <div class="w-8 text-center font-mono text-xs">
                  {statusIcon(statuses()[mod.id])}
                </div>
                <div>{mod.moduleDefinitionLabel}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </ModalContainer>
  );
}
