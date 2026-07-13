import {
  t3,
  TC,
  type ModuleConfigSelections,
  type ModuleId,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createButtonAction,
  createQuery,
} from "panther";
import { Show, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { ModuleParameterInputs } from "~/components/_shared/module_parameter_inputs";
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

  const config = createQuery(
    async () => {
      const res = await serverActions.getModuleWithConfigSelections({
        projectId: p.projectId,
        module_id: p.installedModuleId,
      });
      if (!res.success) {
        return res;
      }
      setTempParameters(res.data.configSelections.parameterSelections);
      return {
        success: true,
        data: res.data.configSelections as ModuleConfigSelections,
      };
    },
    t3({
      en: "Loading module config selections...",
      fr: "Chargement des configurations du module...",
      pt: "A carregar configurações do módulo...",
    }),
  );

  const save = createButtonAction(
    async () => {
      const newParameters = unwrap(tempParameters);
      return await serverActions.updateModuleParameters({
        projectId: p.projectId,
        module_id: p.installedModuleId,
        newParams: newParameters,
      });
    },
    () => p.close(undefined),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={`${p.installedModuleLabel} ${t3({ en: "settings", fr: "paramètres", pt: "definições" })}`}
        >
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
            <div class="ui-pad">
              <ModuleParameterInputs
                parameters={keyedConfig.parameterDefinitions}
                values={tempParameters}
                onChange={updateTempParameter}
              />
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
