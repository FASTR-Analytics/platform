import { type HmisIndicator, t3 } from "lib";
import { plural } from "panther";

export function deleteIndicatorsConfirm(
  selected: HmisIndicator[],
): { text: string; itemList: string[] } {
  return {
    text: plural(selected.length, {
      one: t3({
        en: "Are you sure you want to delete this indicator?",
        fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ?",
        pt: "Tem a certeza de que pretende eliminar este indicador?",
      }),
      other: t3({
        en: "Are you sure you want to delete these indicators?",
        fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ?",
        pt: "Tem a certeza de que pretende eliminar estes indicadores?",
      }),
    }),
    itemList: selected.map(
      (i) => `${i.indicator_common_id} ~ ${i.indicator_common_label}`,
    ),
  };
}
