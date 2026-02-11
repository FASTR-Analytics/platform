import {
  AlertComponentProps,
  Button,
  StateHolderFormError,
  timActionForm,
} from "panther";
import { For } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { t, t2, T, type ProjectPermission, PROJECT_PERMISSIONS } from "lib";

type TriState = true | false | "unchanged";

const PERMISSION_LABELS: Record<ProjectPermission, string> = {
  can_view_visualizations: "can view visualizations",
  can_configure_visualizations: "can create and edit visualizations",
  can_view_reports: "can view reports",
  can_configure_reports: "can create and edit reports",
  can_view_slide_decks: "can view slide decks",
  can_configure_slide_decks: "can create and edit slide decks",
  can_configure_data: "can configure data",
  can_view_data: "can view data",
  can_view_metrics: "can view metrics",
  can_configure_modules: "can configure modules",
  can_run_modules: "can run modules",
  can_configure_settings: "can configure settings",
  can_configure_users: "can configure users",
  can_view_logs: "can view logs",
  can_create_backups: "can create backups",
  can_restore_backups: "can restore backups",
};

const PERMISSION_CATEGORIES: {
  label: string;
  permissions: readonly ProjectPermission[];
}[] = [
  {
    label: "Analytical Products",
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
    label: "Data & Modules",
    permissions: [
      "can_view_data",
      "can_configure_data",
      "can_view_metrics",
      "can_configure_modules",
      "can_run_modules",
    ],
  },
  {
    label: "Project Administration",
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
          {t(`Edit permissions for ${userCount} user${userCount === 1 ? "" : "s"}`)}
        </div>
        <div class="font-700 text-sm">
          {p.emails.join(", ")}
        </div>
        <div class="text-xs text-neutral">
          {t("Click to cycle: unchanged → true → false")}
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
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
        <Button
          onClick={() => p.close(undefined)}
          intent="neutral"
          iconName="x"
        >
          {t2(T.FRENCH_UI_STRINGS.cancel)}
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
