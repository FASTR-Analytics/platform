import { t3, type ProductSummary, type ProductType } from "lib";
import { Badge, Card, Icon, type IconName } from "panther";
import { Show } from "solid-js";
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
      <div class="ui-spy-sm">
        <div class="ui-gap-sm flex flex-wrap items-center">
          <Badge intent="base-200">{productTypeLabel(p.product.type)}</Badge>
          <Badge>{packageLabel(p.product.runId)}</Badge>
          <Show
            when={p.product.adminArea2}
            fallback={
              <Badge intent="base-200">
                {t3({ en: "National", fr: "National", pt: "Nacional" })}
              </Badge>
            }
          >
            {(area) => <Badge intent="neutral">{area()}</Badge>}
          </Show>
        </div>
        <div class="ui-text-caption">
          {t3({
            en: "Updated",
            fr: "Modifié",
            pt: "Atualizado",
          })}{" "}
          {new Date(p.product.lastUpdated).toLocaleDateString()}
        </div>
      </div>
    </Card>
  );
}
