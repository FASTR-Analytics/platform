# PLAN_DEFECTS: defects found and not fixed

Each line is a defect a session found while doing other work, whose fix no plan owns (panther/protocols/PROTOCOL_ALL_PLANS.md, "Findings not fixed"): the file, the line, the defect and the edit.

## Slide text

Lines are of 4791184c9.

- `lib/slide_text_offsets.ts` `alignItem`: inside a code span that runs over two source lines, everything after the line break is read as invisible markup, so a backtick typed there is escaped and draws a `\` (49 times in a fuzz of 4,777 inserts). Edit: match the rendered space to the source newline inside a code span.
- `lib/slide_text_offsets.ts` `slideInsertText`: a `!` typed directly before a link makes a lone image, which slide text cannot draw, so the insert is refused (before the table and image guard, the link's text vanished). Edit: escape a typed `!` when the next character is `[`.
- `lib/slide_text_offsets.ts` `slideInsertText`: a multi-line paste into inline code is kept only if it makes no table, and its line breaks break the code span. Edit: paste line breaks into a code span as spaces, which is how a code span draws them.

## Shared editing

Lines are of 16471444e.

- `client/src/components/products/visualization/visualization.tsx` `bindingFor` (353) and the editor's `collabBinding` prop (588): each call builds a new `localOrigin`, and the prop is an expression that calls it on every read. The figure editor reads the prop once for its undo manager's tracked origin and again for each write, so the writes carry an origin the manager does not track, and undo and redo record nothing in a visualization. Edit: build the binding once per session, so one origin serves the undo manager and the writes.

## AI tools

- `lib` `LayoutSpecSchema`: a one-cell row's span is silently replaced by 12. Edit: the schema refuses a one-cell row with a span other than 12.
- `lib` `LayoutSpecSchema` and `client/src/components/products/copilot/slide_ai/layout_spec_helpers.ts` `TOTAL_COLUMNS`: the 12 columns are written twice. Edit: one constant in `lib`, read by both.
