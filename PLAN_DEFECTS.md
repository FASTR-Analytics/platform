# PLAN_DEFECTS: defects found and not fixed

Each line is a defect a session found while doing other work, whose fix no plan owns (panther/protocols/PROTOCOL_ALL_PLANS.md, "Findings not fixed"): the file, the line, the defect and the edit.

## Slide text

Lines are of cfb7c3562.

- `lib/slide_text_offsets.ts` `slideDeleteRange`: deleting from the start of a code span's text to the end of its list item, when another item follows, leaves the span's empty fence, which draws as two backticks. The space kept before the span is expected as a gap before the next item, which markdown trims, so no candidate verifies and the unverified kept-syntax document applies. Edit: when the range holds no break or block structure, `expected` drops whitespace left at the end of a unit (a fuzz of 3,408 caret-stop edits then leaves no leak).
- `lib/slide_text_offsets.ts` `slideInsertText`: a paste holding a blank line, typed into bold, italic or link text, leaks the delimiters ("**ba\n\nbold**" draws `**ba` and `bold**`), because no candidate can close the style before the break, so the raw paste applies. Edit: add a candidate that rebuilds the touched lines from their drawn chars with the typed lines inserted at the caret, each line serialized on its own, which gives "**ba**\n\n**bold**" and verifies against today's `expected`.
