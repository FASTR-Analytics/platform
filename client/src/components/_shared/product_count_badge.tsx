import { t3 } from "lib";
import { Badge } from "panther";
import { Show } from "solid-js";

// How many products use a package or a scope, in a table's Usage column.
// Nothing is shown for none.
export function ProductCountBadge(p: { count: number }) {
  return (
    <Show when={p.count > 0}>
      <Badge>
        {p.count === 1
          ? t3({ en: "1 product", fr: "1 produit", pt: "1 produto" })
          : t3({
            en: `${p.count} products`,
            fr: `${p.count} produits`,
            pt: `${p.count} produtos`,
          })}
      </Badge>
    </Show>
  );
}

export function usageColumnHeader(): string {
  return t3({ en: "Usage", fr: "Utilisation", pt: "Utilização" });
}
