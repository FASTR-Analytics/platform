import type { ProjectPermission } from "lib";
import {
  PERMISSION_PRESETS,
  PROJECT_PERMISSIONS,
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

const PERMISSION_CATEGORIES: {
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
      silentFetch?: () => Promise<void>;
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
    async () => {
      await p.silentFetch?.();
      p.close(undefined);
    },
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
            {(preset: {
              label: string;
              permissions: Record<ProjectPermission, boolean>;
            }) => (
              <Button
                onClick={() =>
                  setPermissions(structuredClone(preset.permissions))
                }
                intent="neutral"
                size="sm"
              >
                {preset.label}
              </Button>
            )}
          </For>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <For each={PERMISSION_CATEGORIES}>
            {(category: {
              label: string;
              permissions: readonly ProjectPermission[];
            }) => (
              <div class="space-y-1">
                <div class="font-600 text-sm">{category.label}</div>
                <For each={category.permissions}>
                  {(key: ProjectPermission) => (
                    <Checkbox
                      label={getPermissionLabel(key)}
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
