# PLAN_DEFECTS: defects found and not fixed

Each line is a defect a session found while doing other work, whose fix no plan owns (panther/protocols/PROTOCOL_ALL_PLANS.md, "Findings not fixed"): the file, the line, the defect and the edit.

## Slide text

Lines are of 0a69bd980.

- `lib/slide_text_offsets.ts` `slideDeleteRange`: deleting the last text before a line break or a unit's end leaves the syntax around it, which draws as text: "x **k**\ny" with `k` deleted gives `x ****`, and a code span's text deleted to the end of its list item leaves its empty fence. The space kept before it is expected as a gap, which markdown trims there, so no candidate verifies and the unverified kept-syntax document applies. Edit: when the range holds no break or block structure, `expected` drops whitespace whose next kept char is past a break or in another unit (this gives `x \ny`, and a fuzz of 3,408 caret-stop edits then leaves no leak).
- `lib/slide_text_offsets.ts` `slideInsertText`: a paste holding a blank line, typed into bold, italic or link text, leaks the delimiters ("**ba\n\nbold**" draws `**ba` and `bold**`), because no candidate can close the style before the break, so the raw paste applies. Strictly inside a code span a typed line break goes in as a space for the same reason, so Enter there draws no break. Edit: add a candidate that rebuilds the touched lines from their drawn chars with the typed lines inserted at the caret, each line serialized on its own, which gives "**ba**\n\n**bold**" and verifies against today's `expected`, and with it type line breaks into code as breaks.
- `lib/slide_text_offsets.ts` `slideInsertText`: a space typed at the start of a line that begins with emphasis goes inside the opener, which then draws (`x\n** k** ab`). Markdown trims a space there, so a candidate that keeps it drawn cannot verify and the raw insert applies. Edit: `added` drops typed whitespace at a line start (no `pv`, or `pv` separated), which gives `x\n **k** ab`; the repo tests pass with it.
- `lib/slide_text_offsets.ts` `slideInsertText`: at the caret stop between an escape's `\` and the char it escapes, which is the only stop at a line start after `<br>`, typed text splits the escape (`x<br>\*y` with `a` typed gives `x<br>\a*y`, drawing the `\`), and `a` walks back into the `<br>` tag. Edit: when `src[pos - 1]` is an inline-syntax `\` and `kind[pos]` is visible, `pos - 1` is the first candidate position, which gives `x<br>a\*y`; the repo tests pass with it.
- `lib/slide_text_offsets.ts` `slideInsertText`: a line break typed on a blockquote line goes in without the line's `>`, so the text after it leaves the quote and a span crossing the quote's lines breaks (`> q *a\n> b* c` with Enter before `q` gives `> \nq *a\n> b* c`, drawing both `*`). Edit: outside a code span, each typed line break carries the caret line's quote prefix, which gives `> \n> q *a\n> b* c`; the repo tests pass with it, and the insert fuzz's one new failure is a blank-line paste, the record above.

## AI tools

Lines are of 649a44f9d.

- `client/src/components/products/copilot/slide_ai/layout_spec_helpers.ts` `normalizeSpans` (89): a row with fewer free columns than cells without a span (`11` beside two spanless cells) gets a span of 0, which the stored layout schema refuses (`.min(1)`). Edit: the second refine below refuses it at parse.
- `client/src/components/products/copilot/slide_ai/layout_spec_helpers.ts` `normalizeSpans` (78-94): a row whose spans miss the column total throws a plain `Error`, which the tool engine reports as a crash (`expected: false`), though it is a structure rule that PROTOCOL_APP_AI_TOOLS puts in the schema. Edit: `LayoutSpecSchema`'s row gets a second refine, that a full row's spans sum to `_GLOBAL_LAYOUT_COLUMNS` and a row with spanless cells leaves at least one column for each, and both throws in `normalizeSpans` go.
