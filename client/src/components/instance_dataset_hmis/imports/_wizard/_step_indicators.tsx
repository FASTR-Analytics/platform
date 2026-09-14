import { t3, type HmisIndicator } from "lib";
import { Show } from "solid-js";
import { Dhis2IndicatorPicker } from "../_indicator_picker";
import { IdListLine } from "./_id_list_line";
import type { Dhis2SeedDrop } from "./index";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  onDictionaryLoaded: (indicators: HmisIndicator[]) => void;
  // The seeded ids left out when the dictionary loaded (PLAN_A7 ruling 12).
  seedDrops: Dhis2SeedDrop[];
  // Why the step refuses Next (PLAN_A7 ruling 5); undefined when it does not.
  refusal: string | undefined;
};

function uploadedDropSummary(n: number): string {
  return n === 1
    ? t3({
        en: "1 indicator of type Uploaded was left out of the selection, because a DHIS2 import cannot fetch it",
        fr: "1 indicateur de type Téléversé a été exclu de la sélection, car une importation DHIS2 ne peut pas le récupérer",
        pt: "1 indicador do tipo Carregado foi excluído da seleção, porque uma importação DHIS2 não o pode obter",
      })
    : t3({
        en: `${n} indicators of type Uploaded were left out of the selection, because a DHIS2 import cannot fetch them`,
        fr: `${n} indicateurs de type Téléversé ont été exclus de la sélection, car une importation DHIS2 ne peut pas les récupérer`,
        pt: `${n} indicadores do tipo Carregado foram excluídos da seleção, porque uma importação DHIS2 não os pode obter`,
      });
}

function unknownDropSummary(n: number): string {
  return n === 1
    ? t3({
        en: "1 indicator was left out of the selection, because it is no longer in the indicator list",
        fr: "1 indicateur a été exclu de la sélection, car il ne figure plus dans la liste des indicateurs",
        pt: "1 indicador foi excluído da seleção, porque já não consta da lista de indicadores",
      })
    : t3({
        en: `${n} indicators were left out of the selection, because they are no longer in the indicator list`,
        fr: `${n} indicateurs ont été exclus de la sélection, car ils ne figurent plus dans la liste des indicateurs`,
        pt: `${n} indicadores foram excluídos da seleção, porque já não constam da lista de indicadores`,
      });
}

export function Dhis2StepIndicators(p: Props) {
  const idsWithReason = (reason: Dhis2SeedDrop["reason"]) =>
    p.seedDrops.filter((d) => d.reason === reason).map((d) => d.id);
  const uploadedDrops = () => idsWithReason("uploaded");
  const unknownDrops = () => idsWithReason("unknown");
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
          en: "A DHIS2 element is fetched by its DHIS2 id; a sum fetches the DHIS2 elements among its members; a derived indicator fetches the DHIS2 elements its formula includes. The review step lists them.",
          fr: "Un élément DHIS2 est récupéré par son identifiant DHIS2 ; une somme récupère ceux de ses membres qui sont des éléments DHIS2 ; un indicateur dérivé récupère les éléments DHIS2 que sa formule utilise. L'étape de vérification les liste.",
          pt: "Um elemento DHIS2 é obtido pelo seu ID DHIS2; uma soma obtém os elementos DHIS2 entre os seus membros; um indicador derivado obtém os elementos DHIS2 que a sua fórmula utiliza. O passo de revisão lista-os.",
        })}
      </div>
      <IdListLine
        ids={uploadedDrops()}
        summary={uploadedDropSummary(uploadedDrops().length)}
        class="text-warning text-sm"
      />
      <IdListLine
        ids={unknownDrops()}
        summary={unknownDropSummary(unknownDrops().length)}
        class="text-warning text-sm"
      />
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
