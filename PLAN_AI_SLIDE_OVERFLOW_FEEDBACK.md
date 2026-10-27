# PLAN: AI slide overflow feedback

Seen on the Somalia instance (2.3.0) during the investor-demo rehearsal of 27
Oct 2026: the slide copilot writes a content slide whose layout overflows the
page and tells the model it succeeded, so the deck shows a "Layout overflow"
badge the model never hears about.

**Next step: Do 1.** Branch `main`. Repo: this app. Read first: `CLAUDE.md`,
`SYSTEMS.md`, [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md). Start
when: nothing; the plan stands alone.

## §0 How to work this plan

- The plan file is `PLAN_AI_SLIDE_OVERFLOW_FEEDBACK.md`; the instruction is "Do
  the next step of PLAN_AI_SLIDE_OVERFLOW_FEEDBACK.md".
- Branch `main`, as [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds it.
- The floor is the one PROTOCOL_APP_PLANS.md names.
- The log is §6. A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`,
  `SYSTEM_13_ai_assistant.md`, §2 and §3, its own §4 section, §6.
- The last step is 1.
- Vocabulary. _Overflow_: the page-level `score.overflow` (0 or 1) of the best
  layout the page optimizer returns (`panther/_008_layouter/optimizer.ts:43`,
  set at `:117`).

## §1 The problem

[convert_ai_input_to_slide.ts:126-139](client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts#L126-L139)
runs `optimizePageLayout` and keeps `result.best.layout`; `result.best.score` is
dropped, overflow with it. `create_slide`
([slides.tsx:136-156](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L136-L156))
and `replace_slide`
([slides.tsx:192](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L192))
write the slide and return "Created slide …" with no word on fit. The deck's
page holder shows the badge
([page_holder.tsx:631](panther/_303_components/charts/page_holder.tsx#L631))
from the same `overflow` flag, so the user sees what the model cannot. The deck
workflow in the system prompt
([build_system_prompt.ts:284-294](client/src/components/instance/copilot/build_system_prompt.ts#L284-L294))
never says that a `from_metric` block on a multi-indicator metric must filter
its indicators. Observed: a four-slide deck whose data-quality slide carried a
reporting-completeness figure over every indicator in the package, one panel
each, the text column squeezed to one word per line, the badge on, and the
model's final message reporting the slide as done.

## §2 The model

`convertAiInputToSlide` returns `{ slide, overflow }`. `create_slide` and
`replace_slide` still write the slide, and when `overflow` is true their result
ends with one sentence that names the figure block ids on the slide and the fix:
filter the indicator dimension to the indicators the slide's text names, or pick
a preset with fewer rows, via `update_figure`. The deck workflow in the system
prompt states the filtering rule before the model builds a block.

## §3 Rulings

1. _(proposed)_ Overflow is reported, not thrown. The slide is written as the
   model asked, the user can fix it by hand, and the model gets one line to act
   on in the same turn. Throwing would lose the slide and the model's work.
2. _(proposed)_ The feedback names figure blocks only. Text blocks autofit, so
   when a page overflows the figure is the cause; a slide with no figure block
   reports the overflow without a block list.
3. Nothing ships. Tim deploys.

## §4 Steps

### Step 1: Overflow reaches the model

**Surface.**
`client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts`,
`client/src/components/products/copilot/ai_tools/tools/slides.tsx`,
`client/src/components/products/copilot/ai_tools/tools/drafts.tsx`,
`client/src/components/products/copilot/ai_tools/tools/draft_slide_preview.tsx`,
`client/src/components/instance/copilot/build_system_prompt.ts`,
`SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- `convertAiInputToSlide` returns `{ slide: Slide; overflow: boolean }` with
  `overflow` read from `result.best.score.overflow === 1`. Its four callers
  (`slides.tsx:136`, `slides.tsx:192`, `drafts.tsx:77`,
  `draft_slide_preview.tsx:169`) destructure it; the draft tools ignore
  `overflow`.
- `create_slide` and `replace_slide`, when `overflow` is true, append to their
  result:
  `The slide's layout overflows the page. Figure block(s) <ids>: filter
  the indicator dimension to the indicators this slide names, or choose a preset
  with fewer rows, then update_figure.`
  A slide with no figure block appends the first sentence only. The block ids
  are the ones `get_slide` would show.
- The deck workflow in `build_system_prompt.ts` gains a fifth item: a
  `from_metric` block on a content slide filters its indicator dimension to the
  indicators the slide's text names; an unfiltered multi-indicator metric draws
  one panel per indicator and overflows the page.
- `SYSTEM_13_ai_assistant.md` states, where it describes `create_slide` and
  `replace_slide`, that the result carries the overflow sentence and where the
  flag comes from.

**Not in this step.** `update_slide` (it edits blocks in place and does not
re-run the optimizer); the draft preview card's own text; any change to the
optimizer or to panther.

**Gates.** The floor.

**Ends with.** One commit, which, this being the last step, deletes this file.

## §5 Out of scope

- The `figure:<id>` fetch error the report editor's live preview logs for every
  embed: that is Report Forge, Nick's.
- The one `wss://…/collab` "Close received after close" console error seen in
  the same session: the client's ping-deadline close
  ([collab.ts:1252](client/src/state/instance/collab.ts#L1252)) racing the
  server's own close frame. The socket reconnected and the Live indicator stayed
  on.
- Model behaviour that the demo prompts steer in wording: asking to confirm an
  outline before drafting a report, and proposing a figure insertion when asked
  a question inside a report.
- The optimizer's scoring and the page holder badge in panther.

## §6 Log

(empty)
