import { createSignal } from "solid-js";
import {
  effectiveScheme,
  type SchemePreference,
  setSchemePreference,
} from "panther";
import type { ProductSortMode, ProductType, SlideType } from "lib";

// ============================================================================
// Products page
// ============================================================================

// The deep-link parameter: `?product=<id>` opens that product's editor over
// the Products page (D16). It replaces `?p=` / `?d=`; old links in the wild
// break, deliberately, with no shim. Named here so the page, the cards and
// the copilot all spell it the same way.
export const _PRODUCT_QUERY_PARAM = "product";

export function productDeepLinkHref(productId: string): string {
  return `/?${_PRODUCT_QUERY_PARAM}=${productId}`;
}

// Sort and filter for the one product list. Unvalidated on read, like the
// modes they replace: they only feed comparisons, so an unknown stored value
// degrades to "no match" rather than throwing.
const storedProductsSortMode = localStorage.getItem(
  "productsSortMode",
) as ProductSortMode | null;
export const [productsSortMode, setProductsSortModeInternal] =
  createSignal<ProductSortMode>(storedProductsSortMode ?? "recent");
export function setProductsSortMode(mode: ProductSortMode) {
  localStorage.setItem("productsSortMode", mode);
  setProductsSortModeInternal(mode);
}

// null = both types.
const storedProductsTypeFilter = localStorage.getItem(
  "productsTypeFilter",
) as ProductType | null;
export const [productsTypeFilter, setProductsTypeFilterInternal] = createSignal<
  ProductType | null
>(storedProductsTypeFilter);
export function setProductsTypeFilter(type: ProductType | null) {
  if (type === null) {
    localStorage.removeItem("productsTypeFilter");
  } else {
    localStorage.setItem("productsTypeFilter", type);
  }
  setProductsTypeFilterInternal(type);
}

// null = "All products" (the folder sidebar's root row), not "unfoldered".
const storedProductsSelectedFolder = localStorage.getItem(
  "productsSelectedFolder",
);
export const [productsSelectedFolder, setProductsSelectedFolderInternal] =
  createSignal<string | null>(storedProductsSelectedFolder);
export function setProductsSelectedFolder(folderId: string | null) {
  if (folderId === null) {
    localStorage.removeItem("productsSelectedFolder");
  } else {
    localStorage.setItem("productsSelectedFolder", folderId);
  }
  setProductsSelectedFolderInternal(folderId);
}

// ============================================================================
// Explore tab
// ============================================================================

// The Explore tab's (package, scope) pair. EPHEMERAL by ruling (D6) — the
// package Select starts at the pin and the scope picker at national, and
// neither is persisted; these are module-level signals purely so the pair
// survives a tab switch within one session. `null` runId = "not chosen yet,
// use the pin".
export const [exploreRunId, setExploreRunId] = createSignal<string | null>(null);
export const [exploreAdminArea2, setExploreAdminArea2] = createSignal<
  string | null
>(null);

// Navigation collapsed state
const storedNavCollapsed = localStorage.getItem("navCollapsed");

export const [navCollapsed, setNavCollapsedInternal] = createSignal<boolean>(
  storedNavCollapsed === null ? true : storedNavCollapsed === "true",
);

export function setNavCollapsed(collapsed: boolean) {
  localStorage.setItem("navCollapsed", String(collapsed));
  setNavCollapsedInternal(collapsed);
}

// Consolidated updater — one entry point for the copilot's view tools, so a
// tool never reaches past this file into individual setters.
export type ProductsViewStateUpdates = {
  productsSortMode?: ProductSortMode;
  productsTypeFilter?: ProductType | null;
  productsSelectedFolder?: string | null;
  fitWithin?: "fit-within" | "fit-width";
  showAi?: boolean;
  headerOrContent?: "slideHeader" | "content";
  policyHeaderOrContent?: "policyHeaderFooter" | "content";
};

export function updateProductsView(updates: ProductsViewStateUpdates) {
  if (updates.productsSortMode !== undefined) {
    setProductsSortMode(updates.productsSortMode);
  }
  if (updates.productsTypeFilter !== undefined) {
    setProductsTypeFilter(updates.productsTypeFilter);
  }
  if (updates.productsSelectedFolder !== undefined) {
    setProductsSelectedFolder(updates.productsSelectedFolder);
  }
  if (updates.fitWithin !== undefined) {
    setFitWithin(updates.fitWithin);
  }
  if (updates.showAi !== undefined) {
    setShowAi(updates.showAi);
  }
  if (updates.headerOrContent !== undefined) {
    setHeaderOrContent(updates.headerOrContent);
  }
  if (updates.policyHeaderOrContent !== undefined) {
    setPolicyHeaderOrContent(updates.policyHeaderOrContent);
  }
}

// ============================================================================
// Appearance
// ============================================================================

// Tri-state scheme preference on panther's data-scheme contract: "system"
// follows the OS, "light"/"dark" pin. Legacy migration: the old boolean
// "darkMode" key maps true -> "dark", explicit false -> "light"; users who
// never touched the old toggle (no key) get "system".
const storedScheme = localStorage.getItem("scheme");
const legacyDarkMode = localStorage.getItem("darkMode");
const initialScheme: SchemePreference =
  storedScheme === "system" ||
  storedScheme === "light" ||
  storedScheme === "dark"
    ? storedScheme
    : legacyDarkMode === "true"
      ? "dark"
      : legacyDarkMode === "false"
        ? "light"
        : "system";

export const [schemePref, setSchemePrefInternal] =
  createSignal<SchemePreference>(initialScheme);

export function setScheme(pref: SchemePreference) {
  localStorage.setItem("scheme", pref);
  setSchemePrefInternal(pref);
  setSchemePreference(pref);
}

// Resolved scheme as rendered, for JS consumers (CM highlight extensions,
// diff tints, Clerk appearance). Reactive through panther's signal.
export const darkMode = () => effectiveScheme() === "dark";

// Applied at module scope so the stored scheme is on <html> before first paint
setSchemePreference(initialScheme);

// ============================================================================
// Chart/Viz Display Settings
// ============================================================================

export const [fitWithin, setFitWithin] = createSignal<
  "fit-within" | "fit-width"
>("fit-within");

// ============================================================================
// AI Settings
// ============================================================================

export const [showAi, setShowAi] = createSignal<boolean>(false);

// ============================================================================
// Slide/Report Editor State
// ============================================================================

export const [headerOrContent, setHeaderOrContent] = createSignal<
  "slideHeader" | "content"
>("content");

export const [policyHeaderOrContent, setPolicyHeaderOrContent] = createSignal<
  "policyHeaderFooter" | "content"
>("content");

// ============================================================================
// Editor-open flags
// ============================================================================

// Request signal for opening a product's editor from outside the Products
// page (the tour catalogue modal, the copilot, a `?product=` deep link). The
// opener lives in a private closure inside the page, so the request must
// persist until the page mounts and consumes it. Consumers clear the signal
// BEFORE calling their opener (which only resolves when the editor closes).
// One kind, because there is one: the product id says whether a deck editor
// or a report editor opens.
export type PendingEditorOpen = {
  productId: string;
};
export const [pendingEditorOpen, setPendingEditorOpen] =
  createSignal<PendingEditorOpen | null>(null);

// Second level of the same pattern: set alongside a pending deck request by
// the tour catalogue's slide-tour replays, consumed by the deck editor once
// its slides have loaded — it opens the first slide of this type.
export const [pendingSlideOpen, setPendingSlideOpen] =
  createSignal<SlideType | null>(null);

// Top level of the chain: a tour replay requested before the product editor
// that hosts it exists. Set together with a `pendingEditorOpen`; the editor
// consumes it after hydration and runs the tour's own navigate + start.
export const [pendingTourReplay, setPendingTourReplay] = createSignal<
  string | null
>(null);
