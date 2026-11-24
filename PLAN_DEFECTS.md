# PLAN_DEFECTS: defects found and not fixed

Each line is a defect a session found while doing other work, whose fix no plan owns (panther/protocols/PROTOCOL_ALL_PLANS.md, "Findings not fixed"): the file, the line, the defect and the edit.

## Slide text

Lines are of e08a290fa.

- `lib/slide_text_offsets.ts` `slideDeleteRange`: deleting the last text before a line break or a unit's end leaves the syntax around it, which draws as text: "x **k**\ny" with `k` deleted gives `x ****`. The space kept before it is expected as a gap, which markdown trims there, so no candidate verifies and the unverified kept-syntax document applies. Edit: when the range holds no break or block structure, `expected` drops whitespace whose next kept char is past a break or in another unit.
- `lib/slide_text_offsets.ts` `slideInsertText`: a line break typed on a blockquote line goes in without the line's `>`, so the text after it leaves the quote and a span crossing the quote's lines breaks (`> q *a\n> b* c` with Enter before `q` gives `> \nq *a\n> b* c`, drawing both `*`). Edit: outside a code span, each typed line break carries the caret line's quote prefix.

## Roll-up

Lines are of e0a60e66b.

- `lib/rollup.ts:103-113` `isRollupEligibleResultsValue`, `lib/get_fetch_config_from_po.ts:99-103`: the app applies a metric's one function to every value prop, so it adds the interval bounds `ppi_lwr` and `ppi_upr` of the four band metrics (`m11-01-01` to `m11-01-04`) wherever it adds their rows. The module says the bounds "do not add up from a finer level" (`wb-fastr-modules/m011/_band_chart.ts:6-9`), which is why it ships one metric per admin level. Two cases: a roll-up row on `m11-01-02`, `m11-01-03` or `m11-01-04`, and any of the four grouped by quarter or year, or pooled over months. Effect: the band on that row is too wide, so a real deficit or surplus draws as normal. Edit, in `wb-fastr-modules` and here together: a metric names the value props that add (`observed`, `expected`); the roll-up gate and the fetch read it; a roll-up row or a pooled row leaves the others blank.

## Slide AI and overflow

Lines are of 19ec5328a, found by testing the copilot's slides against about twenty overflow cases (2026-11-24). What overflows and how panther reports it is panther's `PLAN_30_OVERFLOW_REPORTING.md`; these are the app's.

- `client/src/components/products/copilot/slide_ai/get_deck_summary.ts:43-44`: the deck outline repeats each broken slide's whole overflow paragraph, so a deck with many broken slides gives an outline mostly of repeats. Edit: the outline gives one line per broken slide (its axis and how much more room it needs), and the slide's own read gives the paragraph.
- `client/src/components/products/copilot/slide_ai/`: a slide created and the deck outline read in the same parallel batch of tool calls gave an outline without the new slide (78 slides; the slide read found it after). Edit: find whether the outline reads a cache the write has not yet updated, and make a write visible to every read that starts after it.
- `client/src/components/products/copilot/slide_ai/`: one update of a figure's footnote was refused with "expected object, received string at patch", and the same call succeeded when retried. Edit: reproduce with the logged call; if the model sent `patch` as a JSON string, the tool's description says it is an object, or the parse takes the string form.
- `client/src/components/products/copilot/slide_ai/`: overflow is learnt only by writing a slide to the deck. Edit: the slide tools take a check that measures a slide without writing it, or the description says that `show_draft_slide_to_user` does, once it is tested.
