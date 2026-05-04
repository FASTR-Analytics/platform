import type { ProjectPermission } from "lib";
import {
  PERMISSION_PRESETS,
  PROJECT_PERMISSIONS,
  PROJECT_PERMISSION_LABELS,
  PROJECT_PERMISSION_CATEGORIES,
  ProjectUser,
  t3,
  TC,
} from "lib";
import {
  AlertComponentProps,
  Button,
  Checkbox,
  ModalContainer,
  StateHolderFormError,
  timActionForm,
} from "panther";
import { For, Show, createSignal, onMount } from "solid-js";
import { serverActions } from "~/server_actions";

function makeDefaultPermissions(): Record<ProjectPermission, boolean> {
  return Object.fromEntries(
    PROJECT_PERMISSIONS.map((k) => [k, false]),
  ) as Record<ProjectPermission, boolean>;
}

export function SelectProjectUserRole(
  p: AlertComponentProps<
    {
      projectId: string;
      projectLabel: string;
      users: ProjectUser[];
    },
    undefined
  >,
) {
  const [permissions, setPermissions] = createSignal<Record<
    ProjectPermission,
    boolean
  > | null>(null);

  onMount(async () => {
    if (p.users.length === 1) {
      const res = await serverActions.getProjectUserPermissions({
        projectId: p.projectId,
        email: p.users[0].email,
      });
      if (res.success) {
        setPermissions(res.data.permissions);
      } else {
        setPermissions(makeDefaultPermissions());
      }
    } else {
      setPermissions(makeDefaultPermissions());
    }
  });

  const togglePermission = (key: ProjectPermission) => {
    const current = permissions();
    if (!current) return;
    setPermissions({ ...current, [key]: !current[key] });
  };

  const save = timActionForm(
    async () => {
      const perms = permissions();
      if (!perms) return { success: true as const };
      return serverActions.updateProjectUserPermissions({
        projectId: p.projectId,
        emails: p.users.map((u) => u.email),
        permissions: perms,
      });
    },
    () => p.close(undefined),
  );

  return (
    <ModalContainer
      width="md"
      topPanel={
        <div class="flex items-center justify-between">
          <div>
            <div class="font-700 text-lg leading-6">
              {t3({ en: "Update project permissions", fr: "Mettre à jour les droits du projet" })}
            </div>
            <div class="font-700 text-sm">
              {p.users.map((u) => u.email).join(", ")}
            </div>
          </div>
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={save.click}
            intent="success"
            state={save.state()}
            iconName="save"
          >
            {t3(TC.save)}
          </Button>,
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
        when={permissions()}
        fallback={<div>{t3(TC.loading)}</div>}
      >
        <div>
          <div class="font-600 text-sm">{t3({ en: "Permission presets", fr: "Préréglages de permissions" })}</div>
          <div class="flex gap-2">
          <For each={PERMISSION_PRESETS}>
            {(preset) => (
              <Button
                onClick={() =>
                  setPermissions(structuredClone(preset.permissions))
                }
                intent="neutral"
                size="sm"
              >
                {t3(preset.label)}
              </Button>
            )}
          </For>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <For each={PROJECT_PERMISSION_CATEGORIES}>
            {(category) => (
              <div class="space-y-1">
                <div class="font-600 text-sm">{t3(category.label)}</div>
                <For each={category.permissions}>
                  {(key) => (
                    <Checkbox
                      label={t3(PROJECT_PERMISSION_LABELS[key])}
                      checked={permissions()![key]}
                      onChange={() => togglePermission(key)}
                    />
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
      <StateHolderFormError state={save.state()} />
    </ModalContainer>
  );
}
