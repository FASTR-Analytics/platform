import type { AIViewIdentity } from "@timroberton/panther";
import type { UserPermission, UserPermissions } from "../types/permissions.ts";
import { INSTANCE_PERMISSION_LABELS } from "../types/permission_labels.ts";
import { type ProductLevel, productLevelAtLeast } from "../types/products.ts";

// The chat's catalogue as data: every view a place can set, which views
// admit each gated tool, what a user needs for a tool to run, which writes
// apply without approval, and what identifies what a view shows. The client
// registry, its tools and its guard read these; the catalogue lives in lib so
// the server tests pin it to the ruling it transcribes
// (server/tests/copilot_catalogue_test.ts). Nothing here reads live state:
// every function is pure over its arguments.

export const COPILOT_VIEW_IDS = [
  "products",
  "opening_product",
  "editing_slide_deck",
  "editing_slide_figure",
  "deck_settings",
  "deck_history",
  "report_history",
  "editing_report",
  "editing_report_figure",
  "results_file",
  "explore",
  "results_packages",
  "package",
  "viewing_package_figure",
  "module_defaults",
  "scopes",
  "data",
  "data_page",
  "hfa_indicators",
  "hfa_indicator_editor",
  "hfa_indicator_import",
  "assets",
  "users",
  "user",
  "shell",
] as const;

export type CopilotViewId = (typeof COPILOT_VIEW_IDS)[number];

// The views with a package in view: their context carries the pair the
// package tools bind to per call, and only they admit a package tool.
export const COPILOT_PACKAGE_VIEWS = [
  "opening_product",
  "editing_slide_deck",
  "editing_slide_figure",
  "deck_settings",
  "deck_history",
  "report_history",
  "editing_report",
  "editing_report_figure",
  "results_file",
  "explore",
  "package",
  "viewing_package_figure",
] as const satisfies readonly CopilotViewId[];

export type CopilotPackageViewId = (typeof COPILOT_PACKAGE_VIEWS)[number];

// Admitted in every view and never refused for a move. Web search is
// Anthropic's server-side tool, enabled through the chat's builtInTools, so
// it has no name in the set.
export const COPILOT_CHAT_WIDE_TOOLS = [
  "ask_user_questions",
  "get_reference_docs",
  "get_reference_doc",
] as const;

const DECK_VIEWS = ["editing_slide_deck"] as const;
const REPORT_VIEWS = ["editing_report"] as const;
const FIGURE_EDITOR_VIEWS = [
  "editing_slide_figure",
  "editing_report_figure",
  "viewing_package_figure",
] as const;
const HFA_VIEWS = [
  "hfa_indicators",
  "hfa_indicator_editor",
  "hfa_indicator_import",
] as const;
const HFA_MANAGER_VIEWS = ["hfa_indicators"] as const;
const HFA_EDITOR_VIEWS = ["hfa_indicator_editor"] as const;
const PRODUCTS_VIEWS = ["products"] as const;

// Each gated tool's `availableIn`, as literal tuples so a handler built with
// the registry narrows its view to these.
export const COPILOT_TOOL_VIEWS = {
  get_available_metrics: COPILOT_PACKAGE_VIEWS,
  get_metric_data: COPILOT_PACKAGE_VIEWS,
  get_available_modules: COPILOT_PACKAGE_VIEWS,
  get_module_r_script: COPILOT_PACKAGE_VIEWS,
  get_module_log: COPILOT_PACKAGE_VIEWS,
  get_module_settings: COPILOT_PACKAGE_VIEWS,
  get_deck: DECK_VIEWS,
  get_slide: DECK_VIEWS,
  create_slide: DECK_VIEWS,
  update_slide: DECK_VIEWS,
  update_figure: DECK_VIEWS,
  replace_slide: DECK_VIEWS,
  delete_slides: DECK_VIEWS,
  duplicate_slides: DECK_VIEWS,
  move_slides: DECK_VIEWS,
  show_draft_slide_to_user: COPILOT_PACKAGE_VIEWS,
  get_report_editor: REPORT_VIEWS,
  get_report_figure: REPORT_VIEWS,
  get_report_pages: REPORT_VIEWS,
  rewrite_report: REPORT_VIEWS,
  rewrite_section: REPORT_VIEWS,
  replace_text: REPORT_VIEWS,
  insert_figure: REPORT_VIEWS,
  replace_figure: REPORT_VIEWS,
  update_report_figure: REPORT_VIEWS,
  get_figure_editor: FIGURE_EDITOR_VIEWS,
  update_figure_editor: FIGURE_EDITOR_VIEWS,
  get_hfa_indicators: HFA_VIEWS,
  get_hfa_indicator_details: HFA_VIEWS,
  get_hfa_variables: HFA_VIEWS,
  get_hfa_variable_details: HFA_VIEWS,
  create_hfa_indicators: HFA_MANAGER_VIEWS,
  update_hfa_indicators: HFA_MANAGER_VIEWS,
  delete_hfa_indicators: HFA_MANAGER_VIEWS,
  get_hfa_indicator_editor: HFA_EDITOR_VIEWS,
  update_hfa_indicator_editor: HFA_EDITOR_VIEWS,
  list_products: PRODUCTS_VIEWS,
} as const satisfies Record<string, readonly CopilotViewId[]>;

export type CopilotGatedToolName = keyof typeof COPILOT_TOOL_VIEWS;
export type CopilotToolName =
  | CopilotGatedToolName
  | (typeof COPILOT_CHAT_WIDE_TOOLS)[number];

// What a user needs for a tool to run, beyond being in a view that admits
// it: a permission bit, the HFA write gate the indicator manager's own write
// controls read, or edit level on the view's product.
export type CopilotToolRequirement =
  | "none"
  | UserPermission
  | "hfa_write"
  | "product_edit";

export const COPILOT_TOOL_REQUIREMENTS = {
  ask_user_questions: "none",
  get_reference_docs: "none",
  get_reference_doc: "none",
  get_available_metrics: "none",
  get_metric_data: "none",
  get_available_modules: "none",
  get_module_r_script: "can_view_data",
  get_module_log: "can_view_logs",
  get_module_settings: "can_view_data",
  get_deck: "none",
  get_slide: "none",
  create_slide: "product_edit",
  update_slide: "product_edit",
  update_figure: "product_edit",
  replace_slide: "product_edit",
  delete_slides: "product_edit",
  duplicate_slides: "product_edit",
  move_slides: "product_edit",
  show_draft_slide_to_user: "none",
  get_report_editor: "none",
  get_report_figure: "none",
  get_report_pages: "none",
  rewrite_report: "product_edit",
  rewrite_section: "product_edit",
  replace_text: "product_edit",
  insert_figure: "product_edit",
  replace_figure: "product_edit",
  update_report_figure: "product_edit",
  get_figure_editor: "none",
  update_figure_editor: "product_edit",
  get_hfa_indicators: "can_configure_data",
  get_hfa_indicator_details: "can_configure_data",
  get_hfa_variables: "can_configure_data",
  get_hfa_variable_details: "can_configure_data",
  create_hfa_indicators: "hfa_write",
  update_hfa_indicators: "hfa_write",
  delete_hfa_indicators: "hfa_write",
  get_hfa_indicator_editor: "none",
  update_hfa_indicator_editor: "hfa_write",
  list_products: "none",
} as const satisfies Record<CopilotToolName, CopilotToolRequirement>;

// The writes that apply directly to what the user is looking at: a deck's
// slides, stored or open in the editor (deleting them asks first), a
// report's figure by stable id, the open figure editor's draft and the HFA
// code editor's unsaved state. Every other write asks before it applies.
export const COPILOT_APPROVAL_EXEMPT: CopilotGatedToolName[] = [
  "create_slide",
  "update_slide",
  "update_figure",
  "replace_slide",
  "duplicate_slides",
  "move_slides",
  "update_report_figure",
  "update_figure_editor",
  "update_hfa_indicator_editor",
];

export type CopilotToolUser = {
  permissions: UserPermissions;
  canWriteHfaIndicators: boolean;
  // The user's level on the view's product; null in a view with no product
  // (the package figure viewer's draft belongs to no product), where the
  // edit-level requirement has nothing to bind to.
  productLevel: ProductLevel | null;
};

// The reason a tool is refused for this user, or undefined when it may run.
export function copilotToolRefusal(
  tool: CopilotToolName,
  user: CopilotToolUser,
): string | undefined {
  const requirement: CopilotToolRequirement = COPILOT_TOOL_REQUIREMENTS[tool];
  switch (requirement) {
    case "none":
      return undefined;
    case "product_edit":
      return user.productLevel === null ||
          productLevelAtLeast(user.productLevel, "edit")
        ? undefined
        : "Your account can view this product but not change it, so this tool is refused.";
    case "hfa_write":
      return user.canWriteHfaIndicators
        ? undefined
        : "Your account cannot change HFA indicators, so this tool is refused.";
    default:
      return user.permissions[requirement]
        ? undefined
        : `Your account lacks the "${
          INSTANCE_PERMISSION_LABELS[requirement].en
        }" permission, which this tool needs. Ask an instance admin if you need it.`;
  }
}

// A results package and a scope, with the scope's definition hash: a
// scope edit changes what a pair reads without changing its ids.
export type CopilotPair = {
  runId: string;
  scopeId: string;
  definitionHash: string;
};

export type CopilotIdentityPart =
  | "product"
  | "deck"
  | "slide"
  | "figure"
  | "report"
  | "resultsObject"
  | "run"
  | "page"
  | "family"
  | "indicator"
  | "pair";

// What identifies what each view shows. A view-limited call is refused once
// the live identity differs from the one the turn last saw, so a move inside
// a view (a reattached product, another figure in the figure editor) refuses
// a call planned for the old one. The deck's open slide is the deck view's
// state, not a part: the slide tools take a slide id, so a switch of the open
// slide leaves every call valid. A view with no parts declares no identity:
// its id is the whole of it.
export const COPILOT_VIEW_IDENTITY_PARTS = {
  products: [],
  opening_product: ["product", "pair"],
  editing_slide_deck: ["deck", "pair"],
  editing_slide_figure: ["deck", "slide", "figure", "pair"],
  deck_settings: ["deck", "pair"],
  deck_history: ["deck", "pair"],
  report_history: ["report", "pair"],
  editing_report: ["report", "pair"],
  editing_report_figure: ["report", "figure", "pair"],
  results_file: ["resultsObject", "pair"],
  explore: ["pair"],
  results_packages: [],
  package: ["run", "pair"],
  viewing_package_figure: ["figure", "pair"],
  module_defaults: [],
  scopes: [],
  data: [],
  data_page: ["page", "family"],
  hfa_indicators: [],
  hfa_indicator_editor: ["indicator"],
  hfa_indicator_import: [],
  assets: [],
  users: [],
  user: [],
  shell: [],
} as const satisfies Record<CopilotViewId, readonly CopilotIdentityPart[]>;

export type CopilotIdentityView = {
  [V in CopilotViewId]: (typeof COPILOT_VIEW_IDENTITY_PARTS)[V] extends
    readonly [] ? never : V;
}[CopilotViewId];

// The pair is undefined while the view has no package: Explore with none
// ready, and `package` while it generates or has failed. The family is
// undefined on a Data page about no one family.
type CopilotIdentityInputs = {
  product: string;
  deck: string;
  slide: string;
  figure: string;
  report: string;
  resultsObject: string;
  run: string;
  page: string;
  family: string | undefined;
  indicator: string;
  pair: CopilotPair | undefined;
};

export type CopilotViewIdentityParts<V extends CopilotIdentityView> = Pick<
  CopilotIdentityInputs,
  (typeof COPILOT_VIEW_IDENTITY_PARTS)[V][number]
>;

// The identity of a view from its parts: a flat record, the pair expanded to
// its run id, scope id and definition hash, undefined parts left out.
export function copilotViewIdentity<V extends CopilotIdentityView>(
  view: V,
  parts: CopilotViewIdentityParts<V>,
): AIViewIdentity {
  const given = parts as Partial<CopilotIdentityInputs>;
  const identity: Record<string, string> = {};
  for (const part of COPILOT_VIEW_IDENTITY_PARTS[view]) {
    if (part === "pair") {
      if (given.pair === undefined) continue;
      identity.runId = given.pair.runId;
      identity.scopeId = given.pair.scopeId;
      identity.definitionHash = given.pair.definitionHash;
      continue;
    }
    const value = given[part];
    if (value !== undefined) identity[part] = value;
  }
  return identity;
}

// The key of the inner tool set built for a pair. The HFA rounds are
// instance state outside the authoring context and the set lists them, so
// an import changes the key. JSON keeps every part separate whatever its
// text holds.
export function packageToolsKey(
  args: CopilotPair & {
    timePoints: readonly { label: string; periodId: string }[];
  },
): string {
  return JSON.stringify([
    args.runId,
    args.scopeId,
    args.definitionHash,
    args.timePoints.map((tp) => [tp.label, tp.periodId]),
  ]);
}
