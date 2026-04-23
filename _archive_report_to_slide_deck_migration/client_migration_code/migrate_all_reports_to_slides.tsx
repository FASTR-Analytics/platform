import { t3 } from "lib";
import type { EditorComponentProps } from "panther";
import { Button, ModalContainer, toPct1 } from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { migrateProjectReports } from "./migrate_project_reports";

type Props = {};

export function MigrateAllReportsToSlides(
  p: EditorComponentProps<Props, undefined>
) {
  const [phase, setPhase] = createSignal<"ready" | "running" | "done">("ready");
  const [currentProject, setCurrentProject] = createSignal("");
  const [projectProgress, setProjectProgress] = createSignal({ current: 0, total: 0 });
  const [itemProgress, setItemProgress] = createSignal({ current: 0, total: 0 });
  const [log, setLog] = createSignal<string[]>([]);
  const [errors, setErrors] = createSignal<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  function addError(msg: string) {
    setErrors((prev) => [...prev, msg]);
  }

  async function runMigration() {
    setPhase("running");
    const projects = instanceState.projects;
    setProjectProgress({ current: 0, total: projects.length });

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      setCurrentProject(project.label);
      setProjectProgress({ current: i + 1, total: projects.length });

      const wasLocked = project.isLocked;
      try {
        if (wasLocked) {
          await serverActions.setProjectLockStatus({
            project_id: project.id,
            projectId: project.id,
            lockAction: "unlock",
          });
        }

        const detailRes = await serverActions.getProjectDetail({ projectId: project.id });
        if (!detailRes.success) {
          addError(`${project.label}: Failed to fetch project detail`);
          continue;
        }
        const projectDetail = detailRes.data;

        const slideDeckReports = projectDetail.reports.filter(
          (r) => r.reportType === "slide_deck"
        );
        if (slideDeckReports.length === 0) {
          addLog(`${project.label}: No slide_deck reports, skipping`);
          continue;
        }

        const result = await migrateProjectReports(
          projectDetail,
          (current, total) => setItemProgress({ current, total }),
          addLog,
          addError
        );

        addLog(`${project.label}: Migrated ${result.migratedCount} reports`);
      } catch (e) {
        addError(`${project.label}: ${e instanceof Error ? e.message : "Unknown error"}`);
      } finally {
        if (wasLocked) {
          await serverActions.setProjectLockStatus({
            project_id: project.id,
            projectId: project.id,
            lockAction: "lock",
          });
        }
      }
    }

    setPhase("done");
    addLog("Migration complete!");
  }

  const overallPct = () => {
    const pp = projectProgress();
    if (pp.total === 0) return 0;
    const projectPct = (pp.current - 1) / pp.total;
    const ip = itemProgress();
    const itemPct = ip.total > 0 ? ip.current / ip.total / pp.total : 0;
    return projectPct + itemPct;
  };

  return (
    <ModalContainer
      title={t3({
        en: "Migrate all reports to slides",
        fr: "Migrer tous les rapports vers les diapositives",
      })}
      width="md"
      leftButtons={
        phase() === "done"
          ? [
              <Button onClick={() => p.close(undefined)} intent="primary">
                {t3({ en: "Done", fr: "Termine" })}
              </Button>,
            ]
          : phase() === "ready"
            ? [
                <Button onClick={runMigration} intent="success">
                  {t3({ en: "Start migration", fr: "Demarrer la migration" })}
                </Button>,
                <Button onClick={() => p.close(undefined)} intent="neutral" iconName="x">
                  {t3({ en: "Cancel", fr: "Annuler" })}
                </Button>,
              ]
            : undefined
      }
    >
      <div class="ui-spy-sm">
        <Show when={phase() === "ready"}>
          <div>
            {t3({
              en: `This will migrate all slide_deck reports across ${instanceState.projects.length} projects to the new slides system.`,
              fr: `Ceci migrera tous les rapports de type presentation sur ${instanceState.projects.length} projets vers le nouveau systeme de diapositives.`,
            })}
          </div>
        </Show>

        <Show when={phase() === "running"}>
          <div class="ui-spy-sm">
            <div class="font-600">
              {t3({ en: "Project", fr: "Projet" })}: {currentProject()} ({projectProgress().current}/{projectProgress().total})
            </div>
            <div class="bg-base-300 h-4 w-full rounded">
              <div
                class="bg-primary h-full rounded transition-all"
                style={{ width: toPct1(overallPct()) }}
              />
            </div>
            <Show when={itemProgress().total > 0}>
              <div class="text-neutral text-sm">
                {t3({ en: "Item", fr: "Element" })}: {itemProgress().current}/{itemProgress().total}
              </div>
            </Show>
          </div>
        </Show>

        <Show when={log().length > 0}>
          <div class="border-base-300 max-h-48 overflow-y-auto rounded border p-2">
            <For each={log()}>{(msg) => <div class="text-sm">{msg}</div>}</For>
          </div>
        </Show>

        <Show when={errors().length > 0}>
          <div class="border-danger max-h-32 overflow-y-auto rounded border p-2">
            <For each={errors()}>
              {(msg) => <div class="text-danger text-sm">{msg}</div>}
            </For>
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}
