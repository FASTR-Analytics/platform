import { useSearchParams } from "@solidjs/router";
import { t3, TC, type ProductSummary, type ProductType } from "lib";
import {
  Button,
  ButtonGroup,
  Card,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  Select,
  SelectList,
  createButtonAction,
  createDeleteAction,
  createSelectionController,
  getColor,
  getEditorWrapper,
  getFirstString,
  openComponent,
  showMenu,
  type ListItem,
  type MenuItem,
} from "panther";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { copilotViewController } from "~/components/copilot/ai_views";
import { ReportEditor } from "~/components/report";
import { SlideDeckEditor } from "~/components/slide_deck";
import { sortBySortMode } from "~/components/_shared/sort_control";
import { serverActions } from "~/server_actions";
import { canEditProducts, instanceState } from "~/state/instance/t1_store";
import {
  _PRODUCT_QUERY_PARAM,
  pendingEditorOpen,
  productsSelectedFolder,
  productsSortMode,
  productsTypeFilter,
  setPendingEditorOpen,
  setProductsSelectedFolder,
  setProductsSortMode,
  setProductsTypeFilter,
  setShowAi,
  showAi,
} from "~/state/t4_ui";
import { DuplicateProductsModal } from "./duplicate_products_modal";
import { EditFolderModal } from "./edit_folder_modal";
import { MoveToFolderModal } from "./move_to_folder_modal";
import { ProductCard, productTypeLabel } from "./product_card";
import { ProductSettings } from "./product_settings";

// Sidebar sentinels. `productsSelectedFolder` stores null for "All products"
// and a real uuid for a folder, so "un-foldered" needs a name of its own.
const _ALL_PRODUCTS = "_all";
const _GENERAL = "_general";

// The type-filter chips store null for "both", so the chip group needs the
// same treatment.
const _ALL_TYPES = "_all_types";

type GroupOption = {
  value: string;
  label: string;
  count: number;
  color: string | null;
};

export function Products() {
  const { openEditor: openProductEditor, EditorWrapper: ProductEditorWrapper } =
    getEditorWrapper();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = createSignal<string>("");

  // The page IS the copilot's `viewing_products` view (D15). Each editor sets
  // its own view while open and restores on close, so this only has to claim
  // the view when the tab is entered.
  onMount(() => copilotViewController.setView("viewing_products"));

  async function openProduct(product: ProductSummary) {
    // The editors take the product id and read label, package and scope LIVE
    // from the T1 row (D16) — nothing about the pair is snapshotted here.
    if (product.type === "slide_deck") {
      await openProductEditor({
        element: SlideDeckEditor,
        props: { productId: product.id },
      });
      return;
    }
    await openProductEditor({
      element: ReportEditor,
      props: { productId: product.id },
    });
  }

  // `?product=<id>` is consumed into the same pending-open request the tour
  // catalogue and the copilot use, so there is one opener and one place that
  // waits for hydration.
  createEffect(() => {
    const deepLinkId = getFirstString(searchParams[_PRODUCT_QUERY_PARAM]);
    if (deepLinkId === undefined) return;
    setSearchParams({ [_PRODUCT_QUERY_PARAM]: undefined });
    setPendingEditorOpen({ productId: deepLinkId });
  });

  createEffect(() => {
    const pending = pendingEditorOpen();
    const products = instanceState.products;
    const isReady = instanceState.isReady;
    if (!pending) return;
    const product = products.find((x) => x.id === pending.productId);
    if (!product) {
      // Still hydrating: keep the request. Once the store is ready and the id
      // is still absent it is a dead link, so drop it rather than retry.
      if (isReady) setPendingEditorOpen(null);
      return;
    }
    setPendingEditorOpen(null);
    void openProduct(product);
  });

  const filteredBySearchAndType = createMemo(() => {
    const products = instanceState.products;
    const typeFilter = productsTypeFilter();
    const search = searchText();
    const byType =
      typeFilter === null
        ? products
        : products.filter((x) => x.type === typeFilter);
    if (search.length < 3) return byType;
    const searchLower = search.toLowerCase();
    return byType.filter((x) => x.label.toLowerCase().includes(searchLower));
  });

  const groupOptions = createMemo((): GroupOption[] => {
    const products = filteredBySearchAndType();
    return [
      {
        value: _ALL_PRODUCTS,
        label: t3({
          en: "All products",
          fr: "Tous les produits",
          pt: "Todos os produtos",
        }),
        count: products.length,
        color: null,
      },
      {
        value: _GENERAL,
        label: t3(TC.general),
        count: products.filter((x) => x.folderId === null).length,
        color: null,
      },
      ...instanceState.folders.map((folder) => ({
        value: folder.id,
        label: folder.label,
        count: products.filter((x) => x.folderId === folder.id).length,
        color: folder.color,
      })),
    ];
  });

  const selectedGroup = () => productsSelectedFolder() ?? _ALL_PRODUCTS;

  // A folder deleted elsewhere (or by another user) must not leave the grid
  // showing nothing with no way back.
  createEffect(() => {
    const groups = groupOptions();
    const current = selectedGroup();
    if (!groups.some((g) => g.value === current)) {
      setProductsSelectedFolder(null);
    }
  });

  const visibleProducts = createMemo(() => {
    const products = filteredBySearchAndType();
    const group = selectedGroup();
    const selected =
      group === _ALL_PRODUCTS
        ? products
        : group === _GENERAL
          ? products.filter((x) => x.folderId === null)
          : products.filter((x) => x.folderId === group);
    return sortBySortMode(
      selected,
      productsSortMode(),
      (x) => x.label,
      (x) => x.lastUpdated,
    );
  });

  const selection = createSelectionController<string>({
    ids: () => visibleProducts().map((x) => x.id),
    mode: "multi",
  });

  function batchProducts(product: ProductSummary): ProductSummary[] {
    const ids = new Set(selection.getBatchIds(product.id));
    return instanceState.products.filter((x) => ids.has(x.id));
  }

  // The folder a NEW product lands in: whatever the sidebar is showing, unless
  // that is one of the two pseudo-groups.
  function currentFolderId(): string | null {
    const group = selectedGroup();
    return group === _ALL_PRODUCTS || group === _GENERAL ? null : group;
  }

  // A new product's package is the pin, resolved server-side (D5), so with no
  // ready pinned package there is nothing to create against. T1 already knows
  // that, so the buttons say so BEFORE the click rather than after it (D16).
  // The server's typed NO_READY_PINNED_PACKAGE still comes back through the
  // action's alert — it is the authority, and it covers the race where the pin
  // is unpinned between render and click.
  const canCreateProduct = () =>
    instanceState.pinnedRunId !== null &&
    instanceState.readyPackages.some((x) => x.id === instanceState.pinnedRunId);

  const createProduct = createButtonAction(
    (type: ProductType) =>
      serverActions.createProduct({ type, folderId: currentFolderId() }),
    async (data) => {
      const product = instanceState.products.find(
        (x) => x.id === data.productId,
      );
      // The SSE echo normally lands first; if it has not, the pending-open
      // request picks the new product up as soon as it arrives.
      if (product) {
        await openProduct(product);
      } else {
        setPendingEditorOpen({ productId: data.productId });
      }
    },
  );

  async function openSettings(product: ProductSummary) {
    await openComponent({
      element: ProductSettings,
      props: { product },
    });
  }

  async function handleMoveToFolder(product: ProductSummary) {
    await openComponent({
      element: MoveToFolderModal,
      props: {
        productIds: batchProducts(product).map((x) => x.id),
        currentFolderId: product.folderId,
        folders: instanceState.folders,
      },
    });
    selection.clear();
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
    // Hard delete, no trash (D11) — the confirmation carries the count.
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

  function handleContextMenu(e: MouseEvent, product: ProductSummary) {
    e.preventDefault();
    const count = selection.selectedCount();
    const isMultiSelect = selection.isSelected(product.id) && count > 1;

    const items: MenuItem[] = [
      {
        label: t3(TC.settings),
        icon: "settings",
        onClick: () => void openSettings(product),
      },
      {
        label: isMultiSelect
          ? t3({
              en: `Move ${count} products to folder...`,
              fr: `Déplacer ${count} produits vers un dossier...`,
              pt: `Mover ${count} produtos para uma pasta...`,
            })
          : t3({
              en: "Move to folder...",
              fr: "Déplacer vers un dossier...",
              pt: "Mover para uma pasta...",
            }),
        icon: "folder",
        onClick: () => void handleMoveToFolder(product),
      },
      {
        label: isMultiSelect
          ? t3({
              en: `Duplicate ${count} products...`,
              fr: `Dupliquer ${count} produits...`,
              pt: `Duplicar ${count} produtos...`,
            })
          : t3({ en: "Duplicate...", fr: "Dupliquer...", pt: "Duplicar..." }),
        icon: "copy",
        onClick: () => void handleDuplicate(product),
      },
      {
        label: isMultiSelect
          ? t3({
              en: `Delete ${count} products`,
              fr: `Supprimer ${count} produits`,
              pt: `Eliminar ${count} produtos`,
            })
          : t3(TC.delete),
        icon: "trash",
        intent: "danger",
        onClick: () => void handleDelete(product),
      },
    ];
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items,
    });
  }

  function handleFolderContextMenu(e: MouseEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const folder = instanceState.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const items: MenuItem[] = [
      {
        label: t3({
          en: "Rename / Change color...",
          fr: "Renommer / Changer la couleur...",
          pt: "Mudar o nome / Alterar a cor...",
        }),
        icon: "pencil",
        onClick: () =>
          void openComponent({ element: EditFolderModal, props: { folder } }),
      },
      {
        label: t3({
          en: "Delete folder",
          fr: "Supprimer le dossier",
          pt: "Eliminar pasta",
        }),
        icon: "trash",
        intent: "danger",
        onClick: async () => {
          const deleteAction = createDeleteAction(
            t3({
              en: "Are you sure you want to delete this folder? Its products move to General.",
              fr: "Êtes-vous sûr de vouloir supprimer ce dossier ? Ses produits seront déplacés dans Général.",
              pt: "Tem a certeza de que pretende eliminar esta pasta? Os seus produtos serão movidos para Geral.",
            }),
            () => serverActions.deleteFolder({ folder_id: folderId }),
            () => {},
          );
          await deleteAction.click();
        },
      },
    ];
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items,
    });
  }

  function renderGroupOption(item: ListItem<string>) {
    const opt = groupOptions().find((g) => g.value === item.id);
    if (!opt) return <span>{item.label}</span>;
    const isUserFolder = !item.id.startsWith("_");
    return (
      <div
        class="flex items-center gap-2"
        onContextMenu={
          isUserFolder ? (e) => handleFolderContextMenu(e, item.id) : undefined
        }
      >
        <div
          class="h-2.5 w-2.5 flex-none rounded-full"
          style={{
            "background-color": opt.color ?? getColor({ key: "base300" }),
          }}
        />
        <span class="flex-1 truncate">{opt.label}</span>
        <span class="ui-text-caption">({opt.count})</span>
      </div>
    );
  }

  const typeFilterItems = (): ListItem<string>[] => [
    {
      id: _ALL_TYPES,
      label: t3({ en: "All", fr: "Tous", pt: "Todos" }),
    },
    { id: "slide_deck", label: productTypeLabel("slide_deck") },
    { id: "report", label: productTypeLabel("report") },
  ];

  const createButtons = (
    <div class="ui-gap-sm flex items-center">
      <Show when={!canCreateProduct()}>
        <span class="text-base-content-muted text-xs">
          {t3({
            en: "An admin must generate a results package",
            fr: "Un administrateur doit générer un package de résultats",
            pt: "Um administrador tem de gerar um pacote de resultados",
          })}
        </span>
      </Show>
      <Button
        data-tour="products-new-deck"
        onClick={() => createProduct.click("slide_deck")}
        state={createProduct.state()}
        disabled={!canCreateProduct()}
        iconName="plus"
      >
        {t3({
          en: "New deck",
          fr: "Nouvelle présentation",
          pt: "Nova apresentação",
        })}
      </Button>
      <Button
        data-tour="products-new-report"
        onClick={() => createProduct.click("report")}
        state={createProduct.state()}
        disabled={!canCreateProduct()}
        iconName="plus"
      >
        {t3({
          en: "New report",
          fr: "Nouveau rapport",
          pt: "Novo relatório",
        })}
      </Button>
    </div>
  );

  return (
    <ProductEditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            data-tour="products-header"
            heading={t3({
              en: "Products",
              fr: "Produits",
              pt: "Produtos",
            })}
            searchText={searchText()}
            setSearchText={setSearchText}
            centerChildren={
              <div class="ui-gap-sm flex items-center">
                <ButtonGroup
                  data-tour="products-type-filter"
                  value={productsTypeFilter() ?? _ALL_TYPES}
                  onChange={(v) =>
                    setProductsTypeFilter(
                      v === undefined || v === _ALL_TYPES
                        ? null
                        : (v as ProductType),
                    )
                  }
                  items={typeFilterItems()}
                />
                <Select
                  data-tour="products-sort"
                  value={productsSortMode()}
                  options={[
                    {
                      value: "label",
                      label: t3({ en: "Name", fr: "Nom", pt: "Nome" }),
                    },
                    {
                      value: "recent",
                      label: t3({
                        en: "Recently updated",
                        fr: "Récemment modifié",
                        pt: "Atualizado recentemente",
                      }),
                    },
                  ]}
                  onChange={(v) =>
                    setProductsSortMode(v === "label" ? "label" : "recent")
                  }
                />
              </div>
            }
          >
            <div class="ui-gap-sm flex items-center">
              <Show when={canEditProducts()}>{createButtons}</Show>
              <Show when={!showAi()}>
                <Button
                  onClick={() => setShowAi(true)}
                  iconName="chevronLeft"
                  outline
                >
                  {t3({ en: "AI", fr: "IA", pt: "IA" })}
                </Button>
              </Show>
            </div>
          </HeadingBar>
        }
      >
        <FrameLeftResizable
          startingWidth={180}
          minWidth={170}
          maxWidth={300}
          panelChildren={
            <div class="flex h-full w-full flex-col" data-tour="products-folders">
              <div class="ui-pad flex-1 overflow-auto">
                <SelectList
                  items={groupOptions().map((g) => ({
                    id: g.value,
                    label: g.label,
                  }))}
                  value={selectedGroup()}
                  onChange={(v) =>
                    setProductsSelectedFolder(v === _ALL_PRODUCTS ? null : v)
                  }
                  renderItem={renderGroupOption}
                  fullWidth
                />
                <Show when={canEditProducts()}>
                  <div class="py-3">
                    <Button
                      size="sm"
                      outline
                      iconName="plus"
                      onClick={() =>
                        void openComponent({
                          element: EditFolderModal,
                          props: { folder: undefined },
                        })
                      }
                    >
                      {t3({
                        en: "New folder",
                        fr: "Nouveau dossier",
                        pt: "Nova pasta",
                      })}
                    </Button>
                  </div>
                </Show>
              </div>
            </div>
          }
        >
          <div
            class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto"
            data-tour="products-grid"
            onClick={() => selection.clear()}
          >
            <For
              each={visibleProducts()}
              fallback={
                <Switch>
                  <Match when={searchText().length >= 3}>
                    <div class="text-base-content-muted text-sm">
                      {t3({
                        en: "No matching products",
                        fr: "Aucun produit correspondant",
                        pt: "Nenhum produto correspondente",
                      })}
                    </div>
                  </Match>
                  <Match
                    when={
                      instanceState.products.length === 0 && canEditProducts()
                    }
                  >
                    <Card
                      header={t3({
                        en: "Start here",
                        fr: "Commencer ici",
                        pt: "Comece aqui",
                      })}
                      class="col-span-2"
                    >
                      <div class="ui-spy-sm">
                        <div class="text-base-content-muted text-sm">
                          {t3({
                            en: "A product is a slide deck or a report. Create one and the editor opens straight away.",
                            fr: "Un produit est une présentation ou un rapport. Créez-en un et l'éditeur s'ouvre immédiatement.",
                            pt: "Um produto é uma apresentação ou um relatório. Crie um e o editor abre de imediato.",
                          })}
                        </div>
                        {createButtons}
                      </div>
                    </Card>
                  </Match>
                  <Match when={true}>
                    <div class="text-base-content-muted text-sm">
                      {t3({
                        en: "No products here yet",
                        fr: "Aucun produit ici pour le moment",
                        pt: "Ainda não há produtos aqui",
                      })}
                    </div>
                  </Match>
                </Switch>
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
        </FrameLeftResizable>
      </FrameTop>
    </ProductEditorWrapper>
  );
}
