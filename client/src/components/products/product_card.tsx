import type { ProductSummary } from "lib";
import { Card, Icon } from "panther";
import { Show } from "solid-js";
import { packageScopeCaption } from "./package_label";
import { PRODUCT_TYPE_REGISTRY } from "./product_types";

type Props = {
  product: ProductSummary;
  selected: boolean;
  // The product's folder path, set only while searching: it replaces the
  // caption so a result says where it lives, as the folder tile does.
  searchPath: string | null;
  onOpen: (evt?: MouseEvent) => void;
  onSelectToggle: (evt?: MouseEvent) => void;
  onContextMenu: (evt: MouseEvent) => void;
};

export function ProductCard(p: Props) {
  return (
    <Card
      data-tour="products-item"
      selected={p.selected}
      onSelectToggle={p.onSelectToggle}
      onClick={p.onOpen}
      onContextMenu={p.onContextMenu}
      header={
        <div class="ui-gap-sm flex items-center">
          <span class="text-base-content-muted inline-block w-4 flex-none">
            <Icon iconName={PRODUCT_TYPE_REGISTRY[p.product.type].icon} />
          </span>
          <span class="flex-1 truncate">{p.product.label}</span>
        </div>
      }
    >
      {/* ONE caption line, mirroring the folder tile's, so product and folder
          tiles share a height. The pair the product serves from is the
          load-bearing info (D8); type is the header icon, and the updated date
          lives in the list view. */}
      <div class="ui-text-caption truncate">
        <Show
          when={p.searchPath}
          fallback={packageScopeCaption(p.product)}
        >
          {(path) => path()}
        </Show>
      </div>
    </Card>
  );
}

// The editor headers' version of the same caption: which package and scope
// the open product resolves its figures under, live off the T1 row (D16).
export function ProductScopeBadge(p: { product: ProductSummary | undefined }) {
  return (
    <div class="ui-text-caption bg-base-200 truncate rounded px-2 py-1">
      {p.product ? packageScopeCaption(p.product) : ""}
    </div>
  );
}
