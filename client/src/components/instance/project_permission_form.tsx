import {
  PERMISSION_PRESETS,
  PROJECT_PERMISSIONS,
  PROJECT_PERMISSION_LABELS,
  PROJECT_PERMISSION_CATEGORIES,
  type ProjectPermission,
  t3,
  TC,
} from "lib";
import {
  AlertComponentProps,
  Button,
  Checkbox,
  ModalContainer,
  timActionButton,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

function makeDefaultProjectPermissions(): Record<ProjectPermission, boolean> {
  return Object.fromEntries(
    (PROJECT_PERMISSIONS as readonly ProjectPermission[]).map((k) => [k, false]),
  ) as Record<ProjectPermission, boolean>;
}

type Props = {
  projectId: string | null;
  projectLabel: string;
  email: string;
};

export function ProjectPermissionForm(p: AlertComponentProps<Props, undefined>) {
  const [permissions, setPermissions] = createSignal<Record<ProjectPermission, boolean> | null>(null);
  const [originalPermissions, setOriginalPermissions] = createSignal<Record<ProjectPermission, boolean> | null>(null);

  (async () => {
    let fetched: Record<ProjectPermission, boolean> | null = null;
    if (p.projectId === null) {
      const res = await serverActions.getUserDefaultProjectPermissions({ email: p.email });
      if (res.success) {
        fetched = res.data.permissions;
      }
    } else {
      const res = await serverActions.getProjectUserPermissions({ projectId: p.projectId, email: p.email });
      if (res.success) {
        fetched = res.data.permissions;
      }
    }
    const perms = fetched ?? makeDefaultProjectPermissions();
    setPermissions(perms);
    setOriginalPermissions(perms);
  })();

  const hasChanges = (): boolean => {
    const current = permissions();
    const original = originalPermissions();
    if (!current || !original) return false;
    return (PROJECT_PERMISSIONS as readonly ProjectPermission[]).some((key) => current[key] !== original[key]);
  };

  const togglePerm = (key: ProjectPermission) => {
    const current = permissions();
    if (!current) return;
    setPermissions({ ...current, [key]: !current[key] });
  };

  const save = timActionButton(
    async () => {
      const perms = permissions();
      if (!perms) return { success: false as const, err: "No permissions" };
      if (p.projectId === null) {
        return serverActions.updateUserDefaultProjectPermissions({
          email: p.email,
          permissions: perms,
        });
      } else {
        const res = await serverActions.updateProjectUserPermissions({
          projectId: p.projectId,
          emails: [p.email],
          permissions: perms,
        });
        if (!res.success) {
          // User may not be on the project yet — add them first, then retry
          const addRes = await serverActions.addProjectUserRole({
            projectId: p.projectId,
            email: p.email,
          });
          if (!addRes.success) return addRes;
          return serverActions.updateProjectUserPermissions({
            projectId: p.projectId,
            emails: [p.email],
            permissions: perms,
          });
        }
        return res;
      }
    },
    async () => {
      setOriginalPermissions(permissions());
    },
  );

  return (
    <ModalContainer
      width="lg"
      title={p.projectLabel}
      leftButtons={[
        <Show when={hasChanges()}>
          <Button
            onClick={save.click}
            state={save.state()}
            intent="success"
            iconName="save"
          >
            {t3(TC.save)}
          </Button>
        </Show>,
        <Button
          onClick={() => p.close(undefined)}
          intent="neutral"
          iconName="x"
          outline
        >
          {t3(TC.cancel)}
        </Button>,
      ]}
    >
      <Show when={permissions()} keyed fallback={<div>{t3(TC.loading)}</div>}>
        {(perms) => (
          <div class="ui-spy-sm">
            <div class="flex gap-2">
              <For each={PERMISSION_PRESETS}>
                {(preset) => (
                  <Button
                    onClick={() => setPermissions(structuredClone(preset.permissions))}
                    intent="neutral"
                    size="sm"
                  >
                    {t3(preset.label)}
                  </Button>
                )}
              </For>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <For each={PROJECT_PERMISSION_CATEGORIES}>
                {(category) => (
                  <div class="space-y-2">
                    <div class="font-600 text-sm">{t3(category.label)}</div>
                    <For each={category.permissions}>
                      {(key) => (
                        <Checkbox
                          label={t3(PROJECT_PERMISSION_LABELS[key])}
                          checked={perms[key]}
                          onChange={() => togglePerm(key)}
                        />
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
    </ModalContainer>
  );
}
