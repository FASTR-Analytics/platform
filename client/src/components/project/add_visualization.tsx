import {
  DisaggregationOption,
  InstalledModuleSummary,
  PresentationOption,
  get_PRESENTATION_SELECT_OPTIONS,
  isFrench,
  t,
  t2,
  T,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  LabelHolder,
  RadioGroup,
  StateHolderWrapper,
  getSelectOptionsFromIdLabel,
  timActionForm,
  timQuery,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function AddVisualization(
  p: AlertComponentProps<
    {
      projectId: string;
      isGlobalAdmin: boolean;
    },
    { moduleId: string; newPresentationObjectId: string; lastUpdated: string }
  >,
) {
  const modulesWithResultsValues = timQuery(
    () =>
      serverActions.getAllModulesWithResultsValues({ projectId: p.projectId }),
    "Loading...",
  );

  // Temp state

  const [tempModuleId, setTempModuleId] = createSignal<string>("");
  const [tempResultsValue, setTempResultsValue] = createSignal<string>("");
  const [tempPresentationOption, setTempPresentationOption] = createSignal<
    PresentationOption | undefined
  >(undefined);
  const [tempDisaggregations, setTempDisaggregations] = createSignal<
    DisaggregationOption[]
  >([]);
  const [tempMakeDefault, setTempMakeDefault] = createSignal<boolean>(false);

  const readyToSave = () =>
    tempModuleId() && tempResultsValue() && tempPresentationOption();

  const selectedModule = () => {
    const modules = modulesWithResultsValues.state();
    const moduleId = tempModuleId();
    if (modules.status !== "ready") {
      return;
    }
    return modules.data.find((modDef) => modDef.id === moduleId);
  };

  const selectedResultsValue = () => {
    return selectedModule()?.resultsValues.find(
      (rv) => rv.id === tempResultsValue(),
    );
  };

  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const resultsValue = selectedResultsValue();
      if (!resultsValue) {
        return {
          success: false,
          err: t("You must select a results value"),
        };
      }

      const presentationOption = tempPresentationOption();
      if (!presentationOption) {
        return {
          success: false,
          err: t("You must select a presentation option"),
        };
      }

      const disaggregations = resultsValue.disaggregationOptions
        .filter(
          (disOpt) =>
            disOpt.isRequired || tempDisaggregations().includes(disOpt.value),
        )
        .filter(
          (disOpt) =>
            !disOpt.allowedPresentationOptions ||
            disOpt.allowedPresentationOptions.includes(presentationOption),
        )
        .map((disOpt) => disOpt.value);

      return serverActions.createPresentationObject({
        projectId: p.projectId,
        label: resultsValue.label.trim(),
        resultsValue,
        presentationOption,
        disaggregations,
        makeDefault: p.isGlobalAdmin && tempMakeDefault(),
      });
    },
    (data) => {
      const resultsValue = selectedResultsValue();
      if (resultsValue) {
        p.close({
          moduleId: resultsValue.moduleId,
          newPresentationObjectId: data.newPresentationObjectId,
          lastUpdated: data.lastUpdated,
        });
      }
    },
  );

  return (
    <AlertFormHolder
      formId="add-presentation-object"
      header={t2(T.FRENCH_UI_STRINGS.create_new_visualization)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      wider
      disableSaveButton={!readyToSave()}
      french={isFrench()}
    >
      <StateHolderWrapper state={modulesWithResultsValues.state()} noPad>
        {(keyedModules) => {
          return (
            <>
              {/* <Show when={p.isGlobalAdmin}>
                <Checkbox
                  label={t2(T.FRENCH_UI_STRINGS.make_this_visualization_a_defa)}
                  checked={tempMakeDefault()}
                  onChange={setTempMakeDefault}
                />
              </Show> */}
              <Show
                when={keyedModules.length > 0}
                fallback={t(
                  "You need to enable at least one module in order to create visualizations",
                )}
              >
                <RadioGroup
                  label={t2(T.FRENCH_UI_STRINGS.module)}
                  options={getSelectOptionsFromIdLabel(keyedModules)}
                  value={tempModuleId()}
                  onChange={(v) => {
                    setTempModuleId(v);
                    setTempResultsValue("");
                    setTempDisaggregations([]);
                  }}
                />
              </Show>
              <Show when={selectedModule()} keyed>
                {(selectedModule) => {
                  return (
                    <RadioGroup
                      label={t2(T.FRENCH_UI_STRINGS.results_value)}
                      options={getSelectOptionsFromIdLabel(
                        selectedModule.resultsValues,
                      )}
                      value={tempResultsValue()}
                      onChange={(v) => {
                        setTempResultsValue(v);
                        setTempDisaggregations([]);
                      }}
                    />
                  );
                }}
              </Show>
              <Show when={selectedResultsValue()} keyed>
                {(selectedResultsValue) => {
                  return (
                    <>
                      <RadioGroup
                        label={t2(T.FRENCH_UI_STRINGS.present_as)}
                        options={get_PRESENTATION_SELECT_OPTIONS()}
                        value={tempPresentationOption()}
                        onChange={setTempPresentationOption}
                      />
                      <Show when={tempPresentationOption()} keyed>
                        {(selectedPresentationOption) => {
                          return (
                            <LabelHolder
                              label={t2(T.FRENCH_UI_STRINGS.disaggregate_by)}
                            >
                              <div class="space-y-1">
                                <For
                                  each={selectedResultsValue.disaggregationOptions.filter(
                                    (disOpt) =>
                                      !disOpt.allowedPresentationOptions ||
                                      disOpt.allowedPresentationOptions.includes(
                                        selectedPresentationOption,
                                      ),
                                  )}
                                >
                                  {(disOpt) => {
                                    return (
                                      <Switch>
                                        <Match when={!disOpt.isRequired}>
                                          <Checkbox
                                            label={t2(disOpt.label)}
                                            checked={tempDisaggregations().includes(
                                              disOpt.value,
                                            )}
                                            onChange={(checked) => {
                                              setTempDisaggregations((prev) => {
                                                if (checked) {
                                                  return [
                                                    ...prev,
                                                    disOpt.value,
                                                  ];
                                                } else {
                                                  return prev.filter(
                                                    (d) => d !== disOpt.value,
                                                  );
                                                }
                                              });
                                            }}
                                          />
                                        </Match>
                                        <Match when={disOpt.isRequired}>
                                          <Checkbox
                                            label={
                                              <>
                                                {t2(disOpt.label)}
                                                <span class="ml-1 text-xs">
                                                  (
                                                  {t(
                                                    "Required for this visualization",
                                                  )}
                                                  )
                                                </span>
                                              </>
                                            }
                                            checked={true}
                                            onChange={() => {}}
                                            disabled={true}
                                          />
                                        </Match>
                                      </Switch>
                                    );
                                  }}
                                </For>
                              </div>
                            </LabelHolder>
                          );
                        }}
                      </Show>
                    </>
                  );
                }}
              </Show>
            </>
          );
        }}
      </StateHolderWrapper>
    </AlertFormHolder>
  );
}
