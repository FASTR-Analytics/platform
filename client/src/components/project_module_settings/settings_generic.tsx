import { t, t2, T,
  type APIResponseWithData,
  type ModuleConfigSelectionsParameters,
  type ModuleId } from "lib";
import {
  Button,
  Checkbox,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Input,
  Select,
  StateHolderWrapper,
  timActionButton,
  timQuery,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";

export function SettingsForProjectModuleGeneric(
  p: EditorComponentProps<
    {
      projectId: string;
      projectIsLocked: boolean;
      installedModuleId: ModuleId;
      installedModuleLabel: string;
      silentRefreshProject: () => Promise<void>;
    },
    undefined
  >,
) {
  const [tempParameters, setTempParameters] = createStore<
    Record<string, string>
  >({});
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(false);

  function updateTempParameter(k: string, v: string) {
    setTempParameters(k, v);
    setNeedsSaving(true);
  }

  const config = timQuery(async () => {
    const res = await serverActions.getModuleWithConfigSelections({
      projectId: p.projectId,
      module_id: p.installedModuleId,
    });
    if (!res.success) {
      return res;
    }
    if (res.data.configSelections.configType === "parameters") {
      setTempParameters(res.data.configSelections.parameterSelections);
    } else {
      return { success: false, err: "Wrong config type" };
    }
    return {
      success: true,
      data: res.data.configSelections as ModuleConfigSelectionsParameters,
    };
  }, "Loading module config selections...");

  const save = timActionButton(async () => {
    const newParameters = unwrap(tempParameters);
    return await serverActions.updateModuleParameters({
      projectId: p.projectId,
      module_id: p.installedModuleId,
      newParams: newParameters,
    });
  }, p.silentRefreshProject);

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`${p.installedModuleLabel} ${t2(T.FRENCH_UI_STRINGS.settings_1)}`}>
          <div class="ui-gap-sm flex">
            <Show when={!p.projectIsLocked}>
              <Button
                onClick={save.click}
                state={save.state()}
                intent="success"
                disabled={!needsSaving()}
                iconName="save"
              >
                {t2(T.FRENCH_UI_STRINGS.save)}
              </Button>
            </Show>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={config.state()}>
        {(keyedConfig) => {
          return (
            <div class="ui-pad ui-gap grid grid-cols-12">
              <For
                each={keyedConfig.parameterDefinitions}
                fallback={
                  <div class="text-neutral col-span-12">
                    {t("No parameters for this module")}
                  </div>
                }
              >
                {(inputParameter) => {
                  return (
                    <div class="ui-spy-sm col-span-12 lg:col-span-6 xl:col-span-3">
                      <div class="text-md font-700">
                        {inputParameter.description}
                      </div>
                      <div class="">
                        <Switch fallback="Bad input type">
                          <Match
                            when={inputParameter.input.inputType === "number"}
                          >
                            <Input
                              value={
                                tempParameters[
                                  inputParameter.replacementString
                                ] ?? ""
                              }
                              onChange={(v) =>
                                updateTempParameter(
                                  inputParameter.replacementString,
                                  v,
                                )
                              }
                              invalidMsg={
                                isNaN(
                                  Number(
                                    tempParameters[
                                      inputParameter.replacementString
                                    ],
                                  ),
                                )
                                  ? t("Not a number")
                                  : undefined
                              }
                              fullWidth
                            />
                          </Match>

                          <Match
                            when={inputParameter.input.inputType === "text"}
                          >
                            <Input
                              value={
                                tempParameters[
                                  inputParameter.replacementString
                                ] ?? ""
                              }
                              onChange={(v) =>
                                updateTempParameter(
                                  inputParameter.replacementString,
                                  v,
                                )
                              }
                              invalidMsg={
                                !tempParameters[
                                  inputParameter.replacementString
                                ]
                                  ? t("No text")
                                  : undefined
                              }
                              fullWidth
                            />
                          </Match>
                          <Match
                            when={
                              inputParameter.input.inputType === "select" &&
                              inputParameter.input.options
                            }
                            keyed
                          >
                            {(keyedOptions) => {
                              return (
                                <Select
                                  options={keyedOptions}
                                  value={
                                    tempParameters[
                                      inputParameter.replacementString
                                    ]
                                  }
                                  onChange={(v) =>
                                    updateTempParameter(
                                      inputParameter.replacementString,
                                      v,
                                    )
                                  }
                                  invalidMsg={
                                    !tempParameters[
                                      inputParameter.replacementString
                                    ]
                                      ? t("Unselected")
                                      : undefined
                                  }
                                  fullWidth
                                />
                              );
                            }}
                          </Match>
                          <Match
                            when={inputParameter.input.inputType === "boolean"}
                          >
                            <Checkbox
                              label={t("Yes / No")}
                              checked={
                                tempParameters[
                                  inputParameter.replacementString
                                ] === t("TRUE")
                              }
                              onChange={(v) =>
                                updateTempParameter(
                                  inputParameter.replacementString,
                                  v ? t("TRUE") : t("FALSE"),
                                )
                              }
                            />
                          </Match>
                        </Switch>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
