# PLAN: HFA indicator verification

A country's HFA workbook holds 400 to 500 indicators, each with a short label, a
long label, a type and aggregation, a category, and per survey round a code
expression and a filter over the round's variables. The status core finds what
code can decide (syntax, unknown variables, cycles, a result type that does not
fit). What it cannot decide is whether the code measures what the labels say,
whether the variables are the right ones, whether a filter matches the "among"
clause, or whether a sentinel code or a negation makes the indicator wrong. This
plan adds a verification: a non-interactive process that sends every indicator,
one call each, to the model through the existing proxy, stores what it finds as
rows a user triages over many sessions, shows progress on a full-screen page,
and turns the findings the user marks as to-do into proposed edits applied
through the existing write path. It is not part of the copilot.

**Next step: Do 1.**

Branch: `main` here and in panther. Repos: this one and panther
(`/Users/timroberton/projects/panther/timroberton-panther`, whose `./sync`
copies it into `panther/`). Read first: [CLAUDE.md](CLAUDE.md),
[SYSTEMS.md](SYSTEMS.md),
[SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) "The
four indicator dictionaries" and "Client state & wizard",
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) "The proxy" and the HFA
paragraph of its header, [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)
the notify recipe, [PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md),
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md),
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md),
[panther/protocols/PROTOCOL_UI_STRUCTURE.md](panther/protocols/PROTOCOL_UI_STRUCTURE.md),
and panther's `DOC_AI_CHAT.md` where it describes `callAI`. Start when: both
trees are clean.

## §0 How to work this plan

The instruction is "Do the next step of PLAN_HFA_VERIFICATION.md." Branch,
floor, conditional gates, reading order and the review cadence are
[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) and
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md).
The log is §6. The last step is 6; its close commit deletes this file. Nothing
in this plan ships (ruling 13).

Step 1 is not code: it has no review or re-review agents, and its close is
Tim's word on the mockup (ruling 1). Step 2 is worked in the panther repo on
its floor (its CLAUDE.md "Commands") and ends with its `./sync` into this repo,
committed here as one commit whose body names the panther commits.

Vocabulary, used throughout:

- **verification**: one check of one indicator by the model, recorded as one
  `hfa_indicator_verifications` row, the latest check only.
- **finding**: one rule the model reports as violated by an indicator, one
  `hfa_verification_findings` row.
- **rule**: one entry of the rules list, with an id, a group, who checks it
  (the app or the model), a fixed severity and a text in en, fr and pt.
- **rules list**: `HFA_VERIFICATION_RULES` in `lib/hfa_verification_rules.ts`,
  the one statement of what is checked; the instruction block and the page's
  info button are generated from it.
- **triage**: a finding's state, `undecided`, `todo` or `ignored`.
- **check state**: an indicator is _unchecked_ (no verification row), _changed_
  (its row's hash differs from the current input hash) or _checked_.
- **snapshot**: the HFA state read once when a run starts, the
  `HfaIndicatorsForAIInput` that `loadReadInput(true)` builds
  ([tools.ts:136-163](client/src/components/data/hfa/indicators/ai/tools.ts#L136-L163)).
- **context block**: the system text block built from the snapshot and sent,
  cached, with every call of a run.
- **instruction block**: the system text block that holds the HFA guidance and
  the model-checked rules of the rules list; fixed per instance language.
- **message**: the user text of one call: one indicator in full, as
  `formatHfaIndicatorDetailsForAI` prints it, plus its dismissed section.
- **dismissed section**: the indicator's `ignored` findings, appended to the
  message so the model does not raise them again.
- **input hash**: SHA-256 hex over the instruction block, the model id and the
  message without its dismissed section.
- **run**: one pass of the runner over its queue.
- **queue**: the unchecked and changed indicators, or every indicator when the
  user asks for all.
- **proposal**: the model's proposed edit of one indicator for its selected
  findings, shown as a diff; never persisted.
- **the page**: `HfaVerification`, opened full-screen from the manager through
  its editor wrapper, as the code editor is.

Rules peculiar to this plan:

- Every line number here was read from the code when the plan was written;
  where the code has moved, the code wins.
- The `_shared/` folders this plan creates gain their second consumer in the
  step that creates them, because the structure lint refuses a `_shared/` with
  one.

## §1 The problem

- **The status core stops at what code can decide.** `HfaCodeIssueKind` is
  syntax, unknown variable, filter or variant without code, cycle and result
  type ([hfa_indicator_code.ts:400-406](lib/hfa_indicator_code.ts#L400-L406)).
  A label that contradicts its code, a filter that does not match the long
  label's "among" clause, a wrong variable, a negated test that counts a kept
  don't-know as yes, or code that differs between rounds for no reason, is
  invisible to it.
- **The parser accepts a quoted value and the run reads it as missing.** A
  `string` node is allowed under `compare` and `in`
  ([hfa_indicator_code.ts:209-212](lib/hfa_indicator_code.ts#L209-L212)); the
  guidance says a quoted value never matches a numeric answer and an option
  whose code is text is read as missing
  ([instructions.ts:31](client/src/components/data/hfa/indicators/ai/instructions.ts#L31)).
  On production Mali (read-only, 2026-11-03), 46 code rows compare against a
  quoted value; `mli011` is `sh_03=="e"` over a variable whose option codes
  are the letters `c` to `z`, so it can never be yes, and no status says so.
  Ruling 2 lists the rule and keeps it out of the status core for now.
- **The copilot's HFA tools are the wrong shape for a sweep.** They are
  interactive, view-gated and per-request
  ([tools.ts:760-838](client/src/components/data/hfa/indicators/ai/tools.ts#L760-L838)),
  read at most 20 indicators in full per call
  ([tools.ts:165](client/src/components/data/hfa/indicators/ai/tools.ts#L165)),
  and keep nothing between conversations. Mali has 421 indicators over 3
  rounds, Sierra Leone 499 over 1; a chat cannot hold a review of that size,
  and its findings vanish with the thread.
- **What a sweep would find exists on production.** Sampled from Mali:
  `mli062`'s short label begins "Pourcentage de formations sanitaires", the
  measure phrase the guidance says never belongs in a label; `mli099` filters
  with `serv_08a_g != -999998`, a negated test. Nothing records such findings,
  so a reviewer re-reads the whole workbook each time.
- **Panther's one-shot calls cannot run with panther's own defaults.**
  `callAIStructured` sends a non-streaming `beta.messages.parse`
  ([one_shot.ts:72-105](panther/_305_ai/_core/one_shot.ts#L72-L105)) and the
  tool-less `callAI` a non-streaming `create`
  ([one_shot.ts:197-213](panther/_305_ai/_core/one_shot.ts#L197-L213)); with
  the default `max_tokens` of 32,000
  ([anthropic_consts.ts:248-252](panther/_110_ai_types/anthropic_consts.ts#L248-L252))
  the SDK throws "Streaming is required for operations that may take longer
  than 10 minutes" before any request is sent (proven with SDK 1.3.0: 32,000
  throws, 16,000 reaches fetch). Neither takes an `AbortSignal`, which a Stop
  button needs.
- **The proxy needs nothing.** It streams, settles usage on abort, and
  forwards the structured-outputs beta
  ([anthropic_messages_proxy.ts:30-33](server/routes/anthropic_messages_proxy.ts#L30-L33)).
  Both production instances read run with a 50M daily and 300M weekly token
  limit, and cache tokens are never counted against either (S13 "The proxy"
  step 9).

Sizes measured on production, read-only: Mali 341 distinct variables and
2,916 answer options over 3 rounds (the compact variable list is 72k
characters, the full dictionary 177k); Sierra Leone 139 variables and 439
options (22k and 33k). One indicator's message is 1k to 3k characters. The
shared part is 30 to 60 times the per-indicator part, so what is cached decides
the cost.

## §2 The model

**Two tables, S5-owned.**

```sql
CREATE TABLE IF NOT EXISTS hfa_indicator_verifications (
  indicator_id text PRIMARY KEY REFERENCES hfa_indicators(indicator_id) ON DELETE CASCADE,
  input_hash text NOT NULL,
  model text NOT NULL,
  verified_at timestamptz NOT NULL,
  verified_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS hfa_verification_findings (
  id text PRIMARY KEY,
  indicator_id text NOT NULL REFERENCES hfa_indicators(indicator_id) ON DELETE CASCADE,
  rule text NOT NULL,
  time_point text,
  message text NOT NULL,
  suggestion text,
  triage text NOT NULL DEFAULT 'undecided' CHECK (triage IN ('undecided', 'todo', 'ignored')),
  triaged_at timestamptz,
  triaged_by text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hfa_verification_findings_indicator ON hfa_verification_findings(indicator_id);
```

No verdict column: an indicator's verdict derives from its open findings. No
severity column: it is the rule's. `rule` is validated against the rules list
at the route, not by a CHECK. A deleted indicator takes its rows with it;
`replaceAll` workbook imports do the same through the cascade.

**The rules list**, `HFA_VERIFICATION_RULES` in `lib/hfa_verification_rules.ts`,
one entry per rule: `id`, `group`, `checker` (`app` or `model`), `severity`
(`problem` or `warning`) and `text` (en, fr, pt). The instruction block is
generated from the model rules; the info button on the page shows every rule
in the instance language; a finding names one rule id. The app rules are the
status core's issue kinds, listed so the page can say what is checked without
a run and the model is told not to repeat them. The list, as ruled:

App rules (the status core, deterministic):

- `syntax`: the code parses.
- `unknown_variable`: every id the code names is a variable of that round or an
  indicator.
- `filter_without_code`, `variant_without_code`: a filter or variant code has
  main code in the same round.
- `cycle`: indicators do not reference each other in a loop.
- `result_type` (warning): binary code is a yes/no condition; numeric code is a
  number.
- `quoted_value` (warning): no comparison against a quoted value. Present in
  the file as a commented-out entry whose comment states the reason: the
  parser accepts a quoted value under compare and in, and the status core does
  not warn on it yet.

Model rules, severity fixed per rule:

- Labels: `label_measure_phrase` (warning): neither label contains the measure
  phrase ("% of facilities", "number of", "average"); it is added at display.
  `label_matches_code` (problem): the long label says exactly what the code
  computes: the condition, the threshold, the items.
  `label_denominator_matches_filter` (problem): an "among ..." qualifier in the
  long label has a filter that implements it, and a filter has a qualifier in
  the label. `short_label_consistent` (warning): the short label is a
  shortening of the long label, not a different measure.
- Variables: `variable_matches_intent` (problem): each variable named is the
  question the label refers to, judged by the variable's label.
  `better_variable_exists` (warning): no other variable in the dictionary
  matches the label more exactly. `option_code_matches` (problem): each value
  compared against is a real option code of that variable, with the meaning
  the label needs (`== 1` where 1 is Yes). `variable_blank` (warning): no
  named variable is blank in every round it is used in.
- Code logic: `positive_test` (problem): conditions test for yes positively
  (`x == 1`, `x >= 3`), never by negation, in the filter too.
  `sentinel_in_numeric` (problem): a numeric sum or average does not include a
  variable whose kept sentinel codes (other, not applicable,
  question-specific) would be summed as values. `all_any_logic` (problem):
  "all of" is AND and "any of" is OR, matching the label.
  `threshold_matches_label` (problem): a threshold in the code equals the one
  the label states. `items_match_label` (problem): where the label or the code
  enumerates items, the two sets agree.
- Filter: `filter_yes_no` (problem): the filter is a yes/no condition.
- Type and aggregation: `type_matches_measure` (problem): "% of facilities" is
  binary + avg; "average per facility" is numeric + avg; a total is
  numeric + sum.
- Rounds: `rounds_consistent` (problem): code is identical across rounds
  unless the round's question changed; where it changed, the round's code
  follows the change. `round_coverage` (warning): every round whose variables
  exist has code.
- Category: `category_fits` (warning): category, sub-category and service
  categories match the indicator's subject.
- Variants: `variant_items_consistent` (problem): each item's code is the main
  measure restricted to that item; the main code is not derived from the
  items.

**Three routes** in `lib/api-routes/instance/hfa_verification.ts`:
`getHfaVerification` (GET `/hfa-verification`, `can_view_data`: every
verification row and every finding), `saveHfaIndicatorVerification` (POST
`/hfa-verification/save`, `can_configure_data`: one indicator's hash, model and
new findings; in one transaction it upserts the verification row, deletes the
indicator's `undecided` and `todo` findings and inserts the new ones as
`undecided`), and `setHfaVerificationFindingTriage` (POST
`/hfa-verification/triage`, `can_configure_data`: finding ids and a triage).
Both writes notify through `notifyInstanceIndicatorsUpdated`, whose summary
gains `hfaVerificationVersion`, a stamp over both tables computed as
`getHfaIndicatorsVersion` computes its own
([instance.ts:39](server/db/instance/instance.ts#L39)); a T2 cache keyed on it
gives the page and the manager the rows.

**One call per indicator**, from the browser through the proxy client, with
panther's one-shot structured call (streamed and abortable after step 2):

```ts
const res = await callAIStructured(
  {
    sdkClient,
    system: () => [
      { type: "text", text: instructionBlock },
      {
        type: "text",
        text: contextBlock,
        cache_control: { type: "ephemeral" },
      },
    ],
  },
  [{ role: "user", content: message }],
  hfaVerificationOutputSchema,
  { signal },
);
```

- The instruction block is the HFA guidance (`getHfaIndicatorsGuidance`, moved
  to lib) followed by the model rules of the rules list, each as its id and
  its English text, grouped. It says: the app rules ride the message as issues
  and are not repeated; a finding names one rule id; `timePoint` is null for a
  finding about the whole indicator; write `message` and `suggestion` in the
  instance language; return no finding for an indicator that is right.
- The context block is the taxonomy and every indicator with its code
  (`formatHfaIndicatorListForAI`, `withCode`,
  [format_hfa_indicators_for_ai.ts:254](lib/ai_tools/format_hfa_indicators_for_ai.ts#L254))
  and the compact variable list (`formatHfaVariableListForAI`,
  [:514](lib/ai_tools/format_hfa_indicators_for_ai.ts#L514)). Answer options
  are not in it: the message carries them for the variables that matter.
- The message is `formatHfaIndicatorDetailsForAI(read, [id])`
  ([:465](lib/ai_tools/format_hfa_indicators_for_ai.ts#L465)): the indicator,
  its code and status per round, every variable it names with options,
  sentinel classes, counts and values present, and every indicator it names;
  then the dismissed section.
- The output schema, in lib:

```ts
z.object({
  findings: z.array(z.object({
    rule: z.enum(HFA_VERIFICATION_MODEL_RULE_IDS),
    timePoint: z.string().nullable(),
    message: z.string(),
    suggestion: z.string().nullable(),
  })),
});
```

**The runner** (a module of the page, no UI in it): reads the snapshot once,
builds the blocks and every indicator's message and hash, compares the hashes
with the T2 rows to form the queue, sends the first call alone so its cache
write lands, then keeps four calls in flight; each result is saved through
`saveHfaIndicatorVerification`; a `null` `data` lists the indicator as not
checked with its stop reason and the run goes on; a thrown error (a 429 whose
message the proxy client already rewrites, a network failure) stops the run and
shows the message; Stop aborts every in-flight call through one
`AbortController`; progress is done over queued. A closed tab is a pause: the
next run's queue is recomputed from the hashes.

**The page**: a header with the counts by check state and the open findings by
severity, a `ProgressBar` with "n of N: id", Verify (the queue), Verify all,
Stop; a table of indicators (id, short label, check state, open problems and
warnings) with each row's open findings under it (the rule's text and
severity, round, message, suggestion, the three triage buttons), bulk triage of
the selected findings, filters by check state, triage, severity and rule group,
and an info button opening the rules list in the instance language, app rules
and model rules apart; a row opens the indicator in the code editor through the
manager's `handleOpenCodeEditor`
([manager.tsx:395](client/src/components/data/hfa/indicators/manager.tsx#L395)).
The manager gains the "Verify indicators" item in its actions menu
([manager.tsx:916](client/src/components/data/hfa/indicators/manager.tsx#L916))
and a "Findings" column (open problems and warnings per indicator, sortable and
filterable).

**The fix flow**: the user selects `todo` findings and asks for proposals; the
page groups them by indicator and sends one structured call per indicator with
the verification's system blocks and a message holding the indicator in full,
the selected findings with their rules' text and the instruction to return the
edit; the output is a
fix schema whose every field is nullable, null meaning unchanged; the page turns
it into an update entry, merges it on fresh state with `mergeUpdate`, refuses it
with `refuseUnfitIndicator`'s message where it does not fit, and shows the
before and after layouts (`indicatorLayout`) in a merge view; Apply writes
through `saveHfaIndicatorsBatch` as the copilot's update tool does
([tools.ts:1333](client/src/components/data/hfa/indicators/ai/tools.ts#L1333))
and re-verifies that indicator at once, which replaces its findings; Apply all
remaining applies the proposals in turn.

**Where it lives.** `lib/types/hfa_verification.ts` (row types),
`lib/hfa_verification_rules.ts` (the rules list), `lib/hfa_verification.ts`
(the output and fix schemas, the block, message and hash builders),
`server/db/instance/hfa_verification.ts`,
`server/routes/instance/hfa_verification.ts`,
`client/src/components/data/hfa/indicators/verification/` (the page, the
runner, the proposals), `client/src/components/data/hfa/indicators/_shared/`
(what the copilot's HFA tools and the page both use: the read loaders, the
merge and layout helpers, the merge view), and
`client/src/components/_shared/ai_proxy_client.ts` (the proxy's SDK client,
out of the copilot's folder). All S5-owned but the proxy client, which S13
keeps.

**The ringfence.** The page imports nothing from `components/instance/copilot/`
or `indicators/ai/`, uses `callAIStructured` and never `createAITool`, the view
registry or the controller, holds no conversation record and nothing in browser
storage, and registers the copilot view `hfa_verification` with no tool
available in it, so the chat knows where the user is and can edit nothing. Its
system text is its own; none of `build_system_prompt.ts`, the instance
`ai_context`, the tool catalogue or the date block.

## §3 Rulings

1. _(proposed)_ Step 1 publishes a Design artifact of the page, the proposals
   view and the manager's additions, and writes its URL here:
   <https://claude.ai/artifact/DfX1Ap3H7StuoM8i44QtEt>. Steps 5 and 6 build what
   it shows. This ruling is ruled when Tim removes its mark; until then step 2
   does not start.
2. Findings are rows in their own tables. `hfaIndicatorsStatus` stays
   deterministic and the model never writes to it. The rules list of §2 is the
   one statement of what is checked: the instruction block and the page's info
   button are generated from it, a finding names one rule, and a rule's
   severity is fixed. The `quoted_value` rule is in the list as a commented-out
   entry and not in the status core (Tim, 2026-11-03).
3. The model never runs server-side: the page calls `/ai` through the proxy
   client, and the proxy is unchanged.
4. The model config is panther's default, unnamed in this repo; the
   verification row records the model the response names.
5. One snapshot per run. The context block carries
   `cache_control: { type: "ephemeral" }`; the first call of a run runs alone,
   then four are in flight.
6. The input hash is SHA-256 hex over the instruction block, the model id and
   the message without its dismissed section, computed in the browser; the
   server stores what it is sent and never recomputes it.
7. Re-verifying an indicator replaces its `undecided` and `todo` findings and
   keeps its `ignored` ones, which ride the message as the dismissed section.
8. No verdict is stored or asked of the model: it derives from the findings.
9. Findings are written in the instance language.
10. A fix is proposed per indicator over its selected `todo` findings, shown as
    a diff, applied through `saveHfaIndicatorsBatch`, and the indicator is
    re-verified at once. Proposals are not persisted. A proposal never clears
    a category, sub-category or variant group, never changes an indicator id
    and never deletes.
11. The fix call sends the verification call's two system blocks byte for
    byte; its instruction rides the user message.
12. The ringfence of §2 holds in every step: no import into `verification/`
    from `components/instance/copilot/` or `indicators/ai/`, a copilot view
    `hfa_verification` with no tool, and no identifier that says ai, assistant
    or copilot in the verification's files, tables or routes.
13. Nothing in this plan ships. `ai_usage_logs` gains no column that tells the
    two surfaces apart (Tim, 2026-11-03).
14. Opening the page and every write need `can_configure_data`; reading the
    rows needs `can_view_data`.
15. The live stamp is `hfaVerificationVersion` on `InstanceIndicatorsSummary`;
    no new SSE event type.
16. The moves of step 5 (the proxy client, the read loaders, the merge and
    layout helpers, the merge view) change no behaviour of the copilot or its
    HFA tools.

## §4 Steps

### Step 1: The mockup (this repo)

**Surface.** This file.

**Deliverable.** A Design artifact, published with the Artifact tool
(`quickstart` with intent `design`, built on the listed design system nearest
to panther's tokens), showing in the app's visual system: (a) the page as §2
describes it, with a run in progress; (b) the proposals view: one card per
indicator with its before and after diff, Apply, Apply all remaining, and a
refused proposal's message; (c) the manager with its "Findings" column and
"Verify indicators" menu item; (d) the rules list behind the page's info
button, app rules and model rules apart, each with its severity. The URL is
written into ruling 1.

**Not in this step.** Code.

**Gates.** `deno fmt --check PLAN_HFA_VERIFICATION.md`.

**Ends with.** One commit holding the URL. The close is Tim's: he removes the
mark on ruling 1, or names changes, which are made and published again in
further commits of this step.

### Step 2: Panther's one-shot calls stream and abort (panther repo)

**Surface.** `modules/_305_ai/_core/one_shot.ts`, `modules/_305_ai/mod.ts`,
`modules/_305_ai/README.md` "One-Shot Requests", the `callAI` paragraph of
`DOC_AI_CHAT.md`, `tests/ai_one_shot_test.ts` (new); in this repo, `panther/**`
through the sync.

**Deliverable.**

- `callAI(config, messages, options?)` and
  `callAIStructured(config, messages, schema, options?)` take
  `options?: { signal?: AbortSignal }` and pass the signal as the SDK request's
  `signal` on every path, the tool runner's included.
- The tool-less `callAI` and `callAIStructured` send through
  `beta.messages.stream(...)` and `finalMessage()`, so panther's default
  `max_tokens` is accepted.
- `callAIStructured` keeps `output_config.format` from `betaZodOutputFormat`
  and validates the final message's text with the schema itself: `data` is the
  parsed value, `null` on a refusal, on `max_tokens`, or when the text fails
  the schema.
- `CallAIResult` gains `model: string`, the response's model.
- `tests/ai_one_shot_test.ts`: a `createSDKClient` whose `fetch` is a stub
  answering a minimal SSE stream pins that the body carries `stream: true`,
  that the signal reaches fetch, that `data` is the parsed object and `model`
  the response's; and that an already-aborted signal rejects before fetch.
- The README's one-shot section and the `DOC_AI_CHAT.md` paragraph state the
  streaming and the options.
- `./sync` for the `wb-fastr` target, then this repo's floor.

**Not in this step.** The proxy; any consumer in this repo.

**Gates.** Panther's floor in the panther repo; this repo's floor after the
sync.

**Ends with.** The panther commits, then one sync commit here naming them in
its body.

### Step 3: Persistence, routes and the live stamp (this repo)

**Surface.** `server/db/migrations/instance/228_hfa_verification.sql` (new),
`server/db/instance/_main_database.sql`,
`server/db/instance/_main_database_types.ts`,
`server/db/instance/hfa_verification.ts` (new), `server/db/mod.ts`,
`server/db/instance/instance.ts`, `lib/hfa_indicator_guidance.ts` (new, the
guidance moved from `client/src/components/data/hfa/indicators/ai/instructions.ts`,
deleted), `client/src/components/data/hfa/indicators/ai/mod.ts`,
`client/src/components/data/hfa/indicators/mod.ts`,
`client/src/components/data/hfa/indicators/manager.tsx`,
`client/src/components/data/hfa/indicators/indicator_code_editor.tsx`,
`lib/types/hfa_verification.ts` (new), `lib/hfa_verification_rules.ts` (new),
`lib/hfa_verification.ts` (new), `lib/mod.ts`, `lib/types/instance_sse.ts`,
`lib/api-routes/instance/hfa_verification.ts` (new), `lib/api-routes/mod.ts`,
`server/routes/instance/hfa_verification.ts` (new), `main.ts`,
`client/src/state/instance/t1_store.ts`, `client/src/state/instance/t1_sse.tsx`,
`client/src/state/instance/t2_indicators.ts`,
`server/tests/hfa_verification_test.ts` (new),
`server/tests/permission_matrix_test.ts`, SYSTEM_03, SYSTEM_05, SYSTEM_13.

**Deliverable.**

- The two tables of §2 in the migration and the base schema, idempotent.
- `lib/hfa_verification_rules.ts`: `HFA_VERIFICATION_RULES` as §2 lists it,
  the `quoted_value` entry commented out with its reason, and the derived
  `HFA_VERIFICATION_MODEL_RULE_IDS`, `HfaVerificationRuleId`,
  `HfaVerificationRuleGroup`, `HfaVerificationSeverity` and
  `hfaVerificationRule(id)`.
- `lib/types/hfa_verification.ts`: `HfaIndicatorVerification`,
  `HfaVerificationFinding` (with `rule: HfaVerificationRuleId`) and
  `HfaVerificationTriage`.
- `lib/hfa_indicator_guidance.ts` holds `getHfaIndicatorsGuidance` unchanged;
  the manager, the code editor and the copilot's HFA tools read it from lib.
- `lib/hfa_verification.ts`: `hfaVerificationOutputSchema`;
  `buildHfaVerificationBlocks(read, language)` returning the instruction block
  and the context block; `buildHfaVerificationMessage(read, indicatorId,
  dismissed)`; `hfaVerificationInputHash(instructionBlock, model, message)`
  over `crypto.subtle`.
- The DB layer: `getHfaVerification`, `saveHfaIndicatorVerification` (the
  transaction of §2, finding ids from `crypto.randomUUID()`),
  `setHfaVerificationFindingTriage` (bulk; `triaged_at` now, `triaged_by` the
  caller), `getHfaVerificationVersion`.
- The three routes, their rows in `EXPECTED` of the permission matrix test,
  the router mounted in `main.ts` beside `routesHfaIndicators`
  ([main.ts:168](main.ts#L168)).
- `InstanceIndicatorsSummary` and the T1 store carry `hfaVerificationVersion`;
  the two write routes notify; `getHfaVerificationFromCacheOrFetch(version)`
  in `t2_indicators.ts` on the pattern of
  [t2_indicators.ts:38-57](client/src/state/instance/t2_indicators.ts#L38-L57).
- `server/tests/hfa_verification_test.ts` pins: rule ids are unique and every
  rule has en, fr and pt text; the instruction block names every model rule
  and no app rule; the output schema accepts the §2 shape and rejects an app
  rule id and an unknown id; the hash is stable, changes with the model id,
  and ignores the dismissed section; the message ends with the dismissed
  section when there are ignored findings and has none otherwise; two
  indicators of one snapshot get a byte-identical context block.
- SYSTEM_05 gains a section "HFA indicator verification" (the rules list,
  tables, routes, the stamp, the blocks, the hash, the ringfence); SYSTEM_03's
  catalogue names the
  summary's new field; SYSTEM_13's HFA paragraph says the verification is
  S5's, uses the proxy and no chat; the manifests claim every new file.

**Not in this step.** The page, the runner, the copilot view, the proxy
client's move.

**Gates.** The floor, `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Several commits: the guidance's move to lib; the rules list;
the tables, DB layer and routes; the stamp, the T2 cache and the docs. Each
green.

### Step 4: The copilot view with no tools (this repo)

**Surface.** `client/src/components/instance/copilot/ai_views.ts`,
`client/src/components/instance/copilot/chat_pane.tsx`,
`lib/ai_tools/copilot_catalogue.ts`, `server/tests/copilot_catalogue_test.ts`,
SYSTEM_13.

**Deliverable.** View `hfa_verification` (label "HFA indicator verification")
declared beside `hfa_indicator_import`
([ai_views.ts:673](client/src/components/instance/copilot/ai_views.ts#L673)),
restorable in `restoreCopilotView`, in `COPILOT_VIEW_IDS`
([copilot_catalogue.ts:18](lib/ai_tools/copilot_catalogue.ts#L18)), in the chat
pane's per-view map with `ASK_HFA`
([chat_pane.tsx:102](client/src/components/instance/copilot/chat_pane.tsx#L102)),
and in the catalogue test's view list with no groups
([copilot_catalogue_test.ts:143](server/tests/copilot_catalogue_test.ts#L143)),
so no tool is available in it. SYSTEM_13 lists it among the HFA views as the
one with no tools.

**Not in this step.** Setting the view: the page does that in step 5.

**Gates.** The floor.

**Ends with.** One commit.

### Step 5: The page and the runner (this repo)

**Surface.** `client/src/components/_shared/ai_proxy_client.ts` (new),
`client/src/components/instance/copilot/ai_configs/defaults.ts`,
`client/src/components/instance/copilot/ai_configs/mod.ts`,
`client/src/components/instance/copilot/mod.ts`,
`client/src/components/instance/copilot/panel.tsx`,
`client/src/components/instance/copilot/debug_api.ts`,
`client/src/components/data/hfa/indicators/_shared/**`
(new), `client/src/components/data/hfa/indicators/ai/tools.ts`,
`client/src/components/data/hfa/indicators/ai/proposal_diff.tsx`,
`client/src/components/data/hfa/indicators/verification/**` (new),
`client/src/components/data/hfa/indicators/manager.tsx`,
`client/src/components/data/hfa/indicators/mod.ts`, SYSTEM_05, SYSTEM_13.

**Deliverable.**

- `components/_shared/ai_proxy_client.ts` holds `createAiProxyClient` and
  `aiProxyRequests`, the client and recorder now at
  [defaults.ts:62](client/src/components/instance/copilot/ai_configs/defaults.ts#L62),
  renamed and otherwise unchanged; the copilot imports them;
  `DEFAULT_BUILTIN_TOOLS` stays in `defaults.ts`.
- `indicators/_shared/read_input.ts` holds the loaders and `loadReadInput`
  ([tools.ts:59-163](client/src/components/data/hfa/indicators/ai/tools.ts#L59-L163));
  `indicators/_shared/indicator_edit.ts` holds `updateEntrySchema`,
  `loadWriteState`, `refuseUnfitIndicator`, `statusOver`, `indicatorLayout`,
  `mergeUpdate` and what they call
  ([tools.ts:246-735](client/src/components/data/hfa/indicators/ai/tools.ts#L246-L735));
  `indicators/_shared/code_merge_view.tsx` holds the merge view that
  `HfaProposalDiff` wraps in its modal. `tools.ts` and `proposal_diff.tsx`
  import them; their behaviour is unchanged (ruling 16).
- `indicators/verification/`: `verification.tsx` (`HfaVerification`, the page
  of §2), `runner.ts` (the runner of §2, signals for progress, the current
  indicator, the not-checked list and the error; no UI), `findings.tsx` (a
  row's findings with their rules' text and severity, and triage),
  `rules_info.tsx` (the info button's modal: the rules list in the instance
  language, app rules and model rules apart), `mod.ts`. The page calls
  `holdCopilotView()`
  then sets `hfa_verification`; its rows come from the T2 cache keyed on
  `instanceState.hfaVerificationVersion`; every string is a `t3` literal in
  en, fr and pt.
- The manager's actions menu gains "Verify indicators", disabled without HFA
  data or `can_configure_data`, opening the page through `openEditor` with
  `openIndicator` bound to `handleOpenCodeEditor`; its table gains the
  "Findings" column.
- SYSTEM_05's section describes the page and the runner; SYSTEM_13 names the
  proxy client's new home and the `_shared/` the HFA tools now read.

**Not in this step.** Proposals and Apply.

**Gates.** The floor.

**Ends with.** Several commits: the proxy client's move; the `_shared/` moves
with the page as their second consumer; the manager. Each green.

### Step 6: Fix proposals (this repo)

**Surface.** `lib/hfa_verification.ts`, `server/tests/hfa_verification_test.ts`,
`client/src/components/data/hfa/indicators/verification/**`,
`client/src/components/data/hfa/indicators/_shared/indicator_edit.ts`,
SYSTEM_05.

**Deliverable.**

- `hfaFixOutputSchema` in lib: `shortLabel`, `definition`, `type`,
  `aggregation`, `categoryId`, `subCategoryId`, `serviceCategoryIds`,
  `variantGroupId`, `code` (rounds with `code` and `filterCode`) and
  `variantCode`, each nullable, null meaning unchanged, plus `note`, one
  sentence on what the edit does; `buildHfaFixMessage(read, indicatorId,
  findings)`, each finding with its rule's text;
  `fixToUpdateEntry(indicatorId, output)` returning the
  `updateEntrySchema` shape with every null field absent.
- `verification/proposals.tsx`: Propose fixes over the selected `todo`
  findings, one abortable call per indicator with the verification's system
  blocks (ruling 11), the same four-in-flight runner; per proposal the merge
  on fresh state, a refusal's message, the before and after in the merge view,
  Apply (`saveHfaIndicatorsBatch` for that indicator, then the runner verifies
  it alone and its findings are replaced), and Apply all remaining.
- The test pins `fixToUpdateEntry` (nulls absent, rounds and variant rows
  carried) and that the fix schema rejects a missing `note`.
- SYSTEM_05's section describes the fix flow and the plan's residue.

**Not in this step.** Anything of §5.

**Gates.** The floor.

**Ends with.** Several commits, each green; the close commit deletes this file.

## §5 Out of scope

- A server-side worker or any server-side caller of Anthropic.
- A column on `ai_usage_logs` telling the two surfaces apart (ruling 13).
- HMIS indicators.
- A history of past verifications: one row per indicator, the latest.
- Persisting proposals.
- Verifying the taxonomy or the survey dictionary themselves.
- Exposing verifications or findings on `/mcp` or to the copilot's tools.
- Applying a proposal without showing its diff.
- Help buttons on the page (the info button shows the rules list, not help).
- The `quoted_value` check in the status core: its rule is listed, commented
  out (ruling 2).

## §6 Log

- Step 1: built without a design system, because the account lists none; the
  mockup takes panther's light-scheme tokens from
  `panther/_303_components/_fixed.css` directly.
- Step 1: (c) is two artboards, the manager with the Findings column and the
  manager with the actions menu open, because the open menu covers that column.
