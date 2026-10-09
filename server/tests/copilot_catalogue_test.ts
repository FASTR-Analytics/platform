// Pins lib/ai_tools/copilot_catalogue.ts to the chat's catalogue as ruled
// (PLAN_COPILOT03_ONE_CHAT ruling 1, 2026-10-08): the two tables below are
// written from the ruling, independently of the module, and every case
// derives what the module must hold from them.
//
//   deno test -A --no-check server/tests/copilot_catalogue_test.ts

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import type { CopilotToolName } from "lib";
import {
  _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
  _USER_PERMISSIONS_DEFAULT_NO_ACCESS,
  COPILOT_APPROVAL_EXEMPT,
  COPILOT_CHAT_WIDE_TOOLS,
  COPILOT_PACKAGE_VIEWS,
  COPILOT_TOOL_REQUIREMENTS,
  COPILOT_TOOL_VIEWS,
  COPILOT_VIEW_IDENTITY_PARTS,
  COPILOT_VIEW_IDS,
  copilotToolRefusal,
  copilotViewIdentity,
  packageToolsKey,
  USER_PERMISSIONS,
} from "lib";

// Ruling 1's first table: the tool groups.
const GROUPS = {
  chat_wide: [
    "ask_user_questions",
    "get_methodology_docs_list",
    "get_methodology_doc_content",
    "get_info",
  ],
  package_reads: [
    "get_available_metrics",
    "get_metric_data",
    "get_available_modules",
  ],
  module_internals: [
    "get_module_r_script",
    "get_module_log",
    "get_module_settings",
  ],
  deck_reads: ["get_deck", "get_slide"],
  deck_writes: [
    "create_slide",
    "replace_slide",
    "update_slide_content",
    "update_slide_header",
    "modify_slide_layout",
    "delete_slides",
    "duplicate_slides",
    "move_slides",
  ],
  slide_editor: ["get_slide_editor", "update_slide_editor", "update_figure"],
  drafts: ["show_draft_slide_to_user"],
  report_reads: ["get_report_editor", "get_report_figure", "get_report_pages"],
  report_writes: [
    "rewrite_report",
    "rewrite_section",
    "replace_text",
    "insert_figure",
    "replace_figure",
    "update_report_figure",
  ],
  figure_editor: ["get_figure_editor", "update_figure_editor"],
  hfa_reads: [
    "get_hfa_indicators",
    "get_hfa_taxonomy",
    "get_hfa_variable_dictionary",
    "inspect_hfa_variable",
    "get_hfa_indicator_code",
    "validate_hfa_indicators",
  ],
  hfa_writes: [
    "update_hfa_indicator_labels",
    "assign_hfa_indicator_categories",
    "create_hfa_indicators",
    "set_hfa_indicator_code",
    "delete_hfa_indicators",
  ],
  hfa_editor: ["get_hfa_indicator_editor", "update_hfa_indicator_editor"],
  products: ["list_products"],
} as const;

type Group = keyof typeof GROUPS;

// The groups whose tools run against a package: bound per call to the
// view's pair.
const PACKAGE_TOOL_GROUPS: Group[] = [
  "package_reads",
  "module_internals",
  "deck_reads",
  "deck_writes",
  "slide_editor",
  "drafts",
  "report_reads",
  "report_writes",
  "figure_editor",
];

// Ruling 1's second table: each view, whether it has a package in view, its
// groups beyond chat-wide, and the one tool named outside its group.
const PRODUCT: Group[] = ["package_reads", "module_internals", "drafts"];
const VIEWS: {
  id: string;
  hasPackage: boolean;
  groups: Group[];
  tools?: string[];
}[] = [
  { id: "products", hasPackage: false, groups: ["products"] },
  { id: "opening_product", hasPackage: true, groups: PRODUCT },
  {
    id: "editing_slide_deck",
    hasPackage: true,
    groups: [...PRODUCT, "deck_reads", "deck_writes"],
    tools: ["update_figure"],
  },
  {
    id: "editing_slide",
    hasPackage: true,
    groups: [...PRODUCT, "deck_reads", "deck_writes", "slide_editor"],
  },
  {
    id: "editing_slide_figure",
    hasPackage: true,
    groups: [...PRODUCT, "figure_editor"],
  },
  { id: "deck_settings", hasPackage: true, groups: PRODUCT },
  { id: "deck_history", hasPackage: true, groups: PRODUCT },
  { id: "report_history", hasPackage: true, groups: PRODUCT },
  {
    id: "editing_report",
    hasPackage: true,
    groups: [...PRODUCT, "report_reads", "report_writes"],
  },
  {
    id: "editing_report_figure",
    hasPackage: true,
    groups: [...PRODUCT, "figure_editor"],
  },
  { id: "results_file", hasPackage: true, groups: PRODUCT },
  { id: "explore", hasPackage: true, groups: PRODUCT },
  { id: "results_packages", hasPackage: false, groups: [] },
  { id: "package", hasPackage: true, groups: PRODUCT },
  {
    id: "viewing_package_figure",
    hasPackage: true,
    groups: [...PRODUCT, "figure_editor"],
  },
  { id: "module_defaults", hasPackage: false, groups: [] },
  { id: "scopes", hasPackage: false, groups: [] },
  { id: "data", hasPackage: false, groups: [] },
  { id: "data_page", hasPackage: false, groups: [] },
  {
    id: "hfa_indicators",
    hasPackage: false,
    groups: ["hfa_reads", "hfa_writes"],
  },
  {
    id: "hfa_indicator_editor",
    hasPackage: false,
    groups: ["hfa_reads", "hfa_editor"],
  },
  { id: "hfa_indicator_import", hasPackage: false, groups: ["hfa_reads"] },
  { id: "assets", hasPackage: false, groups: [] },
  { id: "users", hasPackage: false, groups: [] },
  { id: "user", hasPackage: false, groups: [] },
  { id: "shell", hasPackage: false, groups: [] },
];

const ALL_TOOLS: string[] = Object.values(GROUPS).flat();
const GATED_TOOLS: string[] = ALL_TOOLS.filter(
  (t) => !(GROUPS.chat_wide as readonly string[]).includes(t),
);
const MODULE_TOOLS: string[] = [
  ...COPILOT_CHAT_WIDE_TOOLS,
  ...Object.keys(COPILOT_TOOL_VIEWS),
];

const sorted = (xs: Iterable<string>) => [...xs].sort();
const viewsOf = (tool: string): readonly string[] =>
  COPILOT_TOOL_VIEWS[tool as keyof typeof COPILOT_TOOL_VIEWS];

function viewsAdmitting(tool: string): string[] {
  return VIEWS.filter((v) =>
    v.groups.some((g) => (GROUPS[g] as readonly string[]).includes(tool)) ||
    (v.tools ?? []).includes(tool)
  ).map((v) => v.id);
}

Deno.test("the view ids are the catalogue's views", () => {
  assertEquals([...COPILOT_VIEW_IDS], VIEWS.map((v) => v.id));
  assertEquals(
    sorted(COPILOT_PACKAGE_VIEWS),
    sorted(VIEWS.filter((v) => v.hasPackage).map((v) => v.id)),
  );
  assertEquals(
    sorted(Object.keys(COPILOT_VIEW_IDENTITY_PARTS)),
    sorted(COPILOT_VIEW_IDS),
  );
});

Deno.test("each gated tool is admitted in exactly the views its group's rows give", () => {
  assertEquals(sorted(Object.keys(COPILOT_TOOL_VIEWS)), sorted(GATED_TOOLS));
  for (const tool of GATED_TOOLS) {
    const expected = viewsAdmitting(tool);
    assert(expected.length > 0, `${tool} is admitted nowhere`);
    assertEquals(sorted(viewsOf(tool)), sorted(expected), tool);
  }
});

Deno.test("chat-wide tools carry no views", () => {
  assertEquals(sorted(COPILOT_CHAT_WIDE_TOOLS), sorted(GROUPS.chat_wide));
  for (const tool of COPILOT_CHAT_WIDE_TOOLS) {
    assert(!(tool in COPILOT_TOOL_VIEWS), `${tool} declares views`);
    assertEquals(viewsAdmitting(tool), []);
  }
});

Deno.test("every tool belongs to exactly one group", () => {
  assertEquals(new Set(ALL_TOOLS).size, ALL_TOOLS.length);
  assertEquals(sorted(MODULE_TOOLS), sorted(ALL_TOOLS));
  assertEquals(
    sorted(Object.keys(COPILOT_TOOL_REQUIREMENTS)),
    sorted(ALL_TOOLS),
  );
});

Deno.test("a view with no package admits no package tool", () => {
  const packageTools = PACKAGE_TOOL_GROUPS.flatMap((g) => GROUPS[g]);
  for (const view of VIEWS.filter((v) => !v.hasPackage)) {
    for (const tool of packageTools) {
      assert(!viewsOf(tool).includes(view.id), `${view.id} admits ${tool}`);
    }
  }
  for (const view of COPILOT_PACKAGE_VIEWS) {
    for (const tool of [...GROUPS.package_reads, ...GROUPS.module_internals]) {
      assert(viewsOf(tool).includes(view), `${view} refuses ${tool}`);
    }
  }
});

Deno.test("the approval exemptions are exactly the direct-apply editor writes", () => {
  // Deck writes apply directly, deleting slides asks; the slide editor's
  // writes are live edits; the first five report writes take a diff; the
  // figure editor's and the HFA editor's writes are live; HFA writes ask.
  const expected = [
    ...GROUPS.deck_writes.filter((t) => t !== "delete_slides"),
    "update_slide_editor",
    "update_figure",
    "update_report_figure",
    "update_figure_editor",
    "update_hfa_indicator_editor",
  ];
  assertEquals(sorted(COPILOT_APPROVAL_EXEMPT), sorted(expected));
});

// Ruling 5's requirements.
const REQUIREMENTS: Record<string, string> = Object.fromEntries([
  ...ALL_TOOLS.map((t) => [t, "none"]),
  ["get_module_r_script", "can_view_data"],
  ["get_module_settings", "can_view_data"],
  ["get_module_log", "can_view_logs"],
  ...GROUPS.hfa_reads.map((t) => [t, "can_configure_data"]),
  ["inspect_hfa_variable", "can_view_data"],
  ...GROUPS.hfa_writes.map((t) => [t, "hfa_write"]),
  ["update_hfa_indicator_editor", "hfa_write"],
  ...GROUPS.deck_writes.map((t) => [t, "product_edit"]),
  ["update_slide_editor", "product_edit"],
  ["update_figure", "product_edit"],
  ...GROUPS.report_writes.map((t) => [t, "product_edit"]),
  ["update_figure_editor", "product_edit"],
]);

Deno.test("refusals follow the permission bits, the product level and the HFA write gate", () => {
  assertEquals({ ...COPILOT_TOOL_REQUIREMENTS }, REQUIREMENTS);

  const nothing = {
    permissions: _USER_PERMISSIONS_DEFAULT_NO_ACCESS,
    canWriteHfaIndicators: false,
    productLevel: "view" as const,
  };
  const everything = {
    permissions: _USER_PERMISSIONS_DEFAULT_FULL_ACCESS,
    canWriteHfaIndicators: true,
    productLevel: "edit" as const,
  };
  const refusedFor = (user: Parameters<typeof copilotToolRefusal>[1]) =>
    sorted(
      ALL_TOOLS.filter((t) =>
        copilotToolRefusal(t as CopilotToolName, user) !== undefined
      ),
    );
  const requiring = (requirement: string) =>
    sorted(ALL_TOOLS.filter((t) => REQUIREMENTS[t] === requirement));

  assertEquals(refusedFor(everything), []);
  assertEquals(
    refusedFor(nothing),
    sorted(ALL_TOOLS.filter((t) => REQUIREMENTS[t] !== "none")),
  );
  for (const permission of USER_PERMISSIONS) {
    const user = {
      ...nothing,
      permissions: { ...nothing.permissions, [permission]: true },
    };
    assertEquals(
      refusedFor(user),
      sorted(
        ALL_TOOLS.filter((t) =>
          REQUIREMENTS[t] !== "none" && REQUIREMENTS[t] !== permission
        ),
      ),
      permission,
    );
  }
  assertEquals(
    refusedFor({ ...everything, canWriteHfaIndicators: false }),
    requiring("hfa_write"),
  );
  for (const level of ["none", "view"] as const) {
    assertEquals(
      refusedFor({ ...everything, productLevel: level }),
      requiring("product_edit"),
      level,
    );
  }
  for (const level of ["edit", "own", null] as const) {
    assertEquals(refusedFor({ ...everything, productLevel: level }), []);
  }
  for (const tool of ALL_TOOLS) {
    const refusal = copilotToolRefusal(tool as CopilotToolName, nothing);
    if (refusal !== undefined) assert(refusal.length > 0, tool);
  }
});

// Ruling 5's identity parts.
const IDENTITY_PARTS: Record<string, string[]> = {
  opening_product: ["product", "pair"],
  editing_slide_deck: ["deck", "pair"],
  deck_settings: ["deck", "pair"],
  deck_history: ["deck", "pair"],
  editing_slide: ["deck", "slide", "pair"],
  editing_slide_figure: ["deck", "slide", "figure", "pair"],
  editing_report: ["report", "pair"],
  report_history: ["report", "pair"],
  editing_report_figure: ["report", "figure", "pair"],
  results_file: ["resultsObject", "pair"],
  explore: ["pair"],
  package: ["run", "pair"],
  viewing_package_figure: ["figure", "pair"],
  data_page: ["page", "family"],
  hfa_indicator_editor: ["indicator"],
};

Deno.test("an identity changes with the entity, the pair and the definition hash, and with nothing else", () => {
  for (const view of COPILOT_VIEW_IDS) {
    assertEquals(
      sorted(COPILOT_VIEW_IDENTITY_PARTS[view]),
      sorted(IDENTITY_PARTS[view] ?? []),
      view,
    );
  }

  const pair = { runId: "r1", scopeId: "s1", definitionHash: "h1" };
  const base = { deck: "d1", slide: "s1", figure: "f1", pair };
  const identity = copilotViewIdentity("editing_slide_figure", base);
  assertEquals(identity, {
    deck: "d1",
    slide: "s1",
    figure: "f1",
    runId: "r1",
    scopeId: "s1",
    definitionHash: "h1",
  });
  assertEquals(copilotViewIdentity("editing_slide_figure", base), identity);
  const variants = [
    { ...base, deck: "d2" },
    { ...base, slide: "s2" },
    { ...base, figure: "f2" },
    { ...base, pair: { ...pair, runId: "r2" } },
    { ...base, pair: { ...pair, scopeId: "s2" } },
    { ...base, pair: { ...pair, definitionHash: "h2" } },
  ];
  for (const variant of variants) {
    assertNotEquals(
      copilotViewIdentity("editing_slide_figure", variant),
      identity,
    );
  }

  assertEquals(copilotViewIdentity("package", { run: "r1", pair: undefined }), {
    run: "r1",
  });
  assertEquals(copilotViewIdentity("package", { run: "r1", pair }), {
    run: "r1",
    runId: "r1",
    scopeId: "s1",
    definitionHash: "h1",
  });
  assertEquals(copilotViewIdentity("explore", { pair: undefined }), {});
  assertEquals(
    copilotViewIdentity("data_page", { page: "facilities", family: undefined }),
    { page: "facilities" },
  );
  assertEquals(
    copilotViewIdentity("data_page", { page: "hmis_data", family: "hmis" }),
    { page: "hmis_data", family: "hmis" },
  );
  assertEquals(
    copilotViewIdentity("hfa_indicator_editor", { indicator: "i1" }),
    { indicator: "i1" },
  );
});

Deno.test("packageToolsKey separates run, scope, definition hash and time points, and never collides across separators", () => {
  const rounds = [
    { label: "2021", periodId: "2021" },
    { label: "2023", periodId: "2023" },
  ];
  const base = {
    runId: "r1",
    scopeId: "s1",
    definitionHash: "h1",
    timePoints: rounds,
  };
  const key = packageToolsKey(base);
  assertEquals(packageToolsKey({ ...base, timePoints: [...rounds] }), key);

  const variants = [
    { ...base, runId: "r2" },
    { ...base, scopeId: "s2" },
    { ...base, definitionHash: "h2" },
    { ...base, timePoints: [rounds[0]] },
    { ...base, timePoints: [rounds[1], rounds[0]] },
    { ...base, timePoints: [{ label: "2021", periodId: "202101" }, rounds[1]] },
    {
      ...base,
      timePoints: [{ label: "Round 1", periodId: "2021" }, rounds[1]],
    },
  ];
  for (const variant of variants) {
    assertNotEquals(packageToolsKey(variant), key);
  }

  const shifted = [
    [
      { runId: "ab", scopeId: "c", definitionHash: "d", timePoints: [] },
      { runId: "a", scopeId: "bc", definitionHash: "d", timePoints: [] },
    ],
    [
      { runId: "a", scopeId: "b", definitionHash: "cd", timePoints: [] },
      { runId: "a", scopeId: "bc", definitionHash: "d", timePoints: [] },
    ],
    [
      { runId: "a", scopeId: "b", definitionHash: "c", timePoints: [] },
      {
        runId: "a",
        scopeId: "b",
        definitionHash: "",
        timePoints: [{ label: "c", periodId: "" }],
      },
    ],
    [
      { ...base, timePoints: [{ label: "a,b", periodId: "c" }] },
      { ...base, timePoints: [{ label: "a", periodId: "b,c" }] },
    ],
    [
      {
        ...base,
        timePoints: [{ label: "a", periodId: "b" }, {
          label: "c",
          periodId: "d",
        }],
      },
      { ...base, timePoints: [{ label: "a", periodId: "b,c,d" }] },
    ],
    [
      { ...base, runId: 'r"1', scopeId: "s1" },
      { ...base, runId: "r", scopeId: '"1s1' },
    ],
  ];
  for (const [a, b] of shifted) {
    assertNotEquals(packageToolsKey(a), packageToolsKey(b));
  }
});
