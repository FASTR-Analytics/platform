import { createSignal } from "solid-js";
import { t, t2, T } from "lib";
import { serverActions } from "~/server_actions";
import {
  Button,
  RadioGroup,
  StateHolderFormError,
  getSelectOptions,
  timActionForm,
} from "panther";

type Props = {
  sourceType: "csv" | "dhis2" | undefined;
  silentFetch: () => Promise<void>;
};

// Import Source Selector Component

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
      return {
        success: false,
        err: t("You must select a source type"),
      };
    }

    return serverActions.setDatasetUploadSourceType({
      sourceType,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="w-96">
        <RadioGroup
          options={[
            { value: "csv", label: "Upload CSV file" },
            { value: "dhis2", label: "Import directly from DHIS2" },
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
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
      </div>
    </div>
  );
}
