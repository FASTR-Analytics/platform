import { createSignal } from "solid-js";
import { t3 } from "lib";
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
      return { success: false, err: t3({ en: "You must select an import method", fr: "Vous devez sélectionner une méthode d'importation" }) };
    }
    return serverActions.structureStep0_SetSourceType({
      sourceType,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="font-700 mb-4 text-lg">{t3({ en: "Select Import Method", fr: "Sélectionner la méthode d'importation" })}</div>
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
          {t3({ en: "Continue", fr: "Continuer" })}
        </Button>
      </div>
    </div>
  );
}
