import {
  PERMISSION_PRESETS,
  PROJECT_PERMISSIONS,
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

const PERMISSION_LABELS: Partial<Record<ProjectPermission, string>> = {
  can_configure_visualizations: t3({ en: "can create and edit visualizations", fr: "peut créer et modifier les visualisations" }),
  can_view_visualizations: t3({ en: "can view visualizations", fr: "peut voir les visualisations" }),
  can_configure_reports: t3({ en: "can create and edit reports", fr: "peut créer et modifier les rapports" }),
  can_view_reports: t3({ en: "can view reports", fr: "peut voir les rapports" }),
  can_configure_slide_decks: t3({ en: "can create and edit slide decks", fr: "peut créer et modifier les présentations" }),
  can_view_slide_decks: t3({ en: "can view slide decks", fr: "peut voir les présentations" }),
};

function getPermissionLabel(key: ProjectPermission): string {
  return PERMISSION_LABELS[key] ?? key.replaceAll("_", " ");
}

export const PERMISSION_CATEGORIES: {
  label: string;
  permissions: readonly ProjectPermission[];
}[] = [
  {
    label: t3({ en: "Analytical Products", fr: "Produits analytiques" }),
    permissions: [
      "can_view_visualizations",
      "can_configure_visualizations",
      "can_view_reports",
      "can_configure_reports",
      "can_view_slide_decks",
      "can_configure_slide_decks",
    ],
  },
  {
    label: t3({ en: "Data & Modules", fr: "Données et modules" }),
    permissions: [
      "can_view_data",
      "can_configure_data",
      "can_view_metrics",
      "can_view_script_code",
      "can_configure_modules",
      "can_run_modules",
    ],
  },
  {
    label: t3({ en: "Project Administration", fr: "Administration du projet" }),
    permissions: [
      "can_configure_settings",
      "can_configure_users",
      "can_view_logs",
      "can_create_backups",
      "can_restore_backups",
    ],
  },
];

export function makeDefaultProjectPermissions(): Record<ProjectPermission, boolean> {
  return Object.fromEntries(
    (PROJECT_PERMISSIONS as readonly ProjectPermission[]).map((k) => [k, false]),
  ) as Record<ProjectPermission, boolean>;
}

type Props = {
  projectId: string | null;
  projectLabel: string;
  email: string;
  silentFetch: () => Promise<void>;
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
      await p.silentFetch();
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
                    {preset.label}
                  </Button>
                )}
              </For>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <For each={PERMISSION_CATEGORIES}>
                {(category) => (
                  <div class="space-y-2">
                    <div class="font-600 text-sm">{category.label}</div>
                    <For each={category.permissions as ProjectPermission[]}>
                      {(key) => (
                        <Checkbox
                          label={getPermissionLabel(key)}
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
