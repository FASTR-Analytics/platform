import { createSignal } from "solid-js";
import { t3, TC } from "lib";
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
        err: t3({ en: "You must select a source type", fr: "Vous devez sélectionner un type de source" }),
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
            { value: "csv", label: t3({ en: "Upload CSV file", fr: "Téléverser un fichier CSV" }) },
            { value: "dhis2", label: t3({ en: "Import directly from DHIS2", fr: "Importer directement depuis DHIS2" }) },
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
          {t3(TC.save)}
        </Button>
      </div>
    </div>
  );
}
