import {
  HMIS_INDICATOR_TYPES,
  t3,
  type HmisIndicatorType,
} from "lib";
import { AlertComponentProps, Button, ModalContainer } from "panther";
import { For } from "solid-js";
import { indicatorTypeWord } from "./_indicator_display";

// What a type entails, in the four terms a reader needs: where its data
// comes from, whether the data quality modules adjust it (`isCount`),
// whether it holds rows of its own (`hasRows`), and what format it may
// have (a count is always a number). One derivation for the editor's type
// caption and the manager's Indicator types modal.
type TypeFacts = {
  source: string;
  adjustment: string;
  rows: string;
  format: string;
};

function adjustedText(): string {
  return t3({
    en: "Adjusted by the data quality modules like every count.",
    fr: "Ajusté par les modules de qualité des données comme tout dénombrement.",
    pt: "Ajustado pelos módulos de qualidade dos dados como qualquer contagem.",
  });
}

function countFormatText(): string {
  return t3({
    en: "Always a number, since this is a count: never a percent or a rate.",
    fr: "Toujours un nombre, puisqu'il s'agit d'un dénombrement : jamais un pourcentage ni un taux.",
    pt: "Sempre um número, por se tratar de uma contagem: nunca uma percentagem nem uma taxa.",
  });
}

function indicatorTypeFacts(type: HmisIndicatorType): TypeFacts {
  switch (type) {
    case "uploaded":
      return {
        source: t3({
          en: "A monthly count filled by CSV import. At the Mapping step of each CSV import you choose which values in the file belong to it.",
          fr: "Un dénombrement mensuel rempli par importation CSV. À l'étape Correspondance de chaque importation CSV, vous choisissez quelles valeurs du fichier lui appartiennent.",
          pt: "Uma contagem mensal preenchida por importação CSV. No passo Correspondência de cada importação CSV, escolhe quais os valores do ficheiro que lhe pertencem.",
        }),
        adjustment: adjustedText(),
        rows: t3({
          en: "Holds its own data rows, stored under an identifier FASTR manages.",
          fr: "Possède ses propres lignes de données, conservées sous un identifiant géré par FASTR.",
          pt: "Tem as suas próprias linhas de dados, guardadas sob um identificador gerido pelo FASTR.",
        }),
        format: countFormatText(),
      };
    case "dhis2_element":
      return {
        source: t3({
          en: "A monthly count the DHIS2 import fetches by its DHIS2 id.",
          fr: "Un dénombrement mensuel que l'importation DHIS2 récupère par son identifiant DHIS2.",
          pt: "Uma contagem mensal que a importação DHIS2 obtém pelo seu ID DHIS2.",
        }),
        adjustment: adjustedText(),
        rows: t3({
          en: "Holds its own data rows, stored under its DHIS2 id.",
          fr: "Possède ses propres lignes de données, conservées sous son identifiant DHIS2.",
          pt: "Tem as suas próprias linhas de dados, guardadas sob o seu ID DHIS2.",
        }),
        format: countFormatText(),
      };
    case "sum":
      return {
        source: t3({
          en: "The total of its members, DHIS2 element or Uploaded indicators, added per facility and month.",
          fr: "Le total de ses membres, des éléments DHIS2 ou des indicateurs téléversés, additionnés par établissement et par mois.",
          pt: "O total dos seus membros, elementos DHIS2 ou indicadores carregados, somados por estabelecimento e mês.",
        }),
        adjustment: adjustedText(),
        rows: t3({
          en: "No rows of its own: it is read from its members' rows.",
          fr: "Aucune ligne propre : elle est lue à partir des lignes de ses membres.",
          pt: "Sem linhas próprias: é lida a partir das linhas dos seus membros.",
        }),
        format: countFormatText(),
      };
    case "derived":
      return {
        source: t3({
          en: "A formula over other indicators and populations.",
          fr: "Une formule sur d'autres indicateurs et des populations.",
          pt: "Uma fórmula sobre outros indicadores e populações.",
        }),
        adjustment: t3({
          en: "Not adjusted: computed from the formula after the data is adjusted and aggregated.",
          fr: "Non ajusté : calculé à partir de la formule après l'ajustement et l'agrégation des données.",
          pt: "Não ajustado: calculado a partir da fórmula depois de os dados serem ajustados e agregados.",
        }),
        rows: t3({
          en: "No rows of its own.",
          fr: "Aucune ligne propre.",
          pt: "Sem linhas próprias.",
        }),
        format: t3({
          en: "A number, a percent or a rate per 10,000, chosen when the indicator is edited.",
          fr: "Un nombre, un pourcentage ou un taux pour 10 000, choisi lors de la modification de l'indicateur.",
          pt: "Um número, uma percentagem ou uma taxa por 10 000, escolhido ao editar o indicador.",
        }),
      };
  }
}

function factLabels(): { key: keyof TypeFacts; label: string }[] {
  return [
    { key: "source", label: t3({ en: "Source", fr: "Source", pt: "Origem" }) },
    {
      key: "adjustment",
      label: t3({ en: "Adjustment", fr: "Ajustement", pt: "Ajustamento" }),
    },
    { key: "rows", label: t3({ en: "Data rows", fr: "Lignes", pt: "Linhas" }) },
    { key: "format", label: t3({ en: "Format", fr: "Format", pt: "Formato" }) },
  ];
}

export function TypeFactsList(p: { type: HmisIndicatorType }) {
  const facts = () => indicatorTypeFacts(p.type);
  return (
    <div class="ui-text-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <For each={factLabels()}>
        {(fact) => (
          <>
            <div class="font-700">{fact.label}</div>
            <div>{facts()[fact.key]}</div>
          </>
        )}
      </For>
    </div>
  );
}

export function IndicatorTypesModal(p: AlertComponentProps<{}, undefined>) {
  return (
    <ModalContainer
      width="4xl"
      title={t3({
        en: "Indicator types",
        fr: "Types d'indicateurs",
        pt: "Tipos de indicadores",
      })}
      rightButtons={[
        <Button intent="primary" onClick={() => p.close(undefined)}>
          {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
        </Button>,
      ]}
    >
      <div class="ui-spy text-sm">
        <div class="text-xs">
          {t3({
            en: "The Type column says what fills an indicator. The three counts are adjusted by the data quality modules; a derived indicator is a formula computed afterwards.",
            fr: "La colonne Type indique ce qui alimente un indicateur. Les trois dénombrements sont ajustés par les modules de qualité des données ; un indicateur dérivé est une formule calculée ensuite.",
            pt: "A coluna Tipo indica o que preenche um indicador. As três contagens são ajustadas pelos módulos de qualidade dos dados; um indicador derivado é uma fórmula calculada depois.",
          })}
        </div>
        <For each={HMIS_INDICATOR_TYPES}>
          {(type) => (
            <div class="ui-spy-sm">
              <div class="font-700">{indicatorTypeWord(type)}</div>
              <TypeFactsList type={type} />
            </div>
          )}
        </For>
      </div>
    </ModalContainer>
  );
}
