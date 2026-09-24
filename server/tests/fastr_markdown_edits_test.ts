import { assert, assertEquals } from "@std/assert";
import {
  applyStepsChildAction,
  applyTilesChildAction,
  cardTilesSnippet,
  columnsSnippet,
  applyTableCellAction,
  deleteFastrBlockEdit,
  enterBesideRegionEdit,
  fastrRegionAtLine,
  insertBlockEdit,
  type EditResult,
  inlineMarkStateAt,
  insertLinkEdit,
  setHeadingLevelEdit,
  setInlineColorEdit,
  setInlineHighlightEdit,
  setInlineRoleEdit,
  setInlineSizeEdit,
  setInlineUnderlineEdit,
  statTilesSnippet,
  stepsChildInfo,
  stepsSnippet,
  tableSnippet,
  toggleInlineDelimiters,
  toggleLinePrefixEdit,
} from "../../lib/fastr_markdown_edits.ts";

// The toolbar dispatches every EditResult as ONE CodeMirror transaction, which
// requires the changes to be disjoint and ascending with pre-transaction
// offsets. Apply them the way CodeMirror does — back to front — so a test
// asserts on the text the user would actually see.
function apply(doc: string, r: EditResult): string {
  for (const c of [...r.changes].sort((a, b) => b.from - a.from)) {
    doc = doc.slice(0, c.from) + c.insert + doc.slice(c.to);
  }
  return doc;
}

function assertWellFormed(r: EditResult) {
  let prev = -1;
  for (const c of r.changes) {
    assert(c.from >= prev, `changes must ascend: ${c.from} after ${prev}`);
    assert(c.to >= c.from, "a change may not run backwards");
    prev = c.to;
  }
}

// ── Inline delimiters ────────────────────────────────────────────────────────

Deno.test("wrapping a selection puts the delimiters inside its whitespace", () => {
  // A double-click routinely takes the trailing space, and `** bold **` does
  // not render as bold — so the delimiters hug the words, not the selection.
  const doc = "Coverage rose sharply this year.";
  const r = toggleInlineDelimiters(doc, 8, 14, "**", "**");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage **rose** sharply this year.");
});

Deno.test("a second click unwraps what the first click wrapped", () => {
  const doc = "Coverage rose sharply.";
  const first = toggleInlineDelimiters(doc, 9, 13, "**", "**");
  const wrapped = apply(doc, first);
  assertEquals(wrapped, "Coverage **rose** sharply.");
  // The wrap leaves the words selected, which is the state the next click sees.
  const sel = first.selection!;
  const second = toggleInlineDelimiters(wrapped, sel.anchor, sel.head!, "**", "**");
  assertWellFormed(second);
  assertEquals(apply(wrapped, second), doc);
});

Deno.test("a selection that swallowed the delimiters still unwraps", () => {
  const doc = "Coverage **rose** sharply.";
  const r = toggleInlineDelimiters(doc, 9, 17, "**", "**");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage rose sharply.");
});

Deno.test("with no selection the word under the caret is wrapped", () => {
  const doc = "Coverage rose sharply.";
  const r = toggleInlineDelimiters(doc, 11, 11, "**", "**");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage **rose** sharply.");
});

Deno.test("a caret with no word nearby does nothing", () => {
  // Between the space and the period — nothing to style, so no invisible
  // `****` junk is inserted.
  const doc = "Coverage .";
  assertEquals(toggleInlineDelimiters(doc, 9, 9, "**", "**").changes.length, 0);
});

Deno.test("caret actions refuse structural lines instead of corrupting them", () => {
  // The caret is parked on the fence line whenever a block's chrome was
  // clicked — a stat tile, a callout title. Styling must be a no-op there.
  const doc = ":::stat{value=64% label=ANC4}\ntext";
  assertEquals(toggleInlineDelimiters(doc, 0, 0, "**", "**").changes.length, 0);
  assertEquals(setInlineSizeEdit(doc, 4, 4, 18).changes.length, 0);
  assertEquals(setInlineRoleEdit(doc, 4, 4, "danger").changes.length, 0);
  // An embed line is structure too.
  const embed = "![Cap](figure:abc){width=wide}\n";
  assertEquals(setInlineSizeEdit(embed, 3, 3, 18).changes.length, 0);
  // A table delimiter row has no words, only dashes.
  const table = "| A | B |\n| --- | --- |\n| a | b |";
  assertEquals(setInlineSizeEdit(table, 13, 13, 18).changes.length, 0);
});

Deno.test("inline styling never wraps a line's marker", () => {
  // The markers are hidden in the editor, so Home / triple-click / select-all
  // put them inside the selection unseen.
  const cases: [string, string][] = [
    ["# Big title", "# [Big title]{size=18}"],
    ["- item text", "- [item text]{size=18}"],
    ["1. item", "1. [item]{size=18}"],
    ["> quoted", "> [quoted]{size=18}"],
    ["- [ ] todo", "- [ ] [todo]{size=18}"],
    ["  * nested", "  * [nested]{size=18}"],
  ];
  for (const [doc, expected] of cases) {
    const r = setInlineSizeEdit(doc, 0, doc.length, 18);
    assertWellFormed(r);
    assertEquals(apply(doc, r), expected, doc);
  }
  // Bold over a whole heading line.
  const h = "# Big title";
  assertEquals(apply(h, toggleInlineDelimiters(h, 0, h.length, "**", "**")), "# **Big title**");
  // Select-all across mixed lines styles each line's content only.
  const doc = "# Title\n- one\n- two\nplain";
  const r = setInlineSizeEdit(doc, 0, doc.length, 14);
  assertWellFormed(r);
  assertEquals(
    apply(doc, r),
    "# [Title]{size=14}\n- [one]{size=14}\n- [two]{size=14}\n[plain]{size=14}",
  );
  // A caret inside an ordered marker has no word to wrap.
  assertEquals(setInlineSizeEdit("1. item", 0, 0, 18).changes.length, 0);
});

Deno.test("a caret inside an existing pair removes it", () => {
  const doc = "Coverage **rose** sharply.";
  const r = toggleInlineDelimiters(doc, 13, 13, "**", "**");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage rose sharply.");
});

// ── Role marks ───────────────────────────────────────────────────────────────

Deno.test("a role wraps the selection and re-selects the phrase", () => {
  const doc = "Coverage fell 12 points this quarter.";
  const r = setInlineRoleEdit(doc, 9, 23, "danger");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage [fell 12 points]{.danger} this quarter.");
});

Deno.test("picking a different role rewrites in place, not around", () => {
  const doc = "Coverage [fell 12 points]{.danger} this quarter.";
  // 10..24 is the label: a selection of the WHOLE phrase (or a caret in it)
  // patches the mark it is in, where a partial one splits that mark instead.
  const r = setInlineRoleEdit(doc, 10, 24, "warning");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage [fell 12 points]{.warning} this quarter.");
});

Deno.test("clearing a role removes both brackets and the attribute", () => {
  const doc = "Coverage [fell 12 points]{.danger} this quarter.";
  const r = setInlineRoleEdit(doc, 10, 24, undefined);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage fell 12 points this quarter.");
});

Deno.test("a literal colour and a role are one choice", () => {
  const doc = "Coverage fell 12 points this quarter.";
  const r = setInlineColorEdit(doc, 9, 23, "#c62828");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage [fell 12 points]{color=#c62828} this quarter.");
  // A role replaces the colour, a colour replaces the role; size survives both.
  const coloured = "Coverage [fell 12 points]{color=#c62828 size=14} this quarter.";
  assertEquals(
    apply(coloured, setInlineRoleEdit(coloured, 10, 24, "danger")),
    "Coverage [fell 12 points]{.danger size=14} this quarter.",
  );
  const roled = "Coverage [fell 12 points]{.danger size=14} this quarter.";
  assertEquals(
    apply(roled, setInlineColorEdit(roled, 10, 24, "#123456")),
    "Coverage [fell 12 points]{color=#123456 size=14} this quarter.",
  );
  // Clearing either clears both; a size-less mark unwraps entirely.
  assertEquals(
    apply(coloured, setInlineRoleEdit(coloured, 10, 24, undefined)),
    "Coverage [fell 12 points]{size=14} this quarter.",
  );
  const only = "Coverage [fell 12 points]{color=#c62828} this quarter.";
  assertEquals(apply(only, setInlineColorEdit(only, 10, 24, undefined)), doc);
  // The state reads it back for the toolbar.
  assertEquals(inlineMarkStateAt(only, 14, 14).color, "#c62828");
  assertEquals(inlineMarkStateAt(only, 14, 14).role, undefined);
});

Deno.test("clearing a role where there is none does nothing", () => {
  const doc = "Coverage fell 12 points.";
  assertEquals(setInlineRoleEdit(doc, 9, 13, undefined).changes.length, 0);
});

// ── Size marks ───────────────────────────────────────────────────────────────

Deno.test("a size wraps the selection like a role does", () => {
  const doc = "Coverage fell 12 points this quarter.";
  const r = setInlineSizeEdit(doc, 9, 23, 18);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage [fell 12 points]{size=18} this quarter.");
});

Deno.test("a size with no selection wraps the word under the caret", () => {
  const doc = "Coverage rose sharply.";
  const r = setInlineSizeEdit(doc, 11, 11, 18);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage [rose]{size=18} sharply.");
  // Inside a table cell the word wraps too — the row stays a valid row.
  const row = "| Header one | Header two |";
  const r2 = setInlineSizeEdit(row, 4, 4, 12);
  assertWellFormed(r2);
  assertEquals(apply(row, r2), "| [Header]{size=12} one | Header two |");
});

Deno.test("role and size share one wrapper: setting either preserves the other", () => {
  const doc = "Coverage [fell 12 points]{size=18} this quarter.";
  const r = setInlineRoleEdit(doc, 10, 24, "danger");
  assertWellFormed(r);
  assertEquals(
    apply(doc, r),
    "Coverage [fell 12 points]{.danger size=18} this quarter.",
  );
  const doc2 = "Coverage [fell 12 points]{.danger} this quarter.";
  const r2 = setInlineSizeEdit(doc2, 10, 24, 10.5);
  assertWellFormed(r2);
  assertEquals(
    apply(doc2, r2),
    "Coverage [fell 12 points]{.danger size=10.5} this quarter.",
  );
});

Deno.test("clearing one attribute keeps the wrapper while the other remains", () => {
  const doc = "Coverage [fell 12 points]{.danger size=18} this quarter.";
  const r = setInlineSizeEdit(doc, 10, 24, undefined);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage [fell 12 points]{.danger} this quarter.");
  const r2 = setInlineRoleEdit(doc, 10, 24, undefined);
  assertWellFormed(r2);
  assertEquals(apply(doc, r2), "Coverage [fell 12 points]{size=18} this quarter.");
});

Deno.test("underline toggles on the shared wrapper and keeps its neighbours", () => {
  const doc = "Coverage rose sharply.";
  const on = setInlineUnderlineEdit(doc, 11, 11, true);
  assertWellFormed(on);
  assertEquals(apply(doc, on), "Coverage [rose]{underline} sharply.");
  const sized = "Coverage [rose]{.danger size=14} sharply.";
  assertEquals(
    apply(sized, setInlineUnderlineEdit(sized, 12, 12, true)),
    "Coverage [rose]{.danger size=14 underline} sharply.",
  );
  const both = "Coverage [rose]{.danger underline} sharply.";
  assertEquals(
    apply(both, setInlineUnderlineEdit(both, 12, 12, false)),
    "Coverage [rose]{.danger} sharply.",
  );
  const only = "Coverage [rose]{underline} sharply.";
  assertEquals(apply(only, setInlineUnderlineEdit(only, 12, 12, false)), doc);
  assertEquals(inlineMarkStateAt(only, 12, 12).underline, true);
  assertEquals(inlineMarkStateAt(doc, 12, 12).underline, false);
  // Underlining across an underlined phrase merges rather than nests.
  const mixed = "ab[cd]{underline}efg";
  assertEquals(apply(mixed, setInlineUnderlineEdit(mixed, 0, mixed.length, true)), "[abcdefg]{underline}");
});

Deno.test("clearing the last attribute unwraps the mark entirely", () => {
  const doc = "Coverage [fell 12 points]{size=18} this quarter.";
  const r = setInlineSizeEdit(doc, 10, 24, undefined);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage fell 12 points this quarter.");
});

Deno.test("sizing across an existing size mark flattens, never nests", () => {
  // ab[cd]{size=10}efg with everything selected -> ONE mark, not a nest.
  const doc = "ab[cd]{size=10}efg";
  const r = setInlineSizeEdit(doc, 0, doc.length, 12);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "[abcdefg]{size=12}");
});

Deno.test("a mark the selection cuts into is split, not swallowed", () => {
  const doc = "ab[cd]{size=10}efg";
  // The selection ends inside the mark's label: the mark is rewritten whole
  // (half a `[x]{...}` is not a document), but only the covered half takes
  // the new size. Styling the rest of a phrase nobody selected is the bug
  // this splits to avoid.
  const r = setInlineSizeEdit(doc, 0, 4, 12);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "[abc]{size=12}[d]{size=10}efg");
});

Deno.test("underlining a word inside a sized phrase leaves the phrase alone", () => {
  // The reported bug: the selection sits inside a `{size=13}` span, and the
  // underline landed on the whole span instead of the selected word.
  const doc = "The first four months of 2025 sit lower.";
  const sized = apply(doc, setInlineSizeEdit(doc, 0, doc.length - 1, 13));
  assertEquals(sized, "[The first four months of 2025 sit lower]{size=13}.");
  const at = sized.indexOf("months");
  const on = setInlineUnderlineEdit(sized, at, at + "months".length, true);
  assertWellFormed(on);
  const marked = apply(sized, on);
  assertEquals(
    marked,
    "[The first four ]{size=13}[months]{size=13 underline}[ of 2025 sit lower]{size=13}.",
  );
  // The new mark is left selected, so the next click on the button is an
  // undo rather than a second, wider underline.
  const sel = on.selection!;
  assertEquals(marked.slice(sel.anchor, sel.head), "[months]{size=13 underline}");
  const off = setInlineUnderlineEdit(marked, sel.anchor, sel.head!, false);
  assertWellFormed(off);
  assertEquals(
    apply(marked, off),
    "[The first four ]{size=13}[months]{size=13}[ of 2025 sit lower]{size=13}.",
  );
});

Deno.test("a split rewrites only the stretch that differs", () => {
  // The untouched text of a label must not be deleted and reinserted: the
  // collab merge and the who-wrote-this attribution follow the characters.
  const doc = "[one two three]{size=13}";
  const r = setInlineUnderlineEdit(doc, 5, 8, true);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "[one ]{size=13}[two]{size=13 underline}[ three]{size=13}");
  for (const c of r.changes) {
    assert(c.from >= 5, "the leading text is untouched");
    assert(c.to <= 8, "the trailing text is untouched");
  }
});

Deno.test("a role inside a size sweep survives as its own flat segment", () => {
  const doc = "ab [cd]{.danger} efg";
  const r = setInlineSizeEdit(doc, 0, doc.length, 12);
  assertWellFormed(r);
  assertEquals(
    apply(doc, r),
    "[ab ]{size=12}[cd]{.danger size=12}[ efg]{size=12}",
  );
});

Deno.test("clearing a size across a range unwraps the marks in it", () => {
  const doc = "ab[cd]{size=10}efg";
  const r = setInlineSizeEdit(doc, 0, doc.length, undefined);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "abcdefg");
  // Clearing where nothing is marked is a no-op, not a dispatch.
  assertEquals(setInlineSizeEdit("plain text", 0, 10, undefined).changes.length, 0);
});

Deno.test("a multi-line size selection wraps each line separately", () => {
  const doc = "one two\nthree four";
  const r = setInlineSizeEdit(doc, 0, doc.length, 14);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "[one two]{size=14}\n[three four]{size=14}");
});

Deno.test("a size selection skips fences and delimiter rows it crosses", () => {
  const doc = "before\n:::stat{value=1}\nafter";
  const r = setInlineSizeEdit(doc, 0, doc.length, 14);
  assertWellFormed(r);
  assertEquals(
    apply(doc, r),
    "[before]{size=14}\n:::stat{value=1}\n[after]{size=14}",
  );
  const table = "| A | B |\n| --- | --- |\n| a | b |";
  const r2 = setInlineSizeEdit(table, 0, table.length, 14);
  assertWellFormed(r2);
  assertEquals(
    apply(table, r2),
    "| [A]{size=14} | [B]{size=14} |\n| --- | --- |\n| [a]{size=14} | [b]{size=14} |",
  );
});

// ── Headings ─────────────────────────────────────────────────────────────────

Deno.test("deleting a block takes its lines and one blank line with it", () => {
  const doc = [
    "Intro paragraph.",
    "",
    ":::cover{tone=ink}",
    "# Quarterly review",
    ":::",
    "",
    "After the cover.",
  ].join("\n");
  // The cover is lines 2..4; the blank line UNDER it goes too, so the two
  // paragraphs are left exactly one blank line apart.
  const r = deleteFastrBlockEdit(doc, 2, 4);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Intro paragraph.\n\nAfter the cover.");
  // The caret lands where the block stood.
  assertEquals(r.selection?.anchor, "Intro paragraph.\n\n".length);
});

Deno.test("deleting the document's last block takes the blank line above it", () => {
  const doc = ["Intro paragraph.", "", ":::pagebreak", ""].join("\n");
  assertEquals(apply(doc, deleteFastrBlockEdit(doc, 2, 2)), "Intro paragraph.\n");
  // And with nothing after it at all.
  const tight = ["Intro paragraph.", "", ":::pagebreak"].join("\n");
  assertEquals(apply(tight, deleteFastrBlockEdit(tight, 2, 2)), "Intro paragraph.");
});

Deno.test("deleting the only block leaves an empty document", () => {
  const doc = ":::cover{tone=ink}\n# Title\n:::";
  assertEquals(apply(doc, deleteFastrBlockEdit(doc, 0, 2)), "");
});

Deno.test("a delete outside the document is a no-op, not a dispatch", () => {
  const doc = "One line.";
  assertEquals(deleteFastrBlockEdit(doc, 0, 5).changes.length, 0);
  assertEquals(deleteFastrBlockEdit(doc, -1, 0).changes.length, 0);
  assertEquals(deleteFastrBlockEdit(doc, 2, 1).changes.length, 0);
});

Deno.test("a heading level applies to every selected line and replaces the old one", () => {
  const doc = "One\n## Two\n### Three";
  const r = setHeadingLevelEdit(doc, 0, doc.length, 2);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "## One\n## Two\n## Three");
});

Deno.test("level 0 clears back to paragraphs", () => {
  const doc = "# One\n## Two";
  assertEquals(apply(doc, setHeadingLevelEdit(doc, 0, doc.length, 0)), "One\nTwo");
});

Deno.test("a heading never touches a ::: fence or a code block", () => {
  // Prefixing a fence with `#` breaks the container outright, and inside a
  // code block markdown syntax is content, not markup.
  const doc = [
    ":::callout{kind=note}",
    "Inside the block.",
    ":::",
    "```",
    "not a heading",
    "```",
    "After.",
  ].join("\n");
  const out = apply(doc, setHeadingLevelEdit(doc, 0, doc.length, 2));
  assertEquals(out, [
    ":::callout{kind=note}",
    "## Inside the block.",
    ":::",
    "```",
    "not a heading",
    "```",
    "## After.",
  ].join("\n"));
});

Deno.test("setting the level a line already has is a no-op", () => {
  const doc = "## Two";
  assertEquals(setHeadingLevelEdit(doc, 0, doc.length, 2).changes.length, 0);
});

// ── Lists ────────────────────────────────────────────────────────────────────

Deno.test("an ordered list renumbers from the top of the selection", () => {
  const doc = "alpha\nbeta\ngamma";
  const r = toggleLinePrefixEdit(doc, 0, doc.length, "ordered");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "1. alpha\n2. beta\n3. gamma");
});

Deno.test("a list toggles off only when every line already carries it", () => {
  const all = "- alpha\n- beta";
  assertEquals(apply(all, toggleLinePrefixEdit(all, 0, all.length, "bullet")), "alpha\nbeta");
  // Mixed: the click means "make this a list", not "half-clear it".
  const mixed = "- alpha\nbeta";
  assertEquals(
    apply(mixed, toggleLinePrefixEdit(mixed, 0, mixed.length, "bullet")),
    "- alpha\n- beta",
  );
});

Deno.test("blank lines and fences are left out of a list", () => {
  const doc = "alpha\n\n:::\nbeta";
  assertEquals(apply(doc, toggleLinePrefixEdit(doc, 0, doc.length, "bullet")), "- alpha\n\n:::\n- beta");
});

// ── Insertions ───────────────────────────────────────────────────────────────

Deno.test("a link keeps the selected text and selects the placeholder url", () => {
  const doc = "See the report here.";
  const r = insertLinkEdit(doc, 4, 14);
  assertEquals(apply(doc, r), "See [the report](https://) here.");
  const sel = r.selection!;
  assertEquals(apply(doc, r).slice(sel.anchor, sel.head), "https://");
});

Deno.test("a table has a header, a rule and the asked-for rows", () => {
  const lines = tableSnippet(3, 2).split("\n");
  assertEquals(lines.length, 4);
  assertEquals(lines[1], "| --- | --- | --- |");
  assert(lines[0].startsWith("| Column 1 |"));
});

// ── Toolbar active state ─────────────────────────────────────────────────────

Deno.test("the active state reads the mark under the caret", () => {
  const line = "Coverage **fell** to [62%]{.danger} in Q3.";
  assertEquals(inlineMarkStateAt(line, 12, 12).bold, true);
  assertEquals(inlineMarkStateAt(line, 3, 3).bold, false);
  assertEquals(inlineMarkStateAt(line, 23, 23).role, "danger");
  assertEquals(inlineMarkStateAt(line, 3, 3).role, undefined);
  const sized = "Big [number]{.danger size=18} here.";
  assertEquals(inlineMarkStateAt(sized, 6, 6).size, 18);
  assertEquals(inlineMarkStateAt(sized, 6, 6).role, "danger");
  assertEquals(inlineMarkStateAt(sized, 1, 1).size, undefined);
});

Deno.test("emphasis state pairs delimiter runs, not the nearest stars on the line", () => {
  const line = "Plain prose with **bold**, *italic*, ***bold italic***, `inline code`";
  const at = (i: number) => inlineMarkStateAt(line, i, i);
  const bold = line.indexOf("bold") + 2;
  const italic = line.indexOf("italic") + 2;
  const both = line.indexOf("bold italic") + 6;
  const code = line.indexOf("inline code") + 3;
  assertEquals([at(bold).bold, at(bold).italic, at(bold).code], [true, false, false]);
  assertEquals([at(italic).bold, at(italic).italic], [false, true]);
  assertEquals([at(both).bold, at(both).italic], [true, true]);
  assertEquals([at(code).bold, at(code).italic, at(code).code], [false, false, true]);
  // Nested: `**bold *and italic* text**`.
  const nested = "**bold *and italic* text**";
  assertEquals([at2(nested, 3).bold, at2(nested, 3).italic], [true, false]);
  assertEquals([at2(nested, 10).bold, at2(nested, 10).italic], [true, true]);
  // A bullet's star and a bare `*` in arithmetic are not emphasis.
  assertEquals(at2("* item with *em*", 3).italic, false);
  assertEquals(at2("2 * 3 * 4", 3).italic, false);
});
function at2(line: string, i: number) {
  return inlineMarkStateAt(line, i, i);
}

Deno.test("a caret toggle unwraps the enclosing run of its own kind", () => {
  const doc = "with **bold**, *italic*, ***bold italic***.";
  // Bold off inside `***bold italic***` leaves the italics.
  const both = doc.indexOf("bold italic") + 6;
  assertEquals(
    apply(doc, toggleInlineDelimiters(doc, both, both, "**", "**")),
    "with **bold**, *italic*, *bold italic*.",
  );
  // Italic off there leaves the bold.
  assertEquals(
    apply(doc, toggleInlineDelimiters(doc, both, both, "*", "*")),
    "with **bold**, *italic*, **bold italic**.",
  );
  // Bold with the caret in `*italic*` must NOT eat the neighbouring `**`
  // runs — there is no bold here, so the word gets wrapped instead.
  const it = doc.indexOf("italic") + 2;
  assertEquals(
    apply(doc, toggleInlineDelimiters(doc, it, it, "**", "**")),
    "with **bold**, ***italic***, ***bold italic***.",
  );
});

Deno.test("bold is not reported as italic", () => {
  // `**x**` matches a single-asterisk search too, so the state must exclude it
  // or every bold phrase would light the italic button as well.
  const s = inlineMarkStateAt("a **b** c", 5, 5);
  assertEquals(s.bold, true);
  assertEquals(s.italic, false);
});

Deno.test("the list kinds are one choice, and a quote is orthogonal", () => {
  // Switching kinds replaces the marker rather than stacking a second one.
  const bullets = "- milk\n- eggs";
  assertEquals(
    apply(bullets, toggleLinePrefixEdit(bullets, 0, bullets.length, "ordered")),
    "1. milk\n2. eggs",
  );
  const ordered = "1. milk\n2. eggs";
  assertEquals(
    apply(ordered, toggleLinePrefixEdit(ordered, 0, ordered.length, "bullet")),
    "- milk\n- eggs",
  );
  // A quote wraps whatever list is there instead of replacing it.
  assertEquals(
    apply(bullets, toggleLinePrefixEdit(bullets, 0, bullets.length, "quote")),
    "> - milk\n> - eggs",
  );
  assertEquals(inlineMarkStateAt("> quoted", 3, 3).quote, true);
  assertEquals(inlineMarkStateAt("plain", 3, 3).quote, false);
});

Deno.test("a highlight is a stripe that survives the other mark attributes", () => {
  const doc = "Coverage fell 12 points this quarter.";
  const r = setInlineHighlightEdit(doc, 9, 23, "#ffe08a");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage [fell 12 points]{highlight=#ffe08a} this quarter.");
  // Unlike a role and a colour, a highlight coexists with them.
  const roled = "Coverage [fell 12 points]{.danger size=14} this quarter.";
  assertEquals(
    apply(roled, setInlineHighlightEdit(roled, 10, 24, "yellow")),
    "Coverage [fell 12 points]{.danger highlight=yellow size=14} this quarter.",
  );
  // Clearing it leaves the rest of the mark alone, and unwraps when alone.
  const both = "Coverage [fell 12 points]{.danger highlight=yellow} this quarter.";
  assertEquals(
    apply(both, setInlineHighlightEdit(both, 10, 24, undefined)),
    "Coverage [fell 12 points]{.danger} this quarter.",
  );
  const only = "Coverage [fell 12 points]{highlight=yellow} this quarter.";
  assertEquals(apply(only, setInlineHighlightEdit(only, 10, 24, undefined)), doc);
  assertEquals(inlineMarkStateAt(only, 14, 14).highlight, "yellow");
  // An unsafe colour is not a mark at all.
  assertEquals(apply(doc, setInlineHighlightEdit(doc, 9, 23, "url(x)")), doc);
});

Deno.test("the active state reads the line's heading level and list kind", () => {
  assertEquals(inlineMarkStateAt("### Three", 5, 5).headingLevel, 3);
  assertEquals(inlineMarkStateAt("plain", 2, 2).headingLevel, 0);
  assertEquals(inlineMarkStateAt("- item", 3, 3).list, "bullet");
  assertEquals(inlineMarkStateAt("2. item", 4, 4).list, "ordered");
  assertEquals(inlineMarkStateAt("plain", 2, 2).list, undefined);
});

Deno.test("the stat tiles snippet is a grid of the picked width", () => {
  assertEquals(
    statTilesSnippet(2),
    ':::tiles{cols=2}\n:::stat{value="0" label="Stat 1"}\n:::stat{value="0" label="Stat 2"}\n:::',
  );
  assertEquals(statTilesSnippet(9).split("\n").length, 6);
});

Deno.test("stat tile actions keep the column count following the tile count", () => {
  const doc = ':::tiles{cols=3}\n:::stat{value=1 label=A}\n:::stat{value=2 label=B}\n:::stat{value=3 label=C}\n:::\nafter';
  // Add after the second tile: four tiles, four columns.
  const r = applyTilesChildAction(doc, 3, "insertAfter", { tile: "New tile", card: "C", body: "T" });
  assertWellFormed(r);
  assertEquals(
    apply(doc, r),
    ':::tiles{cols=4}\n:::stat{value=1 label=A}\n:::stat{value=2 label=B}\n:::stat{value="0" label="New tile"}\n:::stat{value=3 label=C}\n:::\nafter',
  );
  // Past four the grid wraps and cols is left alone.
  const four = apply(doc, r);
  const r2 = applyTilesChildAction(four, 2, "insertBefore");
  assertWellFormed(r2);
  assert(apply(four, r2).startsWith(":::tiles{cols=4}\n"));
  assertEquals(apply(four, r2).split("\n").filter((l) => l.startsWith(":::stat")).length, 5);
  // Delete shrinks the columns with the tiles.
  const r3 = applyTilesChildAction(doc, 4, "delete");
  assertWellFormed(r3);
  assertEquals(
    apply(doc, r3),
    ':::tiles{cols=2}\n:::stat{value=1 label=A}\n:::stat{value=2 label=B}\n:::\nafter',
  );
  // Deleting the last tile removes the whole grid.
  const one = ':::tiles{cols=1}\n:::stat{value=1 label=A}\n:::\nafter';
  assertEquals(apply(one, applyTilesChildAction(one, 2, "delete")), "after");
  // An explicit column choice.
  assertEquals(
    apply(doc, applyTilesChildAction(doc, 2, { cols: 2 })).split("\n")[0],
    ":::tiles{cols=2}",
  );
  // A lone stat outside a grid just gains a neighbour; not a stat = no-op.
  const lone = "text\n:::stat{value=1 label=A}\nmore";
  assertEquals(
    apply(lone, applyTilesChildAction(lone, 2, "insertAfter", { tile: "N", card: "C", body: "T" })),
    'text\n:::stat{value=1 label=A}\n:::stat{value="0" label="N"}\nmore',
  );
  assertEquals(applyTilesChildAction(lone, 1, "insertAfter").changes.length, 0);
  assertEquals(applyTilesChildAction(lone, 2, { cols: 2 }).changes.length, 0);
});

Deno.test("card grids get the same insert, delete and column following", () => {
  assertEquals(
    cardTilesSnippet(2, "Card", "Text"),
    ':::tiles{cols=2}\n:::card{title="Card 1"}\nText\n:::\n:::card{title="Card 2"}\nText\n:::\n:::',
  );
  const doc = ':::tiles{cols=2}\n:::card{title="A"}\nbody a\n:::\n:::card{title="B"}\nbody b\n:::\n:::\nend';
  const labels = { tile: "T", card: "New card", body: "Text" };
  // Add after card A (a multi-line block): lands after its closing fence.
  const r = applyTilesChildAction(doc, 2, "insertAfter", labels);
  assertWellFormed(r);
  assertEquals(
    apply(doc, r),
    ':::tiles{cols=3}\n:::card{title="A"}\nbody a\n:::\n:::card{title="New card"}\nText\n:::\n:::card{title="B"}\nbody b\n:::\n:::\nend',
  );
  // Delete card A removes its whole block and shrinks the columns.
  const r2 = applyTilesChildAction(doc, 2, "delete", labels);
  assertWellFormed(r2);
  assertEquals(apply(doc, r2), ':::tiles{cols=1}\n:::card{title="B"}\nbody b\n:::\n:::\nend');
  // A card's body line is not a card: no-op.
  assertEquals(applyTilesChildAction(doc, 3, "delete", labels).changes.length, 0);
});

Deno.test("columns get the same picker snippet and column actions", () => {
  assertEquals(
    columnsSnippet(3, "Text"),
    ":::columns{cols=3}\n:::col\n### Heading\nText\n:::\n:::col\n### Heading\nText\n:::\n:::col\n### Heading\nText\n:::\n:::",
  );
  const doc = ":::columns{cols=2}\n:::col\nleft\n:::\n:::col\nright\n:::\n:::\nend";
  const labels = { tile: "T", card: "C", body: "Text", heading: "Head" };
  const r = applyTilesChildAction(doc, 2, "insertAfter", labels);
  assertWellFormed(r);
  assertEquals(
    apply(doc, r),
    ":::columns{cols=3}\n:::col\nleft\n:::\n:::col\n### Head\nText\n:::\n:::col\nright\n:::\n:::\nend",
  );
  const r2 = applyTilesChildAction(doc, 5, "delete", labels);
  assertWellFormed(r2);
  assertEquals(apply(doc, r2), ":::columns{cols=1}\n:::col\nleft\n:::\n:::\nend");
  // A col whose parent is not a columns grid gets a neighbour, no cols patch.
  const lone = ":::card\n:::col\nx\n:::\n:::";
  assertEquals(
    apply(lone, applyTilesChildAction(lone, 2, "insertAfter", labels)),
    ":::card\n:::col\nx\n:::\n:::col\n### Head\nText\n:::\n:::",
  );
});

Deno.test("the steps snippet is blank-separated paragraphs of the picked count", () => {
  assertEquals(stepsSnippet(3), ":::steps\nStep 1\n\nStep 2\n\nStep 3\n:::");
  assertEquals(stepsSnippet(1, "Étape"), ":::steps\nÉtape 1\n:::");
  assertEquals(stepsSnippet(99).split("\n\n").length, 8);
});

Deno.test("a step is a direct child of the steps block, whatever its shape", () => {
  const doc = [
    "intro",
    ":::steps",
    "First, one line.",
    "",
    "Second runs",
    "over two lines.",
    "",
    "## A heading step",
    "Right under it.",
    "",
    ":::callout{title=Nested}",
    "inside the callout",
    ":::",
    ":::",
    "outro",
  ].join("\n");
  const block = { line1: 2, endLine1: 14 };
  assertEquals(stepsChildInfo(doc, 3), { from1: 3, to1: 3, block });
  // Either line of a two-line paragraph names the whole paragraph.
  assertEquals(stepsChildInfo(doc, 5), { from1: 5, to1: 6, block });
  assertEquals(stepsChildInfo(doc, 6), { from1: 5, to1: 6, block });
  // A heading is one line; the paragraph under it does not join it.
  assertEquals(stepsChildInfo(doc, 8), { from1: 8, to1: 8, block });
  assertEquals(stepsChildInfo(doc, 9), { from1: 9, to1: 9, block });
  // A nested block is one step from fence to close.
  assertEquals(stepsChildInfo(doc, 11), { from1: 11, to1: 13, block });
  // Not steps: a line inside the nested block, blank lines, the fences,
  // and prose outside the block.
  assertEquals(stepsChildInfo(doc, 12), undefined);
  assertEquals(stepsChildInfo(doc, 4), undefined);
  assertEquals(stepsChildInfo(doc, 2), undefined);
  assertEquals(stepsChildInfo(doc, 14), undefined);
  assertEquals(stepsChildInfo(doc, 1), undefined);
  assertEquals(stepsChildInfo(doc, 15), undefined);
  // An unclosed block runs to the end of the document.
  const open = ":::steps\nA\n\nB";
  assertEquals(stepsChildInfo(open, 4), { from1: 4, to1: 4, block: { line1: 1, endLine1: 4 } });
});

Deno.test("step actions add blank-separated steps and delete cleanly", () => {
  const doc = ":::steps\nA\n\nB\n\nC\n:::\nafter";
  const r = applyStepsChildAction(doc, 4, "insertAfter", "New step");
  assertWellFormed(r);
  assertEquals(apply(doc, r), ":::steps\nA\n\nB\n\nNew step\n\nC\n:::\nafter");
  const r2 = applyStepsChildAction(doc, 4, "insertBefore", "New step");
  assertWellFormed(r2);
  assertEquals(apply(doc, r2), ":::steps\nA\n\nNew step\n\nB\n\nC\n:::\nafter");
  // Delete the middle, the first and the last step: the survivors stay
  // separated by exactly one blank line each time.
  assertEquals(apply(doc, applyStepsChildAction(doc, 4, "delete")), ":::steps\nA\n\nC\n:::\nafter");
  assertEquals(apply(doc, applyStepsChildAction(doc, 2, "delete")), ":::steps\nB\n\nC\n:::\nafter");
  assertEquals(apply(doc, applyStepsChildAction(doc, 6, "delete")), ":::steps\nA\n\nB\n:::\nafter");
  // A two-line paragraph moves as one; a nested block too.
  const multi = ":::steps\nA\n\nB one\nB two\n\n:::callout\nx\n:::\n:::";
  assertEquals(
    apply(multi, applyStepsChildAction(multi, 5, "insertAfter", "N")),
    ":::steps\nA\n\nB one\nB two\n\nN\n\n:::callout\nx\n:::\n:::",
  );
  assertEquals(
    apply(multi, applyStepsChildAction(multi, 4, "delete")),
    ":::steps\nA\n\n:::callout\nx\n:::\n:::",
  );
  assertEquals(
    apply(multi, applyStepsChildAction(multi, 7, "delete")),
    ":::steps\nA\n\nB one\nB two\n:::",
  );
  // Deleting the only step removes the whole block; an unclosed block too.
  const one = "before\n:::steps\nA\n:::\nafter";
  assertEquals(apply(one, applyStepsChildAction(one, 3, "delete")), "before\nafter");
  const open = ":::steps\nA\n\nB";
  assertEquals(apply(open, applyStepsChildAction(open, 4, "delete")), ":::steps\nA");
  assertEquals(apply(open, applyStepsChildAction(open, 2, "delete")), ":::steps\nB");
  // Not a step: no-op.
  assertEquals(applyStepsChildAction(doc, 3, "insertAfter").changes.length, 0);
  assertEquals(applyStepsChildAction(doc, 8, "delete").changes.length, 0);
});

Deno.test("table cell actions rebuild the table around the clicked cell", () => {
  const table = ["| A | B |", "| --- | --- |", "| a1 | b1 |", "| a2 | b2 |"];
  assertEquals(applyTableCellAction(table, 2, 0, "insertRowBelow"), [
    "| A | B |",
    "| --- | --- |",
    "| a1 | b1 |",
    "|  |  |",
    "| a2 | b2 |",
  ]);
  // Above the header lands as the first body row.
  assertEquals(applyTableCellAction(table, 0, 0, "insertRowAbove")?.[2], "|  |  |");
  assertEquals(applyTableCellAction(table, 3, 1, "insertColRight", "New column"), [
    "| A | B | New column |",
    "| --- | --- | --- |",
    "| a1 | b1 |  |",
    "| a2 | b2 |  |",
  ]);
  assertEquals(
    applyTableCellAction(table, 2, 1, "insertColLeft", "New column")?.[0],
    "| A | New column | B |",
  );
  assertEquals(applyTableCellAction(table, 2, 0, "deleteRow"), [
    "| A | B |",
    "| --- | --- |",
    "| a2 | b2 |",
  ]);
  // The header and delimiter rows are not deletable.
  assertEquals(applyTableCellAction(table, 0, 0, "deleteRow"), undefined);
  assertEquals(applyTableCellAction(table, 2, 0, "deleteCol"), [
    "| B |",
    "| --- |",
    "| b1 |",
    "| b2 |",
  ]);
  // The last column is not deletable (delete the table instead).
  assertEquals(
    applyTableCellAction(["| A |", "| --- |", "| a |"], 2, 0, "deleteCol"),
    undefined,
  );
});

// ── Blocks as units: inserts land outside, Enter opens a line beside ─────────

const NESTED = [
  ":::report{background=muted}",
  "",
  "Intro.",
  "",
  ":::tiles{cols=2}",
  ":::card{title=\"A\"}",
  "Inside a card.",
  ":::",
  ":::card{title=\"B\"}",
  "Second card.",
  ":::",
  ":::",
  "",
  "After.",
].join("\n");

function posOfLine(doc: string, line1: number, col = 0): number {
  const lines = doc.split("\n");
  let pos = 0;
  for (let i = 0; i < line1 - 1; i++) pos += lines[i].length + 1;
  return pos + col;
}

Deno.test("fastrRegionAtLine: the outermost block, a leaf, prose", () => {
  assertEquals(fastrRegionAtLine(NESTED, 7), { kind: "container", name: "tiles", from1: 5, to1: 12 });
  assertEquals(fastrRegionAtLine(NESTED, 12), { kind: "container", name: "tiles", from1: 5, to1: 12 });
  assertEquals(fastrRegionAtLine(NESTED, 1), { kind: "leaf", name: "report", from1: 1, to1: 1 });
  assertEquals(fastrRegionAtLine(NESTED, 3), undefined);
  assertEquals(fastrRegionAtLine(NESTED, 14), undefined);
});

Deno.test("insertBlockEdit: a caret inside a card puts the block after the whole tiles row", () => {
  const r = insertBlockEdit(NESTED, posOfLine(NESTED, 7, 3), "| a | b |\n| - | - |\n| 1 | 2 |");
  assertWellFormed(r);
  const out = apply(NESTED, r);
  const lines = out.split("\n");
  // The tiles row is untouched and closed before the table begins.
  assertEquals(lines.slice(4, 12), NESTED.split("\n").slice(4, 12));
  assertEquals(lines[12], "");
  assertEquals(lines[13], "| a | b |");
  assertEquals(lines[15], "| 1 | 2 |");
  // The blank line that already followed the row is reused, not doubled.
  assertEquals(lines[16], "");
  assertEquals(lines[17], "After.");
  assertEquals(r.selection?.anchor, posOfLine(out, 17));
});

Deno.test("insertBlockEdit: parked on the open fence still lands after the block", () => {
  const r = insertBlockEdit(NESTED, posOfLine(NESTED, 5), ":::pagebreak");
  const lines = apply(NESTED, r).split("\n");
  assertEquals(lines[4], ":::tiles{cols=2}");
  assertEquals(lines[13], ":::pagebreak");
});

Deno.test("insertBlockEdit: at the end of the document a trailing blank line is added", () => {
  const doc = "Text\n\n:::callout\nBody\n:::";
  const r = insertBlockEdit(doc, posOfLine(doc, 4, 2), ":::pagebreak");
  assertEquals(apply(doc, r), "Text\n\n:::callout\nBody\n:::\n\n:::pagebreak\n\n");
});

Deno.test("insertBlockEdit: in prose the token gets a blank line on both sides", () => {
  const doc = "One\nTwo";
  assertEquals(apply(doc, insertBlockEdit(doc, 0, ":::pagebreak")), ":::pagebreak\n\nOne\nTwo");
  assertEquals(apply(doc, insertBlockEdit(doc, 2, ":::pagebreak")), "On\n\n:::pagebreak\n\ne\nTwo");
  // At the start of a line under content: a blank line is opened above too.
  assertEquals(apply(doc, insertBlockEdit(doc, 4, ":::pagebreak")), "One\n\n:::pagebreak\n\nTwo");
  // On the blank line after a block: the token takes it, the caret lands on
  // the blank line after the token, and nothing is doubled.
  const spaced = "Text\n\n:::callout\nBody\n:::\n\nNext";
  const r = insertBlockEdit(spaced, spaced.indexOf("\nNext"), ":::pagebreak");
  assertEquals(apply(spaced, r), "Text\n\n:::callout\nBody\n:::\n\n:::pagebreak\n\nNext");
  assertEquals(r.selection?.anchor, spaced.indexOf("\nNext") + ":::pagebreak\n\n".length);
});

Deno.test("insertBlockEdit: the report header is a region the token goes after", () => {
  const r = insertBlockEdit(NESTED, 0, ":::pagebreak");
  const lines = apply(NESTED, r).split("\n");
  assertEquals(lines[0], ":::report{background=muted}");
  assertEquals(lines[2], ":::pagebreak");
});

Deno.test("enterBesideRegionEdit: parked at the start opens a line above (the block moves down)", () => {
  const r = enterBesideRegionEdit(NESTED, posOfLine(NESTED, 6));
  assert(r);
  const out = apply(NESTED, r);
  assertEquals(out.split("\n")[4], "");
  assertEquals(out.split("\n")[5], ":::tiles{cols=2}");
  assertEquals(r.selection?.anchor, posOfLine(NESTED, 5));
});

Deno.test("enterBesideRegionEdit: at the region's very end opens a line below", () => {
  const end = posOfLine(NESTED, 12, 3);
  const r = enterBesideRegionEdit(NESTED, end);
  assert(r);
  const lines = apply(NESTED, r).split("\n");
  assertEquals(lines[11], ":::");
  assertEquals(lines[12], "");
  assertEquals(lines[13], "");
  assertEquals(r.selection?.anchor, end + 1);
});

Deno.test("enterBesideRegionEdit: prose and the report header are left alone", () => {
  assertEquals(enterBesideRegionEdit(NESTED, posOfLine(NESTED, 3, 2)), undefined);
  assertEquals(enterBesideRegionEdit(NESTED, 0), undefined);
  // A leaf at the end of the document: Enter at its end appends a line.
  const doc = "Text\n\n:::pagebreak";
  const r = enterBesideRegionEdit(doc, doc.length);
  assertEquals(r && apply(doc, r), "Text\n\n:::pagebreak\n");
});
