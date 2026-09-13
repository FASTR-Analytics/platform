import {
  definitionDataId,
  t3,
  type HmisIndicator,
  type HmisIndicatorType,
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
    case "derived":
      return t3({ en: "Derived", fr: "Dérivé", pt: "Derivado" });
  }
}

// What a screen calls a DHIS2 element's data id. An Uploaded indicator's
// key is opaque and never shown (PLAN_A6 ruling 1); a sum or a derived has
// none.
export function dhis2IdLabel(): string {
  return t3({ en: "DHIS2 id", fr: "Identifiant DHIS2", pt: "ID DHIS2" });
}

// What the indicator is made of: the DHIS2 id of an element, the members
// of a sum, the formula of a derived indicator; nothing for an Uploaded
// indicator. One derivation for display and sort.
export function definedByText(indicator: HmisIndicator): string {
  switch (indicator.definition.type) {
    case "uploaded":
      return "";
    case "dhis2_element":
      return indicator.definition.data_id;
    case "sum":
      return indicator.definition.members.join(", ");
    case "derived":
      return indicator.definition.expression;
  }
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
