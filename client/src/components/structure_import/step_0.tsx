import { createSignal } from "solid-js";
import { t, t2, T } from "lib";
import {
  Button,
  RadioGroup,
  StateHolderFormError,
  timActionForm,
} from "panther";
import { serverActions } from "~/server_actions";

type Props = {
  sourceType: "csv" | "dhis2" | undefined;
  silentFetch: () => Promise<void>;
};

export function Step0(p: Props) {
  const [selectedSourceType, setSelectedSourceType] = createSignal<
    "csv" | "dhis2" | "none"
  >(p.sourceType ?? "none");
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.sourceType);

  function updateSelectedSourceType(sourceType: "csv" | "dhis2") {
    setNeedsSaving(true);
    setSelectedSourceType(sourceType);
  }

  const save = timActionForm(async () => {
    const sourceType = selectedSourceType();

    if (sourceType !== "csv" && sourceType !== "dhis2") {
      return { success: false, err: t("You must select an import method") };
    }
    return serverActions.structureStep0_SetSourceType({
      sourceType,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="font-700 mb-4 text-lg">{t("Select Import Method")}</div>
      <div class="w-96">
        <RadioGroup
          options={[
            { value: "csv", label: t("Upload CSV file") },
            { value: "dhis2", label: t("Import directly from DHIS2") },
          ]}
          value={selectedSourceType()}
          onChange={(v) => updateSelectedSourceType(v as "csv" | "dhis2")}
        />
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving() || selectedSourceType() === "none"}
          iconName="save"
        >
          {t2(T.FRENCH_UI_STRINGS.continue)}
        </Button>
      </div>
    </div>
  );
}
