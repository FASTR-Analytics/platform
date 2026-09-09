import { useSearchParams } from "@solidjs/router";
import {
  PRODUCT_TYPES,
  t3,
  type Folder,
  type ProductSummary,
  type ProductType,
} from "lib";
import {
  Button,
  ButtonGroup,
  FrameTop,
  HeadingBar,
  createButtonAction,
  createDeleteAction,
  createSelectionController,
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
  type JSX,
} from "solid-js";
import { SortControl, sortBySortMode } from "~/components/_shared/sort_control";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { canEditProduct } from "~/state/instance/product_access";
import {
  _PRODUCT_QUERY_PARAM,
  pendingEditorOpen,
  productsOpenFolder,
  productsSortMode,
  productsTypeFilter,
  productsViewMode,
  setPendingEditorOpen,
  setProductsOpenFolder,
  setProductsSortMode,
  setProductsTypeFilter,
  setProductsViewMode,
} from "~/state/t4_ui";
import { DuplicateProductsModal } from "./duplicate_products_modal";
import { EditFolderModal } from "./edit_folder_modal";
import { FolderCard, folderColor, topLevelLabel } from "./folder_card";
import { buildFolderMenu } from "./folder_menu";
import { ancestors, childFolders, folderPathLabels } from "./folder_tree";
import { ListView } from "./list_view";
import { MoveToFolderModal } from "./move_to_folder_modal";
import { ProductCard } from "./product_card";
import { buildProductMenu } from "./product_menu";
import { PRODUCT_TYPE_REGISTRY } from "./product_types";
import { ProductSettings } from "./product_settings";

// The type-filter chips store null for "every type", so the chip group needs a
// sentinel of its own.
const _ALL_TYPES = "_all_types";

const _SEARCH_MIN_LENGTH = 3;

// The breadcrumb always shows the root and the current folder; the folders
// between them collapse into a menu once there are more than this many (D16).
const _MAX_UNCOLLAPSED_ANCESTORS = 2;

// The product explorer (D16): a file browser over the flat T1 products and
// folders lists. The user is always inside one folder; the page shows that
// folder's sub-folders and products and nothing else, and the path back to the
// root is derived by walking `parentId`.
export function Products() {
  const { openEditor: openProductEditor, EditorWrapper: ProductEditorWrapper } =
    getEditorWrapper();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = createSignal("");

  async function openProduct(product: ProductSummary) {
    // The editors take the product id and read label, package and scope LIVE
    // from the T1 row (D16); nothing about the pair is snapshotted here.
    await openProductEditor({
      element: PRODUCT_TYPE_REGISTRY[product.type].editor,
      props: { productId: product.id },
    });
  }

  // `?product=<id>` is consumed into the same pending-open request the tours
  // use, so there is one opener and one place that waits for hydration.
  createEffect(() => {
    const deepLinkId = getFirstString(searchParams[_PRODUCT_QUERY_PARAM]);
    if (deepLinkId === undefined) return;
    setSearchParams({ [_PRODUCT_QUERY_PARAM]: undefined });
    setPendingEditorOpen({ kind: "product", id: deepLinkId });
  });

  // The one opener for requests made from outside this page (the tour
  // catalogue, a deep link). An id still absent once the store is ready is a
  // dead link, so the request is dropped rather than retried.
  createEffect(() => {
    const pending = pendingEditorOpen();
    const products = instanceState.products;
    const isReady = instanceState.isReady;
    if (!pending || pending.kind !== "product") return;
    const product = products.find((x) => x.id === pending.id);
    if (!product) {
      if (isReady) setPendingEditorOpen(null);
      return;
    }
    setPendingEditorOpen(null);
    void openProduct(product);
  });

  // A product this page just created, waiting for its row to arrive. NOT
  // pendingEditorOpen: that request is dropped as a dead link the first tick
  // the store is ready, which it already is here, so a create whose response
  // beat its SSE echo would never open. This one waits for the row itself and
  // is answered by nothing else.
  const [awaitingProductId, setAwaitingProductId] = createSignal<string | null>(
    null,
  );

  createEffect(() => {
    const id = awaitingProductId();
    const products = instanceState.products;
    if (id === null) return;
    const product = products.find((x) => x.id === id);
    if (!product) return;
    setAwaitingProductId(null);
    void openProduct(product);
  });

  // The explorer's location: null = the root, an id = inside that folder.
  const location = () => productsOpenFolder();

  // A folder deleted by another session must not strand the explorer inside a
  // location that no longer exists. Gated on isReady so the persisted location
  // survives hydration.
  createEffect(() => {
    const openFolderId = productsOpenFolder();
    const folders = instanceState.folders;
    const isReady = instanceState.isReady;
    if (openFolderId === null || !isReady) return;
    if (!folders.some((f) => f.id === openFolderId)) {
      setProductsOpenFolder(null);
    }
  });

  const isSearching = () => searchText().length >= _SEARCH_MIN_LENGTH;

  const pathLabels = createMemo(() => folderPathLabels(instanceState.folders));

  // Search is global and flat: it escapes the location and matches folders and
  // products from anywhere in the tree. The chips filter products only;
  // folders are always visible in a location (D16).
  const visibleFolders = createMemo(() => {
    const folders = instanceState.folders;
    const needle = searchText().toLowerCase();
    const selected = isSearching()
      ? folders.filter((f) => f.label.toLowerCase().includes(needle))
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
    const needle = searchText().toLowerCase();
    const byType =
      typeFilter === null
        ? products
        : products.filter((x) => x.type === typeFilter);
    const selected = isSearching()
      ? byType.filter((x) => x.label.toLowerCase().includes(needle))
      : byType.filter((x) => x.folderId === location());
    return sortBySortMode(
      selected,
      productsSortMode(),
      (x) => x.label,
      (x) => x.lastUpdated,
    );
  });

  // Every folder's DIRECT child counts in one pass: a per-row scan of both
  // lists would be quadratic. The product half reflects the type filter (D16).
  const folderCounts = createMemo(() => {
    const typeFilter = productsTypeFilter();
    const counts = new Map<string, { folderCount: number; productCount: number }>();
    const entry = (folderId: string) => {
      const existing = counts.get(folderId);
      if (existing !== undefined) return existing;
      const created = { folderCount: 0, productCount: 0 };
      counts.set(folderId, created);
      return created;
    };
    for (const folder of instanceState.folders) {
      entry(folder.id);
      if (folder.parentId !== null) entry(folder.parentId).folderCount += 1;
    }
    for (const product of instanceState.products) {
      if (product.folderId === null) continue;
      if (typeFilter !== null && product.type !== typeFilter) continue;
      entry(product.folderId).productCount += 1;
    }
    return counts;
  });

  function countsForFolder(folderId: string) {
    return (
      folderCounts().get(folderId) ?? { folderCount: 0, productCount: 0 }
    );
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
      setSearchText("");
    });
  }

  function goToParent() {
    const current = instanceState.folders.find((f) => f.id === location());
    openFolder(current?.parentId ?? null);
  }

  // A new product's package is the pin, resolved server-side (D5), so with no
  // ready pinned package there is nothing to create against. T1 already knows
  // that, so the buttons say so BEFORE the click. The server's typed
  // NO_READY_PINNED_PACKAGE still comes back through the action's alert: it
  // is the authority, and it covers the race where the pin moves between
  // render and click.
  const canEdit = () => instanceState.currentUserApproved;
  const canCreateProduct = () =>
    canEdit() &&
    instanceState.pinnedRunId !== null &&
    instanceState.readyPackages.some((x) => x.id === instanceState.pinnedRunId);

  async function openCreatedProduct(data: { productId: string }) {
    const product = instanceState.products.find((x) => x.id === data.productId);
    // The SSE echo normally lands first; if it has not, the effect above
    // opens the row the moment it arrives.
    if (product) {
      await openProduct(product);
    } else {
      setAwaitingProductId(data.productId);
    }
  }

  // ONE ACTION PER BUTTON: createButtonAction owns a state signal and a
  // request-id guard that drops the callback of any but the most recent
  // click. Shared, one click would spin both buttons and a second click while
  // the first is in flight would discard the first product's open.
  const createDeck = createButtonAction(
    () =>
      serverActions.createProduct({ type: "slide_deck", folderId: location() }),
    openCreatedProduct,
  );
  const createReport = createButtonAction(
    () => serverActions.createProduct({ type: "report", folderId: location() }),
    openCreatedProduct,
  );

  async function openSettings(product: ProductSummary) {
    await openComponent({ element: ProductSettings, props: { product } });
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
        folders: instanceState.folders,
      },
    });
    selection.clear();
  }

  // The quick moves have no modal, so a failure surfaces through openAlert;
  // the picker path gets that from createFormAction.
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
      await openAlert({ text: res.err, intent: "danger" });
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
      await openAlert({ text: res.err, intent: "danger" });
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
    return buildProductMenu({
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

  function handleProductMenu(e: MouseEvent, product: ProductSummary) {
    if (!canEditProduct(product.id)) return;
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items: productMenuItems(product),
    });
  }

  async function handleDeleteFolder(folder: Folder) {
    const counts = countsForFolder(folder.id);
    const parent = instanceState.folders.find((f) => f.id === folder.parentId);
    const destination = parent?.label ?? topLevelLabel();
    // Deleting a folder reparents one level and never cascades (D16), so the
    // confirmation carries the direct counts and where the contents land.
    const confirmText = t3({
      en: `Delete "${folder.label}"? Its ${counts.folderCount} folder(s) and ${counts.productCount} product(s) move to ${destination}.`,
      fr: `Supprimer « ${folder.label} » ? Ses ${counts.folderCount} dossier(s) et ${counts.productCount} produit(s) seront déplacés vers ${destination}.`,
      pt: `Eliminar "${folder.label}"? As suas ${counts.folderCount} pasta(s) e ${counts.productCount} produto(s) serão movidos para ${destination}.`,
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
    if (!canEdit()) return;
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items: folderMenuItems(folder),
    });
  }

  const typeFilterItems = (): ListItem<string>[] => [
    { id: _ALL_TYPES, label: t3({ en: "All", fr: "Tous", pt: "Todos" }) },
    ...PRODUCT_TYPES.map((type) => ({
      id: type,
      label: PRODUCT_TYPE_REGISTRY[type].label(),
    })),
  ];

  function crumbSeparator(): JSX.Element {
    return <span class="text-base-content-faint flex-none">›</span>;
  }

  function crumbButton(folder: Folder): JSX.Element {
    return (
      <button
        type="button"
        class="ui-focusable text-base-content-muted hover:text-base-content max-w-40 cursor-pointer truncate"
        title={folder.label}
        onClick={() => openFolder(folder.id)}
      >
        {folder.label}
      </button>
    );
  }

  function openCollapsedCrumbsMenu(e: MouseEvent, middle: Folder[]) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    showMenu({
      anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      items: middle.map(
        (f): MenuItem => ({
          label: f.label,
          icon: "folder",
          onClick: () => openFolder(f.id),
        }),
      ),
    });
  }

  const productsLabel = () =>
    t3({ en: "Products", fr: "Produits", pt: "Produtos" });

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
    if (folder === undefined) {
      return productsLabel();
    }
    const trail = ancestors(instanceState.folders, folder.id);
    const collapsed = trail.length > _MAX_UNCOLLAPSED_ANCESTORS;
    return (
      <div
        class="ui-gap-sm flex min-w-0 items-center"
        data-tour="products-breadcrumb"
      >
        <button
          type="button"
          class="ui-focusable text-base-content-muted hover:text-base-content cursor-pointer"
          onClick={() => openFolder(null)}
        >
          {productsLabel()}
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
            class="ui-focusable text-base-content-muted hover:text-base-content cursor-pointer"
            onClick={(e) => openCollapsedCrumbsMenu(e, trail.slice(1, -1))}
          >
            …
          </button>
          {crumbSeparator()}
          {crumbButton(trail[trail.length - 1])}
        </Show>
        {crumbSeparator()}
        <div class="ui-gap-sm flex min-w-0 items-center" title={folder.label}>
          <div
            class="h-2.5 w-2.5 flex-none rounded-full"
            style={{ "background-color": folderColor(folder) }}
          />
          <span class="max-w-40 truncate">{folder.label}</span>
        </div>
      </div>
    );
  };

  const matchCount = () => visibleFolders().length + visibleProducts().length;

  function productSearchPath(product: ProductSummary): string | null {
    if (!isSearching()) return null;
    if (product.folderId === null) return topLevelLabel();
    return pathLabels().get(product.folderId) ?? topLevelLabel();
  }

  function folderSearchPath(folder: Folder): string | null {
    if (!isSearching()) return null;
    if (folder.parentId === null) return topLevelLabel();
    return pathLabels().get(folder.parentId) ?? topLevelLabel();
  }

  const createButtons = (
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
  );

  function emptyState(): JSX.Element {
    return (
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
          <div class="text-base-content-muted text-sm">
            {t3({
              en: "No products in this folder. Create one here, or move products in from their menu.",
              fr: "Aucun produit dans ce dossier. Créez-en un ici, ou déplacez-y des produits depuis leur menu.",
              pt: "Nenhum produto nesta pasta. Crie um aqui, ou mova produtos para cá a partir do seu menu.",
            })}
          </div>
        </Match>
        <Match when={true}>
          <div class="text-base-content-muted text-sm">
            {t3({
              en: "No products yet. A product is a slide deck or a report; create one and the editor opens straight away.",
              fr: "Aucun produit pour le moment. Un produit est une présentation ou un rapport ; créez-en un et l'éditeur s'ouvre immédiatement.",
              pt: "Ainda não há produtos. Um produto é uma apresentação ou um relatório; crie um e o editor abre de imediato.",
            })}
          </div>
        </Match>
      </Switch>
    );
  }

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
                <SortControl
                  data-tour="products-sort"
                  value={productsSortMode()}
                  onChange={setProductsSortMode}
                />
                <ButtonGroup
                  data-tour="products-view-mode"
                  value={productsViewMode()}
                  onChange={(v) =>
                    setProductsViewMode(v === "list" ? "list" : "grid")
                  }
                  items={[
                    {
                      id: "grid",
                      label: "",
                      iconName: "layoutGrid",
                      labelText: t3({
                        en: "Grid view",
                        fr: "Vue en grille",
                        pt: "Vista em grelha",
                      }),
                    },
                    {
                      id: "list",
                      label: "",
                      iconName: "clearAll",
                      labelText: t3({
                        en: "List view",
                        fr: "Vue en liste",
                        pt: "Vista em lista",
                      }),
                    },
                  ]}
                />
              </div>
            }
          >
            <Show when={canEdit()}>
              <div class="ui-gap-sm flex items-center">
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
              </div>
            </Show>
          </HeadingBar>
        }
      >
        <Switch>
          <Match when={productsViewMode() === "grid"}>
            <div
              class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto"
              data-tour="products-items"
              onClick={() => selection.clear()}
            >
              <For each={visibleFolders()}>
                {(folder) => (
                  <FolderCard
                    folder={folder}
                    folderCount={countsForFolder(folder.id).folderCount}
                    productCount={countsForFolder(folder.id).productCount}
                    searchPath={folderSearchPath(folder)}
                    onOpen={() => openFolder(folder.id)}
                    onMenu={(e) => handleFolderMenu(e, folder)}
                  />
                )}
              </For>
              <For each={visibleProducts()} fallback={emptyState()}>
                {(product) => (
                  <ProductCard
                    product={product}
                    selected={selection.isSelected(product.id)}
                    searchPath={productSearchPath(product)}
                    onSelectToggle={(e) => selection.handleClick(product.id, e)}
                    onOpen={(e) => {
                      e?.stopPropagation();
                      selection.handleClick(product.id, e, () =>
                        openProduct(product),
                      );
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleProductMenu(e, product);
                    }}
                  />
                )}
              </For>
            </div>
          </Match>
          <Match when={productsViewMode() === "list"}>
            <ListView
              folders={visibleFolders()}
              products={visibleProducts()}
              searching={isSearching()}
              pathLabels={pathLabels()}
              sortMode={productsSortMode()}
              onSortMode={setProductsSortMode}
              isSelected={(id) => selection.isSelected(id)}
              onToggleSelect={(id) => selection.toggle(id)}
              onRowClick={(product, e) => {
                selection.handleClick(product.id, e, () =>
                  openProduct(product),
                );
              }}
              onRowOpen={(product) => void openProduct(product)}
              onOpenFolder={openFolder}
              onProductMenu={handleProductMenu}
              onFolderMenu={handleFolderMenu}
              folderCounts={countsForFolder}
              onBackgroundClick={() => selection.clear()}
              fallback={emptyState()}
            />
          </Match>
        </Switch>
      </FrameTop>
    </ProductEditorWrapper>
  );
}
