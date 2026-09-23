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
  FrameTop,
  HeadingBar,
  Select,
  createButtonAction,
  createDeleteAction,
  getFirstString,
  openAlert,
  openComponent,
  showMenu,
  type MenuItem,
  type SelectOption,
} from "panther";
import {
  Match,
  Show,
  Switch,
  batch,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
} from "solid-js";
import { sortBySortMode } from "./sort_by_sort_mode";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { canEditProduct } from "~/state/instance/product_access";
import {
  _PRODUCT_QUERY_PARAM,
  openShellEditor,
  pendingEditorOpen,
  productsExpandedFolders,
  productsSortMode,
  productsTypeFilter,
  setPendingEditorOpen,
  setProductsExpandedFolders,
  setProductsSortMode,
  setProductsTypeFilter,
} from "~/state/t4_ui";
import { ProductCopilotHost } from "~/components/products/copilot/mod.ts";
import { DuplicateProductsModal } from "./_shared/mod.ts";
import { PackageScopeModal } from "./_shared/mod.ts";
import { EditFolderModal } from "./edit_folder_modal";
import { topLevelLabel } from "./folder_labels";
import { buildFolderMenu } from "./folder_menu";
import { buildProductTree, productTreeRows } from "./_shared/mod.ts";
import { ListView } from "./list_view";
import { MoveToFolderModal } from "./move_to_folder_modal";
import { buildProductMenu } from "./product_menu";
import { PRODUCT_TYPE_REGISTRY } from "./product_types";
import { ProductSettings } from "./_shared/mod.ts";

// The type filter stores null for "every type", so the Select needs a
// sentinel of its own.
const _ALL_TYPES = "_all_types";

const _SEARCH_MIN_LENGTH = 3;

// The product explorer (D16): a file browser over the flat T1 products and
// folders lists, shown as a tree from the top level with any number of folders
// open in place.
export function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = createSignal("");
  // Folders the user opened or closed during this search,
  // relative to the ones the search opens itself. Kept apart from the saved
  // open folders so clearing the search restores the tree as it was.
  const [searchToggles, setSearchToggles] = createSignal<ReadonlySet<string>>(
    new Set(),
  );

  function updateSearchText(text: string) {
    batch(() => {
      setSearchText(text);
      setSearchToggles(new Set<string>());
    });
  }

  async function openProduct(product: ProductSummary) {
    // The editors take the product id and read label, package and scope LIVE
    // from the T1 row (D16); nothing about the pair is snapshotted here. The
    // copilot host is the one mount site (D15): one copilot per open product.
    await openShellEditor({
      element: ProductCopilotHost,
      props: {
        productId: product.id,
        editor: PRODUCT_TYPE_REGISTRY[product.type].editor,
      },
    });
  }

  // `?product=<id>` is consumed into the same pending-open request the tours
  // use, so there is one opener and one place that waits for hydration.
  createEffect(() => {
    const deepLinkId = getFirstString(searchParams[_PRODUCT_QUERY_PARAM]);
    if (deepLinkId === undefined) return;
    setSearchParams({ [_PRODUCT_QUERY_PARAM]: undefined });
    setPendingEditorOpen({ productId: deepLinkId });
  });

  // The one opener for requests made from outside this page (the tour
  // catalogue, a deep link). An id still absent once the store is ready is a
  // dead link, so the request is dropped rather than retried.
  createEffect(() => {
    const pending = pendingEditorOpen();
    const products = instanceState.products;
    const isReady = instanceState.isReady;
    if (!pending) return;
    const product = products.find((x) => x.id === pending.productId);
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

  // Ids of deleted folders drop out of the saved open set, so they do not pile
  // up in localStorage. Gated on isReady so the set survives hydration.
  createEffect(() => {
    const expanded = productsExpandedFolders();
    const folders = instanceState.folders;
    const isReady = instanceState.isReady;
    if (!isReady) return;
    const existing = new Set(folders.map((f) => f.id));
    if ([...expanded].every((id) => existing.has(id))) return;
    setProductsExpandedFolders(
      new Set([...expanded].filter((id) => existing.has(id))),
    );
  });

  const isSearching = () => searchText().length >= _SEARCH_MIN_LENGTH;

  const productTree = createMemo(() => {
    const sortMode = productsSortMode();
    const sort = <T extends { label: string; lastUpdated: string }>(xs: T[]) =>
      sortBySortMode(
        xs,
        sortMode,
        (x) => x.label,
        (x) => x.lastUpdated,
      );
    return buildProductTree({
      folders: instanceState.folders,
      products: instanceState.products,
      typeFilter: productsTypeFilter(),
      needle: isSearching() ? searchText().toLowerCase() : null,
      sortFolders: sort,
      sortProducts: sort,
    });
  });

  const openFolderIds = createMemo(
    (): ReadonlySet<string> =>
      isSearching()
        ? symmetricDifference(productTree().matchAncestors, searchToggles())
        : productsExpandedFolders(),
  );

  function setOpenFolderIds(next: ReadonlySet<string>) {
    if (isSearching()) {
      setSearchToggles(symmetricDifference(next, productTree().matchAncestors));
    } else {
      setProductsExpandedFolders(next);
    }
  }

  function toggleFolder(folderId: string) {
    const next = new Set(openFolderIds());
    if (!next.delete(folderId)) next.add(folderId);
    setOpenFolderIds(next);
  }

  // Every folder with something inside to open, as the tree currently shows.
  const openableFolderIds = createMemo(() => {
    const tree = productTree();
    return [...tree.folders.values()]
      .flat()
      .filter((f) => tree.folders.has(f.id) || tree.products.has(f.id))
      .map((f) => f.id);
  });

  const anyFolderOpen = () => {
    const open = openFolderIds();
    return openableFolderIds().some((id) => open.has(id));
  };

  const treeRows = createMemo(() => {
    const open = openFolderIds();
    return productTreeRows(productTree(), (id) => open.has(id));
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

  // ONE ACTION PER TYPE: createButtonAction owns a request-id guard that
  // drops the callback of any but the most recent click, so a shared action
  // would discard the first product's open when a second create starts while
  // the first is in flight.
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

  async function openPackageScope(product: ProductSummary) {
    await openComponent({ element: PackageScopeModal, props: { product } });
  }

  async function handleMoveToFolder(product: ProductSummary) {
    await openComponent({
      element: MoveToFolderModal,
      props: {
        target: {
          kind: "products" as const,
          productIds: [product.id],
          currentFolderId: product.folderId,
        },
        folders: instanceState.folders,
      },
    });
  }

  // The quick moves have no modal, so a failure surfaces through openAlert;
  // the picker path gets that from createFormAction.
  async function quickMoveProducts(
    product: ProductSummary,
    folderId: string | null,
  ) {
    const res = await serverActions.moveProductsToFolder({
      productIds: [product.id],
      folderId,
    });
    if (!res.success) {
      await openAlert({ text: res.err, intent: "danger" });
    }
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
      props: { products: [product] },
    });
  }

  async function handleDelete(product: ProductSummary) {
    // Hard delete, no trash (D16).
    const deleteAction = createDeleteAction(
      t3({
        en: "Are you sure you want to delete this product? This cannot be undone.",
        fr: "Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible.",
        pt: "Tem a certeza de que pretende eliminar este produto? Esta ação é irreversível.",
      }),
      () => serverActions.deleteProducts({ productIds: [product.id] }),
      () => {},
    );
    await deleteAction.click();
  }

  function productMenuItems(product: ProductSummary): MenuItem[] {
    return buildProductMenu({
      folders: instanceState.folders,
      parentId: product.folderId,
      onSettings: () => void openSettings(product),
      onPackageScope: () => void openPackageScope(product),
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

  const typeFilterOptions = (): SelectOption<string>[] => [
    { value: _ALL_TYPES, label: t3({ en: "All", fr: "Tous", pt: "Todos" }) },
    ...PRODUCT_TYPES.map((type) => ({
      value: type,
      label: PRODUCT_TYPE_REGISTRY[type].pluralLabel(),
    })),
  ];

  function openNewMenu(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    showMenu({
      anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      position: "bottom-end",
      items: [
        {
          label: PRODUCT_TYPE_REGISTRY.slide_deck.createLabel(),
          icon: PRODUCT_TYPE_REGISTRY.slide_deck.icon,
          disabled: !canCreateProduct(),
          onClick: () => void createDeck.click(),
        },
        {
          label: PRODUCT_TYPE_REGISTRY.report.createLabel(),
          icon: PRODUCT_TYPE_REGISTRY.report.icon,
          disabled: !canCreateProduct(),
          onClick: () => void createReport.click(),
        },
        { type: "divider" },
        {
          label: t3({
            en: "New folder",
            fr: "Nouveau dossier",
            pt: "Nova pasta",
          }),
          icon: "folder",
          onClick: () =>
            void openComponent({
              element: EditFolderModal,
              props: { folder: undefined, parentId: null },
            }),
        },
      ],
    });
  }

  const isCreating = () =>
    createDeck.state().status === "loading" ||
    createReport.state().status === "loading";

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
    <FrameTop
      panelChildren={
        <div>
          <HeadingBar
            data-tour="products-header"
            searchText={searchText()}
            setSearchText={updateSearchText}
            centerLeftChildren={
              <Button
                outline
                iconName={anyFolderOpen() ? "fold" : "unfold"}
                disabled={openableFolderIds().length === 0}
                ariaLabel={
                  anyFolderOpen()
                    ? t3({
                        en: "Collapse all",
                        fr: "Tout replier",
                        pt: "Recolher tudo",
                      })
                    : t3({
                        en: "Expand all",
                        fr: "Tout déplier",
                        pt: "Expandir tudo",
                      })
                }
                onClick={() =>
                  setOpenFolderIds(
                    anyFolderOpen()
                      ? new Set()
                      : new Set(instanceState.folders.map((f) => f.id)),
                  )
                }
              />
            }
            centerChildren={
              <div class="ui-gap flex items-center">
                <div class="w-36">
                  <Select
                    data-tour="products-type-filter"
                    fullWidth
                    value={productsTypeFilter() ?? _ALL_TYPES}
                    onChange={(v) =>
                      setProductsTypeFilter(
                        v === _ALL_TYPES ? null : (v as ProductType),
                      )
                    }
                    options={typeFilterOptions()}
                  />
                </div>
                <Show when={isSearching()}>
                  <span class="text-base-content-muted text-sm text-nowrap">
                    {t3({
                      en: `${productTree().matchCount} results`,
                      fr: `${productTree().matchCount} résultats`,
                      pt: `${productTree().matchCount} resultados`,
                    })}
                  </span>
                </Show>
              </div>
            }
          >
            <Show when={canEdit()}>
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
                  data-tour="products-new"
                  iconName="plus"
                  loading={isCreating()}
                  onClick={openNewMenu}
                >
                  {t3({ en: "New", fr: "Nouveau", pt: "Novo" })}
                </Button>
              </div>
            </Show>
          </HeadingBar>
        </div>
      }
    >
      <ListView
        rows={treeRows()}
        sortMode={productsSortMode()}
        onSortMode={setProductsSortMode}
        onOpenProduct={(product) => void openProduct(product)}
        onToggleFolder={toggleFolder}
        onProductMenu={handleProductMenu}
        onFolderMenu={handleFolderMenu}
        folderCounts={countsForFolder}
        fallback={emptyState()}
      />
    </FrameTop>
  );
}

function symmetricDifference(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): Set<string> {
  return new Set([
    ...[...a].filter((x) => !b.has(x)),
    ...[...b].filter((x) => !a.has(x)),
  ]);
}
