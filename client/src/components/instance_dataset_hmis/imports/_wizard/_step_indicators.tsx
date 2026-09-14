import { t3, type HmisIndicator } from "lib";
import { Show } from "solid-js";
import { Dhis2IndicatorPicker } from "../_indicator_picker";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  onDictionaryLoaded: (indicators: HmisIndicator[]) => void;
  // Why the step refuses Next (PLAN_A7 ruling 5); undefined when it does not.
  refusal: string | undefined;
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
          en: "A DHIS2-element indicator fetches its DHIS2 element; a sum fetches the DHIS2 elements among its members; a derived indicator fetches the DHIS2 elements its formula reaches. The review step lists them.",
          fr: "Un indicateur élément DHIS2 récupère son élément DHIS2 ; une somme récupère les éléments DHIS2 parmi ses membres ; un indicateur dérivé récupère les éléments DHIS2 que sa formule atteint. L'étape de vérification les liste.",
          pt: "Um indicador elemento DHIS2 obtém o seu elemento DHIS2; uma soma obtém os elementos DHIS2 entre os seus membros; um indicador derivado obtém os elementos DHIS2 que a sua fórmula alcança. O passo de revisão lista-os.",
        })}
      </div>
      <Dhis2IndicatorPicker
        selectedIds={p.selectedIds}
        setSelectedIds={p.setSelectedIds}
        onDictionaryLoaded={p.onDictionaryLoaded}
      />
      <Show when={p.refusal}>
        <div class="text-danger text-sm">{p.refusal}</div>
      </Show>
    </div>
  );
}
