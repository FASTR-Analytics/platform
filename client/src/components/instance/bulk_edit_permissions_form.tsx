import {
  AlertComponentProps,
  AlertFormHolder,
  timActionForm,
} from "panther";
import { For } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { isFrench, t, type UserPermission } from "lib";
import { USER_PERMISSIONS } from "./user";

type TriState = true | false | "unchanged";

const PERMISSION_LABELS: Record<UserPermission, string> = {
  can_configure_users: "Configure users",
  can_view_users: "View users",
  can_view_logs: "View logs",
  can_configure_settings: "Configure settings",
  can_configure_assets: "Configure assets",
  can_configure_data: "Configure data",
  can_view_data: "View data",
  can_create_projects: "Create projects",
};

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
  const headerText = t(
    `Edit permissions for ${userCount} user${userCount === 1 ? "" : "s"}`,
  );

  return (
    <AlertFormHolder
      formId="bulk-edit-permissions"
      header={headerText}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <div class="w-[420px] space-y-1">
        <For each={[...USER_PERMISSIONS]}>
          {(key) => (
            <div class="flex items-center gap-3 py-1">
              <span class="text-sm flex-1 min-w-0">
                {PERMISSION_LABELS[key]}
              </span>
              <div class="flex gap-0.5 flex-none">
                <TriStateButton
                  label="—"
                  title={t("Unchanged")}
                  active={state[key] === "unchanged"}
                  onClick={() => setState(key, "unchanged")}
                  intent="neutral"
                />
                <TriStateButton
                  label="✓"
                  title={t("Set to true")}
                  active={state[key] === true}
                  onClick={() => setState(key, true)}
                  intent="positive"
                />
                <TriStateButton
                  label="✗"
                  title={t("Set to false")}
                  active={state[key] === false}
                  onClick={() => setState(key, false)}
                  intent="negative"
                />
              </div>
            </div>
          )}
        </For>
      </div>
    </AlertFormHolder>
  );
}

function TriStateButton(p: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  intent: "neutral" | "positive" | "negative";
}) {
  const cls = () => {
    const base =
      "w-8 h-8 flex items-center justify-center text-sm rounded cursor-pointer border transition-colors";
    if (!p.active)
      return `${base} border-base-300 text-neutral bg-transparent hover:bg-base-200`;
    switch (p.intent) {
      case "neutral":
        return `${base} border-base-400 text-base-content bg-base-200 font-700`;
      case "positive":
        return `${base} border-success text-success bg-success/10 font-700`;
      case "negative":
        return `${base} border-error text-error bg-error/10 font-700`;
    }
  };

  return (
    <button type="button" class={cls()} title={p.title} onClick={() => p.onClick()}>
      {p.label}
    </button>
  );
}
