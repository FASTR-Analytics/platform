import { createSignal, type JSX } from "solid-js";
import {
  effectiveScheme,
  getEditorWrapper,
  type OpenEditorProps,
  type SchemePreference,
  setSchemePreference,
} from "panther";
import { MODULE_FAMILY_ORDER, type DatasetType, type ListSort, type SlideType } from "lib";

// ============================================================================
// Instance shell
// ============================================================================

// The rail's collapsed state. Collapsed by default: each frame page's heading
// bar names the page, so the labels are not needed to orient.
const storedNavCollapsed = localStorage.getItem("navCollapsed");
export const [navCollapsed, setNavCollapsedInternal] = createSignal<boolean>(
  storedNavCollapsed !== "false",
);
export function setNavCollapsed(collapsed: boolean) {
  localStorage.setItem("navCollapsed", String(collapsed));
  setNavCollapsedInternal(collapsed);
}

// The Explore page's family tab and, per family, the chosen module id,
// persisted and resolved against the package on read. The package and scope are page signals, never stored (SYSTEM_11).
const storedExploreFamily = localStorage.getItem(
  "exploreFamily",
) as DatasetType | null;
export const [exploreFamily, setExploreFamilyInternal] = createSignal<
  DatasetType
>(storedExploreFamily ?? "hmis");
export function setExploreFamily(family: DatasetType) {
  localStorage.setItem("exploreFamily", family);
  setExploreFamilyInternal(family);
}

type ExploreModules = Partial<Record<DatasetType, string>>;
function readStoredExploreModules(): ExploreModules {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem("exploreModules") ?? "{}",
    );
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      MODULE_FAMILY_ORDER.flatMap((family) => {
        const id = (parsed as Record<string, unknown>)[family];
        return typeof id === "string" ? [[family, id]] : [];
      }),
    );
  } catch {
    return {};
  }
}
export const [exploreModules, setExploreModulesInternal] = createSignal<
  ExploreModules
>(readStoredExploreModules());
export function setExploreModule(family: DatasetType, moduleId: string) {
  const next = { ...exploreModules(), [family]: moduleId };
  localStorage.setItem("exploreModules", JSON.stringify(next));
  setExploreModulesInternal(next);
}

// The shell's one full-page wrapper. `ShellEditorWrapper` wraps the whole
// frame (header, rail and tab page), so a view opened through
// `openShellEditor` covers all of it and its Back is the only way out; the
// rail cannot switch tabs under an open editor. Module level so the frame
// pages that open views share the instance the shell renders; recreated on
// each shell mount so a same-tab user switch without a reload cannot
// resurface the previous user's open view.
let shellEditor = getEditorWrapper();
export function openShellEditor<TProps, TReturn>(
  v: OpenEditorProps<TProps, TReturn>,
): Promise<TReturn | undefined> {
  return shellEditor.openEditor(v);
}
export function ShellEditorWrapper(p: { children: JSX.Element }) {
  shellEditor = getEditorWrapper();
  return shellEditor.EditorWrapper(p);
}

// ============================================================================
// Products page
// ============================================================================

// The deep-link parameter: `?product=<id>` opens that product's editor over
// the Products page (D16). It replaces `?p=` / `?d=` for products, with no
// shim; named here so the page and the tour catalogue spell it the same way.
export const _PRODUCT_QUERY_PARAM = "product";

// The product explorer's open folders.
function readStoredIds(key: string): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}
export const [productsExpandedFolders, setProductsExpandedFoldersInternal] =
  createSignal<ReadonlySet<string>>(readStoredIds("productsExpandedFolders"));
export function setProductsExpandedFolders(folderIds: ReadonlySet<string>) {
  localStorage.setItem(
    "productsExpandedFolders",
    JSON.stringify([...folderIds]),
  );
  setProductsExpandedFoldersInternal(folderIds);
}

// Set by the list's clickable Name and Last updated headers.
function readStoredProductsSort(): ListSort {
  const fallback: ListSort = { mode: "recent", direction: "desc" };
  try {
    const parsed = JSON.parse(localStorage.getItem("productsSort") ?? "");
    return (parsed.mode === "name" || parsed.mode === "recent") &&
        (parsed.direction === "asc" || parsed.direction === "desc")
      ? { mode: parsed.mode, direction: parsed.direction }
      : fallback;
  } catch {
    return fallback;
  }
}
export const [productsSort, setProductsSortInternal] = createSignal<ListSort>(
  readStoredProductsSort(),
);
export function setProductsSort(sort: ListSort) {
  localStorage.setItem("productsSort", JSON.stringify(sort));
  setProductsSortInternal(sort);
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

// Top level of the chain: a tour replay requested from the catalogue modal,
// armed AFTER the entry's navigate() has switched tab and requested any
// product open (the manager's effect runs synchronously on this write, so
// arming first would find the page inactive). The manager starts the tour
// once the tour's own page is active. `productId` is the product the tour's
// page lives in: the manager drops the replay when T1 is ready and no longer
// holds it (a dead id), the same rule the Products page applies to the open
// request itself. A replay with no product is dropped as soon as its page is
// not active: a tab switch is synchronous, and the catalogue cannot be opened
// while a full-page view covers the shell.
export type PendingTourReplay = { tourId: string; productId?: string };
export const [pendingTourReplay, setPendingTourReplay] =
  createSignal<PendingTourReplay | null>(null);
