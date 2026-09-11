import { t3, type CommonIndicator } from "lib";

// The Type column (PLAN_A4 ruling 12): what fills the indicator, not its
// storage type. One derivation for the manager and the import picker.
export function indicatorTypeLabel(indicator: CommonIndicator): string {
  switch (indicator.definition.type) {
    case "base":
      return indicator.definition.dhis2_id === null
        ? t3({ en: "Uploaded", fr: "Téléversé", pt: "Carregado" })
        : t3({ en: "DHIS2 element", fr: "Élément DHIS2", pt: "Elemento DHIS2" });
    case "sum":
      return t3({ en: "Sum", fr: "Somme", pt: "Soma" });
    case "derived":
      return t3({ en: "Derived", fr: "Dérivé", pt: "Derivado" });
  }
}

// What the indicator is made of: the DHIS2 id of an element, the members of
// a sum, the formula of a derived indicator. One derivation for display and
// sort.
export function definedByText(indicator: CommonIndicator): string {
  switch (indicator.definition.type) {
    case "base":
      return indicator.definition.dhis2_id ?? "";
    case "sum":
      return indicator.definition.members.join(", ");
    case "derived":
      return indicator.definition.expression;
  }
}
