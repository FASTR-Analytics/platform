import { t3 } from "lib";
import { Button } from "panther";
import { createSignal } from "solid-js";
import type { WizardState } from "./index";

type Props = {
  state: WizardState;
};

export function Step0(p: Props) {
  const { state } = p;
  const [localSource, setLocalSource] = createSignal<"file" | "dhis2">(state.source());

  function handleContinue() {
    state.setSource(localSource());
    state.setStep(1);
  }

  return (
    <div class="ui-spy">
      <div class="font-600">{t3({ en: "Select import source", fr: "Sélectionner la source d'importation" })}</div>

      <div class="ui-spy-sm">
        <label class="flex cursor-pointer items-center gap-3 rounded border border-base-300 p-4 hover:bg-base-100">
          <input
            type="radio"
            name="source"
            checked={localSource() === "file"}
            onChange={() => setLocalSource("file")}
            class="radio"
          />
          <div>
            <div class="font-600">{t3({ en: "Upload GeoJSON file", fr: "Téléverser un fichier GeoJSON" })}</div>
            <div class="text-base-500 text-sm">
              {t3({ en: "Upload a GeoJSON file from your computer", fr: "Téléversez un fichier GeoJSON depuis votre ordinateur" })}
            </div>
          </div>
        </label>

        <label class="flex cursor-pointer items-center gap-3 rounded border border-base-300 p-4 hover:bg-base-100">
          <input
            type="radio"
            name="source"
            checked={localSource() === "dhis2"}
            onChange={() => setLocalSource("dhis2")}
            class="radio"
          />
          <div>
            <div class="font-600">{t3({ en: "Import from DHIS2", fr: "Importer depuis DHIS2" })}</div>
            <div class="text-base-500 text-sm">
              {t3({ en: "Fetch organization unit boundaries directly from a DHIS2 instance", fr: "Récupérer les limites des unités d'organisation directement depuis une instance DHIS2" })}
            </div>
          </div>
        </label>
      </div>

      <div class="ui-gap-sm flex">
        <Button onClick={handleContinue} intent="primary">
          {t3({ en: "Continue", fr: "Continuer" })}
        </Button>
        <Button intent="neutral" onClick={() => state.close(undefined)}>
          {t3({ en: "Cancel", fr: "Annuler" })}
        </Button>
      </div>
    </div>
  );
}
