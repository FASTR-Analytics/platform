import { createSignal } from "solid-js";
import {
  effectiveScheme,
  type SchemePreference,
  setSchemePreference,
} from "panther";
import type { ProductType, SlideType, SortMode } from "lib";

// ============================================================================
// Products page
// ============================================================================

// The deep-link parameter: `?product=<id>` opens that product's editor over
// the Products page (D16). It replaces `?p=` / `?d=` for products, with no
// shim; named here so the page and the tour catalogue spell it the same way.
export const _PRODUCT_QUERY_PARAM = "product";

// The explorer's location: null = the root, a folder id = inside that folder.
// The path from the root is derived by walking `parentId` and never stored.
const storedProductsOpenFolder = localStorage.getItem("productsOpenFolder");
export const [productsOpenFolder, setProductsOpenFolderInternal] = createSignal<
  string | null
>(storedProductsOpenFolder);
export function setProductsOpenFolder(folderId: string | null) {
  if (folderId === null) {
    localStorage.removeItem("productsOpenFolder");
  } else {
    localStorage.setItem("productsOpenFolder", folderId);
  }
  setProductsOpenFolderInternal(folderId);
}

export type ProductsViewMode = "grid" | "list";
const storedProductsViewMode = localStorage.getItem(
  "productsViewMode",
) as ProductsViewMode | null;
export const [productsViewMode, setProductsViewModeInternal] =
  createSignal<ProductsViewMode>(storedProductsViewMode ?? "grid");
export function setProductsViewMode(mode: ProductsViewMode) {
  localStorage.setItem("productsViewMode", mode);
  setProductsViewModeInternal(mode);
}

// One sort vocabulary for the header Select and the list's clickable Name and
// Last updated headers.
const storedProductsSortMode = localStorage.getItem(
  "productsSortMode",
) as SortMode | null;
export const [productsSortMode, setProductsSortModeInternal] =
  createSignal<SortMode>(storedProductsSortMode ?? "recent");
export function setProductsSortMode(mode: SortMode) {
  localStorage.setItem("productsSortMode", mode);
  setProductsSortModeInternal(mode);
}

// null = every type. The chips filter products only; folders are always
// visible in a location (D16).
const storedProductsTypeFilter = localStorage.getItem(
  "productsTypeFilter",
) as ProductType | null;
export const [productsTypeFilter, setProductsTypeFilterInternal] =
  createSignal<ProductType | null>(storedProductsTypeFilter);
export function setProductsTypeFilter(type: ProductType | null) {
  if (type === null) {
    localStorage.removeItem("productsTypeFilter");
  } else {
    localStorage.setItem("productsTypeFilter", type);
  }
  setProductsTypeFilterInternal(type);
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
// Editor-open requests
// ============================================================================

// Request signal for opening a product editor from outside the Products page
// (the tour catalogue modal, a deep link). The opener lives in a private
// closure inside the page, and an inactive page is unmounted, so the request
// must persist until the page mounts and consumes it. The page clears the
// signal BEFORE calling its opener (the editor promise only resolves when the
// editor closes).
export type PendingEditorOpen = { productId: string };
export const [pendingEditorOpen, setPendingEditorOpen] =
  createSignal<PendingEditorOpen | null>(null);

// Second level of the same pattern: set alongside a pending open by the tour
// catalogue's slide-tour replays, consumed by the deck editor once its slides
// have loaded: it opens the first slide of this type.
export const [pendingSlideOpen, setPendingSlideOpen] =
  createSignal<SlideType | null>(null);

// Top level of the chain: a tour replay requested from the catalogue modal.
// Set together with the entry's navigate(); the tour manager starts the tour
// once the tour's own page is active, and drops the request when the product
// it needed turns out not to exist.
export const [pendingTourReplay, setPendingTourReplay] = createSignal<
  string | null
>(null);
