import { t3, type HmisIndicator } from "lib";
import { Dhis2IndicatorPicker } from "../_indicator_picker";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  onDictionaryLoaded: (indicators: HmisIndicator[]) => void;
};

export function Dhis2StepIndicators(p: Props) {
  return (
    <div class="ui-spy">
      <div class="font-700 text-base">
        {t3({
          en: "Select the indicators to import",
          fr: "Sélectionner les indicateurs à importer",
          pt: "Selecionar os indicadores a importar",
        })}
      </div>
      <div class="text-sm">
        {t3({
          en: "A DHIS2 element is fetched by its DHIS2 id; a sum fetches its members; a derived indicator fetches the indicators its formula uses. Uploaded indicators are not fetched.",
          fr: "Un élément DHIS2 est récupéré par son identifiant DHIS2 ; une somme récupère ses membres ; un indicateur dérivé récupère les indicateurs que sa formule utilise. Les indicateurs téléversés ne sont pas récupérés.",
          pt: "Um elemento DHIS2 é obtido pelo seu ID DHIS2; uma soma obtém os seus membros; um indicador derivado obtém os indicadores que a sua fórmula utiliza. Os indicadores carregados não são obtidos.",
        })}
      </div>
      <Dhis2IndicatorPicker
        selectedIds={p.selectedIds}
        setSelectedIds={p.setSelectedIds}
        onDictionaryLoaded={p.onDictionaryLoaded}
      />
    </div>
  );
}
