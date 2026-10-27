# PLAN_COPILOT_AUDIT_DEFECTS: six defects found by the copilot test run

A full run of
[TESTING_SCRIPT_FOR_AI_COPILOT.md](TESTING_SCRIPT_FOR_AI_COPILOT.md) against the
Somalia demo instance on 2026-10-27 passed 49 of 52 steps and turned up six
defects: a deck name reverted by every deck-config write, one dead copilot tool,
a pair of stray 404 reads, an index that offers the model figures no reader can
see, a brief that does not say what a written claim must meet, and two usage
figures that count different populations without saying so. Every one is pinned
to a file and a line below, and every mechanism here was verified in the code,
not inferred from the symptom. This plan fixes them one at a time.

**Next step:** `Do 1`

- **Branch:** `main`
- **Repos:** this app only.
- **Read first:** [CLAUDE.md](CLAUDE.md), [SYSTEMS.md](SYSTEMS.md), then §1, §2
  and §3 of this file.
- **Start when:** no condition. Nothing precedes this plan.

---

## §0 How to work this plan

- **Instruction:** "Do the next step of PLAN_COPILOT_AUDIT_DEFECTS.md."
- **Branch:** `main`, confirmed with `git branch --show-current`. Never create a
  branch. The tree is shared: confirm `git status` is clean before starting and
  stage only the step's own files.
- **Repo of every step:** this app.
- **Floor** (the four commands under "The floor" in
  [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md)), green at the end of every
  step.
- **A step reads, in order:** `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file each
  step names, §2 and §3 of this plan, the step's own section in §4, and §6.
- **Last step:** 6.
- **Log:** §6.
- **Vocabulary, defined once:**
  - **the run** - the 2026-10-27 execution of the testing script that found
    these defects. Its step ids (F15, G6, Q1 and so on) are the script's, and
    are used here only to say where a defect was seen.
  - **the brief** - the per-view text sent ahead of the user's message. The
    shared base (role, core principles, interpretation framework) is
    `getBaseInstructions` in `lib/ai_tools/build_system_prompt.ts`; the deck
    brief is in the client's `build_system_prompt.ts` and the report brief is
    `getEditingReportInstructions` in the lib file.
  - **product label** - `products.label`, the name shown in the Products list,
    the deck editor's header and every export.
  - **config label** - `slide_decks.config.label`, a second name stored inside
    the deck's own config JSON.
  - **branded** - carrying an own `Symbol(solid-proxy)` (and usually
    `Symbol(store-node)`) property, which Solid's `wrap` defines on a raw object
    the first time a store proxy reads it. `unwrap` does not remove it.

---

## §1 The problem

Six defects, in the order this plan fixes them.

### 1.1 Every deck-config write reverts the deck's name

A deck has two names, and one of them is written back over the other.

- **Product label.** `products.label`, written by `updateProductLabel`
  ([products.ts:271-295](server/db/products/products.ts#L271-L295)). Both rename
  surfaces write only this: the rail's inline title
  ([product_title.tsx:18-19](client/src/components/products/_shared/product_title.tsx#L18-L19))
  and File > "Name and folder…"
  ([product_settings.tsx:51-55](client/src/components/products/_shared/product_settings.tsx#L51-L55)).
  Everything that displays or exports a deck's name reads it.
- **Config label.** `slide_decks.config.label`
  ([slides.ts:97](lib/types/slides.ts#L97)), minted as `"Untitled deck"` at
  creation and read back by nothing except the deck Settings screen, which
  displays it
  ([settings.tsx:140](client/src/components/products/slide_deck/settings.tsx#L140))
  and edits it
  ([settings.tsx:154-155](client/src/components/products/slide_deck/settings.tsx#L154-L155)).

So a stale `config.label` is the normal state of every renamed deck. It is not
inert: `updateSlideDeckConfig` pushes it back over the product row
([slide_decks.ts:114-120](server/db/products/slide_decks.ts#L114-L120)), and
`touchProduct` writes that argument straight into `products.label`
([_product_row.ts:28-34](server/db/products/_product_row.ts#L28-L34)).

The loss is wider than the Settings Save the run saw. `patchDeckConfig`
([slide_deck.tsx:202-216](client/src/components/products/slide_deck/slide_deck.tsx#L202-L216))
spreads the loaded config, stale label included, into `{ ...before, ...patch }`
and sends the whole thing, so **every** write that goes through it reverts the
name: the first-open theme modal
([slide_list.tsx:545](client/src/components/products/slide_deck/slide_list.tsx#L545))
and each of the Deck menu's six items (footer text, footer toggle, page numbers,
logos, theme:
[deck_menu.tsx:65](client/src/components/products/slide_deck/deck_menu.tsx#L65),
`:78`, `:100`, `:253`, `:272`, `:307`), none of which has a Save button. In the
run the header read `COPILOT TEST DECK 20261027-1705` while the Settings field
held `Untitled deck`; clicking Cancel avoided the loss, and changing the theme
from the Deck menu would have caused it without any dialogue at all.

[SYSTEM_12_documents_sharing.md:2803](SYSTEM_12_documents_sharing.md#L2803)
already records this as a known issue and proposes an overlay on read. That
palliative leaves two sources of truth and the Settings box still writing a name
through `touchProduct`; removing the key is the only version in which no deck
write can carry a name.

### 1.2 `update_figure_editor` is dead in the slide figure editor

Open any slide figure in the figure editor and ask the copilot to change its
caption. The tool returns, every time:

```
Invalid figure bundle at "items.0.Symbol(solid-proxy)": Invalid key in record
```

Two attempts in the run, identical both times. The throw is
[resolve_figure_from_metric.ts:108-118](client/src/generate_visualization/resolve_figure_from_metric.ts#L108-L118),
validating against
[_figure_bundle.ts:115-118](lib/types/_figure_bundle.ts#L115-L118):

```ts
export const jsonArrayItemSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()]),
);
```

What reaches the validator is not a store proxy. It is the items cache's own row
objects, branded. Zod 4's `z.record` enumerates `Reflect.ownKeys` and rejects
every key that is not a string (`zod/v4/core/schemas.js:1361`, `:1388-1395`),
while `z.strictObject` uses `for...in` and skips symbols, which is why the
equally branded `indicatorMetadata` passes and only `items` fails. Solid's
`wrap` defines `Symbol(solid-proxy)` on the **raw** target
(`solid-js/store/dist/store.js:263-268`), so a row read once through any store
is branded permanently, and `unwrap` only swaps proxy children for their targets
(`store.js:33-55`): it never deletes a symbol property.

The cache hands its rows out by reference
([reactive_cache.ts:166-172](client/src/state/_infra/reactive_cache.ts#L166-L172))
and both bundle constructors keep them:
[resolve_figure_from_metric.ts:91](client/src/generate_visualization/resolve_figure_from_metric.ts#L91)
and
[resolve_bundle_from_metric_and_config.ts:245](client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts#L245).
In the slide editor the bundle lands in the `tempSlide` store
([slide_editor.tsx:167](client/src/components/products/slide_deck/slide_editor/slide_editor.tsx#L167)),
whose `trackStore` effect
([slide_editor.tsx:546](client/src/components/products/slide_deck/slide_editor/slide_editor.tsx#L546))
walks every nested child through the proxy, down to each row, and brands the
cache's rows. The tool then resolves before applying its patch, and a caption
change leaves the fetch-config hash alone, so it hits that same cache entry and
fails. The report is unaffected because its figures live in a signal
([report.tsx:238](client/src/components/products/report/report.tsx#L238)), never
a store, and the figure editor's own store holds only the config.

The collab bindings are field-for-field the same on both sides; the difference
is only where `onCoherentBundle` lands. Four more routes brand the same rows
without collab at all (insert, edit-close rebuild, the AI slide tools'
`setDraft`, the deck's stale refresh), so the binding is not the fault.

The file next door already knows this mechanism and clones against it
([resolve_bundle_from_metric_and_config.ts:49-56](client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts#L49-L56)):
"unwrap() alone is not enough, the raw objects keep the symbol keys. A bundle
destined for storage must also not alias live store objects." It clones `metric`
and `config`. The items were the gap.

### 1.3 The delete stamps the slides it just deleted

Deleting the open slide produced the only browser console errors of the entire
run:

```
GET /products/z8m6/slides/j67f  404 (Not Found)   ×2
```

These are not reads left in flight. The deck moves the editor off the slide
before it sends the request
([slide_deck.tsx:273-290](client/src/components/products/slide_deck/slide_deck.tsx#L273-L290)),
so nothing is reading the slide when the delete runs. They are new reads, and
the delete route asks for them: after deleting the rows it stamps their ids as
updated ([slides.ts:216-221](server/routes/products/slides.ts#L216-L221)). The
client writes that stamp into `lastUpdated.slides`
([t1_store.ts:304-311](client/src/state/instance/t1_store.ts#L304-L311)); two
effects track that key for every slide in the rail
([slide_card.tsx:46](client/src/components/products/slide_deck/slide_card.tsx#L46),
[slide_list.tsx:479](client/src/components/products/slide_deck/slide_list.tsx#L479)),
and the slide cache is versioned by it
([t2_slides.ts:17](client/src/state/products/t2_slides.ts#L17)), so a new stamp
is a cache miss. The rail still lists the id, because `slideIds` comes from the
deck detail and shrinks only when the separate `products_upserted` message
lands. Two trackers, two misses, two 404s.

The same stamp has a second effect: the deck forwards every stamped id to the
copilot as an `edited_slide` interaction, and the filter runs against a slide
list that still holds the deleted id, so the digest gains a false "Edited slide"
line for a slide the user removed.

The version-restore route does the same thing: it stamps `plan.toDelete`
alongside the rows it inserts and updates
([slide_decks.ts:365-377](server/routes/products/slide_decks.ts#L365-L377)), so
any client with the deck open issues the same reads for every slide a restore
removes.

Nothing needs a deleted slide's stamp. This client's editor has already left the
slide, other clients' editors are told by `closeSlideRoom`, the presenter
refetches on the deck's product stamp, and
[SYSTEM_03_realtime_cache.md:251](SYSTEM_03_realtime_cache.md#L251) defines the
slide stamp as the signal to invalidate those slides' caches. A deleted row has
no cache to invalidate. Ids can be re-minted after a delete, but every creator
stamps the new row with its own fresh `last_updated`, so a stale entry can never
be served.

### 1.4 The report figures index offers figures no reader can see

`get_report_editor` builds its index from every key in the figure store, with no
check that the body still references any of them
([report_editor.ts:132-142](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L132-L142)).
After `replace_figure`, the replaced figure stays in that store, so in the run
the index listed three figures for a two-figure report:

```
- figure:7c0d9a1f-… · m12-01-01 · table      · "REPORT FIGURE CAPTION"   <- orphan
- figure:5eea3e02-… · m12-01-01 · table      · "Immunization Indicators (Feb-Apr 2025)"
- figure:6553e24d-… · m6-01-01  · timeseries · "ANC4 National Coverage Trend"
```

The copilot noticed unprompted and described it correctly as an orphaned figure,
listed in the index but no longer referenced in the body.

Two things the symptom suggests are not true, and the fix must not chase them.
The stored set does not grow without bound: unreferenced entries are pruned at
load and the prune is written back
([report.tsx:582-608](client/src/components/products/report/report.tsx#L582-L608)),
and the comment there states why it happens only at load, which is that editor
undo can bring a token back and a missed reference deletes a figure. And the
orphan could not have been edited by mistake: `update_report_figure` and
`replace_figure` both refuse a figure whose token is absent from the body
([report_editor.ts:243-251](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L243-L251),
`:669-677`).

What the defect costs is a wasted turn and a misleading read. The orphan's index
line carries the caption the user asked to keep, so a model aiming at "the
figure with that caption" picks the orphan, is refused, and has to re-aim. And
`get_report_figure` has no body check at all
([report_editor.ts:173-199](client/src/components/products/copilot/ai_tools/tools/report_editor.ts#L173-L199)):
it serves the orphan's full config and lists every store id in its error, so
filtering the index alone would leave the model able to read a figure nobody can
see.

### 1.5 The brief does not say what a written claim must meet

In the run the copilot wrote three checkably false statements into a slide deck,
all from tool results it had read correctly:

- **Slide 5:** "District 007 has the lowest Penta1→Penta3 dropout rate at 3.6%".
  Its own `get_metric_data` CSV gives 0.025 for District 014 and 0.029 for
  District 011 against 0.036 for District 007: third, not lowest. Slide 6 of the
  same deck states the range correctly from "2.5% (District 014)", so the deck
  contradicts itself and the right answer was in hand.
- **Slide 4:** "ANC4-per-delivery coverage rose steadily from 82.1% (2022) to
  87.5% (2025)". The series is 0.821, 0.797, 0.845, 0.875: it falls in 2023. The
  endpoints are right, the shape is not, and the figure beside the bullet shows
  the dip.
- **Slide 4:** "…approaching the ≤10% progress-needed band" of a value of 8.5%,
  which is already inside that band.
- Unflagged throughout: 2025 is four months of data (coverage ends 202504) yet
  is used as a trend endpoint. The model had the end in hand, because
  `get_metric_data` prints a "Period coverage (all data for this metric)" line
  on every result
  ([format_metric_data_for_ai.ts:277-278](lib/ai_tools/format_metric_data_for_ai.ts#L277-L278)),
  whose purpose is stated at `:68-76` as letting the model tell "the data ends
  here" from "I didn't ask for later periods". The same model qualified 2025
  correctly as "YTD" when writing the report.

It also narrated a change it had not made. After `create_slide` passed only
`metricId`, `vizPresetId: "scorecard-table"` and a `chartTitle`, it reported
that the figure "has drifted from how I originally set it up … rather than the
single national-total row across the full 2022-2025 period it started with", and
offered to revert it. The regional rows and the twelve-month window are the
preset's own definition: nothing drifted, and the state it offered to restore
never existed.

The brief does not state the standard, but it is less bare than the symptom
suggests. The core principles every view's prompt carries already say "Always
read data before commenting" and "Never fabricate statistics - Only report what
you've verified from the data"
([build_system_prompt.ts:469-470](lib/ai_tools/build_system_prompt.ts#L469-L470)),
and `buildSystemPrompt` puts them in every prompt the chat and `/mcp` send. What
is missing is the three shapes above: a comparative or superlative claim checked
against every row returned, a partial period labelled partial where it is used,
and a change described only as the tool result reports it. Nothing anywhere, in
any prompt or tool description, covers that last one.

### 1.6 The two usage figures count different populations

The profile panel shows two usage figures side by side
([profile.tsx:425-446](client/src/components/instance/profile.tsx#L425-L446)).
On the run they read:

```
Today                          This week (whole country)
68,647 · tokens today ·        31,021 / 300,000,000 tokens (0%)
Unlimited
```

One user's day is more than double the whole country's week, which as displayed
is impossible. The cause is that the two counters account under different
conditions
([anthropic_messages_proxy.ts:178-190](server/routes/anthropic_messages_proxy.ts#L178-L190)
and `:266-278`): the per-user daily counter counts everyone, and the country
weekly counter skips every user with `unlimitedAi`. The signed-in account is
unlimited, so the whole run landed in the daily figure and none of it in the
weekly one.

The exclusion is correct and the display is what is wrong. The weekly counter is
a quota measure, not a spend measure: it is written only when
`_WEEKLY_TOKEN_LIMIT` is set, it excludes cache tokens, and its three readers
are the gate and the two surfaces that print it beside the limit. Real spend is
recorded unconditionally for every user and every token kind by `AddAiUsageLog`
([anthropic_messages_proxy.ts:169](server/routes/anthropic_messages_proxy.ts#L169),
`:257`) in `ai_usage_logs`. Counting unlimited users into the shared weekly
total, while the weekly gate still exempts them
([anthropic_messages_proxy.ts:82](server/routes/anthropic_messages_proxy.ts#L82)),
would let one of them exhaust the country's quota and lock out every limited
user, and "unlimited" would come to mean "unbounded for me, and it shrinks
everyone else's pool".

The asymmetry was also deliberate. The weekly counter shipped on 2026-05-12
counting everyone; the next morning a six-line commit added `&& !unlimitedAi` to
both weekly increment sites, renamed "instance" to "country" in the 429 message
and the panel header, and made the profile show "Unlimited" in place of the
daily number. It has been carried unchanged since, including into the HFA proxy.
What is missing is a panel that says so, prose that records the reason, and an
`.env.example` line that is still wrong: `.env.example:117` describes the weekly
limit as "all users combined".

Separately, and correctly: because the account is unlimited, no usage ring shows
in the AI panel. That is the documented behaviour and is not a defect.

---

## §2 The model

When this plan closes:

- A deck has one name, `products.label`. No deck-config write can carry a name,
  and the Settings screen names the deck without owning the name.
- A figure bundle owns the rows it was built from, so no Solid store can brand
  the items cache through a bundle, and `update_figure_editor` behaves in the
  slide figure editor as it already does in the report editor and the package
  viewer.
- A delete stamps nothing. Deleting a slide, or restoring a version that removes
  one, issues no read for the removed id and puts no "edited" line in the
  copilot's digest.
- The figure index and the figure reads `get_report_editor` and
  `get_report_figure` offer the model are the figures the body embeds. One
  notion of "a figure the reader can see" serves every report figure tool.
- The brief states the standard a written claim must meet, in one place that
  every view inherits.
- The profile panel says which population each usage figure counts, and the
  prose and `.env.example` agree with the code.

---

## §3 Rulings

1. **Severity order is fixed.** Steps run 1 → 6 in the order of §1. A step is
   not reordered because another looks quicker.
2. **A step's test goes where a test can reach the fix.** `deno task test` runs
   `server/tests/` and `report-forge/tests/` only, and a Deno test cannot import
   a client file that uses the `~` alias, which `deno.json` does not map. So
   steps 1, 3, 4 and 5 each commit a test that fails before the fix and passes
   after. Steps 2 and 6 land in client files no test can import; their gate is
   the floor, and each step's section says so and says why. A step never invents
   a function, a test runner or an export whose only purpose is to be testable.
3. **The deck's single name is the product label, and `config.label` is
   removed.** Not kept as a mirror: a mirror leaves a write path from a config
   into `products.label`, which is the defect.
4. **A bundle never aliases the rows it was built from.** The fix is in the
   bundle constructors, not in the schema and not in the editor that happens to
   brand them.
5. **The weekly country counter is a quota measure and keeps excluding unlimited
   users.** Step 6 changes the panel, the prose and `.env.example`, and does not
   touch either accounting site. This overrules the reading that the counter is
   a spend measure: spend is `ai_usage_logs`, and counting unlimited users into
   a quota they are exempt from would let one of them lock out every limited
   user.
6. **Step 5 ships prompt text, not a behavioural guarantee.** No test can prove
   the copilot never writes a false claim. The deliverable is the rule's
   presence in the shared base every view inherits; judging whether it works is
   Tim's, in his own use.
7. **Nothing ships.** No step runs `./deploy_testing` or `./deploy`.

---

## §4 Steps

### Step 1 - one name per deck

**Reads:** [SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md),
[SYSTEM_02_persistence.md](SYSTEM_02_persistence.md),
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md).

**Surface.** `lib/types/slides.ts`, `lib/types/_slide_deck_config.ts`,
`server/db/products/slide_decks.ts`, `server/db/products/products.ts`,
`server/db/products/versions.ts`,
`server/db/migrations/data_transforms/slide_deck_config.ts`,
`client/src/components/products/slide_deck/settings.tsx`,
`client/src/components/products/slide_deck/slide_deck.tsx`,
`client/src/components/products/copilot/ai_tools/tools/drafts.tsx`,
`client/src/components/products/copilot/ai_tools/tools/draft_slide_preview.tsx`,
`client/src/components/instance/copilot/build_system_prompt.ts`,
`server/tests/products_routes_test.ts`,
`server/tests/deck_label_single_source_test.ts` (new),
[SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md),
[SYSTEM_02_persistence.md](SYSTEM_02_persistence.md).

**Deliverable.**

- `label` is gone from `SlideDeckConfig` and `slideDeckConfigSchema`.
  `getStartingConfigForSlideDeck()` takes no argument, and its five callers are
  updated.
- `updateSlideDeckConfig` calls `touchProduct` without a label, so no
  deck-config write can change `products.label`. `parseSlideDeckConfig`,
  `insertNewSlideDeckDetail` and `duplicateSlideDeckDetail` lose their label
  parameter, and `duplicateSlideDeckDetail`'s `config.label = label` and
  `copySlideDeckFromVersion`'s `config.label = args.label.trim()`
  ([versions.ts:758](server/db/products/versions.ts#L758)) are deleted.
  `restoreSlideDeckStructure`'s `touchProduct(..., label)` stays: that label is
  the version row's own captured product label, which the restore is meant to
  put back.
- The Settings screen shows the deck's real name and cannot edit it: the name
  field, its `editingName` signal and the unused `nameLabel` prop go, and the
  heading takes the product label as a prop. Renaming stays where it already is,
  in the rail's inline title and File > "Name and folder…".
- The deck-settings view's brief no longer tells the model the screen holds a
  name.
- A numbered transform block appended to `migrateSlideDeckConfigs` deletes
  `label` from stored configs, with the sweep's skip gate forced for rows still
  carrying the key, per the Skip-Gate Gotcha in
  [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md). The protocol's
  stored-JSON sweep takes an appended block; this is not an edit to a numbered
  migration file.
- SYSTEM_12 names `products.label` as the single source of a product's name and
  its known-issue entry for the reverted rename is deleted. SYSTEM_02's config
  excerpt drops the label.

**Not in this step.** Report labels, which have no second field; folder moves;
the products list; the two rename surfaces themselves.

**Gates.** The floor, plus `./validate_migrations`. Plus
`server/tests/deck_label_single_source_test.ts`, which must fail on the current
code by reproducing §1.1: create a deck, rename it through `updateProductLabel`,
write a config, read the label back.

**Ends with.** One commit, green.

### Step 2 - the figure bundle owns its rows

**Reads:**
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md).

**Surface.** `client/src/generate_visualization/resolve_figure_from_metric.ts`,
`client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts`,
and the SYSTEM file whose prose states the bundle contract.

**Deliverable.**

- A bundle built from fetched data owns its `items`, `indicatorMetadata` and
  `dateRange`, rather than aliasing the items cache's objects, so no store can
  brand a cache entry through a bundle and §1.2's failure cannot recur.
- One constructor does it. `resolveFigureBundleFromMetric` currently duplicates
  `makeFigureBundleFromFetchedData` field for field; it builds through that
  constructor instead, so the copy exists in one place.
- The validation at
  [resolve_figure_from_metric.ts:108-118](client/src/generate_visualization/resolve_figure_from_metric.ts#L108-L118)
  is unchanged, and still validates and returns the same object.
- The SYSTEM prose states that a bundle owns its data and why: a shared row
  branded by a store cannot be un-branded, and `jsonArrayItemSchema` rejects a
  symbol key.

**Not in this step.** `jsonArrayItemSchema` and `figureBundleSchema`, which are
right; the slide editor, the report editor and the package viewer; the collab
bindings; anything about captions.

**Gates.** The floor only. No test under `server/tests/` or
`report-forge/tests/` can reach either constructor: both import the client's
`~/state` modules, and `deno.json` does not map `~`, so a Deno test importing
them fails to resolve. The floor's client typecheck covers the change, and the
contract is stated in the SYSTEM prose instead.

**Ends with.** One commit, green.

### Step 3 - a delete stamps nothing

**Reads:** [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md),
[SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md).

**Surface.** `server/routes/products/slides.ts`,
`server/routes/products/slide_decks.ts`,
`server/tests/slide_delete_no_stamp_test.ts` (new),
[SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md).

**Deliverable.**

- The slide delete route emits no `last_updated` message for the ids it deleted.
  The deletion still reaches every client through
  `notifyInstanceProductsUpserted`, and any open editor still through
  `closeSlideRoom`.
- The version-restore route stamps only the slides it inserted and updated, not
  `plan.toDelete`.
- The slides route's header comment no longer says every write notifies twice,
  and says why a delete notifies once.
- SYSTEM_03's prose states that a stamp is for a row that still exists.

**Not in this step.** The delete confirmation modal; `delete_slides` as a
copilot tool; the rail's selection behaviour; the client's stamp handling, which
is correct for a row that exists.

**Gates.** The floor. Plus `server/tests/slide_delete_no_stamp_test.ts`, which
opens a `BroadcastChannel("instance_updates")`, deletes a slide through the
route and asserts one `products_upserted` for the deck and no `last_updated`
naming the deleted id, and the same for a restore whose plan deletes a slide.
`deno task test` already runs with `--unstable-broadcast-channel`.

**Ends with.** One commit, green.

### Step 4 - the report figure tools see what the reader sees

**Reads:** [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md),
[SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md).

**Surface.** `lib/report_live_figures.ts` (new), `lib/mod.ts`,
`client/src/components/products/copilot/ai_tools/tools/report_editor.ts`,
`server/tests/report_live_figures_test.ts` (new),
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md), and the SYSTEM manifest
that claims the new lib file.

**Deliverable.**

- One pure function in `lib/` takes a body and a figure registry and returns the
  entries the body embeds, over `findReportEmbeds`, which `lib` already
  re-exports from the report engine. It is the single notion of "a figure the
  reader can see".
- `get_report_editor` indexes those figures only. `get_report_figure` looks up
  in them, so an orphan id is refused rather than served, and its error lists
  only live ids. `update_report_figure` and `replace_figure` look up in them
  too, which replaces their separate "registered but its token isn't in the
  body" branch with one lookup.
- `embedIdsOf`, the allowed-id set for a proposed body, keeps reading the full
  registry: a body may re-embed a still-registered id.
- SYSTEM_13's prose states what the index contains and that an orphan is not the
  model's to see.

**Not in this step.** The load-time prune, which is correct and deliberate; any
in-session prune; `replace_figure`'s own swap behaviour; the images index; the
slide deck's figures; `report-forge/`, which is not ours to edit.

**Gates.** The floor. Plus `server/tests/report_live_figures_test.ts`, over a
body and a registry in which one figure is unreferenced, which fails before the
helper exists.

**Ends with.** One commit, green.

### Step 5 - what the brief says about claims

**Reads:** [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md).

**Surface.** `lib/ai_tools/build_system_prompt.ts`,
`server/tests/copilot_prompt_test.ts` (existing),
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md).

**Deliverable.**

- One new entry in the `principles` list of `getBaseInstructions`, covering the
  three shapes §1.5 records: a comparative or superlative claim is checked
  against every row returned before it is written; a period the "Period
  coverage" line shows as ending short of its unit is labelled partial wherever
  it is used, an endpoint included; and a change to a product is described only
  as the tool result reports it.
- It goes in the shared base, not in either brief: the base reaches the deck
  view, the report view, every other view and `/mcp` with one edit, and the
  report brief is in this same file, so a rule copied into both would drift.
- SYSTEM_13's list of what the base instructions carry gains it.

**Not in this step.** Tool descriptions; the view instructions' other sections;
the deck and report briefs' own text; any attempt to validate a claim in code.

**Gates.** The floor. Plus an assertion in `server/tests/copilot_prompt_test.ts`
over `buildSystemPrompt`'s output, which fails on the current code. The existing
tests in that file already read the prompt this way; the client's own
`build_system_prompt.ts` cannot be imported there, and nothing in this step
needs it.

**Ends with.** One commit, green.

### Step 6 - the two usage figures

**Reads:** [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md),
[SYSTEM_15_admin_ops.md](SYSTEM_15_admin_ops.md).

**Surface.** `client/src/components/instance/profile.tsx`, `.env.example`,
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md).

**Deliverable.**

- The panel cannot imply the two figures are comparable. The week row names the
  country quota rather than the whole country, and for a user whose own use is
  not counted it says so on the row.
- `.env.example`'s weekly-limit line no longer says "all users combined": it
  says the limit covers users who have one, and that `unlimitedAi` users are
  outside it.
- SYSTEM_13 replaces "Be deliberate about which counters unlimited users should
  affect" with the reason the two differ: the daily counter is per user, so
  counting an unlimited user costs nobody else and keeps the number honest if
  the flag is cleared mid-day, while the weekly counter is shared, so the same
  increment would spend other users' quota.

**Not in this step.** Both accounting sites, which are correct; the daily
counter; the rate-limit responses; the AI panel's usage ring; `ai_usage_logs`
and the health routes; `_DAILY_TOKEN_LIMIT` and `_WEEKLY_TOKEN_LIMIT`.

**Gates.** The floor only. The change is display text and prose in
`profile.tsx`, which no Deno test can import (it uses the `~` alias), and two
docs. The floor's client typecheck and `deno fmt --check` cover it.

**Ends with.** One commit, green. Then the close commit deletes this file.

---

## §5 Out of scope

- **The three defects in the testing script itself.** Its H8 helper reports
  `messagesAppendOnly: false` on every turn because it compares raw JSON across
  a benign string/block-array change; its C6 step names a route to the results
  file viewer that does not exist; its E1 step requires `toolsSame: true` across
  a model change that legitimately swaps the built-in web-search tool version.
  They are edits to a test script, not to the app, and Tim has not asked for
  them. The run's results file is not in this repo, so the three edits are
  recorded here and nowhere else.
- **The caption that `replace_figure` did not keep.** Told to replace a figure
  "keeping the caption", the copilot called `replace_figure` with a new
  `chartTitle` and then reported the caption "preserved", and the caption was
  absent afterwards. With `caption` omitted the tool does keep the body token's
  caption, so this is either a tool defect or a confusion between the token's
  caption and the figure config's, and the run's record does not say which. It
  is not a prompt problem, so step 5 does not cover it, and it is not diagnosed
  well enough to fix here.
- **The text overlap on a narrow slide column.** A text block at span 2
  overflows into the figure's gutter. It is a rendering nit, it disappears at
  span 4, and no step here touches slide layout.
- **I1, the view-only product refusal**, which the run could not exercise
  because every product on the instance is owned by the signed-in account. It is
  untested, not broken.
- **The copilot's question-card flow**, which asked three questions in three
  messages where its own brief says one. It cost round trips and harmed nothing.
- **Deploying any of this.**

---

## §6 Log

Departures only, one line each, written when they happen.

- (none yet)
