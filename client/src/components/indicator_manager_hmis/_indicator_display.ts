import {
  definitionDataId,
  t3,
  type HmisIndicator,
  type HmisIndicatorType,
  type IndicatorFormat,
} from "lib";

// The Type column (PLAN_A5 ruling 2): the stored type under its word. One
// derivation for the manager and the import picker.
export function indicatorTypeLabel(indicator: HmisIndicator): string {
  return indicatorTypeWord(indicator.definition.type);
}

export function indicatorTypeWord(type: HmisIndicatorType): string {
  switch (type) {
    case "uploaded":
      return t3({ en: "Uploaded", fr: "Téléversé", pt: "Carregado" });
    case "dhis2_element":
      return t3({ en: "DHIS2 element", fr: "Élément DHIS2", pt: "Elemento DHIS2" });
    case "sum":
      return t3({ en: "Sum", fr: "Somme", pt: "Soma" });
    case "calculated":
      return t3({ en: "Calculated", fr: "Calculé", pt: "Calculado" });
  }
}

// What a screen calls a DHIS2 element's data id. An Uploaded indicator's
// key is opaque and never shown (PLAN_A6 ruling 1); a sum or a calculated has
// none.
export function dhis2IdLabel(): string {
  return t3({ en: "DHIS2 id", fr: "Identifiant DHIS2", pt: "ID DHIS2" });
}

// What the indicator is made of: the DHIS2 id of an element, the members
// of a sum, the formula of a calculated indicator; nothing for an Uploaded
// indicator. One derivation for display and sort.
export function definedByText(indicator: HmisIndicator): string {
  switch (indicator.definition.type) {
    case "uploaded":
      return "";
    case "dhis2_element":
      return indicator.definition.data_id;
    case "sum":
      return indicator.definition.members.join(", ");
    case "calculated":
      return indicator.definition.expression;
  }
}

// What DHIS2 calls a DHIS2 element's element or operand; null for every
// other type and for an element it was never read for.
export function dhis2LabelOf(indicator: HmisIndicator): string | null {
  return indicator.definition.type === "dhis2_element"
    ? indicator.definition.dhis2_label
    : null;
}

export function dhis2LabelHeading(): string {
  return t3({ en: "DHIS2 name", fr: "Nom DHIS2", pt: "Nome DHIS2" });
}

export function indicatorFormatWord(format: IndicatorFormat): string {
  switch (format) {
    case "number":
      return t3({ en: "Number", fr: "Nombre", pt: "Número" });
    case "percent":
      return t3({ en: "Percent", fr: "Pourcentage", pt: "Percentagem" });
    case "rate_per_10k":
      return t3({
        en: "Rate per 10,000",
        fr: "Taux pour 10 000",
        pt: "Taxa por 10 000",
      });
  }
}

// The search over an indicator list, shared by the manager and the import
// picker: every typed word must appear in the id, label, DHIS2 name, type
// word or definition, case-insensitive.
export function matchesIndicatorSearch(
  indicator: HmisIndicator,
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return true;
  const haystack = [
    indicator.indicator_common_id,
    indicator.indicator_common_label,
    dhis2LabelOf(indicator) ?? "",
    indicatorTypeLabel(indicator),
    definedByText(indicator),
  ]
    .join(" ")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}

// How an import surface names an indicator it reached through a data id.
export function indicatorNameText(indicator: HmisIndicator): string {
  return `${indicator.indicator_common_label} (${indicator.indicator_common_id})`;
}

// The dictionary keyed by data id, for the run, ledger and progress views
// whose rows carry data ids (ruling 9): a pair's key is what DHIS2 or the
// file called the series, and the indicator under it is looked up here.
export function indicatorsByDataId(
  indicators: HmisIndicator[],
): Map<string, HmisIndicator> {
  const byDataId = new Map<string, HmisIndicator>();
  for (const indicator of indicators) {
    const dataId = definitionDataId(indicator.definition);
    if (dataId !== null) byDataId.set(dataId, indicator);
  }
  return byDataId;
}

export function dataIdWithIndicator(
  indicator: HmisIndicator | undefined,
  dataId: string,
): string {
  return indicator
    ? `${indicator.indicator_common_id} · ${indicator.indicator_common_label} (${dataId})`
    : dataId;
}

// The one wording of what a user does about a DHIS2 formula id, carried by
// every surface that names one (SYSTEM_06, the dispatcher bullet of "HMIS
// import runs").
export function dhis2FormulaRemedy(): string {
  return t3({
    en: "To fix it: in the indicator list, use Add from DHIS2, search the formula by name and save it. The app creates one DHIS2 element per data element in the formula and one calculated indicator for the formula itself. Then change the old indicator's type to Uploaded and turn off its Include in analysis: it keeps the values it already holds, and no DHIS2 import fetches it again. Delete it instead if it holds no data.",
    fr: "Pour corriger : dans la liste des indicateurs, utilisez Ajouter depuis DHIS2, recherchez la formule par son nom et enregistrez-la. L'application crée un élément DHIS2 par élément de données de la formule et un indicateur calculé pour la formule elle-même. Changez ensuite le type de l'ancien indicateur en Téléversé et désactivez son Inclure dans l'analyse : il conserve les valeurs qu'il contient déjà, et aucune importation DHIS2 ne le récupère plus. Supprimez-le plutôt s'il ne contient aucune donnée.",
    pt: "Para corrigir: na lista de indicadores, use Adicionar do DHIS2, procure a fórmula pelo nome e guarde-a. A aplicação cria um elemento DHIS2 por elemento de dados da fórmula e um indicador calculado para a própria fórmula. Depois mude o tipo do indicador antigo para Carregado e desligue o seu Incluir na análise: mantém os valores que já tem, e nenhuma importação DHIS2 o volta a obter. Em vez disso, elimine-o se não tiver dados.",
  });
}
