import { InstanceDetail, OtherUser, isFrench, t, t2, T } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  TimQuery,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function AddProjectForm(
  p: AlertComponentProps<
    {
      instanceDetail: TimQuery<InstanceDetail>;
      users: OtherUser[];
    },
    { newProjectId: string }
  >,
) {
  // Temp state

  const [tempLabel, setTempLabel] = createSignal<string>("");
  // const [tempDatasetsToEnable, setTempDatasetsToEnable] = createSignal<
  //   DatasetType[]
  // >(["hmis"]);
  // const [tempModulesToEnable, setTempModulesToEnable] = createSignal<string[]>(
  //   [],
  // );
  // const [tempProjectUsers, setTempProjectUsers] = createStore<
  //   {
  //     email: string;
  //     role: ProjectUserRoleType;
  //     isGlobalAdmin: boolean;
  //   }[]
  // >(
  //   structuredClone(
  //     p.users.map((otherUser) => ({
  //       email: otherUser.email,
  //       isGlobalAdmin: otherUser.isGlobalAdmin,
  //       role: "none",
  //     })),
  //   ),
  // );

  // Actions

  // const { progressFrom0To100, progressMsg, onProgress } = getProgress();

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const goodLabel = tempLabel().trim();
      if (!goodLabel) {
        return { success: false, err: t("You must enter a project name") };
      }

      // const users = structuredClone(
      //   p.users.map((otherUser) => ({
      //     email: otherUser.email,
      //     isGlobalAdmin: otherUser.isGlobalAdmin,
      //     role: "none",
      //   })),
      // );
      return await serverActions.createProject({
        label: goodLabel,
        datasetsToEnable: [],
        modulesToEnable: [],
        projectEditors: [],
        projectViewers: [],
      });
    },
    () => p.instanceDetail.silentFetch(),
    (data) => p.close({ newProjectId: data!.newProjectId }),
  );

  return (
    <AlertFormHolder
      formId="add-project"
      header={t("Create new project")}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
      wider
    >
      {/* <Switch>
        <Match when={save.state().status === "loading"}>
          <ProgressBar
            progressFrom0To100={progressFrom0To100()}
            progressMsg={progressMsg()}
          />
        </Match>
        <Match when={true}> */}
      <div class="ui-spy">
        <Input
          label={t2(T.FRENCH_UI_STRINGS.project_name)}
          value={tempLabel()}
          onChange={setTempLabel}
          fullWidth
          autoFocus
        />
        {/* <StateHolderWrapper state={p.instanceDetail.state()}>
          {(keyedInstanceDetail) => {
            return (
              <div class="ui-spy">
                <MultiSelect
                  label={t("Enable datasets")}
                  options={_POSSIBLE_DATASETS
                    .filter((d) => {
                      return keyedInstanceDetail.datasetsWithData.includes(
                        d.datasetType,
                      );
                    })
                    .map((d) => {
                      return {
                        value: d.datasetType,
                        label: d.label,
                      };
                    })}
                  values={tempDatasetsToEnable()}
                  onChange={setTempDatasetsToEnable}
                />
                <MultiSelect
                  label={t("Enable modules")}
                  options={getSelectOptionsFromIdLabel(_POSSIBLE_MODULES)}
                  values={tempModulesToEnable()}
                  onChange={setTempModulesToEnable}
                />
                <LabelHolder label={t("User permissions")}>
                  <For each={tempProjectUsers}>
                    {(pu, i_pu) => {
                      return (
                        <div class="ui-gap border-base-300 flex border-t py-1 text-sm">
                          <div class="flex-1">&rarr; {pu.email}</div>
                          <div class="">
                            <Switch>
                              <Match when={pu.isGlobalAdmin}>
                                {t2(T.Paramètres.instance_admin)}
                              </Match>
                              <Match when={true}>
                                <RadioGroup
                                  horizontal
                                  options={[
                                    {
                                      value: "none",
                                      label: t2(T.FRENCH_UI_STRINGS.none),
                                    },
                                    {
                                      value: "viewer",
                                      label: t("Viewer"),
                                    },
                                    {
                                      value: "editor",
                                      label: t2(T.FRENCH_UI_STRINGS.editor),
                                    },
                                  ]}
                                  value={pu.role}
                                  onChange={(v) => {
                                    setTempProjectUsers(
                                      i_pu(),
                                      "role",
                                      v as ProjectUserRoleType,
                                    );
                                  }}
                                />
                              </Match>
                            </Switch>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </LabelHolder>
              </div>
            );
          }}
        </StateHolderWrapper> */}
      </div>
      {/* </Match>
      </Switch> */}
    </AlertFormHolder>
  );
}
