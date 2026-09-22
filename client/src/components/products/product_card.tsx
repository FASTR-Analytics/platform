import type { ProductSummary } from "lib";
import { Card, Icon } from "panther";
import { Show } from "solid-js";
import { PackageScopeChip } from "./package_scope_chip";
import { PRODUCT_TYPE_REGISTRY } from "~/components/_shared/product_types";

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
          tiles share a height: the small chip's line box matches the caption's.
          The pair the product serves from is the load-bearing info (D8); type
          is the header icon, and the updated date lives in the list view. */}
      <div class="ui-text-caption flex min-w-0">
        <Show
          when={p.searchPath}
          fallback={<PackageScopeChip product={p.product} size="sm" />}
        >
          {(path) => <span class="truncate">{path()}</span>}
        </Show>
      </div>
    </Card>
  );
}
