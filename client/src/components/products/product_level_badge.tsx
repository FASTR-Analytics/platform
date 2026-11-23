import { type ProductLevel, type ProductSummary, t3 } from "lib";
import { Badge, type Intent, Tooltip } from "panther";
import { Show } from "solid-js";
import {
  productLevelTeamLabels,
  productSummaryLevel,
} from "~/state/instance/product_access";
import { instanceState } from "~/state/instance/t1_store";

type ShownLevel = Exclude<ProductLevel, "none">;

const LEVEL_INTENT: Record<ShownLevel, Intent> = {
  own: "primary",
  edit: "success",
  view: "neutral",
};

function levelLabel(level: ShownLevel): string {
  switch (level) {
    case "own":
      return t3({ en: "Owner", fr: "Propriétaire", pt: "Proprietário" });
    case "edit":
      return t3({ en: "Editor", fr: "Éditeur", pt: "Editor" });
    case "view":
      return t3({ en: "Viewer", fr: "Lecteur", pt: "Leitor" });
  }
}

// The viewer's own standing on a product. A global admin holds every product,
// so the badge would say nothing and is not drawn. When the level comes from
// a team, the hover names it: "Editor through <team>".
export function ProductLevelBadge(p: { product: ProductSummary }) {
  const level = () => {
    const held = productSummaryLevel(p.product);
    return held === "none" ? undefined : held;
  };
  const teams = () => productLevelTeamLabels(p.product).join(", ");
  return (
    <Show when={!instanceState.currentUserIsGlobalAdmin && level()}>
      {(shown) => (
        <span class="flex h-[1lh] flex-none items-center">
          <Tooltip
            content={t3({
              en: `${levelLabel(shown())} through ${teams()}`,
              fr: `${levelLabel(shown())} via ${teams()}`,
              pt: `${levelLabel(shown())} através de ${teams()}`,
            })}
            disabled={teams() === ""}
          >
            <Badge intent={LEVEL_INTENT[shown()]}>{levelLabel(shown())}</Badge>
          </Tooltip>
        </span>
      )}
    </Show>
  );
}
