import {
  AlertComponentProps,
  Button,
  StateHolderFormError,
  timActionForm,
} from "panther";
import { For } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { t3, TC, type ProjectPermission, PROJECT_PERMISSIONS, PERMISSION_PRESETS } from "lib";

type TriState = true | false | "unchanged";

const PERMISSION_LABELS: Record<ProjectPermission, string> = {
  can_view_visualizations: t3({ en: "can view visualizations", fr: "peut voir les visualisations" }),
  can_configure_visualizations: t3({ en: "can create and edit visualizations", fr: "peut créer et modifier les visualisations" }),
  can_view_reports: t3({ en: "can view reports", fr: "peut voir les rapports" }),
  can_configure_reports: t3({ en: "can create and edit reports", fr: "peut créer et modifier les rapports" }),
  can_view_slide_decks: t3({ en: "can view slide decks", fr: "peut voir les présentations" }),
  can_configure_slide_decks: t3({ en: "can create and edit slide decks", fr: "peut créer et modifier les présentations" }),
  can_configure_data: t3({ en: "can configure data", fr: "peut configurer les données" }),
  can_view_data: t3({ en: "can view data", fr: "peut voir les données" }),
  can_view_metrics: t3({ en: "can view metrics", fr: "peut voir les métriques" }),
  can_configure_modules: t3({ en: "can configure modules", fr: "peut configurer les modules" }),
  can_run_modules: t3({ en: "can run modules", fr: "peut exécuter les modules" }),
  can_configure_settings: t3({ en: "can configure settings", fr: "peut configurer les paramètres" }),
  can_configure_users: t3({ en: "can configure users", fr: "peut configurer les utilisateurs" }),
  can_view_logs: t3({ en: "can view logs", fr: "peut voir les journaux" }),
  can_create_backups: t3({ en: "can create backups", fr: "peut créer des sauvegardes" }),
  can_restore_backups: t3({ en: "can restore backups", fr: "peut restaurer des sauvegardes" }),
};

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

function cycleTriState(current: TriState): TriState {
  if (current === "unchanged") return true;
  if (current === true) return false;
  return "unchanged";
}

type Props = {
  projectId: string;
  emails: string[];
  silentFetch: () => Promise<void>;
};

export function BulkEditProjectPermissionsForm(
  p: AlertComponentProps<Props, undefined>,
) {
  const [state, setState] = createStore<Record<ProjectPermission, TriState>>(
    Object.fromEntries(
      PROJECT_PERMISSIONS.map((k) => [k, "unchanged" as TriState]),
    ) as Record<ProjectPermission, TriState>,
  );

  const save = timActionForm(
    async () => {
      const permissions: Partial<Record<ProjectPermission, boolean>> = {};
      for (const key of PROJECT_PERMISSIONS) {
        const val = state[key];
        if (val !== "unchanged") {
          permissions[key] = val;
        }
      }
      return serverActions.bulkUpdateProjectUserPermissions({
        projectId: p.projectId,
        emails: p.emails,
        permissions,
      });
    },
    p.silentFetch,
    () => p.close(undefined),
  );

  const userCount = p.emails.length;

  return (
    <div class="ui-pad ui-spy w-[600px]">
      <div class="space-y-3">
        <div class="font-700 text-lg leading-6">
          {t3({ en: `Edit permissions for ${userCount} user${userCount === 1 ? "" : "s"}`, fr: `Modifier les permissions pour ${userCount} utilisateur${userCount === 1 ? "" : "s"}` })}
        </div>
        <div class="font-700 text-sm">
          {p.emails.join(", ")}
        </div>
        <div class="text-xs text-neutral">
          {t3({ en: "Click to cycle: unchanged → true → false", fr: "Cliquez pour alterner : inchangé → vrai → faux" })}
        </div>
        <div>
          <div class="font-600 text-sm">{t3({ en: "Permission presets", fr: "Préréglages de permissions" })}</div>
          <div class="flex gap-2">
            <For each={PERMISSION_PRESETS}>
              {(preset: { label: string; permissions: Record<ProjectPermission, boolean> }) => (
                <Button
                  onClick={() =>
                    setState(
                      Object.fromEntries(
                        PROJECT_PERMISSIONS.map((k: ProjectPermission) => [k, preset.permissions[k]]),
                      ) as Record<ProjectPermission, TriState>,
                    )
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
        <div class="grid grid-cols-2 gap-4">
          <For each={PERMISSION_CATEGORIES}>
            {(category: { label: string; permissions: readonly ProjectPermission[] }) => (
              <div class="space-y-2">
                <div class="font-600 text-sm">{category.label}</div>
                <For each={category.permissions}>
                  {(key: ProjectPermission) => (
                    <TriStateCheckbox
                      label={PERMISSION_LABELS[key]}
                      value={state[key]}
                      onChange={() => setState(key, cycleTriState(state[key]))}
                    />
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="flex gap-2">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          iconName="save"
        >
          {t3(TC.save)}
        </Button>
        <Button
          onClick={() => p.close(undefined)}
          intent="neutral"
          iconName="x"
        >
          {t3(TC.cancel)}
        </Button>
      </div>
    </div>
  );
}

function TriStateCheckbox(p: {
  label: string;
  value: TriState;
  onChange: () => void;
}) {
  const icon = () => {
    if (p.value === true) return "✓";
    if (p.value === false) return "✗";
    return "—";
  };

  const boxClass = () => {
    const base = "w-4 h-4 rounded border flex items-center justify-center text-xs flex-none";
    if (p.value === true)
      return `${base} bg-primary border-primary text-primary-content`;
    if (p.value === false)
      return `${base} border-danger text-danger bg-danger/10 font-700`;
    return `${base} bg-base-200 border-base-400 text-base-content`;
  };

  const labelClass = () => {
    if (p.value === "unchanged") return "text-sm text-neutral";
    if (p.value === false) return "text-sm text-danger";
    return "text-sm";
  };

  return (
    <label class="flex items-center gap-2 cursor-pointer select-none" onClick={() => p.onChange()}>
      <span class={boxClass()}>{icon()}</span>
      <span class={labelClass()}>{p.label}</span>
    </label>
  );
}
