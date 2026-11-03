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
findings a user dismisses or fixes over many sessions, shows them where the
app's own issues already show (the manager's table and the code editor), and
lets the editor fill its draft with the model's proposed fix. It adds no page,
tab or table: a column and a button on the manager, findings and two buttons
in the editor, and one modal for the rule switches. It is not part of the
copilot.

**Next step: Do 5.**

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
The log is §6. The last step is 5; its close commit deletes this file. Nothing
in this plan ships (ruling 13).

Step 1 is not code: it has no review or re-review agents, and its close is
Tim's word on the mockup (ruling 1). Step 2 is worked in the panther repo on
its floor (its CLAUDE.md "Commands") and ends with its `./sync` into this repo,
committed here as one commit whose body names the panther commits. Both are
closed.

Vocabulary, used throughout:

- **verification**: one check of one indicator by the model, recorded as one
  `hfa_indicator_verifications` row, the latest check only.
- **finding**: one rule the model reports as violated by an indicator, for the
  whole indicator or for one round, one `hfa_verification_findings` row; at
  most one per indicator, rule and round.
- **rule**: one entry of the rules list, with an id, a group, who checks it
  (the app or the model), a fixed severity, the editor field it is shown
  beside, and a text in en, fr and pt.
- **rules list**: `HFA_VERIFICATION_RULES` in `lib/hfa_verification_rules.ts`,
  the one statement of what is checked; the instruction block, the editor's
  placement and the rules modal are generated from it.
- **dismissed**: a finding the user has dismissed. It stays stored and hidden,
  and suppresses its rule for that indicator and round (every round when the
  finding was about the whole indicator) until undismissed.
- **rule switch**: a model rule switched off for the instance. Its findings are
  hidden everywhere; the model is still asked about it.
- **open finding**: a finding neither dismissed nor of a switched-off rule.
- **not verified** / **changed**: an indicator with no verification row, or
  whose row's hash differs from its current input hash.
- **snapshot**: the HFA state read once when a run starts, the
  `HfaIndicatorsForAIInput` that `loadReadInput(true)` builds
  ([tools.ts:136-163](client/src/components/data/hfa/indicators/ai/tools.ts#L136-L163)).
- **context block**: the system text block built from the snapshot and sent,
  cached, with every call of a run.
- **instruction block**: the system text block that holds the HFA guidance and
  the model-checked rules of the rules list; fixed per instance language.
- **message**: the user text of one call: one indicator in full, as
  `formatHfaIndicatorDetailsForAI` prints it, plus its dismissed section.
- **dismissed section**: the indicator's dismissed findings, appended to the
  message so the model does not raise them again.
- **input hash**: SHA-256 hex over the instruction block and the message built
  without display rows and without its dismissed section.
- **run**: one pass of the runner over its queue.
- **queue**: the not-verified and changed indicators, or every indicator when
  the user asks for all, or the one indicator the editor asks for.
- **draft fix**: the model's proposed edit of one indicator for its open
  findings, applied to the editor's draft; never persisted.

Rules peculiar to this plan:

- Every line number here was read from the code when the plan was written;
  where the code has moved, the code wins.
- Each `_shared/` file this plan creates gains its second consumer in the step
  that creates it, because the structure lint refuses a `_shared/` file with
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
- **Panther's one-shot calls could not run with panther's own defaults.**
  Closed by step 2: `callAI` and `callAIStructured` stream, take a signal and
  return the response's model.
- **The proxy needs nothing.** It streams, settles usage on abort, and
  forwards the structured-outputs beta
  ([anthropic_messages_proxy.ts:30-33](server/routes/anthropic_messages_proxy.ts#L30-L33)).
  Both production instances read run with a 50M daily and 300M weekly token
  limit, and cache tokens are never counted against either (S13 "The proxy"
  step 9).
- **The app already has the shape a finding needs.** An indicator's issues are
  counted in the manager's Status column
  ([manager.tsx:840](client/src/components/data/hfa/indicators/manager.tsx#L840)),
  filtered there, and shown in the editor beside the field they concern
  ([indicator_code_editor.tsx:969-999](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L969-L999)).
  A model finding is one more kind of issue, with two differences: it is
  stored, because it cost a call, and it can be dismissed, because it is an
  opinion.

Sizes measured on production, read-only: Mali 341 distinct variables and
2,916 answer options over 3 rounds (the compact variable list is 72k
characters, the full dictionary 177k); Sierra Leone 139 variables and 439
options (22k and 33k). One indicator's message is 1k to 3k characters. The
shared part is 30 to 60 times the per-indicator part, so what is cached decides
the cost.

## §2 The model

**Two tables and one config key, S5-owned.**

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
  time_point text REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  message text NOT NULL,
  suggestion text,
  dismissed_at timestamptz,
  dismissed_by text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hfa_verification_findings_indicator ON hfa_verification_findings(indicator_id);
```

The rule switches are the `instance_config` key `hfa_verification_rules_off`,
a JSON array of model rule ids in a text value, read and written in TypeScript
as every config value is. No verdict column: an indicator's verdict derives
from its open findings. No severity column: it is the rule's. `rule` is
validated against the rules list at the route, not by a CHECK; a returned
finding whose round is not a time point is dropped before the insert, so one
bad round does not fail the indicator's save. `time_point` carries the foreign
key every round-keyed table has
([_main_database.sql:897](server/db/instance/_main_database.sql#L897)), with
cascade on delete because a finding about a deleted round is void. A deleted
indicator takes its rows with it; `replaceAll` workbook imports do the same
through the cascade.

**The rules list**, `HFA_VERIFICATION_RULES` in `lib/hfa_verification_rules.ts`,
one entry per rule: `id`, `group`, `checker` (`app` or `model`), `severity`
(`problem` or `warning`), `field` (the editor field the finding shows beside:
`shortLabel`, `definition`, `type`, `category`, `code`, `filterCode`,
`variantCode` or `rounds`) and `text` (en, fr, pt). Beside it,
`HFA_VERIFICATION_RULE_GROUPS` gives each group its label in en, fr and pt, and
the two severities have theirs. The instruction block is generated from the
model rules; the rules modal shows every rule; a finding names one rule id.
The app rules are the status core's issue kinds, listed so the modal can say
what is checked without a run and the model is told not to repeat them. The
list, as ruled:

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

Model rules, severity fixed per rule, field in brackets:

- Labels: `label_measure_phrase` (warning) [definition]: neither label contains
  the measure phrase ("% of facilities", "number of", "average"); it is added
  at display. `label_matches_code` (problem) [definition]: the long label says
  exactly what the code computes: the condition, the threshold, the items.
  `label_denominator_matches_filter` (problem) [filterCode]: an "among ..."
  qualifier in the long label has a filter that implements it, and a filter
  has a qualifier in the label. `short_label_consistent` (warning)
  [shortLabel]: the short label is a shortening of the long label, not a
  different measure.
- Variables, all [code]: `variable_matches_intent` (problem): each variable
  named is the question the label refers to, judged by the variable's label.
  `better_variable_exists` (warning): no other variable in the dictionary
  matches the label more exactly. `option_code_matches` (problem): each value
  compared against is a real option code of that variable, with the meaning
  the label needs (`== 1` where 1 is Yes). `variable_blank` (warning): no
  named variable is blank in every round it is used in.
- Code logic, all [code]: `positive_test` (problem): conditions test for yes
  positively (`x == 1`, `x >= 3`), never by negation, in the filter too.
  `sentinel_in_numeric` (problem): a numeric sum or average does not include a
  variable whose kept sentinel codes (other, not applicable,
  question-specific) would be summed as values. `all_any_logic` (problem):
  "all of" is AND and "any of" is OR, matching the label.
  `threshold_matches_label` (problem): a threshold in the code equals the one
  the label states. `items_match_label` (problem): where the label or the code
  enumerates items, the two sets agree.
- Filter: `filter_yes_no` (problem) [filterCode]: the filter is a yes/no
  condition.
- Type and aggregation: `type_matches_measure` (problem) [type]: "% of
  facilities" is binary + avg; "average per facility" is numeric + avg; a
  total is numeric + sum.
- Rounds, both [rounds]: `rounds_consistent` (problem): code is identical
  across rounds unless the round's question changed; where it changed, the
  round's code follows the change. `round_coverage` (warning): every round
  whose variables exist has code.
- Category: `category_fits` (warning) [category]: category, sub-category and
  service categories match the indicator's subject.
- Variants: `variant_items_consistent` (problem) [variantCode]: each item's
  code is the main measure restricted to that item; the main code is not
  derived from the items.

**Four routes** in `lib/api-routes/instance/hfa_verification.ts`:
`getHfaVerification` (GET `/hfa-verification`, `can_view_data`: every
verification row, every finding and the switched-off rules),
`saveHfaIndicatorVerifications` (POST `/hfa-verification/save`,
`can_configure_data`: an array of results, each an indicator's hash, model and
new findings, written in one transaction),
`setHfaVerificationFindingsDismissed` (POST `/hfa-verification/dismissed`,
`can_configure_data`: finding ids and `dismissed: boolean`; sets or clears
`dismissed_at` and `dismissed_by`) and `setHfaVerificationRulesOff` (POST
`/hfa-verification/rules-off`, `can_configure_data`: the array of model rule
ids). Every write notifies through `notifyInstanceIndicatorsUpdated`, whose
summary gains `hfaVerificationVersion`: MD5 over `MAX(verified_at)` and
`COUNT(*)` of the verifications, `MAX(created_at)`, `COUNT(*)`,
`COUNT(dismissed_at)` and `MAX(dismissed_at)` of the findings (the count of
non-null `dismissed_at` moves on every dismiss and undismiss), and the config
value, computed as `getHfaIndicatorsVersion` computes its own
([instance.ts:39](server/db/instance/instance.ts#L39)); a T2 cache keyed on it
gives the manager and the editor the rows.

**The save transaction**, in `saveHfaIndicatorVerifications`, per result:
upsert the verification row; read the indicator's dismissed
`(rule, time_point)` pairs; drop returned findings whose round is not a time
point; merge returned findings that share a rule and round into one (messages
and suggestions joined by a blank line); drop a returned finding when a
dismissed pair has the same rule and a null or equal round; delete the
indicator's undismissed findings; insert what is left as undismissed, ids from
`crypto.randomUUID()`. The comparison is TypeScript over the rows read in the
transaction, never a SQL equality on `time_point`, which is null for a
whole-indicator finding. One notify after the transaction, whatever the batch
size.

**One call per indicator**, from the browser through the proxy client, with
panther's one-shot structured call (streamed and abortable since step 2):

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
  and are not repeated; a finding names one rule id; at most one finding per
  rule and round, and a finding about several variables, values or items names
  them all in its message; `timePoint` is null for a finding about the whole
  indicator; write `message` and `suggestion` in the instance language; return
  no finding for an indicator that is right.
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
- The hash is over the instruction block and the message built from the same
  read input with `displayRows: undefined`, so the facility counts
  ([:338](lib/ai_tools/format_hfa_indicators_for_ai.ts#L338)) are sent but not
  hashed: a data re-upload changes no hash, and the manager, which does not
  load display rows, can compute every indicator's current hash from the state
  it holds. The model id is not in the hash: the row records it, and a new
  model is re-checked by Verify all, as is the data-dependent rule
  `variable_blank` after a data upload.
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

**The current-hash map**, `verification/hashes.ts`:
`createHfaVerificationHashes(read)` returns a signal holding a
`Map<indicatorId, hash>`, written by an effect with a run id on the pattern of
[manager.tsx:178-186](client/src/components/data/hfa/indicators/manager.tsx#L178-L186),
because `crypto.subtle` is asynchronous and a memo cannot hold it. The
manager builds the read input from the signals it already loads, so the map
recomputes on `hfaIndicatorsVersion` and `hfaCacheHash` only, never on the
verification version the runner bumps during a run. One recompute formats
every indicator through one `createHfaIndicatorDetailsFormatter(read)`, which
builds the input index once ([:85-145](lib/ai_tools/format_hfa_indicators_for_ai.ts#L85-L145))
instead of once per indicator. A memo over the map and the T2 rows gives each
indicator its state (not verified, changed, verified) and the queue; the
Findings column and the Verify label show "…" until the map lands. The manager
passes the state memo to the column, the Verify button and the editor; the
runner forms its queue from it, so the UI's "changed" and the queue agree.

**The runner**, `verification/runner.ts`, module-level state exported through
`verification/mod.ts`: signals for progress (done over queued), the current
indicator, the not-checked list and the error; one `AbortController`;
`startRun(queue)` and `stopRun()`. A run reads the snapshot once, builds the
blocks and every queued indicator's message and hash, sends the first call
alone so its cache write lands, then keeps four calls in flight. Results are
saved in batches of ten through `saveHfaIndicatorVerifications`, and the batch
in hand is flushed on Stop, on the run's end and on error, so the live stamp
moves about forty times a run, not four hundred; each result carries the
response's model. A `null` `data` lists the indicator as not checked with its
stop reason and the run goes on; a thrown error (a 429 whose message the proxy
client already rewrites, a network failure) stops the run and shows the
message; Stop aborts every in-flight call. The run survives tab switches, the
editor opening and the manager's Back; closing the browser tab is a pause: the
next run's queue is recomputed from the hashes.

**The manager.** The toolbar gains Verify, labelled with the queue size
("Verify 87"), disabled at zero, without HFA data (with `noHfaDataMsg()` as the
title) and without `can_configure_data`; while a run is in progress the toolbar
shows "Verifying n of N: id" and Stop instead; after a run the not-checked list
and the stop error, if any, show under the toolbar until the next run. The
actions menu gains "Verify all" and "Verification rules". The table gains the
Findings column: open problems and warnings per indicator ("2 problems, 1
warning"), "No findings" muted for a verified indicator with none open, "not
verified" or "changed" muted beside or instead of them; sortable by open
count; filter values Problem, Warning, No findings, Not verified, Changed and
every rule's name through `t3`. A row click opens the editor as today.

**The editor.** Each open finding of the indicator renders beside its rule's
field, in the style of the app's issues there: severity, rule text, message,
suggestion and Dismiss. A finding with a round renders only while that round is
selected, and the round buttons show their open count under the label where
they show "no code" ([:881-897](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L881-L897)).
Dismissed findings of the field collapse to "n dismissed" with Undo per
finding. While `needsSaving()` is true a line above the fields says the
findings describe the saved version; while the indicator is changed or not
verified it says so, and the header's Verify button, beside Draft a fix, runs
that one indicator through `startRun([indicatorId])`, enabled while no run is
in progress; while it runs the line says Verifying. Dismiss and Undo call the
dismissed route.

**Draft a fix**, a button in the editor header beside Save, enabled with open
findings, `can_configure_data` and a clean draft (`needsSaving()` false; while
dirty its title says Save first, because the patch would land over unsaved
edits). At click it reads the indicator fresh through `loadReadInput(false)`,
because the editor's props are the manager's snapshot at open and go stale
after an in-editor Save
([:176-186](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L176-L186)),
and builds the blocks and the message from that read: one structured call with
the verification's two system blocks byte for byte (ruling 11) and a user
message holding the indicator in full, its open findings with their rules'
text and the instruction to return the edit; the output is
`hfaFixOutputSchema`, every field nullable with null meaning unchanged, plus
`note`, one sentence on what the edit does. `fixToPatch` turns it into an
`HfaIndicatorEditorPatch`; `validateHfaIndicatorPatch` checks every id it
names against the editor's taxonomy and rounds (the copilot's private
`validatePatch`, [editor_tools.ts:124](client/src/components/data/hfa/indicators/ai/editor_tools.ts#L124),
lifted into `_shared/` and returning a patch or an error instead of throwing,
because `applyDraft` skips an unknown round silently,
[:601](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L601));
a valid patch goes through `applyDraft`
([:575](client/src/components/data/hfa/indicators/indicator_code_editor.tsx#L575))
and the banner shows the note, each changed field with its previous value, and
Discard, which restores the previous draft. Save is the editor's own. A
validation error, a refusal, a `null` result or a thrown error shows its
reason in the banner and applies nothing. Closing the editor aborts the call.
Nothing is persisted until Save.

**The rules modal**, from the actions menu (which the manager renders only
with `can_configure_data`): app rules and model rules apart, each with its
group, severity and text through `t3`; each model rule has a switch; off hides
the rule's findings in the column, the editor and the counts and shows "n
hidden" beside the rule; the model is still asked about every rule, so
switching a rule back on shows what it already found without a run. The switch
writes through the rules-off route.

**Where it lives.** `lib/types/hfa_verification.ts` (row types),
`lib/types/hfa_types.ts` (gains the editor's draft, round and patch types,
moved from the copilot's `ai_views.ts`), `lib/hfa_verification_rules.ts` (the
rules list and the group and severity labels), `lib/hfa_verification.ts` (the
output and fix schemas, the block, message, hash and fix-message builders,
`fixToPatch`), `lib/ai_tools/format_hfa_indicators_for_ai.ts`
(`createHfaIndicatorDetailsFormatter`),
`server/db/instance/hfa_verification.ts`,
`server/routes/instance/hfa_verification.ts`,
`client/src/components/data/hfa/indicators/verification/` (`runner.ts`,
`hashes.ts`, `field_findings.tsx` (the block beside a field), `draft_fix.ts`
(the call and the banner's state), `rules_modal.tsx`, `mod.ts`),
`client/src/components/data/hfa/indicators/_shared/` (`read_input.ts`, the
read loaders the copilot's HFA tools and the runner both use;
`indicator_patch.ts`, the patch validation the copilot's editor tools and
Draft a fix both use; `mod.ts`), and
`client/src/components/_shared/ai_proxy_client.ts` (the proxy's SDK client,
out of the copilot's folder). All S5-owned but the proxy client, which S13
keeps.

**The ringfence.** `verification/` imports nothing from
`components/instance/copilot/` or `indicators/ai/`, uses `callAIStructured` and
never `createAITool`, the view registry or the controller, holds no
conversation record and nothing in browser storage, and declares no copilot
view: the user is on `hfa_indicators` or `hfa_indicator_editor`, as today. Its
system text is its own; none of `build_system_prompt.ts`, the instance
`ai_context`, the tool catalogue or the date block.

## §3 Rulings

1. Step 1 published a Design artifact of the page design this plan replaced:
   <https://claude.ai/artifact/DfX1Ap3H7StuoM8i44QtEt>. It stays as the record
   of step 1. This plan's surfaces are additions to existing ones and are
   specified in §2 (Tim, 2026-11-03: the inline design replaces the page).
2. Findings are rows in their own tables. `hfaIndicatorsStatus` stays
   deterministic and the model never writes to it. The rules list of §2 is the
   one statement of what is checked: the instruction block, the editor's
   placement and the rules modal are generated from it, a finding names one
   rule, and a rule's severity is fixed. The `quoted_value` rule is in the
   list as a commented-out entry and not in the status core (Tim, 2026-11-03).
3. The model never runs server-side: the browser calls `/ai` through the proxy
   client, and the proxy is unchanged.
4. The model config is panther's default, unnamed in this repo. The
   verification row records the response's model as a record; it is not in
   the hash (Tim, 2026-11-03: panther's UI entry exports no default model, so
   this repo cannot see the request's).
5. One snapshot per run. The context block carries
   `cache_control: { type: "ephemeral" }`; the first call of a run runs alone,
   then four are in flight.
6. The input hash is SHA-256 hex over the instruction block and the message
   built without display rows and without its dismissed section, computed in
   the browser; the server stores what it is sent and never recomputes it.
7. Re-verifying an indicator replaces its undismissed findings and keeps its
   dismissed ones, which ride the message as the dismissed section. A
   dismissal suppresses its rule for its round, or every round when the
   finding was about the whole indicator; the save enforces it.
8. No verdict is stored or asked of the model: it derives from the findings.
9. A finding's message and suggestion are written in the instance language.
   Rule text, group and severity labels and every control are `t3` literals in
   the user's language.
10. A fix is drafted per indicator in the editor over its open findings,
    validated, applied to a clean draft and never persisted; Save is the
    editor's own. A draft never clears a category, sub-category or variant
    group, never changes an indicator id and never deletes.
11. The fix call sends the verification call's two system blocks byte for
    byte; its instruction rides the user message.
12. The ringfence of §2 holds in every step: no import into `verification/`
    from `components/instance/copilot/` or `indicators/ai/`, no copilot view,
    and no identifier that says ai, assistant or copilot in the verification's
    files, tables or routes.
13. Nothing in this plan ships. `ai_usage_logs` gains no column that tells the
    two surfaces apart (Tim, 2026-11-03).
14. Verify, Verify all, Stop, Dismiss, Undo, Draft a fix, the editor's Verify,
    the rules modal and its switches need `can_configure_data`; the rows and
    the Findings column need `can_view_data`.
15. The live stamp is `hfaVerificationVersion` on `InstanceIndicatorsSummary`;
    no new SSE event type.
16. The moves of steps 3, 4 and 5 (the editor's draft types to lib, the proxy
    client, the read loaders, the patch validation) change no behaviour of the
    copilot or its HFA tools.
17. A finding is unique per indicator, rule and round: the instruction block
    says so and the save merges duplicates.
18. A rule switch hides; it changes neither the request nor the hash.
19. The runner is module-level state: a run survives navigation inside the app
    and ends with the browser tab.
20. Results are saved in batches: one transaction and one notify per batch,
    never one per indicator.

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
`DOC_AI_CHAT.md`; in this repo, `panther/**` through the sync and
`client/src/components/products/slide_deck/slide_editor/text_geometry.ts`,
where the sync's constructor change lands.

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
- The README's one-shot section and the `DOC_AI_CHAT.md` paragraph state the
  streaming and the options.
- `./sync` for the `wb-fastr` target, then this repo's floor.

**Not in this step.** The proxy; any consumer in this repo.

**Gates.** Panther's floor in the panther repo; this repo's floor after the
sync.

**Ends with.** The panther commits, then one sync commit here naming them in
its body.

### Step 3: Persistence, routes, the rules list and the builders (this repo)

**Surface.** `server/db/migrations/instance/228_hfa_verification.sql` (new),
`server/db/instance/_main_database.sql`,
`server/db/instance/_main_database_types.ts`,
`server/db/instance/hfa_verification.ts` (new), `server/db/instance/mod.ts`,
`server/db/instance/instance.ts`, `lib/hfa_indicator_guidance.ts` (new, the
guidance moved from `client/src/components/data/hfa/indicators/ai/instructions.ts`,
deleted), `client/src/components/data/hfa/indicators/ai/mod.ts`,
`client/src/components/data/hfa/indicators/ai/editor_tools.ts`,
`client/src/components/data/hfa/indicators/mod.ts`,
`client/src/components/data/hfa/indicators/manager.tsx`,
`client/src/components/data/hfa/indicators/indicator_code_editor.tsx`,
`client/src/components/instance/copilot/ai_views.ts`,
`client/src/components/instance/copilot/mod.ts`,
`client/src/components/instance/copilot/build_system_prompt.ts`,
`lib/types/hfa_types.ts`, `lib/types/hfa_verification.ts` (new),
`lib/types/mod.ts`,
`lib/hfa_verification_rules.ts` (new),
`lib/hfa_verification.ts` (new), `lib/ai_tools/format_hfa_indicators_for_ai.ts`,
`lib/mod.ts`, `lib/types/instance_sse.ts`,
`lib/api-routes/instance/hfa_verification.ts` (new), `lib/api-routes/combined.ts`,
`server/routes/instance/hfa_verification.ts` (new), `main.ts`,
`client/src/state/instance/t1_store.ts`, `client/src/state/instance/t1_sse.tsx`,
`client/src/state/instance/t2_indicators.ts`,
`server/tests/hfa_verification_test.ts` (new),
`server/tests/permission_matrix_test.ts`, SYSTEM_03, SYSTEM_05, SYSTEM_13,
`PROTOCOL_APP_STATE.md`.

**Deliverable.**

- The two tables of §2 in the migration and the base schema, idempotent; the
  config key's reader and writer in the DB layer.
- `lib/hfa_verification_rules.ts`: `HFA_VERIFICATION_RULES` as §2 lists it
  with `field`, the `quoted_value` entry commented out with its reason,
  `HFA_VERIFICATION_RULE_GROUPS` and the severity labels, and the derived
  `HFA_VERIFICATION_MODEL_RULE_IDS`, `HfaVerificationRuleId`,
  `HfaVerificationRuleGroup`, `HfaVerificationSeverity`,
  `HfaVerificationField` and `hfaVerificationRule(id)`.
- `lib/types/hfa_verification.ts`: `HfaIndicatorVerification`,
  `HfaVerificationFinding` (with `rule: HfaVerificationRuleId`),
  `HfaVerificationResult` (one indicator's hash, model and findings as the
  save takes them) and `HfaVerificationRows` (the GET's shape: rows, findings,
  rules off).
- `HfaIndicatorEditorRound`, `HfaIndicatorEditorDraft` and
  `HfaIndicatorEditorPatch` move from
  [ai_views.ts:374-408](client/src/components/instance/copilot/ai_views.ts#L374-L408)
  to `lib/types/hfa_types.ts`, exported from `lib/mod.ts`; `ai_views.ts`,
  `copilot/mod.ts`, `editor_tools.ts` and the editor import them from lib,
  because lib cannot import client code and `fixToPatch` returns the patch.
- `lib/hfa_indicator_guidance.ts` holds `getHfaIndicatorsGuidance` unchanged;
  the manager, the code editor and the copilot's HFA tools read it from lib.
- `lib/ai_tools/format_hfa_indicators_for_ai.ts` gains
  `createHfaIndicatorDetailsFormatter(input)` returning
  `(ids: string[]) => string` over one index; `formatHfaIndicatorDetailsForAI`
  calls it.
- `lib/hfa_verification.ts`: `hfaVerificationOutputSchema`;
  `hfaFixOutputSchema` (`shortLabel`, `definition`, `type`, `aggregation`,
  `categoryId`, `subCategoryId`, `serviceCategoryIds`, `variantGroupId`,
  `code` (rounds with `code` and `filterCode`) and `variantCode`, each
  nullable, plus `note`); `buildHfaVerificationBlocks(read, language)`
  returning the instruction block and the context block;
  `buildHfaVerificationMessages(read, dismissedByIndicator)` returning, per
  indicator, the sent message and the hashed message (built without display
  rows) over one formatter; `hfaVerificationInputHash(instructionBlock,
  hashedMessage)` over `crypto.subtle`; `buildHfaFixMessage(read,
  indicatorId, findings)`, each finding with its rule's text;
  `fixToPatch(output)` returning an `HfaIndicatorEditorPatch` with every null
  field absent.
- The DB layer: `getHfaVerification`, `saveHfaIndicatorVerifications` (the
  transaction of §2 over an array), `setHfaVerificationFindingsDismissed`
  (bulk; `dismissed_at` now or null, `dismissed_by` the caller or null),
  `getHfaVerificationRulesOff`, `setHfaVerificationRulesOff`,
  `getHfaVerificationVersion` with the terms of §2.
- The four routes, their rows in `EXPECTED` of the permission matrix test,
  the router mounted in `main.ts` beside `routesHfaIndicators`
  ([main.ts:168](main.ts#L168)).
- `InstanceIndicatorsSummary` and the T1 store carry `hfaVerificationVersion`;
  the three write routes notify; `getHfaVerificationFromCacheOrFetch(version)`
  in `t2_indicators.ts` on the pattern of
  [t2_indicators.ts:38-57](client/src/state/instance/t2_indicators.ts#L38-L57).
- `server/tests/hfa_verification_test.ts` pins: rule ids are unique and every
  rule has en, fr and pt text and a field, and every group a label; the
  instruction block names every model rule, no app rule, and the
  one-per-rule-and-round line; the output schema accepts the §2 shape and
  rejects an app rule id and an unknown id; the fix schema rejects a missing
  `note`; the hash is stable and ignores the dismissed section and the display
  rows; the sent message ends with the dismissed section when there are
  dismissed findings and has none otherwise; two indicators of one snapshot
  get a byte-identical context block; the save writes several results in one
  transaction, drops a round that is not a time point and keeps the rest,
  merges two returned findings of one rule and round into one, suppresses an
  equal round and a null dismissed round against a returned round, and does
  not suppress a dismissed round against a returned null; an undismiss changes
  `getHfaVerificationVersion`; `fixToPatch` leaves nulls absent and carries
  rounds and variant rows.
- SYSTEM_05 gains a section "HFA indicator verification" (the rules list,
  tables, the config key, routes, the stamp, the blocks, the hash, the save
  transaction, the ringfence); SYSTEM_03's catalogue names the summary's new
  field; SYSTEM_13's HFA paragraph says the verification is S5's, uses the
  proxy and no chat, and names the editor types' new home; the manifests claim
  every new file.

**Not in this step.** The manager, the editor, the runner, the proxy client's
move.

**Gates.** The floor, `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Several commits: the guidance's move to lib; the editor types'
move to lib; the rules list; the tables, DB layer and routes; the stamp, the
T2 cache and the docs. Each green.

### Step 4: The manager: Verify, the Findings column and the rules modal (this repo)

**Surface.** `client/src/components/_shared/ai_proxy_client.ts` (new),
`client/src/components/_shared/mod.ts`,
`client/src/components/instance/copilot/ai_configs/defaults.ts`,
`client/src/components/instance/copilot/ai_configs/mod.ts`,
`client/src/components/instance/copilot/mod.ts`,
`client/src/components/instance/copilot/panel.tsx`,
`client/src/components/instance/copilot/debug_api.ts`,
`client/src/components/data/hfa/indicators/_shared/read_input.ts` (new),
`client/src/components/data/hfa/indicators/_shared/mod.ts` (new),
`client/src/components/data/hfa/indicators/ai/tools.ts`,
`client/src/components/data/hfa/indicators/ai/editor_tools.ts`,
`client/src/components/data/hfa/indicators/verification/runner.ts` (new),
`client/src/components/data/hfa/indicators/verification/hashes.ts` (new),
`client/src/components/data/hfa/indicators/verification/rules_modal.tsx`
(new), `client/src/components/data/hfa/indicators/verification/mod.ts` (new),
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
  `tools.ts`, `editor_tools.ts` (which imports `loadDisplayRows`,
  [editor_tools.ts:22](client/src/components/data/hfa/indicators/ai/editor_tools.ts#L22))
  and the runner import them; the tools' behaviour is unchanged (ruling 16).
- `verification/runner.ts` and `verification/hashes.ts` as §2 describes them.
- The manager: the Verify button with its label, states and progress, Stop,
  the not-checked list and the stop error; "Verify all" and "Verification
  rules" in the actions menu; the Findings column with its values, sort and
  filter values; the hash effect and the state memo; every string a `t3`
  literal in en, fr and pt.
- `verification/rules_modal.tsx` as §2 describes it.
- SYSTEM_05's section describes the manager's additions, the runner and the
  hash map; SYSTEM_13 names the proxy client's new home and the `_shared/` the
  HFA tools now read.

**Not in this step.** The editor.

**Gates.** The floor.

**Ends with.** Several commits: the runner and the manager's Verify controls,
with the proxy client's move and the `_shared/` move; the Findings column; the
rules modal. Each green.

### Step 5: The editor: findings beside fields, Dismiss, Verify, Draft a fix (this repo)

**Surface.** `client/src/components/data/hfa/indicators/indicator_code_editor.tsx`,
`client/src/components/data/hfa/indicators/_shared/indicator_patch.ts` (new),
`client/src/components/data/hfa/indicators/_shared/mod.ts`,
`client/src/components/data/hfa/indicators/ai/editor_tools.ts`,
`client/src/components/data/hfa/indicators/verification/field_findings.tsx`
(new), `client/src/components/data/hfa/indicators/verification/draft_fix.ts`
(new), `client/src/components/data/hfa/indicators/verification/mod.ts`,
SYSTEM_05.

**Deliverable.**

- `indicators/_shared/indicator_patch.ts`: `validateHfaIndicatorPatch(patch,
  draft, taxonomy, rounds)` returning `{ patch } | { error: string }`, lifted
  from `validatePatch`
  ([editor_tools.ts:124](client/src/components/data/hfa/indicators/ai/editor_tools.ts#L124))
  with each throw turned into the returned error; `editor_tools.ts` wraps the
  error in `AIToolFailure` and behaves as before (ruling 16); `draft_fix.ts`
  shows it in the banner.
- `verification/field_findings.tsx`: the block the editor renders beside a
  field: the field's open findings (severity, rule text, message, suggestion,
  Dismiss) and its dismissed findings collapsed with Undo.
- `verification/draft_fix.ts`: the fresh read, the abortable fix call, the
  validation and the banner's state (the note, the changed fields with their
  previous values, the reason when nothing was applied).
- The editor: reads the T2 rows and the state memo; renders `field_findings`
  beside each field the rules list names, round-bound findings under the
  selected round, the round buttons' open counts, the saved-version and
  changed lines; the Verify button; the Draft a fix button with its clean-draft
  gate, the banner, Discard; `applyDraft` takes the validated patch; closing
  the editor aborts the call; every string a `t3` literal in en, fr and pt.
- SYSTEM_05's section describes the editor's additions and the plan's residue.

**Not in this step.** Anything of §5.

**Gates.** The floor.

**Ends with.** Several commits, each green; the close commit deletes this file.

## §5 Out of scope

- A server-side worker or any server-side caller of Anthropic.
- A column on `ai_usage_logs` telling the two surfaces apart (ruling 13).
- HMIS indicators.
- A history of past verifications: one row per indicator, the latest.
- Persisting a draft fix.
- A page, tab or table of findings; findings show only where issues show.
- Applying draft fixes to several indicators in one action.
- A copilot view for the verification.
- Verifying the taxonomy or the survey dictionary themselves.
- Exposing verifications or findings on `/mcp` or to the copilot's tools.
- Help buttons on the new controls (the rules modal shows the rules list, not
  help).
- The `quoted_value` check in the status core: its rule is listed, commented
  out (ruling 2).

## §6 Log

- Step 1: built without a design system, because the account lists none; the
  mockup takes panther's light-scheme tokens from
  `panther/_303_components/_fixed.css` directly.
- Step 1: (c) is two artboards, the manager with the Findings column and the
  manager with the actions menu open, because the open menu covers that column.
- Step 1: the mockup draws the heading bar, toolbar and table header
  approximately. Steps 4 and 5 use the app's own `HeadingBar`, `Button` and
  `Input`, which win wherever they differ from it.
- Step 2: the tool runner's requests stream too (`stream: true` on
  `toolRunner`, each reply settled with `finalMessage()`), because the SDK's
  ten-minute rule refuses its non-streaming requests at the default
  `max_tokens` exactly as it refuses the tool-less request; proven with a stub
  fetch.
- Step 2: the committed test `tests/ai_one_shot_test.ts` left the Surface and
  the Deliverable on Tim's word (2026-11-03). `deno test` cannot load
  `_305_ai`: its `deps.ts` evaluates the UI kit, whose Solid JSX compiles to a
  `solid-js/jsx-runtime` that solid-js does not ship and whose vendored
  sortable calls `solid-js/web`'s Deno build at load, and the test task grants
  no env access, which the SDK client reads at construction. The test and the
  SDK proof script live in panther's `testing_sandbox/ai_one_shot/`.
- Step 2: the sync carried panther's `CanvasRenderContext` constructor change,
  so `text_geometry.ts` passes `createCanvasBrowser` as every browser call site
  in panther does; without the change the client typecheck is red after the
  sync. The file joined the step's Surface on Tim's word (2026-11-03).
- After step 2: the page design (a full-screen page with its own indicator
  table, three triage states, a proposals view and a copilot view) was
  replaced by the inline design of §2 (Tim, 2026-11-03). Three independent
  deciders chose it over the page; the defects they found in it are folded in:
  the hash without the model id, batched saves, the editor's Verify, the
  patch validation, the clean-draft gate, the fresh read for Draft a fix, the
  time point foreign key, the asynchronous hash map. Steps 3 to 6 became steps
  3 to 5. Step 2's `model` on `CallAIResult` is the response's model, which
  the verification row stores (ruling 4).
- Step 3: the Surface's barrels were corrected to the files the code registers
  in, `server/db/instance/mod.ts`, `lib/types/mod.ts` and
  `lib/api-routes/combined.ts` (Tim, 2026-11-03).
- Step 3: `build_system_prompt.ts` joined the Surface, because its comment
  named the guidance's file, which the move to lib deletes (Tim, 2026-11-03).
- Step 3: `HfaVerificationFinding.rule` is `HfaVerificationModelRuleId`, not
  `HfaVerificationRuleId`, because only a model rule has findings; the rules
  off are typed the same. `buildHfaVerificationInstructionBlock(language)` is
  exported beside `buildHfaVerificationBlocks`, because the manager's hashes
  need the instruction block and not the context block.
- Step 3: `PROTOCOL_APP_STATE.md` joined the Surface, because its T1 field
  table and T2 inventory list the indicator summary's stamps and the caches
  that key on them (Tim, 2026-11-03).
- Step 3: `getHfaVerificationVersion` also hashes the distinct rounds the
  findings name, because a round rename cascades into them and moves none of
  §2's terms.
- Step 4: `client/src/components/_shared/mod.ts` joined the Surface, because
  the structure lint lets another folder import `components/_shared/` only
  through its `mod.ts`, so the proxy client is exported there (Tim, 2026-11-03).
- Step 4: the proxy client's move, the `_shared/` move and the runner land in
  one commit with the manager's Verify controls, because the structure lint
  fails a `_shared/` file with one consuming child and a file nothing imports:
  the proxy client's second consumer is the runner, and the runner's importer
  is the manager.
- Step 4: the not-checked list and the stop error show above the table, beside
  the no-HFA-data notice, not under the toolbar, because panther's `Table` has
  no slot between its toolbar and its rows.
- Step 4: the runner's progress, not-checked list and stop error are one
  signal, `hfaVerificationRun`, not three, because they describe one run and
  `validate_protocols` flags a bare error signal.
- Step 4: Verify is hidden, not disabled, without `can_configure_data`, because
  every control in the indicators toolbar's slot renders inside that gate.
