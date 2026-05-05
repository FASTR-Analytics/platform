import {
  AlertComponentProps,
  Button,
  StateHolderFormError,
  timActionForm,
} from "panther";
import { For } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { t3, TC, type ProjectPermission, PROJECT_PERMISSIONS, PERMISSION_PRESETS, PROJECT_PERMISSION_LABELS, PROJECT_PERMISSION_CATEGORIES } from "lib";

type TriState = true | false | "unchanged";

function cycleTriState(current: TriState): TriState {
  if (current === "unchanged") return true;
  if (current === true) return false;
  return "unchanged";
}

type Props = {
  projectId: string;
  emails: string[];
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
              {(preset) => (
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
                  {t3(preset.label)}
                </Button>
              )}
            </For>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <For each={PROJECT_PERMISSION_CATEGORIES}>
            {(category) => (
              <div class="space-y-2">
                <div class="font-600 text-sm">{t3(category.label)}</div>
                <For each={category.permissions}>
                  {(key) => (
                    <TriStateCheckbox
                      label={t3(PROJECT_PERMISSION_LABELS[key])}
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
