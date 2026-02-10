import {
  AlertComponentProps,
  Button,
  ModalContainer,
  StateHolderFormError,
  timActionForm,
} from "panther";
import { For } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { t3, TC, type UserPermission } from "lib";
import { USER_PERMISSIONS } from "./user";

type TriState = true | false | "unchanged";

const PERMISSION_LABELS: Record<UserPermission, () => string> = {
  can_configure_users: () => t3({ en: "Configure users", fr: "Configurer les utilisateurs" }),
  can_view_users: () => t3({ en: "View users", fr: "Voir les utilisateurs" }),
  can_view_logs: () => t3({ en: "View logs", fr: "Voir les journaux" }),
  can_configure_settings: () => t3({ en: "Configure settings", fr: "Configurer les paramètres" }),
  can_configure_assets: () => t3({ en: "Configure assets", fr: "Configurer les ressources" }),
  can_configure_data: () => t3({ en: "Configure data", fr: "Configurer les données" }),
  can_view_data: () => t3({ en: "View data", fr: "Voir les données" }),
  can_create_projects: () => t3({ en: "Create projects", fr: "Créer des projets" }),
};

function cycleTriState(current: TriState): TriState {
  if (current === "unchanged") return true;
  if (current === true) return false;
  return "unchanged";
}

type Props = {
  emails: string[];
  silentFetch: () => Promise<void>;
};

export function BulkEditPermissionsForm(
  p: AlertComponentProps<Props, undefined>,
) {
  const [state, setState] = createStore<Record<UserPermission, TriState>>(
    Object.fromEntries(
      USER_PERMISSIONS.map((k) => [k, "unchanged" as TriState]),
    ) as Record<UserPermission, TriState>,
  );

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const permissions: Partial<Record<UserPermission, boolean>> = {};
      for (const key of USER_PERMISSIONS) {
        const val = state[key];
        if (val !== "unchanged") {
          permissions[key] = val;
        }
      }
      return serverActions.bulkUpdateUserPermissions({
        emails: p.emails,
        permissions,
      });
    },
    p.silentFetch,
    () => p.close(undefined),
  );

  const userCount = p.emails.length;

  return (
    <ModalContainer
      width="sm"
      title={t3({ en: `Edit permissions for ${userCount} user${userCount === 1 ? "" : "s"}`, fr: `Modifier les permissions pour ${userCount} utilisateur${userCount === 1 ? "" : "s"}` })}
      leftButtons={[
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
          outline
        >
          {t3(TC.cancel)}
        </Button>,
      ]}
    >
      <div class="space-y-1">
        <div class="text-xs text-neutral mb-2">
          {t3({ en: "Click to cycle: unchanged \u2192 true \u2192 false", fr: "Cliquer pour alterner : inchangé \u2192 vrai \u2192 faux" })}
        </div>
        <For each={USER_PERMISSIONS}>
          {(key: UserPermission) => (
            <TriStateCheckbox
              label={PERMISSION_LABELS[key]()}
              value={state[key]}
              onChange={() => setState(key, cycleTriState(state[key]))}
            />
          )}
        </For>
      </div>
      <StateHolderFormError state={save.state()} />
    </ModalContainer>
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
    <label class="flex items-center gap-2 cursor-pointer select-none py-1" onClick={() => p.onChange()}>
      <span class={boxClass()}>{icon()}</span>
      <span class={labelClass()}>{p.label}</span>
    </label>
  );
}
