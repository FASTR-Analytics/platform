import { t3, type ProductSummary, type ProductType } from "lib";
import { Card, Icon, type IconName } from "panther";
import { instanceState } from "~/state/instance/t1_store";

export const PRODUCT_TYPE_ICONS: Record<ProductType, IconName> = {
  slide_deck: "presentation",
  report: "report",
};

export function productTypeLabel(type: ProductType): string {
  return type === "slide_deck"
    ? t3({ en: "Deck", fr: "Présentation", pt: "Apresentação" })
    : t3({ en: "Report", fr: "Rapport", pt: "Relatório" });
}

// The package a product serves from, by LABEL. Ready-package labels are
// approved-user data and ride the instance channel for exactly this (D8); a
// product attached to a package that has left the ready list still shows
// something honest rather than a blank. Shared with the list view.
export function packageLabel(runId: string): string {
  const pkg = instanceState.readyPackages.find((r) => r.id === runId);
  return (
    pkg?.label ??
    t3({
      en: "Unlisted package",
      fr: "Paquet non répertorié",
      pt: "Pacote não listado",
    })
  );
}

type Props = {
  product: ProductSummary;
  selected: boolean;
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
            <Icon iconName={PRODUCT_TYPE_ICONS[p.product.type]} />
          </span>
          <span class="flex-1 truncate">{p.product.label}</span>
        </div>
      }
    >
      {/* ONE caption line, mirroring the folder tile's counts line, so the
          two kinds of tile share a height. The pair the product serves from
          is the load-bearing info (D8); type is the header icon, and the
          updated date lives in the list view. */}
      <div class="ui-text-caption truncate">
        {packageLabel(p.product.runId)}
        {" · "}
        {p.product.adminArea2 ??
          t3({ en: "National", fr: "National", pt: "Nacional" })}
      </div>
    </Card>
  );
}
