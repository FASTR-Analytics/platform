import { t3, type TranslatableString } from "lib";

export type EmptyStateKind =
  | "no_modules"
  | "no_metric"
  | "no_data_available"
  | "too_many_cells";

const MESSAGES: Record<EmptyStateKind, TranslatableString> = {
  no_modules: {
    en: "This package has no modules, so there are no results to explore.",
    fr: "Ce paquet n'a aucun module, il n'y a donc aucun résultat à explorer.",
    pt:
      "Este pacote não tem nenhum módulo, pelo que não há resultados para explorar.",
  },
  no_metric: {
    en: "This module produced no metric in this package",
    fr: "Ce module n'a produit aucun indicateur dans ce paquet",
    pt: "Este módulo não produziu nenhuma métrica neste pacote",
  },
  no_data_available: {
    en: "No data for this selection",
    fr: "Aucune donnée pour cette sélection",
    pt: "Nenhum dado para esta seleção",
  },
  too_many_cells: {
    en:
      "This selection has too many values to show. Choose fewer indicators, or a coarser time grain.",
    fr:
      "Cette sélection contient trop de valeurs pour être affichée. Choisissez moins d'indicateurs ou un pas de temps plus large.",
    pt:
      "Esta seleção tem demasiados valores para mostrar. Escolha menos indicadores ou uma granularidade temporal maior.",
  },
};

// The Explore page's empty states: the page's own (no modules, no metric,
// with the metric's stamped reason when it has one) and the body's (no data,
// too many cells).
export function EmptyState(p: { kind: EmptyStateKind; reason?: string }) {
  return (
    <div class="text-base-content-muted text-sm">
      {(p.kind === "no_metric" ? p.reason : undefined) ?? t3(MESSAGES[p.kind])}
    </div>
  );
}
