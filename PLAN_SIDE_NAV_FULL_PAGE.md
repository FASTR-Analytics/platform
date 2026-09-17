# PLAN: side-rail navigation, full-page Back views, flush heading bars

Status: OPEN. Rulings agreed (Tim, 2026-09-17). In progress.

The instance shell's top `ButtonGroup` nav becomes a collapsible side rail
(`FrameLeft` + vertical `TabsNavigation`), the header keeps only the instance
name, logo and the right-hand cluster, and every view a user reaches through
a Back button opens through one shell-level editor wrapper that covers the
header and the rail. Every heading bar in the app becomes flush; `tonal`
disappears from the client.

**Next step: Review 3**

Branch: `version2`.

Repos: this app only. No panther change: `FrameLeft`, vertical collapsible
`TabsNavigation` and `getEditorWrapper` already exist.

Read first: [SYSTEM_14_client_shell.md](SYSTEM_14_client_shell.md),
[PROTOCOL_APP_UI_CONVENTIONS.md](PROTOCOL_APP_UI_CONVENTIONS.md) "Page layout
patterns", `panther/protocols/PROTOCOL_UI_COMPONENTS.md` "HeadingBar",
`panther/_303_components/special_state/generic_editor_wrapper.tsx`,
`panther/_303_components/layout/tabs/tabs_navigation.tsx`,
`client/src/components/instance/index.tsx`.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md);
the app bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This
plan binds them as follows.

- Instruction: "Do the next step of PLAN_SIDE_NAV_FULL_PAGE.md."
- Branch: `version2`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches migrations, the schema, the query engine or help
  text, so no conditional gate applies.
- Build log: §8. Last step: 3.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 of this plan, the step's own section
  in §4, and §8.
- Vocabulary. **The frame** is the shell's header plus the rail plus the
  tab page beside the rail. **A frame page** is one of the six tab pages
  (Products, Explore, Data, Results, Assets, Users). **A full-page view**
  is anything opened through the shell wrapper: it covers the whole
  viewport, header included, and its heading bar's Back closes it. **The
  shell wrapper** is the one `getEditorWrapper()` instance the shell owns.
  **An inner layer** is a view opened by a full-page view through that
  view's own wrapper (slide editor inside the deck editor, import run
  detail inside a dataset page); inner layers are already full page and
  this plan does not touch them.

## 1. The problem

The shell ([instance/index.tsx:212-240](client/src/components/instance/index.tsx#L212-L240))
is a `FrameTop` whose panel is a hand-built header: name and logo, a
centred `ButtonGroup` rendered twice (icon-only below `xl`, labelled
above), and the right-hand cluster. The tab is a signal.

Leaving a frame page happens two different ways, both confined to the tab
page's own box under the header:

- Products and Results open editors through a page-owned
  `getEditorWrapper()` ([products/index.tsx:82](client/src/components/products/index.tsx#L82),
  [instance_results_packages/index.tsx:44](client/src/components/instance_results_packages/index.tsx#L44)).
  The overlay is `absolute inset-0` inside the page, so the header and nav
  stay visible above it.
- The Data hub replaces itself in place: a `Switch` over
  `selectedDataSource` renders one of fifteen sub-pages, each taking a
  `backToInstance` prop ([instance_data.tsx:77-166](client/src/components/instance/instance_data.tsx#L77-L166)).
  Users does the same for the user detail, keyed on the live row
  ([instance_users.tsx:84-98](client/src/components/instance/instance_users.tsx#L84-L98)).

Because the nav stays visible above an editor, a user can click another tab
while a deck editor is open; the Products page unmounts and the editor dies
without its `close` ever running.

Heading bars are split with no rule behind the split: 41 files pass
`tonal` (every frame page except Products, every Data sub-page and its
inner layers, module defaults, the Logs and Script viewers, user detail)
and eight are flush (Products, the deck, slide and report editors, deck
settings, version history, the Files viewer, the population grid). Logs is
tonal and Files is flush.

## 2. The model

```tsx
<ShellEditorWrapper>
  <FrameTop panelChildren={header /* name, logo, right cluster */}>
    <Show
      when={instanceState.currentUserApproved}
      fallback={notYetApprovedMessage /* today's text, unchanged */}
    >
      <FrameLeft
        panelChildren={
          <TabsNavigation
            vertical
            collapsible
            collapsed={navCollapsed()}
            onCollapsedChange={setNavCollapsed}
            data-tour="instance-nav"
            items={navItems()}
            value={tab()}
            onChange={setTab}
          />
        }
      >
        <Switch>…the six frame pages…</Switch>
      </FrameLeft>
    </Show>
  </FrameTop>
</ShellEditorWrapper>
```

The approval `Show` sits around `FrameLeft`, not inside `panelChildren`: a
`Show` passed as a prop is a truthy accessor even when it renders nothing,
so `FrameLeft` would draw an empty rail for an unapproved user.

Every frame page opens with a flush `HeadingBar` carrying the page title
and that page's actions. Every full-page view opens with a flush
`HeadingBar` carrying `onBack`. The rail is the only navigation; while a
full-page view is open it is covered, so Back is the only way out.

What the user sees, per rail item:

| Rail item | In the frame | Full page (Back returns to the frame) |
| --- | --- | --- |
| Products | The product explorer: folders, cards or list, search, filters, breadcrumb. The breadcrumb Back stays in the frame. | Slide deck editor, report editor. |
| Explore | The placeholder page. | Nothing. |
| Data | The hub grid, gated by permissions as today: General (Admin area labels); HMIS (Configuration, Facilities, Indicators, Data, GeoJSON maps, Population); HFA (Configuration, Facilities, Time points, Sampling weights, Indicators, Data, GeoJSON maps); ICEH (Equity data). The DHIS2 connection and AI context cards stay modals. | Every one of those fifteen cards. |
| Results | The package list and the selected package's detail. Prune stays a modal. | Module defaults; the Script, Logs and Files viewers. |
| Assets | Heading with Upload, asset-type tabs, file table. | Nothing. |
| Users | The user table. Add, batch upload and bulk permissions stay modals. | The user detail page. |

Inner layers are unchanged: they already live inside a view that will be
full page.

## 3. Rulings

1. **The rail.** `FrameLeft` with a vertical, collapsible `TabsNavigation`
   (pattern B in PROTOCOL_APP_UI_CONVENTIONS). Items are today's
   `wideNavItems()` list, gates and order unchanged. `compactNavItems()`
   and the `xl` double render go. The collapsed state is a `t4_ui`
   preference persisted in localStorage under `navCollapsed`, default
   collapsed.
2. **The header.** Keeps the instance name, the logo and the right-hand
   cluster (Theme, language, bell, Help, versions, profile) exactly as
   today. Nothing in the centre. Its `data-tour` targets are unchanged.
3. **One shell wrapper, around `FrameTop`.** The shell owns a single
   `getEditorWrapper()`, used exactly as every page uses it today, with
   the default hide mode; its `EditorWrapper` wraps the whole frame, so a
   full-page view covers the header and the rail. Nothing in the header is
   reachable from a full-page view; that is the decision, not an
   oversight.
4. **Where the wrapper lives** _(proposed)_. `openEditor` and
   `EditorWrapper` are created once at module level in
   `client/src/state/t4_ui.ts`, next to `pendingEditorOpen`, and exported
   as `openShellEditor` and `ShellEditorWrapper`. A module-level signal
   that survives unmount is T4 by PROTOCOL_APP_STATE's definition, and
   the pages that call it already import from that file.
5. **Every Back page opens through the shell wrapper.** Products and
   Results call `openShellEditor` instead of their own wrapper and drop
   their own. The Data hub's fifteen cards call `openShellEditor` with the
   sub-page as `element`; each sub-page's `backToInstance: () => void`
   prop is replaced by the wrapper's `close`, whose type is
   `(v: undefined) => void`, so the sub-page declares it that way and
   writes `onBack={() => p.close(undefined)}`, as `module_defaults.tsx`
   already does. The hub renders only its grid; the
   "No display component for this dataset" fallthrough goes. The Users
   page opens the detail through `openShellEditor`.
6. **In-page Back stays in the frame.** The Products breadcrumb's parent
   folder and clear-search Backs are navigation inside the page, not
   exits. Nothing about them changes.
7. **User detail reads its row live.** `User` takes `email: string` and
   `close`, derives the row from `instanceState.users` in a memo, and
   calls `close()` in an effect when the row is gone. Today the keyed
   `Match` remounts the detail on every row change and drops it when the
   row vanishes; a snapshot prop through the wrapper would do neither.
8. **Every heading bar is flush.** `tonal` is removed from every
   `HeadingBar` in the client. Frame pages keep their title: with the rail
   collapsed by default, the bar's title is the only text on screen naming
   the page. Outline buttons in a bar that was tonal drop their
   `onBackground="base-200"` (PROTOCOL_UI_STYLING rule 7: the surface is
   now `base-100`). A `base-200` declared for some other surface, such as
   the report editor's side panel, stays.
9. **Tours.** The welcome tour's `instance-nav` step targets the rail
    (`TabsNavigation` takes data attributes) and its placement becomes
    `right`. The catalogue's `reasonCloseEditor` and the `isEditingView()`
    branches that produce it are dead once the Help menu is unreachable
    from a full-page view; they go with the shell change. The editor
    tours key on the view controller and are unaffected.
10. **Docs move with the code.** SYSTEM_14's shell paragraph and its
    "topbar's tours menu stays reachable above the editor overlay" clause,
    PROTOCOL_APP_UI_CONVENTIONS's "Instance page" bullet and its "flush or
    tonal" line, and the matching comment in `client/src/app.css` are
    rewritten in the step that changes the code they describe.

## 4. Steps

### Step 1: the shell

**Surface.**

- `client/src/components/instance/index.tsx`
- `client/src/state/t4_ui.ts`
- `client/src/components/products/index.tsx`
- `client/src/components/instance_results_packages/index.tsx`
- `client/src/components/instance_results_packages/detail.tsx` and
  `client/src/components/_shared/results_package/package_view.tsx` only if
  the `openEditor` prop type no longer typechecks against the shell's
  function.
- `client/src/onboarding/tours.ts`
- `client/src/onboarding/catalogue.ts`
- `client/src/onboarding/tour_catalogue_modal.tsx` only if removing the
  dead reason changes its props.
- `SYSTEM_14_client_shell.md`, `PROTOCOL_APP_UI_CONVENTIONS.md`

**Deliverable.** Rulings 1, 2, 3, 4, 9 and 10. The shell renders the
§2 tree. `navCollapsed` is a persisted `t4_ui` signal defaulting to
`true`. `openShellEditor` and `ShellEditorWrapper` are exported from
`t4_ui.ts`. Products and Results open every editor through
`openShellEditor` and no longer call `getEditorWrapper`. `compactNavItems`
and every `xl:` class in the shell are gone. The welcome tour targets the
rail with placement `right`. `reasonCloseEditor` is gone. SYSTEM_14 and the
conventions doc describe the new shell; the conventions doc no longer
describes the shell as responsive at `xl`.

**Not in this step.** The Data hub, Users and heading bars (steps 2 and 3).
The Data sub-pages keep working through the hub's in-place `Switch`.

**Gates.** The floor, plus:

- `grep -rn "getEditorWrapper" client/src/components/products
  client/src/components/instance_results_packages` returns only the type
  reference in `detail.tsx` and `package_view.tsx`, or nothing.
- `grep -n "xl:" client/src/components/instance/index.tsx` returns
  nothing.
- `grep -rn "reasonCloseEditor\|instance-nav" client/src` returns exactly
  the rail's data attribute and the tour target.

**Ends with.** One commit.

### Step 2: the Data hub and Users

**Surface.**

- `client/src/components/instance/instance_data.tsx`
- `client/src/components/instance/instance_users.tsx`
- `client/src/components/instance/user.tsx`
- The twelve files that declare a `backToInstance` prop:
  `indicator_manager_hfa/hfa_indicators_manager.tsx`,
  `indicator_manager_hmis/indicators_manager.tsx`,
  `instance_dataset_hfa/index.tsx`, `instance_dataset_hmis/index.tsx`,
  `instance_dataset_iceh/index.tsx`, `instance_geojson/geojson_manager.tsx`,
  `instance_hfa_time_points/index.tsx`,
  `instance_population/population_manager.tsx`,
  `structure/admin_area_labels.tsx`, `structure/family_configuration.tsx`,
  `structure/hfa_weights.tsx`, `structure/index.tsx`, all under
  `client/src/components/`.
- `SYSTEM_06_ingestion.md`, `SYSTEM_15_admin_ops.md` where their prose
  describes the hub's in-place switch or the keyed user detail.

**Deliverable.** Rulings 5, 6 and 7. `instance_data.tsx` has no
`selectedDataSource` signal and no `Switch`; each card's `onClick` is an
`openShellEditor` call. No file declares `backToInstance`; each sub-page
takes `close: (v: undefined) => void` from the wrapper. `instance_users.tsx` has no `selectedUser`
signal; the row click opens `User` through `openShellEditor` with the
email. `User` reads its row live and closes itself when the row is gone.

**Not in this step.** Heading bars (step 3). The inner layers each
sub-page opens through its own wrapper.

**Gates.** The floor, plus:

- `grep -rnw "backToInstance\|selectedDataSource\|selectedUser" client/src`
  returns nothing (`-w`: the bulk handlers' `selectedUsers` parameter
  stays).

**Ends with.** Two commits, each green: the Data hub and its twelve
sub-pages; then Users.

### Step 3: flush heading bars

**Surface.**

- Every file under `client/src` that passes `tonal` to `HeadingBar` (41
  at the time of writing; `grep -rln "tonal" client/src --include='*.tsx'`
  is the list).
- The `onBackground="base-200"` declarations inside those bars.
- `client/src/app.css` (the "flush or tonal" comment),
  `PROTOCOL_APP_UI_CONVENTIONS.md` (the "No inverted chrome" bullet).

**Deliverable.** Rulings 8 and 10. No `HeadingBar` in the client passes
`tonal`. No button inside a formerly tonal bar declares
`onBackground="base-200"`. `report/index.tsx` keeps its declaration: that
button sits on a `base-200` panel, not a bar. The two doc lines say
"flush".

**Not in this step.** Removing the `--ui-heading-bar-tonal-*` pair from
panther; it is a kit token and other apps may use it. The theme modal has
no knob for it, so nothing there changes.

**Gates.** The floor, plus `grep -rn "tonal" client/src` returns nothing.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate | First reached |
| --- | --- |
| The floor (§0) | Step 1 |
| No `getEditorWrapper` call in Products or Results | Step 1 |
| No `xl:` class in the shell | Step 1 |
| No `backToInstance`, `selectedDataSource`, `selectedUser` in the client | Step 2 |
| No `tonal` in the client | Step 3 |

## 6. Out of scope

- URL-addressable full-page views and browser Back closing them. Two URL
  surfaces exist today (`/access-tokens`, `?product=`) and this plan adds
  none.
- Any change to panther, including removing the tonal token pair or
  changing `TabsNavigation`'s collapse toggle position.
- Filling the Explore page.
- Expanding the rail on a first visit. Default collapsed is the ruling;
  revisit only with evidence from the welcome tour.
- The inner layers' own wrappers and heading bars beyond removing
  `tonal`.

## 7. Rollout and rollback

Nothing ships before step 3's review passes. Then `./deploy_testing`, and
`./deploy` on Tim's call. Rollback is `git revert` of the four commits in
reverse order; no data, cache or schema changes are involved, and the
`navCollapsed` localStorage key is harmless if left behind.

## 8. Build log

| When | Step | Row |
| --- | --- | --- |
| 2026-09-17 | 0 | Plan written. Ruling 4 is proposed, not heard. |
| 2026-09-17 | 1 | `TourCatalogueEntry.unavailableReason` is now optional: the two rows whose only reason was `reasonCloseEditor` (products-intro, instance-welcome) are always available and carry none. `tour_catalogue_modal.tsx` reads it with `?.`, the one prop change the step allowed. |
| 2026-09-17 | 1 | The header carries `border-b` (Tim, mid-step). |
| 2026-09-17 | 1 | `./run` was not started a second time: the dev server and Vite were already up on 8000 and 3000. Vite transformed every changed module without error. |
| 2026-09-17 | 1 | Step 1 built. |
| 2026-09-17 | 2 | The hub opens its cards through one `openSubPage(element, props)` helper with a `const` type parameter: without it a `{ family: "hmis" }` literal widens to `string` during inference and the sub-page's props type rejects it. |
| 2026-09-17 | 2 | `User` is now a thin live-row component (memo over `instanceState.users`, close-when-gone effect, `Show`) around `UserDetail`, the previous body unchanged. The explicit close after a delete stays: the SSE echo that removes the row can lag. |
| 2026-09-17 | 2 | The close-when-gone effect reads the row before the guard, as `./validate_protocols` SolidJS rule 3 asks. |
| 2026-09-17 | 2 | SYSTEM_06 and SYSTEM_15 hold no prose on the hub's in-place switch or the keyed user detail; nothing to rewrite there. SYSTEM_14's shell paragraph (step 1) already names both as full-page views. |
| 2026-09-17 | 2 | `./run` again not restarted: the dev server and Vite were already up. Vite transformed every changed module without error. |
| 2026-09-17 | 2 | Outside the plan, in its own commit at Tim's request mid-session: the Theme modal's "Full" radius (9999px broke cards) is replaced by 12 and 20 px steps. |
| 2026-09-17 | 2 | Step 2 built. |
| 2026-09-17 | 3 | 42 `tonal` removed across 41 files (`structure/index.tsx` carried it inline); nine `onBackground="base-200"` removed from buttons inside formerly tonal bars; `report/index.tsx:1388` kept, it sits on a `base-200` panel. |
| 2026-09-17 | 3 | `./run` again not restarted: the dev server and Vite were already up. Vite transformed the changed modules without error. |
| 2026-09-17 | 3 | Step 3 built. |
| 2026-09-17 | 1 | Step 1 reviewed (fresh context): 4 findings. (a) `t4_ui.ts` `pendingTourReplay` comment still said the catalogue offers no Products-page tour under an editor. (b) `onboarding/index.ts` replay-effect comment said the same; outside the surface. (c) SYSTEM_14 and the conventions doc described the Data and Users full-page views one step ahead of the code; self-corrected by step 2. (d) The module-level wrapper's editor state survives an `Instance` unmount, so a same-tab user switch without a reload would remount the shell over the previous user's open view. |
| 2026-09-17 | 1 | Fix 1: (a) and (b) rewritten; the one-line comment in `onboarding/index.ts` is the only edit outside step 1's surface. (d) `ShellEditorWrapper` now creates a fresh `getEditorWrapper()` on each mount and `openShellEditor` delegates to the current one; the exports and their module-level home are as ruling 4 says. |
| 2026-09-17 | 1 | Step 1 fixed. |
