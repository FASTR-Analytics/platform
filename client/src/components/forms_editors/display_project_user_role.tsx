import type { ProjectPermission, ProjectUser } from "lib";
import { PROJECT_PERMISSION_LABELS, PROJECT_PERMISSION_CATEGORIES, t3, TC } from "lib";
import { AlertComponentProps, Button, ModalContainer } from "panther";
import { createSignal, onMount, Show, For } from "solid-js";
import { serverActions } from "~/server_actions";

export function DisplayProjectUserRole(
  p: AlertComponentProps<
    {
      projectId: string;
      user: ProjectUser;
    },
    undefined
  >,
) {
  const [permissions, setPermissions] = createSignal<Record<
    ProjectPermission,
    boolean
  > | null>(null);
  const [userRoleExists, setUserRoleExists] = createSignal<boolean | null>(
    null,
  );

  onMount(async () => {
    const res = await serverActions.getProjectUserPermissions({
      projectId: p.projectId,
      email: p.user.email,
    });
    if (res.success) {
      setPermissions(res.data.permissions);
      setUserRoleExists(true);
    } else {
      setUserRoleExists(false);
    }
  });

  return (
    <ModalContainer
      width="lg"
      topPanel={
        <div class="space-y-3">
          <div class="font-700 text-lg leading-6">
              {t3({ en: "Permissions", fr: "Permissions" })}
            </div>
            <div class="font-700 text-sm">
              {p.user.email}
            </div>
            <Show
              when={userRoleExists()}
              fallback={<div>{t3(TC.loading)}</div>}
            >
              <Show when={permissions()} fallback={<div>{t3(TC.loading)}</div>}>
                <div class="grid grid-cols-2 gap-4">
                  <For each={PROJECT_PERMISSION_CATEGORIES}>
                    {(category) => (
                      <div class="space-y-1">
                        <div class="font-600 text-sm">{t3(category.label)}</div>
                        <For each={category.permissions}>
                          {(key) => (
                            <div class="flex justify-between">
                              <span>{t3(PROJECT_PERMISSION_LABELS[key])}</span>
                              <span>{permissions()![key] ? "✓" : "✗"}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t3(TC.cancel)}
          </Button>,
        ]
      }
    >
      <Show
        when={userRoleExists()}
        fallback={<div>{t3({ en: "This user does not have access to this project", fr: "Cet utilisateur n'a pas accès à ce projet" })}</div>}
      >
        <Show when={permissions()} fallback={<div>{t3(TC.loading)}</div>}>
          <div class="grid grid-cols-2 gap-4">
            <For each={PROJECT_PERMISSION_CATEGORIES}>
              {(category) => (
                <div class="space-y-1">
                  <div class="font-600 text-sm">{t3(category.label)}</div>
                  <For each={category.permissions}>
                    {(key) => (
                      <div class="flex justify-between">
                        <span>{t3(PROJECT_PERMISSION_LABELS[key])}</span>
                        <span>{permissions()![key] ? "✓" : "✗"}</span>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </ModalContainer>
  );
}
