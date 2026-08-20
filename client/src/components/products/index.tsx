import { useSearchParams } from "@solidjs/router";
import { t3, type Folder, type ProductSummary, type ProductType } from "lib";
import {
  Button,
  ButtonGroup,
  Card,
  FrameTop,
  HeadingBar,
  Select,
  createButtonAction,
  createDeleteAction,
  createSelectionController,
  getColor,
  getEditorWrapper,
  getFirstString,
  openAlert,
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
  batch,
  createEffect,
  createMemo,
  createSignal,
  onMount,
  type JSX,
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
  productsOpenFolder,
  productsSortMode,
  productsTypeFilter,
  setPendingEditorOpen,
  setProductsOpenFolder,
  setProductsSortMode,
  setProductsTypeFilter,
  setShowAi,
  showAi,
} from "~/state/t4_ui";
import { DuplicateProductsModal } from "./duplicate_products_modal";
import { EditFolderModal } from "./edit_folder_modal";
import { FolderCard } from "./folder_card";
import { buildFolderMenu } from "./folder_menu";
import { ancestors, childFolders, pathLabel } from "./folder_tree";
import { MoveToFolderModal } from "./move_to_folder_modal";
import { ProductCard, productTypeLabel } from "./product_card";
import { buildProductMenu } from "./product_menu";
import { ProductSettings } from "./product_settings";

// The type-filter chips store null for "both", so the chip group needs a
// sentinel of its own.
const _ALL_TYPES = "_all_types";

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

  // The explorer's location: null = the root, an id = inside that folder
  // (D12). The path is derived, never stored.
  const location = () => productsOpenFolder();

  // A folder deleted elsewhere (or by another user) must not strand the
  // explorer inside a location that no longer exists (D5). Gated on isReady so
  // the persisted location survives hydration.
  createEffect(() => {
    const loc = productsOpenFolder();
    if (loc === null || !instanceState.isReady) return;
    if (!instanceState.folders.some((f) => f.id === loc)) {
      setProductsOpenFolder(null);
    }
  });

  const isSearching = () => searchText().length >= 3;

  // Search is global and flat (D2): it escapes the location and matches
  // folders and products from anywhere in the tree. The chips filter products
  // only — folders are always visible in a location (D1).
  const visibleFolders = createMemo(() => {
    const folders = instanceState.folders;
    const selected = isSearching()
      ? folders.filter((f) =>
          f.label.toLowerCase().includes(searchText().toLowerCase()),
        )
      : childFolders(folders, location());
    return sortBySortMode(
      selected,
      productsSortMode(),
      (x) => x.label,
      (x) => x.lastUpdated,
    );
  });

  const visibleProducts = createMemo(() => {
    const products = instanceState.products;
    const typeFilter = productsTypeFilter();
    const byType =
      typeFilter === null
        ? products
        : products.filter((x) => x.type === typeFilter);
    const selected = isSearching()
      ? byType.filter((x) =>
          x.label.toLowerCase().includes(searchText().toLowerCase()),
        )
      : byType.filter((x) => x.folderId === location());
    return sortBySortMode(
      selected,
      productsSortMode(),
      (x) => x.label,
      (x) => x.lastUpdated,
    );
  });

  // A folder tile's counts are its DIRECT children only (D16); the product
  // half reflects the type filter (D1).
  function folderCounts(folderId: string): {
    folderCount: number;
    productCount: number;
  } {
    const typeFilter = productsTypeFilter();
    return {
      folderCount: instanceState.folders.filter(
        (f) => f.parentId === folderId,
      ).length,
      productCount: instanceState.products.filter(
        (x) =>
          x.folderId === folderId &&
          (typeFilter === null || x.type === typeFilter),
      ).length,
    };
  }

  const selection = createSelectionController<string>({
    ids: () => visibleProducts().map((x) => x.id),
    mode: "multi",
  });

  function batchProducts(product: ProductSummary): ProductSummary[] {
    const ids = new Set(selection.getBatchIds(product.id));
    return instanceState.products.filter((x) => ids.has(x.id));
  }

  function openFolder(folderId: string | null) {
    batch(() => {
      setProductsOpenFolder(folderId);
      selection.clear();
      if (isSearching()) setSearchText("");
    });
  }

  function goToParent() {
    const current = instanceState.folders.find((f) => f.id === location());
    openFolder(current?.parentId ?? null);
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

  async function openCreatedProduct(data: { productId: string }) {
    const product = instanceState.products.find((x) => x.id === data.productId);
    // The SSE echo normally lands first; if it has not, the pending-open
    // request picks the new product up as soon as it arrives.
    if (product) {
      await openProduct(product);
    } else {
      setPendingEditorOpen({ productId: data.productId });
    }
  }

  // ONE ACTION PER BUTTON, deliberately — they must not share an instance.
  // createButtonAction owns both a `state` signal and a request-id guard that
  // drops the callback of any but the most recent click. Shared, that means
  // one click spins both buttons, and a second click while the first is in
  // flight silently discards the first product's open — the row is created,
  // but its editor never appears, which reads as the wrong button having
  // fired. Separate instances give each type its own state and its own lane.
  const createDeck = createButtonAction(
    () =>
      serverActions.createProduct({
        type: "slide_deck",
        folderId: location(),
      }),
    openCreatedProduct,
  );

  const createReport = createButtonAction(
    () =>
      serverActions.createProduct({
        type: "report",
        folderId: location(),
      }),
    openCreatedProduct,
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
        target: {
          kind: "products" as const,
          productIds: batchProducts(product).map((x) => x.id),
          currentFolderId: product.folderId,
        },
        parentId: location(),
        folders: instanceState.folders,
      },
    });
    selection.clear();
  }

  // D14 quick moves — no modal, so failures surface through openAlert (the
  // modal path gets this from createFormAction).
  async function quickMoveProducts(
    product: ProductSummary,
    folderId: string | null,
  ) {
    const productIds = batchProducts(product).map((x) => x.id);
    const res = await serverActions.moveProductsToFolder({
      productIds,
      folderId,
    });
    if (!res.success) {
      await openAlert({ title: "Error", text: res.err, intent: "danger" });
      return;
    }
    selection.clear();
  }

  async function quickMoveFolder(folder: Folder, parentId: string | null) {
    const res = await serverActions.updateFolder({
      folder_id: folder.id,
      label: folder.label,
      color: folder.color,
      parentId,
    });
    if (!res.success) {
      await openAlert({ title: "Error", text: res.err, intent: "danger" });
    }
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

  function productMenuItems(product: ProductSummary): MenuItem[] {
    return buildProductMenu({
      product,
      batch: batchProducts(product),
      folders: instanceState.folders,
      location: location(),
      onSettings: () => void openSettings(product),
      onMoveToFolder: () => void handleMoveToFolder(product),
      onDuplicate: () => void handleDuplicate(product),
      onDelete: () => void handleDelete(product),
      onMoveTo: (folderId) => void quickMoveProducts(product, folderId),
    });
  }

  function handleContextMenu(e: MouseEvent, product: ProductSummary) {
    e.preventDefault();
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items: productMenuItems(product),
    });
  }

  async function handleDeleteFolder(folder: Folder) {
    const folderCount = instanceState.folders.filter(
      (f) => f.parentId === folder.id,
    ).length;
    const allProductCount = instanceState.products.filter(
      (x) => x.folderId === folder.id,
    ).length;
    const parent = instanceState.folders.find((f) => f.id === folder.parentId);
    // Delete reparents one level, never cascades (D11) — the confirmation
    // carries the DIRECT counts and where the contents land.
    const confirmText =
      parent === undefined
        ? t3({
            en: `Delete "${folder.label}"? Its ${folderCount} ${folderCount === 1 ? "folder" : "folders"} and ${allProductCount} ${allProductCount === 1 ? "product" : "products"} move to the top level.`,
            fr: `Supprimer « ${folder.label} » ? Ses ${folderCount} ${folderCount === 1 ? "dossier" : "dossiers"} et ${allProductCount} ${allProductCount === 1 ? "produit" : "produits"} seront déplacés au niveau supérieur.`,
            pt: `Eliminar "${folder.label}"? As suas ${folderCount} ${folderCount === 1 ? "pasta" : "pastas"} e ${allProductCount} ${allProductCount === 1 ? "produto" : "produtos"} serão movidos para o nível superior.`,
          })
        : t3({
            en: `Delete "${folder.label}"? Its ${folderCount} ${folderCount === 1 ? "folder" : "folders"} and ${allProductCount} ${allProductCount === 1 ? "product" : "products"} move to "${parent.label}".`,
            fr: `Supprimer « ${folder.label} » ? Ses ${folderCount} ${folderCount === 1 ? "dossier" : "dossiers"} et ${allProductCount} ${allProductCount === 1 ? "produit" : "produits"} seront déplacés vers « ${parent.label} ».`,
            pt: `Eliminar "${folder.label}"? As suas ${folderCount} ${folderCount === 1 ? "pasta" : "pastas"} e ${allProductCount} ${allProductCount === 1 ? "produto" : "produtos"} serão movidos para "${parent.label}".`,
          });
    const deleteAction = createDeleteAction(
      confirmText,
      () => serverActions.deleteFolder({ folder_id: folder.id }),
      () => {},
    );
    await deleteAction.click();
  }

  function folderMenuItems(folder: Folder): MenuItem[] {
    return buildFolderMenu({
      folder,
      folders: instanceState.folders,
      location: location(),
      onMoveTo: (parentId) => void quickMoveFolder(folder, parentId),
      onMoveToFolder: () =>
        void openComponent({
          element: MoveToFolderModal,
          props: {
            target: { kind: "folder" as const, folder },
            parentId: location(),
            folders: instanceState.folders,
          },
        }),
      onEdit: () =>
        void openComponent({
          element: EditFolderModal,
          props: { folder, parentId: folder.parentId },
        }),
      onDelete: () => void handleDeleteFolder(folder),
    });
  }

  function handleFolderMenu(e: MouseEvent, folder: Folder) {
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items: folderMenuItems(folder),
    });
  }

  const typeFilterItems = (): ListItem<string>[] => [
    {
      id: _ALL_TYPES,
      label: t3({ en: "All", fr: "Tous", pt: "Todos" }),
    },
    { id: "slide_deck", label: productTypeLabel("slide_deck") },
    { id: "report", label: productTypeLabel("report") },
  ];

  // ── Breadcrumb (D13): root kept, middle collapsed into a menu, truncated
  // labels recoverable via title. ──

  function crumbButton(folder: Folder): JSX.Element {
    return (
      <button
        type="button"
        class="ui-focusable max-w-40 cursor-pointer truncate text-base-content-muted hover:text-base-content"
        title={folder.label}
        onClick={() => openFolder(folder.id)}
      >
        {folder.label}
      </button>
    );
  }

  function crumbSeparator(): JSX.Element {
    return <span class="text-base-content-faint flex-none">›</span>;
  }

  function openMiddleCrumbsMenu(e: MouseEvent, middle: Folder[]) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    showMenu({
      anchor: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      items: middle.map((f) => ({
        label: f.label,
        icon: "folder" as const,
        onClick: () => openFolder(f.id),
      })),
    });
  }

  const currentFolder = () =>
    instanceState.folders.find((f) => f.id === location());

  const heading = (): string | JSX.Element => {
    if (isSearching()) {
      return t3({
        en: "Search results",
        fr: "Résultats de recherche",
        pt: "Resultados da pesquisa",
      });
    }
    const folder = currentFolder();
    const productsLabel = t3({
      en: "Products",
      fr: "Produits",
      pt: "Produtos",
    });
    if (folder === undefined) {
      return productsLabel;
    }
    const trail = ancestors(instanceState.folders, folder.id);
    const collapsed = trail.length > 2;
    return (
      <div
        class="ui-gap-sm flex min-w-0 items-center"
        data-tour="products-breadcrumb"
      >
        <button
          type="button"
          class="ui-focusable cursor-pointer text-base-content-muted hover:text-base-content"
          onClick={() => openFolder(null)}
        >
          {productsLabel}
        </button>
        <Show
          when={collapsed}
          fallback={
            <For each={trail}>
              {(ancestor) => (
                <>
                  {crumbSeparator()}
                  {crumbButton(ancestor)}
                </>
              )}
            </For>
          }
        >
          {crumbSeparator()}
          {crumbButton(trail[0])}
          {crumbSeparator()}
          <button
            type="button"
            class="ui-focusable cursor-pointer text-base-content-muted hover:text-base-content"
            onClick={(e) => openMiddleCrumbsMenu(e, trail.slice(1, -1))}
          >
            …
          </button>
          {crumbSeparator()}
          {crumbButton(trail[trail.length - 1])}
        </Show>
        {crumbSeparator()}
        <div
          class="ui-gap-sm flex min-w-0 items-center"
          title={folder.label}
        >
          <div
            class="h-2.5 w-2.5 flex-none rounded-full"
            style={{
              "background-color": folder.color ?? getColor({ key: "base300" }),
            }}
          />
          <span class="max-w-40 truncate">{folder.label}</span>
        </div>
      </div>
    );
  };

  const matchCount = () => visibleFolders().length + visibleProducts().length;

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
        onClick={createDeck.click}
        state={createDeck.state()}
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
        onClick={createReport.click}
        state={createReport.state()}
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
            heading={heading()}
            subheading={
              isSearching()
                ? t3({
                    en: `${matchCount()} results`,
                    fr: `${matchCount()} résultats`,
                    pt: `${matchCount()} resultados`,
                  })
                : undefined
            }
            onBack={
              isSearching()
                ? () => setSearchText("")
                : location() !== null
                  ? goToParent
                  : undefined
            }
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
              <Show when={canEditProducts()}>
                <Button
                  data-tour="products-new-folder"
                  iconName="plus"
                  outline
                  onClick={() =>
                    void openComponent({
                      element: EditFolderModal,
                      props: { folder: undefined, parentId: location() },
                    })
                  }
                >
                  {t3({
                    en: "New folder",
                    fr: "Nouveau dossier",
                    pt: "Nova pasta",
                  })}
                </Button>
                {createButtons}
              </Show>
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
        <div
          class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto"
          data-tour="products-items"
          onClick={() => selection.clear()}
        >
          <For each={visibleFolders()}>
            {(folder) => (
              <FolderCard
                folder={folder}
                folderCount={folderCounts(folder.id).folderCount}
                productCount={folderCounts(folder.id).productCount}
                searchPath={
                  isSearching()
                    ? folder.parentId === null
                      ? t3({
                          en: "Top level",
                          fr: "Niveau supérieur",
                          pt: "Nível superior",
                        })
                      : pathLabel(instanceState.folders, folder.parentId)
                    : null
                }
                onOpen={() => openFolder(folder.id)}
                onMenu={(e) => handleFolderMenu(e, folder)}
              />
            )}
          </For>
          <For
            each={visibleProducts()}
            fallback={
              <Switch>
                <Match when={isSearching()}>
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
                    location() === null &&
                    visibleFolders().length === 0 &&
                    instanceState.products.length === 0 &&
                    canEditProducts()
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
                <Match when={visibleFolders().length > 0}>
                  <div class="text-base-content-muted text-sm">
                    {t3({
                      en: "No products here yet",
                      fr: "Aucun produit ici pour le moment",
                      pt: "Ainda não há produtos aqui",
                    })}
                  </div>
                </Match>
                <Match when={location() !== null}>
                  <div class="text-base-content-muted ui-spy-sm text-sm">
                    <div>
                      {t3({
                        en: "This folder is empty",
                        fr: "Ce dossier est vide",
                        pt: "Esta pasta está vazia",
                      })}
                    </div>
                    <div>
                      {t3({
                        en: "Move products or folders in from their menu, or create something new here.",
                        fr: "Déplacez des produits ou des dossiers ici depuis leur menu, ou créez-en de nouveaux ici.",
                        pt: "Mova produtos ou pastas para aqui a partir do seu menu, ou crie algo novo aqui.",
                      })}
                    </div>
                  </div>
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
      </FrameTop>
    </ProductEditorWrapper>
  );
}
