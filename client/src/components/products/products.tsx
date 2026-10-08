import { useSearchParams } from "@solidjs/router";
import { type Folder, type ProductSummary, type ProductType, t3 } from "lib";
import {
  Button,
  createDeleteAction,
  foldString,
  FrameTop,
  getFirstString,
  HeadingBar,
  matchesSearch,
  type MenuItem,
  openAlert,
  openComponent,
  searchTokens,
  showMenu,
} from "panther";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  Match,
  Show,
  Switch,
} from "solid-js";
import { nextSort, sortBySortMode } from "./sort_by_sort_mode";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { canEditProduct, canOwnProduct } from "~/state/instance/product_access";
import {
  _PRODUCT_QUERY_PARAM,
  openShellEditor,
  pendingEditorOpen,
  productsExpandedFolders,
  productsGeneralClosed,
  productsSort,
  setPendingEditorOpen,
  setProductsExpandedFolders,
  setProductsGeneralClosed,
  setProductsSort,
} from "~/state/t4_ui";
import { ProductCopilotHost } from "~/components/products/copilot/mod.ts";
import { DuplicateProductsModal } from "./_shared/mod.ts";
import { PackageScopeModal } from "./_shared/mod.ts";
import { ProductAccessModal } from "./_shared/mod.ts";
import { CreateProductModal } from "./create_product_modal";
import { EditFolderModal } from "./edit_folder_modal";
import { buildFolderMenu } from "./folder_menu";
import {
  buildProductTree,
  folderDragItem,
  GENERAL_ID,
  generalLabel,
  productTreeRows,
  topLevelLabel,
} from "./_shared/mod.ts";
import { ListView } from "./list_view";
import { MoveToFolderModal } from "./move_to_folder_modal";
import { buildProductMenu } from "./product_menu";
import { PRODUCT_TYPE_REGISTRY } from "./product_types";
import { ProductSettings } from "./_shared/mod.ts";

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

  const isSearching = () => searchText().trim().length >= _SEARCH_MIN_LENGTH;

  // Folded once per change of the folders and products, not per keystroke.
  const foldedLabels = createMemo(() =>
    new Map(
      [...instanceState.folders, ...instanceState.products].map((item) => [
        item.label,
        foldString(item.label),
      ]),
    )
  );

  const productTree = createMemo(() => {
    const listSort = productsSort();
    const sort = <T extends { label: string; lastUpdated: string }>(xs: T[]) =>
      sortBySortMode(
        xs,
        listSort,
        (x) => x.label,
        (x) => x.lastUpdated,
      );
    const tokens = searchTokens(searchText());
    const folded = foldedLabels();
    return buildProductTree({
      folders: instanceState.folders,
      products: instanceState.products,
      matches: isSearching()
        ? (label) => matchesSearch(folded.get(label) ?? "", tokens)
        : null,
      generalLabel: generalLabel(),
      sort,
    });
  });

  const generalShown = () => productTree().products.has(null);

  // One open set for the rows on screen. Outside a search, General's entry
  // comes from its own saved flag, open by default, and never enters the
  // saved folder set.
  const openFolderIds = createMemo((): ReadonlySet<string> => {
    if (isSearching()) {
      return symmetricDifference(productTree().matchAncestors, searchToggles());
    }
    const saved = productsExpandedFolders();
    return productsGeneralClosed() ? saved : new Set([...saved, GENERAL_ID]);
  });

  function setOpenFolderIds(next: ReadonlySet<string>) {
    if (isSearching()) {
      setSearchToggles(symmetricDifference(next, productTree().matchAncestors));
      return;
    }
    // Only a shown General row takes the write, so collapse-all with no
    // root products does not close it unseen.
    if (generalShown()) setProductsGeneralClosed(!next.has(GENERAL_ID));
    setProductsExpandedFolders(
      new Set([...next].filter((id) => id !== GENERAL_ID)),
    );
  }

  function toggleFolder(folderId: string) {
    const next = new Set(openFolderIds());
    if (!next.delete(folderId)) next.add(folderId);
    setOpenFolderIds(next);
  }

  // A drag opens folders by hovering and by dropping into them: into the same
  // open set a click writes, never out of it. An empty folder added here shows
  // open once the move arrives.
  function openFolder(folderId: string) {
    const open = openFolderIds();
    if (open.has(folderId)) return;
    setOpenFolderIds(new Set([...open, folderId]));
  }

  // Every folder with something inside to open, as the tree currently shows,
  // plus General when it is shown.
  const openableFolderIds = createMemo(() => {
    const tree = productTree();
    const rootFolders = tree.root.flatMap((item) =>
      item.kind === "folder" ? [item.folder] : []
    );
    const folderIds = [...rootFolders, ...[...tree.folders.values()].flat()]
      .filter((f) => tree.folders.has(f.id) || tree.products.has(f.id))
      .map((f) => f.id);
    return generalShown() ? [...folderIds, GENERAL_ID] : folderIds;
  });

  const anyFolderOpen = () => {
    const open = openFolderIds();
    return openableFolderIds().some((id) => open.has(id));
  };

  const treeRows = createMemo(() => {
    const open = openFolderIds();
    return productTreeRows(productTree(), (id) => open.has(id));
  });

  // A new product names a ready package and a scope in its create dialog, so
  // with none of either there is nothing to create against. T1 already knows
  // that, so the buttons say so BEFORE the click. The server's typed
  // PACKAGE_OR_SCOPE_UNAVAILABLE still comes back through the dialog: it is
  // the authority, and it covers a package or scope removed while the dialog
  // is open.
  const canEdit = () => instanceState.currentUserApproved;
  const canCreateProduct = () =>
    canEdit() &&
    instanceState.readyPackages.length > 0 &&
    instanceState.scopes.length > 0;

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

  async function createProduct(type: ProductType) {
    const created = await openComponent({
      element: CreateProductModal,
      props: { type, title: PRODUCT_TYPE_REGISTRY[type].createLabel() },
    });
    if (created) await openCreatedProduct(created);
  }

  async function openSettings(product: ProductSummary) {
    await openComponent({ element: ProductSettings, props: { product } });
  }

  async function openPackageScope(product: ProductSummary) {
    await openComponent({ element: PackageScopeModal, props: { product } });
  }

  async function openAccess(product: ProductSummary) {
    await openComponent({
      element: ProductAccessModal,
      props: { mode: "product" as const, productId: product.id },
    });
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

  // The quick moves and drops have no modal, so a failure surfaces through
  // openAlert; the picker path gets that from createFormAction. The row moves
  // when the live update arrives, never before.
  async function quickMoveProducts(
    productId: string,
    folderId: string | null,
  ) {
    const res = await serverActions.moveProductsToFolder({
      productIds: [productId],
      folderId,
    });
    if (!res.success) {
      await openAlert({ text: res.err, intent: "danger" });
    }
  }

  async function quickMoveFolder(folderId: string, parentId: string | null) {
    const res = await serverActions.moveFolder({
      folder_id: folderId,
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
        en:
          "Are you sure you want to delete this product? This cannot be undone.",
        fr:
          "Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible.",
        pt:
          "Tem a certeza de que pretende eliminar este produto? Esta ação é irreversível.",
      }),
      () => serverActions.deleteProducts({ productIds: [product.id] }),
      () => {},
    );
    await deleteAction.click();
  }

  function productMenuItems(product: ProductSummary): MenuItem[] {
    return buildProductMenu({
      canEdit: canEditProduct(product.id),
      canOwn: canOwnProduct(product.id),
      folders: instanceState.folders,
      parentId: product.folderId,
      onSettings: () => void openSettings(product),
      onPackageScope: () => void openPackageScope(product),
      onManageAccess: () => void openAccess(product),
      onMoveToFolder: () => void handleMoveToFolder(product),
      onDuplicate: () => void handleDuplicate(product),
      onDelete: () => void handleDelete(product),
      onMoveTo: (folderId) => void quickMoveProducts(product.id, folderId),
    });
  }

  function handleProductMenu(e: MouseEvent, product: ProductSummary) {
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items: productMenuItems(product),
    });
  }

  async function handleDeleteFolder(folder: Folder) {
    const counts = {
      folderCount: instanceState.folders.filter((f) => f.parentId === folder.id)
        .length,
      productCount: instanceState.products.filter(
        (pr) => pr.folderId === folder.id,
      ).length,
    };
    const parent = instanceState.folders.find((f) => f.id === folder.parentId);
    // Deleting a folder reparents one level and never cascades (D16), so the
    // confirmation carries the direct counts and where the contents land. At
    // the root the two land in different places: folders at the top level,
    // products under General.
    const confirmText = parent === undefined
      ? t3({
        en:
          `Delete "${folder.label}"? Its ${counts.folderCount} folder(s) move to ${topLevelLabel()} and its ${counts.productCount} product(s) move to ${generalLabel()}.`,
        fr:
          `Supprimer « ${folder.label} » ? Ses ${counts.folderCount} dossier(s) seront déplacés vers ${topLevelLabel()} et ses ${counts.productCount} produit(s) vers ${generalLabel()}.`,
        pt:
          `Eliminar "${folder.label}"? As suas ${counts.folderCount} pasta(s) serão movidas para ${topLevelLabel()} e os seus ${counts.productCount} produto(s) para ${generalLabel()}.`,
      })
      : t3({
        en:
          `Delete "${folder.label}"? Its ${counts.folderCount} folder(s) and ${counts.productCount} product(s) move to ${parent.label}.`,
        fr:
          `Supprimer « ${folder.label} » ? Ses ${counts.folderCount} dossier(s) et ${counts.productCount} produit(s) seront déplacés vers ${parent.label}.`,
        pt:
          `Eliminar "${folder.label}"? As suas ${counts.folderCount} pasta(s) e ${counts.productCount} produto(s) serão movidos para ${parent.label}.`,
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
      isGlobalAdmin: instanceState.currentUserIsGlobalAdmin,
      onMoveTo: (parentId) => void quickMoveFolder(folder.id, parentId),
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
      onSetProductsAccess: () =>
        void openComponent({
          element: ProductAccessModal,
          props: { mode: "folder" as const, folderId: folder.id },
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
          onClick: () => void createProduct("slide_deck"),
        },
        {
          label: PRODUCT_TYPE_REGISTRY.report.createLabel(),
          icon: PRODUCT_TYPE_REGISTRY.report.icon,
          disabled: !canCreateProduct(),
          onClick: () => void createProduct("report"),
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
              en:
                "No products yet. A product is a slide deck or a report; create one and the editor opens straight away.",
              fr:
                "Aucun produit pour le moment. Un produit est une présentation ou un rapport ; créez-en un et l'éditeur s'ouvre immédiatement.",
              pt:
                "Ainda não há produtos. Um produto é uma apresentação ou um relatório; crie um e o editor abre de imediato.",
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
                // intent="neutral"
                ariaLabel={anyFolderOpen()
                  ? t3({
                    en: "Collapse all",
                    fr: "Tout replier",
                    pt: "Recolher tudo",
                  })
                  : t3({
                    en: "Expand all",
                    fr: "Tout déplier",
                    pt: "Expandir tudo",
                  })}
                onClick={() =>
                  setOpenFolderIds(
                    anyFolderOpen() ? new Set() : new Set([
                      ...instanceState.folders.map((f) => f.id),
                      GENERAL_ID,
                    ]),
                  )}
              />
            }
            centerChildren={
              <div class="ui-gap flex items-center">
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
                      en:
                        "An admin must generate a results package and create a scope",
                      fr:
                        "Un administrateur doit générer un paquet de résultats et créer une portée",
                      pt:
                        "Um administrador tem de gerar um pacote de resultados e criar um âmbito",
                    })}
                  </span>
                </Show>
                <Button
                  data-tour="products-new"
                  iconName="plus"
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
        sort={productsSort()}
        onSort={(mode) => setProductsSort(nextSort(productsSort(), mode))}
        onOpenProduct={(product) => void openProduct(product)}
        onToggleFolder={toggleFolder}
        onProductMenu={handleProductMenu}
        onFolderMenu={handleFolderMenu}
        canDrag={(row) =>
          row.kind === "product"
            ? canEditProduct(row.product.id)
            : row.kind === "folder" && canEdit()}
        dragItem={(row) =>
          row.kind === "product"
            ? {
              kind: "product",
              id: row.product.id,
              parentId: row.product.folderId,
            }
            : folderDragItem(instanceState.folders, row.folder)}
        onMove={(item, parentId) =>
          void (item.kind === "product"
            ? quickMoveProducts(item.id, parentId)
            : quickMoveFolder(item.id, parentId))}
        onOpenFolder={openFolder}
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
