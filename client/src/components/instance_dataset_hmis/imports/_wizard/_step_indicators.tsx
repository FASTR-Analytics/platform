import { t3, type IndicatorWithSources } from "lib";
import { Dhis2IndicatorPicker } from "../_indicator_picker";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  onDictionaryLoaded: (indicators: IndicatorWithSources[]) => void;
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
          en: "A base indicator's DHIS2 sources are fetched; a derived indicator fetches the sources of the indicators its formula uses.",
          fr: "Les sources DHIS2 d'un indicateur de base sont récupérées ; un indicateur dérivé récupère les sources des indicateurs que sa formule utilise.",
          pt: "As fontes DHIS2 de um indicador de base são obtidas; um indicador derivado obtém as fontes dos indicadores que a sua fórmula utiliza.",
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
