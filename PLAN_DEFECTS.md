# PLAN_DEFECTS: defects found and not fixed

Each line is a defect a session found while doing other work, whose fix no plan owns (panther/protocols/PROTOCOL_ALL_PLANS.md, "Findings not fixed"): the file, the line, the defect and the edit.

## Slide text

Lines are of 0a69bd980.

- `lib/slide_text_offsets.ts` `slideDeleteRange`: deleting the last text before a line break or a unit's end leaves the syntax around it, which draws as text: "x **k**\ny" with `k` deleted gives `x ****`, and a code span's text deleted to the end of its list item leaves its empty fence. The space kept before it is expected as a gap, which markdown trims there, so no candidate verifies and the unverified kept-syntax document applies. Edit: when the range holds no break or block structure, `expected` drops whitespace whose next kept char is past a break or in another unit (this gives `x \ny`, and a fuzz of 3,408 caret-stop edits then leaves no leak).
- `lib/slide_text_offsets.ts` `slideInsertText`: a space typed at the start of a line that begins with emphasis goes inside the opener, which then draws (`x\n** k** ab`). Markdown trims a space there, so a candidate that keeps it drawn cannot verify and the raw insert applies. Edit: `added` drops typed whitespace at a line start (no `pv`, or `pv` separated), which gives `x\n **k** ab`; the repo tests pass with it.
- `lib/slide_text_offsets.ts` `slideInsertText`: a line break typed on a blockquote line goes in without the line's `>`, so the text after it leaves the quote and a span crossing the quote's lines breaks (`> q *a\n> b* c` with Enter before `q` gives `> \nq *a\n> b* c`, drawing both `*`). Edit: outside a code span, each typed line break carries the caret line's quote prefix, which gives `> \n> q *a\n> b* c`; the repo tests pass with it.
