# Protocol: AI Chat Surfaces

**Scope:** UI

How to build an AI chat surface on panther's `_305_ai` engine: views, tools,
gating, interactions, approval, prompt composition. The full architecture and
contract reference is `DOC_AI_CHAT.md` at the panther repo root (not synced);
quickstart snippets are in `modules/_305_ai/README.md` (synced). This protocol
is the rulebook a consumer app must follow.

## Rules

1. **Tools come from `createAITool`** — never hand-build `SDKTool` objects
   (bypasses the schema guard and availability hints; unsupported path)
2. **One view registry per surface, one module-level controller** — tools type
   against the inert `defineAIViews` registry object; pairing is object
   identity, so every tool and the chat's controller must share the SAME
   registry object
3. **The controller is imperative** — call `setView`/`clearView` from EVERY
   navigation sync site (tab effects, editor mount/unmount/teardown); a missed
   site leaves the gate admitting execution against a torn-down context
4. **Gate with `availableIn`, a whitelist** — family guards ("not while editing
   anything") stay one-line in-handler checks; situational redirects go in tool
   DESCRIPTIONS, never in gate messages
5. **Input schemas must accept unknown keys everywhere** — no `z.strictObject`,
   no `.catchall(z.never())`, no enum/pattern-keyed `z.record` inputs;
   violations throw at construction
6. **`AIToolFailure` for every anticipated failure** (bad input, missing
   referent, failed server call); plain `Error` is reserved for bugs, including
   deliberate invariant throws. Handlers throw; they never return error-shaped
   strings
7. **Every write tool gets approval or an explicit exemption** — set
   `approvalPolicy: { requireForKind: "write", requireKind: true }` and tag
   every tool with `kind`
8. **`propose` is read-only; the mutation lives in `commit`** — `markAIEdit`
   calls belong in `commit` (or plain write handlers), never in `propose`
9. **Mark AI edits for echo suppression** — every persist path whose change
   comes back on a push channel calls `markAIEdit(key)` with a payload-bearing
   key matching the interaction's `echoKey` (a constant key over-suppresses)
10. **Clear the interaction log on consumer scope change** — the controller is a
    singleton but its log is scope-local data; call `clearInteractionLog()`
    where the new scope (project/workspace) mounts
11. **Keep the system prompt byte-stable across navigation** — per-view
    `instructions` use `"ephemeral"` delivery; a `buildToolCatalog` call
    composed into `system` must omit `currentView`
12. **No hand-maintained tool lists in prompt text** — render tool
    names/descriptions with `buildToolCatalog(tools)`; a hand list drifts from
    the registry immediately
13. **Validate the real config in dev** — call `validateAIChatConfig(config)` on
    the fully-assembled config under `import.meta.env.DEV`, so tool mistakes
    fail on page load, not in a live conversation
14. **AI-driven navigation must keep the attribution window open** —
    `onAiNavigation` awaits routing to genuine completion, or the code that
    performs the late `setView` calls `viewController.markAINavigation()` itself

## Do / Don't

### View gating

```tsx
// ❌ DON'T — hand-rolled mode guard in the handler
handler: (input) => {
  if (aiContext().mode !== "editing_report") {
    throw new Error("Only available in the report editor");
  }
  …
}

// ✅ DO — declarative gate; handler receives the narrowed live view
createAITool({
  viewRegistry: appViews,
  availableIn: ["editing_report"],
  kind: "write",
  handler: (input, view) => view.context.getFigures(),
});
```

**Why:** the engine refuses out-of-view executions with a standardized
self-correcting message before the handler runs, and the narrowed view type
makes mode-guard boilerplate unwritable.

### Failure channel

```tsx
// ❌ DON'T — plain Error for an anticipated failure, or error-shaped returns
if (!res.success) throw new Error(res.err);
if (!row) return "Error: indicator not found";

// ✅ DO — AIToolFailure for anything anticipated; plain Error only for bugs
if (!res.success) throw new AIToolFailure(res.err);
if (!row) throw new AIToolFailure(`No indicator with id ${input.id}.`);
if (block.type === undefined) throw new Error("unreachable: unsized block"); // bug detector
```

**Why:** the wire content to the model is identical; the classification controls
timeline rendering (clean row vs stack trace), and a stack for an anticipated
failure points at the throw site, not the cause.

### Session mode and presentation

```tsx
// ❌ DON'T — throws at construction: the modal has no "don't ask again" affordance
approval: { propose, mode: "session", presentation: "modal" }

// ✅ DO — session mode requires the inline card
approval: { propose, mode: "session", presentation: "inline" }
```

### Prompt composition

```tsx
// ❌ DON'T — view-grouped catalog in the system prompt (cache-busts per navigation),
// or a hand-typed tool list in any prompt text
const system = () => `${base}\n${buildToolCatalog(tools, vc.current())}`;

// ✅ DO — no-view catalog composed once into the byte-stable system prompt
const toolCatalog = buildToolCatalog(tools);
const system = () => `${base}\n# Available Tools\n${toolCatalog}`;
```

**Why:** the no-view output is byte-stable, so the system cache breakpoint keeps
hitting; the view-grouped variant belongs in per-send content only.

### Echo suppression keys

```tsx
// ❌ DON'T — constant key (suppresses every entry of the interaction for 30s)
appViewController.markAIEdit("deck_changed");

// ✅ DO — payload-bearing key matching the interaction's echoKey
appViewController.markAIEdit(`slide:${res.data.id}`);
// interaction: echoKey: (p) => `slide:${p.slideId}`
```

Mark the ids the server actually mutated (from the response — the ±TTL window is
order-independent, so a push event arriving before the mark is still
suppressed), not the ids that were requested.

## Patterns

### Surface setup (registry, controller, factory, config)

```tsx
// ai_views.ts — one module, one registry object, one controller
export const appViews = defineAIViews({
  viewing_home: view({ label: "Home" }),
  editing_report: view<ReportParams, ReportEditorContext>({
    label: (p) => `Editing report ${p.reportId}`,
    params: z.object({ reportId: z.string() }),
    instructions: REPORT_EDITING_INSTRUCTIONS, // ephemeral delivery (default)
  }),
});
export const appViewController = createAIViewController(appViews, {
  fallback: "viewing_home",
  interactions: appInteractions,
});
export const createAppAITool = aiToolFactory(appViews); // recommended form

// index.tsx — assemble, then validate the REAL config in dev
const tools = buildTools();
const toolCatalog = buildToolCatalog(tools); // no currentView: system-prompt cache rule
const config: AIChatConfig = {
  tools,
  viewController: appViewController,
  approvalPolicy: { requireForKind: "write", requireKind: true },
  system: () => buildSystemPrompt(toolCatalog),
  …
};
if (import.meta.env.DEV) validateAIChatConfig(config);
```

Every navigation sync site calls the controller: the tab effect
(`setView(TAB_TO_VIEW[tab()])` from a typed `Record<TabOption, ViewId>` so a new
tab fails typecheck), and each editor's mount/teardown. If the app has
switchable scopes (projects/workspaces) in one SPA session, the scope root calls
`appViewController.clearInteractionLog()` on mount.

### Approval tool

```tsx
createAppAITool({
  name: "delete_indicators",
  kind: "write",
  availableIn: ["editing_indicators"],
  inputSchema: z.object({ ids: z.array(z.string()) }),
  approval: {
    presentation: "modal",
    propose: (input, view) => {
      const rows = load(input.ids); // read-only phase
      if (rows.length === 0) return { invalid: "No matching indicators." };
      if (unchanged(rows)) return { skip: "Already deleted." };
      return {
        preview: {
          title: "Delete indicators",
          changes: rows.map((r) => ({
            label: r.code,
            before: r.label,
            after: "—",
          })),
          intent: "danger",
          confirmLabel: "Delete",
        },
        stillValid: () => rowsStillExist(input.ids),
        commit: async () => {
          const res = await serverActions.deleteIndicators(input.ids);
          if (!res.success) throw new AIToolFailure(res.err);
          for (const id of res.data.deletedIds) {
            appViewController.markAIEdit(`indicator:${id}`);
          }
          return `Deleted ${res.data.deletedIds.length} indicator(s).`;
        },
      };
    },
  },
});
```

Detected no-ops return `{ skip }`; validation failures return `{ invalid }`
(maps to `AIToolFailure`); a domain review UI (staged diff) replaces the
card/modal via `customProposalUI(signal)` — clean up when the signal aborts, and
still supply `preview` (it is the timeline's decision record).

### Interactions registry

```tsx
export const appInteractions = defineAIInteractions({
  edited_slide: interaction<{ slideId: string }>({
    relevantIn: ["editing_slide_deck", "editing_slide"],
    filter: (p, view) => view.context.getSlideIds().includes(p.slideId),
    echoKey: (p) => `slide:${p.slideId}`,
    format: (p) => `Edited slide ${p.slideId}`,
  }),
  …
});
```

User-action sources (editor notify wrappers, push-channel listeners) call
`appViewController.notify("edited_slide", { slideId })`. AI edit paths do NOT
route through the user notify wrappers — they use the raw setters and rely on
`markAIEdit` for the push-channel echo. Navigation reporting (`__navigation`
digest) comes free once interactions are configured.

### Navigation tool

```tsx
const navTool = createNavigationTool({
  viewRegistry: appViews,
  destinations: ["viewing_home", "viewing_reports"], // explicit allowlist —
  // exclude deep editor views reachable only through app state
  onAiNavigation: async (target) => {
    await router.go(target); // await REAL completion, or markAINavigation()
    //                          again from the code that fires the late setView
  },
});
```

The tool never calls `setView` — the app's own sync sites do. Refusals throw
`AIToolFailure` from `onAiNavigation`. A plain tool that navigates instead
(soft-return refusal semantics) must call `viewController.markAINavigation()`
immediately before triggering the view change, or the move misreports as a user
action in the next digest.

## Checklist

- [ ] No hand-built `SDKTool` objects; every tool is `createAITool` /
      `aiToolFactory` / `createNavigationTool`
- [ ] Exactly one `defineAIViews` registry object per surface; all tools and the
      chat's `viewController` reference it
- [ ] Every navigation source (tab switch, editor mount/unmount) has a
      `setView`/`clearView` sync site
- [ ] No in-handler mode guards that test only the view id (use `availableIn`);
      remaining in-handler guards are family guards or deliberate, documented
      omissions
- [ ] No `z.strictObject` / `.catchall(z.never())` / keyed `z.record` in tool
      input schemas
- [ ] No `throw new Error` in tool handlers except invariant/bug detectors;
      anticipated failures are `AIToolFailure`
- [ ] `approvalPolicy: { requireForKind: "write", requireKind: true }` set;
      every tool declares `kind`; unapproved write tools are in `exempt`
- [ ] No `markAIEdit` inside `propose`; persist-path writes mark payload-bearing
      keys that match interaction `echoKey`s
- [ ] `clearInteractionLog()` called at each scope root if scopes are switchable
      within one SPA session
- [ ] `buildToolCatalog` in the `system` accessor has no `currentView` argument;
      no hand-maintained tool list in any prompt text
- [ ] `validateAIChatConfig(config)` runs on the real assembled config under
      `import.meta.env.DEV` for every surface
- [ ] No `mode: "session"` combined with `presentation: "modal"`
