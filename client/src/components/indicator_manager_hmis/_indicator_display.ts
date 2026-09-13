import { definitionDataId, t3, type HmisIndicator } from "lib";

// The Type column (PLAN_A5 ruling 2): the stored type under its word. One
// derivation for the manager and the import picker.
export function indicatorTypeLabel(indicator: HmisIndicator): string {
  switch (indicator.definition.type) {
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

// What the indicator is made of: the data id of an Uploaded or DHIS2
// element, the members of a sum, the formula of a derived indicator. One
// derivation for display and sort.
export function definedByText(indicator: HmisIndicator): string {
  switch (indicator.definition.type) {
    case "uploaded":
    case "dhis2_element":
      return definitionDataId(indicator.definition) ?? "";
    case "sum":
      return indicator.definition.members.join(", ");
    case "derived":
      return indicator.definition.expression;
  }
}
