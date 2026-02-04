import { OtherUser, ProjectUser, ProjectUserRoleType, t2, T } from "lib";
import {
  AlertComponentProps,
  Button,
  RadioGroup,
  StateHolderFormError,
  getSelectOptions,
  timActionForm,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { t } from "lib";

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
  const [tempRole, setTempRole] = createSignal<ProjectUserRoleType>(
    p.users.at(0)?.role ?? "viewer",
  );

  const save = p.silentFetch
    ? timActionForm(
        async () => {
          const role = tempRole();
          return serverActions.updateProjectUserRole({
            projectId: p.projectId,
            emails: p.users.map((u) => u.email),
            role,
          });
        },
        p.silentFetch,
        () => p.close(undefined),
      )
    : timActionForm(
        async () => {
          const role = tempRole();
          return serverActions.updateProjectUserRole({
            projectId: p.projectId,
            emails: p.users.map((u) => u.email),
            role,
          });
        },
        () => p.close(undefined),
      );

  return (
    <div class="ui-pad ui-spy w-[400px]">
      <div class="space-y-3">
        <div class="font-700 text-lg leading-6">
          {t2(T.FRENCH_UI_STRINGS.update_project_permissions)}
        </div>
        <div class="font-700 text-sm">
          {p.users.map((u) => u.email).join(", ")}
        </div>
        <Switch>
          {/* <Match when={p.user.isGlobalAdmin}>
            <div class="text-sm">
              {t(
                "This user is automatically a project editor because they are an instance administrator",
              )}
            </div>
          </Match> */}
          <Match when={true}>
            <div class="">
              <RadioGroup
                options={[
                  {
                    value: "none",
                    label: t2(T.FRENCH_UI_STRINGS.no_permissions_for_this_projec),
                  },
                  { value: "viewer", label: t2(T.FRENCH_UI_STRINGS.can_view_this_project) },
                  { value: "editor", label: t2(T.FRENCH_UI_STRINGS.can_edit_this_project) },
                ]}
                value={tempRole()}
                onChange={setTempRole}
              />
            </div>
          </Match>
        </Switch>
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="flex gap-2">
        {/* <Show when={!p.user.isGlobalAdmin}> */}
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          iconName="save"
        >
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
        {/* </Show> */}
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
