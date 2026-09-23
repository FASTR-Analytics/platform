import { t3 } from "lib";

export type EmptyStateKind = "no_primary_module" | "no_metric" | "no_preset";

// The empty states both Explore tabs share. `no_metric` shows the metric's
// stamped reason when it has one.
export function EmptyState(p: { kind: EmptyStateKind; reason?: string }) {
  return (
    <div class="text-base-content-muted text-sm">
      {p.kind === "no_primary_module"
        ? t3({
          en: "This package has no primary module, so there are no results to explore. Generate a package that includes one.",
          fr: "Ce paquet n'a aucun module principal, il n'y a donc aucun résultat à explorer. Générez un paquet qui en inclut un.",
          pt: "Este pacote não tem nenhum módulo principal, pelo que não há resultados para explorar. Gere um pacote que inclua um.",
        })
        : p.kind === "no_preset"
        ? t3({
          en: "This metric declares no visualization preset",
          fr: "Cet indicateur ne déclare aucune visualisation prédéfinie",
          pt: "Esta métrica não declara nenhuma visualização predefinida",
        })
        : p.reason ??
          t3({
            en: "This module produced no metric in this package",
            fr: "Ce module n'a produit aucun indicateur dans ce paquet",
            pt: "Este módulo não produziu nenhuma métrica neste pacote",
          })}
    </div>
  );
}
