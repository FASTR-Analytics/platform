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
      <div class="font-700">{t3({ en: "Select import source", fr: "Sélectionner la source d'importation", pt: "Selecionar a fonte de importação" })}</div>

      <div class="ui-spy-sm">
        <label class="flex ui-hoverable-base-100 items-center gap-3 rounded border p-4">
          <input
            type="radio"
            name="source"
            checked={localSource() === "file"}
            onChange={() => setLocalSource("file")}
            class="radio"
          />
          <div>
            <div class="font-700">{t3({ en: "Upload GeoJSON file", fr: "Téléverser un fichier GeoJSON", pt: "Carregar um ficheiro GeoJSON" })}</div>
            <div class="text-base-content-muted text-sm">
              {t3({ en: "Upload a GeoJSON file from your computer", fr: "Téléversez un fichier GeoJSON depuis votre ordinateur", pt: "Carregue um ficheiro GeoJSON a partir do seu computador" })}
            </div>
          </div>
        </label>

        <label class="flex ui-hoverable-base-100 items-center gap-3 rounded border p-4">
          <input
            type="radio"
            name="source"
            checked={localSource() === "dhis2"}
            onChange={() => setLocalSource("dhis2")}
            class="radio"
          />
          <div>
            <div class="font-700">{t3({ en: "Import from DHIS2", fr: "Importer depuis DHIS2", pt: "Importar do DHIS2" })}</div>
            <div class="text-base-content-muted text-sm">
              {t3({ en: "Fetch organization unit boundaries directly from a DHIS2 instance", fr: "Récupérer les limites des unités d'organisation directement depuis une instance DHIS2", pt: "Obter os limites das unidades organizacionais diretamente de uma instância DHIS2" })}
            </div>
          </div>
        </label>
      </div>

      <div class="ui-gap-sm flex">
        <Button onClick={handleContinue} intent="primary">
          {t3({ en: "Continue", fr: "Continuer", pt: "Continuar" })}
        </Button>
        <Button intent="neutral" onClick={() => state.close(undefined)}>
          {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
        </Button>
      </div>
    </div>
  );
}
