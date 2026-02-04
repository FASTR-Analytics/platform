import { isFrench, t, type ModuleId } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function UpdateModule(
  p: AlertComponentProps<
    {
      projectId: string;
      moduleId: ModuleId;
    },
    undefined
  >,
) {
  const [preserveSettings, setPreserveSettings] = createSignal<boolean>(true);
  const [rerunModule, setRerunModule] = createSignal<boolean>(false);

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      return serverActions.updateModuleDefinition({
        projectId: p.projectId,
        module_id: p.moduleId,
        preserveSettings: preserveSettings(),
        rerunModule: rerunModule(),
      });
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="update-module"
      header={t("Update module")}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <Checkbox
        label="Preserve settings"
        checked={preserveSettings()}
        onChange={setPreserveSettings}
      />
      <Checkbox
        label="Re-run module after update"
        checked={rerunModule()}
        onChange={setRerunModule}
      />
    </AlertFormHolder>
  );
}
