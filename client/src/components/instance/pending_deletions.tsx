import { t3 } from "lib";
import { Button, EditorComponentProps, FrameTop } from "panther";
import { createMemo, For } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

export function PendingDeletions(p: EditorComponentProps<{}, undefined>) {
  const pendingProjects = createMemo(() =>
    instanceState.projects.filter((proj) => proj.status === "pending_deletion"),
  );

  async function handleRestore(projectId: string) {
    await serverActions.restoreProject({
      project_id: projectId,
      projectId: projectId,
    });
  }

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "Pending deletions", fr: "Suppressions en attente" })}
          </div>
        </div>
      }
    >
      <div class="ui-pad ui-spy">
        <For
          each={pendingProjects()}
          fallback={
            <div class="text-neutral text-sm">
              {t3({
                en: "No projects pending deletion",
                fr: "Aucun projet en attente de suppression",
              })}
            </div>
          }
        >
          {(project) => (
            <div class="border-base-300 flex items-center justify-between rounded border p-4">
              <div class="ui-spy-sm">
                <div class="font-700">{project.label}</div>
                <div class="text-neutral text-sm">
                  {project.deletionScheduledAt
                    ? t3({
                        en: `Scheduled for deletion on ${new Date(project.deletionScheduledAt).toLocaleDateString()}`,
                        fr: `Suppression prévue le ${new Date(project.deletionScheduledAt).toLocaleDateString()}`,
                      })
                    : null}
                </div>
              </div>
              <Button onClick={() => handleRestore(project.id)} outline>
                {t3({ en: "Restore", fr: "Restaurer" })}
              </Button>
            </div>
          )}
        </For>
      </div>
    </FrameTop>
  );
}
