import { t3, type ProductSummary } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  createButtonAction,
  createDeleteAction,
  createSelectionController,
  getEditorWrapper,
  openComponent,
  showMenu,
  type MenuItem,
} from "panther";
import { For, Show, createEffect, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { canEditProduct } from "~/state/instance/product_access";
import { pendingEditorOpen, setPendingEditorOpen } from "~/state/t4_ui";
import { DuplicateProductsModal } from "./duplicate_products_modal";
import { ProductCard } from "./product_card";
import { PRODUCT_TYPE_REGISTRY } from "./product_types";
import { ProductSettings } from "./product_settings";

// The Products page, flat: every product in one grid, newest first. The
// folder browser, list view, search and menus land in step 7b (D16); what is
// here is the part every later step builds on: create, open, settings,
// duplicate and delete, all off the T1 lists.
export function Products() {
  const { openEditor: openProductEditor, EditorWrapper: ProductEditorWrapper } =
    getEditorWrapper();

  async function openProduct(product: ProductSummary) {
    // The editors take the product id and read label, package and scope LIVE
    // from the T1 row (D16); nothing about the pair is snapshotted here.
    await openProductEditor({
      element: PRODUCT_TYPE_REGISTRY[product.type].editor,
      props: { productId: product.id },
    });
  }

  // The one opener for requests made before the list is hydrated (the tour
  // catalogue, the copilot, a product created a moment ago).
  createEffect(() => {
    const pending = pendingEditorOpen();
    if (!pending || pending.kind !== "product") return;
    const product = instanceState.products.find((x) => x.id === pending.id);
    if (!product) {
      if (instanceState.isReady) setPendingEditorOpen(null);
      return;
    }
    setPendingEditorOpen(null);
    void openProduct(product);
  });

  const visibleProducts = createMemo(() =>
    [...instanceState.products].sort((a, b) =>
      b.lastUpdated.localeCompare(a.lastUpdated),
    ),
  );

  const selection = createSelectionController<string>({
    ids: () => visibleProducts().map((x) => x.id),
    mode: "multi",
  });

  function batchProducts(product: ProductSummary): ProductSummary[] {
    const ids = new Set(selection.getBatchIds(product.id));
    return instanceState.products.filter((x) => ids.has(x.id));
  }

  // A new product's package is the pin, resolved server-side (D5), so with no
  // ready pinned package there is nothing to create against. T1 already knows
  // that, so the buttons say so BEFORE the click. The server's typed
  // NO_READY_PINNED_PACKAGE still comes back through the action's alert: it
  // is the authority, and it covers the race where the pin moves between
  // render and click.
  const canCreateProduct = () =>
    instanceState.currentUserApproved &&
    instanceState.pinnedRunId !== null &&
    instanceState.readyPackages.some((x) => x.id === instanceState.pinnedRunId);

  async function openCreatedProduct(data: { productId: string }) {
    const product = instanceState.products.find((x) => x.id === data.productId);
    // The SSE echo normally lands first; if it has not, the pending-open
    // request picks the new product up as soon as it arrives.
    if (product) {
      await openProduct(product);
    } else {
      setPendingEditorOpen({ kind: "product", id: data.productId });
    }
  }

  // ONE ACTION PER BUTTON: createButtonAction owns a state signal and a
  // request-id guard that drops the callback of any but the most recent
  // click. Shared, one click would spin both buttons and a second click while
  // the first is in flight would discard the first product's open.
  const createDeck = createButtonAction(
    () => serverActions.createProduct({ type: "slide_deck", folderId: null }),
    openCreatedProduct,
  );
  const createReport = createButtonAction(
    () => serverActions.createProduct({ type: "report", folderId: null }),
    openCreatedProduct,
  );

  async function openSettings(product: ProductSummary) {
    await openComponent({ element: ProductSettings, props: { product } });
  }

  async function handleDuplicate(product: ProductSummary) {
    await openComponent({
      element: DuplicateProductsModal,
      props: { products: batchProducts(product) },
    });
    selection.clear();
  }

  async function handleDelete(product: ProductSummary) {
    const productIds = batchProducts(product).map((x) => x.id);
    // Hard delete, no trash (D16): the confirmation carries the count.
    const confirmText =
      productIds.length > 1
        ? t3({
            en: `Are you sure you want to delete ${productIds.length} products? This cannot be undone.`,
            fr: `Êtes-vous sûr de vouloir supprimer ${productIds.length} produits ? Cette action est irréversible.`,
            pt: `Tem a certeza de que pretende eliminar ${productIds.length} produtos? Esta ação é irreversível.`,
          })
        : t3({
            en: "Are you sure you want to delete this product? This cannot be undone.",
            fr: "Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible.",
            pt: "Tem a certeza de que pretende eliminar este produto? Esta ação é irreversível.",
          });
    const deleteAction = createDeleteAction(
      confirmText,
      () => serverActions.deleteProducts({ productIds }),
      () => selection.clear(),
    );
    await deleteAction.click();
  }

  function productMenuItems(product: ProductSummary): MenuItem[] {
    const count = batchProducts(product).length;
    const many = count > 1;
    return [
      {
        label: t3({ en: "Settings", fr: "Paramètres", pt: "Definições" }),
        icon: "settings",
        onClick: () => void openSettings(product),
        disabled: many,
      },
      {
        label: many
          ? t3({
              en: `Duplicate ${count} products`,
              fr: `Dupliquer ${count} produits`,
              pt: `Duplicar ${count} produtos`,
            })
          : t3({ en: "Duplicate", fr: "Dupliquer", pt: "Duplicar" }),
        icon: "copy",
        onClick: () => void handleDuplicate(product),
      },
      { type: "divider" },
      {
        label: many
          ? t3({
              en: `Delete ${count} products`,
              fr: `Supprimer ${count} produits`,
              pt: `Eliminar ${count} produtos`,
            })
          : t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" }),
        icon: "trash",
        intent: "danger",
        onClick: () => void handleDelete(product),
      },
    ];
  }

  function handleContextMenu(e: MouseEvent, product: ProductSummary) {
    e.preventDefault();
    if (!canEditProduct(product.id)) return;
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items: productMenuItems(product),
    });
  }

  return (
    <ProductEditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            data-tour="products-header"
            heading={t3({ en: "Products", fr: "Produits", pt: "Produtos" })}
          >
            <div class="ui-gap-sm flex items-center">
              <Show when={!canCreateProduct()}>
                <span class="text-base-content-muted text-xs">
                  {t3({
                    en: "An admin must generate and pin a results package",
                    fr: "Un administrateur doit générer et épingler un paquet de résultats",
                    pt: "Um administrador tem de gerar e fixar um pacote de resultados",
                  })}
                </span>
              </Show>
              <Button
                data-tour="products-new-deck"
                onClick={createDeck.click}
                state={createDeck.state()}
                disabled={!canCreateProduct()}
                iconName="plus"
              >
                {PRODUCT_TYPE_REGISTRY.slide_deck.createLabel()}
              </Button>
              <Button
                data-tour="products-new-report"
                onClick={createReport.click}
                state={createReport.state()}
                disabled={!canCreateProduct()}
                iconName="plus"
              >
                {PRODUCT_TYPE_REGISTRY.report.createLabel()}
              </Button>
            </div>
          </HeadingBar>
        }
      >
        <div
          class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto"
          data-tour="products-items"
          onClick={() => selection.clear()}
        >
          <For
            each={visibleProducts()}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No products yet. A product is a slide deck or a report; create one and the editor opens straight away.",
                  fr: "Aucun produit pour le moment. Un produit est une présentation ou un rapport ; créez-en un et l'éditeur s'ouvre immédiatement.",
                  pt: "Ainda não há produtos. Um produto é uma apresentação ou um relatório; crie um e o editor abre de imediato.",
                })}
              </div>
            }
          >
            {(product) => (
              <ProductCard
                product={product}
                selected={selection.isSelected(product.id)}
                onSelectToggle={(e) => selection.handleClick(product.id, e)}
                onOpen={(e) => {
                  e?.stopPropagation();
                  selection.handleClick(product.id, e, () =>
                    openProduct(product),
                  );
                }}
                onContextMenu={(e) => handleContextMenu(e, product)}
              />
            )}
          </For>
        </div>
      </FrameTop>
    </ProductEditorWrapper>
  );
}
