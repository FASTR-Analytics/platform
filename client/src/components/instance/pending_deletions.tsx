import { t3 } from"lib";
import { Button, EditorComponentProps, FrameTop, ModalContainer, openComponent, type AlertComponentProps } from"panther";
import { createMemo, createSignal, For } from"solid-js";
import { serverActions } from"~/server_actions";
import { instanceState } from"~/state/instance/t1_store";

function ForceDeleteModal(p: AlertComponentProps<{ projectId: string; projectLabel: string }, undefined>) {
 const [loading, setLoading] = createSignal(false);

 async function handleConfirm() {
 setLoading(true);
 try {
 await serverActions.forceDeleteProject({
 project_id: p.projectId,
 projectId: p.projectId,
      });
    } finally {
 setLoading(false);
    }
 p.close(undefined);
  }

 return (
    <ModalContainer
 width="sm"
 topPanel={
        <div class="font-700 text-base-content text-xl">
          {t3({ en:"Permanently delete project?", fr:"Supprimer définitivement le projet ?", pt:"Eliminar permanentemente o projeto?"})}
        </div>
      }
 leftButtons={[
        <Button onClick={() => p.close(undefined)} intent="neutral"disabled={loading()}>
          {t3({ en:"Cancel", fr:"Annuler", pt:"Cancelar"})}
        </Button>,
      ]}
 rightButtons={[
        <Button onClick={handleConfirm} intent="danger"disabled={loading()}>
          {t3({ en:"Delete permanently", fr:"Supprimer définitivement", pt:"Eliminar permanentemente"})}
        </Button>,
      ]}
    >
      <div class="ui-spy-sm">
        <p class="text-base-content text-sm">
          {t3({
 en:`Are you sure you want to permanently delete"${p.projectLabel}"? This cannot be undone.`,
 fr:`Êtes-vous sûr de vouloir supprimer définitivement « ${p.projectLabel} » ? Cette action est irréversible.`,
 pt:`Tem a certeza de que pretende eliminar permanentemente"${p.projectLabel}"? Esta ação não pode ser anulada.`,
          })}
        </p>
        <p class="text-danger text-sm font-700">
          {t3({
 en:"All project data, visualizations, and reports will be lost forever.",
 fr:"Toutes les données, visualisations et rapports du projet seront perdus pour toujours.",
 pt:"Todos os dados, visualizações e relatórios do projeto serão perdidos para sempre.",
          })}
        </p>
      </div>
    </ModalContainer>
  );
}

export function PendingDeletions(p: EditorComponentProps<{}, undefined>) {
 const pendingProjects = createMemo(() =>
 instanceState.projects.filter((proj) => proj.status ==="pending_deletion"),
  );

 async function handleRestore(projectId: string) {
 await serverActions.restoreProject({
 project_id: projectId,
 projectId: projectId,
    });
  }

 async function handleForceDelete(projectId: string, projectLabel: string) {
 await openComponent({
 element: ForceDeleteModal,
 props: { projectId, projectLabel },
    });
  }

 return (
    <FrameTop
 panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft"onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en:"Pending deletions", fr:"Suppressions en attente", pt:"Eliminações pendentes"})}
          </div>
        </div>
      }
    >
      <div class="ui-pad ui-spy">
        <For
 each={pendingProjects()}
 fallback={
            <div class="text-base-content-muted text-sm">
              {t3({
 en:"No projects pending deletion",
 fr:"Aucun projet en attente de suppression",
 pt:"Nenhum projeto com eliminação pendente",
              })}
            </div>
          }
        >
          {(project) => (
            <div class="flex items-center justify-between rounded border p-4">
              <div class="ui-spy-sm">
                <div class="font-700">{project.label}</div>
                <div class="text-base-content-muted text-sm">
                  {project.deletionScheduledAt
                    ? t3({
 en:`Scheduled for deletion on ${new Date(project.deletionScheduledAt).toLocaleDateString()}`,
 fr:`Suppression prévue le ${new Date(project.deletionScheduledAt).toLocaleDateString()}`,
 pt:`Eliminação agendada para ${new Date(project.deletionScheduledAt).toLocaleDateString()}`,
                      })
                    : null}
                </div>
              </div>
              <div class="ui-gap flex items-center">
                <Button
 onClick={() => handleForceDelete(project.id, project.label)}
 intent="danger"
 outline
                >
                  {t3({ en:"Delete now", fr:"Supprimer maintenant", pt:"Eliminar agora"})}
                </Button>
                <Button onClick={() => handleRestore(project.id)} outline>
                  {t3({ en:"Restore", fr:"Restaurer", pt:"Restaurar"})}
                </Button>
              </div>
            </div>
          )}
        </For>
      </div>
    </FrameTop>
  );
}
