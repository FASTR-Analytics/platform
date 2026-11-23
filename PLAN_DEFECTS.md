# PLAN_DEFECTS: defects found and not fixed

Each line is a defect a session found while doing other work, whose fix no plan owns (panther/protocols/PROTOCOL_ALL_PLANS.md, "Findings not fixed"): the file, the line, the defect and the edit.

## Slide text

Lines are of e08a290fa.

- `lib/slide_text_offsets.ts` `slideDeleteRange`: deleting the last text before a line break or a unit's end leaves the syntax around it, which draws as text: "x **k**\ny" with `k` deleted gives `x ****`. The space kept before it is expected as a gap, which markdown trims there, so no candidate verifies and the unverified kept-syntax document applies. Edit: when the range holds no break or block structure, `expected` drops whitespace whose next kept char is past a break or in another unit.
- `lib/slide_text_offsets.ts` `slideInsertText`: a space typed at the start of a line that begins with emphasis goes inside the opener, which then draws (`x\n** k** ab`). Markdown trims a space there, so a candidate that keeps it drawn cannot verify and the raw insert applies. Edit: `added` drops typed whitespace at a line start (no `pv`, or `pv` separated).
- `lib/slide_text_offsets.ts` `slideInsertText`: a line break typed on a blockquote line goes in without the line's `>`, so the text after it leaves the quote and a span crossing the quote's lines breaks (`> q *a\n> b* c` with Enter before `q` gives `> \nq *a\n> b* c`, drawing both `*`). Edit: outside a code span, each typed line break carries the caret line's quote prefix.

## Roll-up

Lines are of e0a60e66b.

- `lib/rollup.ts:103-113` `isRollupEligibleResultsValue`, `lib/get_fetch_config_from_po.ts:99-103`: the app applies a metric's one function to every value prop, so it adds the interval bounds `ppi_lwr` and `ppi_upr` of the four band metrics (`m11-01-01` to `m11-01-04`) wherever it adds their rows. The module says the bounds "do not add up from a finer level" (`wb-fastr-modules/m011/_band_chart.ts:6-9`), which is why it ships one metric per admin level. Two cases: a roll-up row on `m11-01-02`, `m11-01-03` or `m11-01-04`, and any of the four grouped by quarter or year, or pooled over months. Effect: the band on that row is too wide, so a real deficit or surplus draws as normal. Edit, in `wb-fastr-modules` and here together: a metric names the value props that add (`observed`, `expected`); the roll-up gate and the fetch read it; a roll-up row or a pooled row leaves the others blank.
