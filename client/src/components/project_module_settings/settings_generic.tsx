import { t3, TC,
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
  }, t3({ en: "Loading module config selections...", fr: "Chargement des configurations du module..." }));

  const save = timActionButton(async () => {
    const newParameters = unwrap(tempParameters);
    return await serverActions.updateModuleParameters({
      projectId: p.projectId,
      module_id: p.installedModuleId,
      newParams: newParameters,
    });
  });

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`${p.installedModuleLabel} ${t3({ en: "settings", fr: "paramètres" })}`}>
          <div class="ui-gap-sm flex">
            <Show when={!p.projectIsLocked}>
              <Button
                onClick={save.click}
                state={save.state()}
                intent="success"
                disabled={!needsSaving()}
                iconName="save"
              >
                {t3(TC.save)}
              </Button>
            </Show>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t3(TC.cancel)}
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
                    {t3({ en: "No parameters for this module", fr: "Aucun paramètre pour ce module" })}
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
                        <Switch fallback={t3({ en: "Bad input type", fr: "Type de saisie incorrect" })}>
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
                                  ? t3({ en: "Not a number", fr: "Pas un nombre" })
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
                                  ? t3({ en: "No text", fr: "Aucun texte" })
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
                                      ? t3({ en: "Unselected", fr: "Non sélectionné" })
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
                              label={t3({ en: "Yes / No", fr: "Oui / Non" })}
                              checked={
                                tempParameters[
                                  inputParameter.replacementString
                                ] === "TRUE"
                              }
                              onChange={(v) =>
                                updateTempParameter(
                                  inputParameter.replacementString,
                                  v ? "TRUE" : "FALSE",
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
