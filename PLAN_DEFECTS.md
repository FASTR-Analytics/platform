# PLAN_DEFECTS: defects found and not fixed

Each line is a defect a session found while doing other work, whose fix no plan owns (panther/protocols/PROTOCOL_ALL_PLANS.md, "Findings not fixed"): the file, the line, the defect and the edit.

## Slide text

Lines are of e08a290fa.

- `lib/slide_text_offsets.ts` `alignItem`: inside a code span that runs over two source lines, everything after the line break is read as invisible markup, so a backtick typed there is escaped and draws a `\` (49 times in a fuzz of 4,777 inserts). Edit: match the rendered space to the source newline inside a code span.
- `lib/slide_text_offsets.ts` `slideInsertText`: a `!` typed directly before a link makes a lone image, which slide text cannot draw, so the insert is refused (before the table and image guard, the link's text vanished). Edit: escape a typed `!` when the next character is `[`.
- `lib/slide_text_offsets.ts` `slideInsertText`: a multi-line paste into inline code is kept only if it makes no table, and its line breaks break the code span. Edit: paste line breaks into a code span as spaces, which is how a code span draws them.
- `lib/slide_text_offsets.ts` `slideDeleteRange`: deleting the last text before a line break or a unit's end leaves the syntax around it, which draws as text: "x **k**\ny" with `k` deleted gives `x ****`. The space kept before it is expected as a gap, which markdown trims there, so no candidate verifies and the unverified kept-syntax document applies. Edit: when the range holds no break or block structure, `expected` drops whitespace whose next kept char is past a break or in another unit.
- `lib/slide_text_offsets.ts` `slideInsertText`: a space typed at the start of a line that begins with emphasis goes inside the opener, which then draws (`x\n** k** ab`). Markdown trims a space there, so a candidate that keeps it drawn cannot verify and the raw insert applies. Edit: `added` drops typed whitespace at a line start (no `pv`, or `pv` separated).
- `lib/slide_text_offsets.ts` `slideInsertText`: a line break typed on a blockquote line goes in without the line's `>`, so the text after it leaves the quote and a span crossing the quote's lines breaks (`> q *a\n> b* c` with Enter before `q` gives `> \nq *a\n> b* c`, drawing both `*`). Edit: outside a code span, each typed line break carries the caret line's quote prefix.

## Roll-up

Lines are of e0a60e66b.

- `lib/rollup.ts:106-116` `isRollupEligibleResultsValue`: every SUM metric can be rolled up, whatever its value props. `m11-01-02`, `m11-01-03` and `m11-01-04` are SUM metrics whose value props include the interval bounds `ppi_lwr` and `ppi_upr`, so their roll-up row adds the areas' bounds, and the sum of interval bounds is not the interval of the sum. The same sum is made wherever a figure of one of them pools a dimension, since the fetch applies the metric's one function to every value prop (`lib/get_fetch_config_from_po.ts:99-103`). Edit: a metric names the value props that add (`observed`, `expected`), and a roll-up row or a pooled row leaves the others blank.
