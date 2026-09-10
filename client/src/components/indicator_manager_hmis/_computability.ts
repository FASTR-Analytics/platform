// The manager list and the editor state the shared computability judgement
// (`judgeDerivedIndicator` in lib) in the UI language. Display only: a
// derived indicator that cannot be computed today is a normal state while a
// country is still mapping raw indicators, so nothing here blocks a save.
import {
  type DerivedIndicatorComputability,
  isPopulationTypeId,
  type PopulationCoverage,
  populationTypeLabel,
  populationYearRangeLabel,
  type ResolvedIndicatorExpression,
  t3,
} from "lib";

export function computabilityProblemText(
  judgement: Exclude<DerivedIndicatorComputability, { kind: "computable" }>,
): string {
  const prefix = t3({
    en: "Cannot be computed",
    fr: "Ne peut pas être calculé",
    pt: "Não pode ser calculado",
  });
  if (judgement.kind === "unresolvable") {
    return `${prefix}: ${judgement.problem}`;
  }
  const ids = judgement.missing.join(", ");
  const detail = judgement.missing.length === 1
    ? t3({
      en: `${ids} has no mapped raw indicator`,
      fr: `${ids} n'a aucun indicateur brut associé`,
      pt: `${ids} não tem nenhum indicador bruto associado`,
    })
    : t3({
      en: `${ids} have no mapped raw indicators`,
      fr: `${ids} n'ont aucun indicateur brut associé`,
      pt: `${ids} não têm nenhum indicador bruto associado`,
    });
  return `${prefix}: ${detail}`;
}

// A softer, separate note: the population store holds nothing for a type the
// flattened expression divides by, which generation refuses too. How much of
// a run's years and areas the store covers is recorded in the package, not
// checked anywhere.
export function missingPopulationText(
  resolved: ResolvedIndicatorExpression,
  coverage: PopulationCoverage[],
): string | undefined {
  const emptyTypes = resolved.ingredientIds
    .filter(isPopulationTypeId)
    .filter((type) => populationCoverageSummary(type, coverage).empty);
  if (emptyTypes.length === 0) return undefined;
  const labels = emptyTypes.map((type) => t3(populationTypeLabel(type))).join(
    ", ",
  );
  return t3({
    en: `Population data missing: ${labels}`,
    fr: `Données de population manquantes : ${labels}`,
    pt: `Dados de população em falta: ${labels}`,
  });
}

export function populationCoverageSummary(
  populationType: string,
  coverage: PopulationCoverage[],
): { text: string; empty: boolean } {
  const c = coverage.find((row) => row.populationType === populationType);
  if (c === undefined || c.yearCount === 0) {
    return {
      empty: true,
      text: t3({
        en: "no population data uploaded",
        fr: "aucune donnée de population téléversée",
        pt: "nenhum dado de população carregado",
      }),
    };
  }
  const years = populationYearRangeLabel(c);
  if (c.complete) {
    return {
      empty: false,
      text: `${years} ${t3({ en: "complete", fr: "complet", pt: "completo" })}`,
    };
  }
  const shortYears = c.incompleteYears.join(", ");
  return {
    empty: false,
    text: t3({
      en: `${years}, ${c.areaCount} of ${c.structureAreaCount} areas; incomplete: ${shortYears}`,
      fr: `${years}, ${c.areaCount} unités sur ${c.structureAreaCount} ; incomplet : ${shortYears}`,
      pt: `${years}, ${c.areaCount} de ${c.structureAreaCount} zonas; incompleto: ${shortYears}`,
    }),
  };
}
