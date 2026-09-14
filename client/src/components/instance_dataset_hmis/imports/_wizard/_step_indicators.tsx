import { t3, type HmisIndicator } from "lib";
import { For, Show } from "solid-js";
import { Dhis2IndicatorPicker } from "../_indicator_picker";
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

function seedDropText(drop: Dhis2SeedDrop): string {
  return drop.reason === "uploaded"
    ? t3({
        en: "is an Uploaded indicator, which a DHIS2 import cannot fetch",
        fr: "est un indicateur téléversé, qu'une importation DHIS2 ne peut pas récupérer",
        pt: "é um indicador carregado, que uma importação DHIS2 não pode obter",
      })
    : t3({
        en: "is no longer in the indicator list",
        fr: "ne figure plus dans la liste des indicateurs",
        pt: "já não consta da lista de indicadores",
      });
}

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
          en: "A DHIS2-element indicator fetches its DHIS2 element; a sum fetches the DHIS2 elements among its members; a derived indicator fetches the DHIS2 elements its formula includes. The review step lists them.",
          fr: "Un indicateur élément DHIS2 récupère son élément DHIS2 ; une somme récupère les éléments DHIS2 parmi ses membres ; un indicateur dérivé récupère les éléments DHIS2 que sa formule utilise. L'étape de vérification les liste.",
          pt: "Um indicador elemento DHIS2 obtém o seu elemento DHIS2; uma soma obtém os elementos DHIS2 entre os seus membros; um indicador derivado obtém os elementos DHIS2 que a sua fórmula utiliza. O passo de revisão lista-os.",
        })}
      </div>
      <Show when={p.seedDrops.length > 0}>
        <div class="text-warning text-sm">
          {t3({
            en: "Left out of the selection:",
            fr: "Exclus de la sélection :",
            pt: "Excluídos da seleção:",
          })}{" "}
          <For each={p.seedDrops}>
            {(drop, i) => (
              <>
                {i() > 0 ? "; " : ""}
                <span class="font-mono">{drop.id}</span> {seedDropText(drop)}
              </>
            )}
          </For>
        </div>
      </Show>
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
