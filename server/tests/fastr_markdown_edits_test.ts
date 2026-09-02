import { assert, assertEquals } from "@std/assert";
import {
  type EditResult,
  inlineMarkStateAt,
  insertLinkEdit,
  setHeadingLevelEdit,
  setInlineRoleEdit,
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

Deno.test("with no selection the delimiters open and the caret lands between", () => {
  const doc = "Coverage .";
  const r = toggleInlineDelimiters(doc, 9, 9, "**", "**");
  assertEquals(apply(doc, r), "Coverage ****.");
  assertEquals(r.selection?.anchor, 11);
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
  const r = setInlineRoleEdit(doc, 12, 20, "warning");
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage [fell 12 points]{.warning} this quarter.");
});

Deno.test("clearing a role removes both brackets and the attribute", () => {
  const doc = "Coverage [fell 12 points]{.danger} this quarter.";
  const r = setInlineRoleEdit(doc, 12, 20, undefined);
  assertWellFormed(r);
  assertEquals(apply(doc, r), "Coverage fell 12 points this quarter.");
});

Deno.test("clearing a role where there is none does nothing", () => {
  const doc = "Coverage fell 12 points.";
  assertEquals(setInlineRoleEdit(doc, 9, 13, undefined).changes.length, 0);
});

// ── Headings ─────────────────────────────────────────────────────────────────

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
});

Deno.test("bold is not reported as italic", () => {
  // `**x**` matches a single-asterisk search too, so the state must exclude it
  // or every bold phrase would light the italic button as well.
  const s = inlineMarkStateAt("a **b** c", 5, 5);
  assertEquals(s.bold, true);
  assertEquals(s.italic, false);
});

Deno.test("the active state reads the line's heading level and list kind", () => {
  assertEquals(inlineMarkStateAt("### Three", 5, 5).headingLevel, 3);
  assertEquals(inlineMarkStateAt("plain", 2, 2).headingLevel, 0);
  assertEquals(inlineMarkStateAt("- item", 3, 3).list, "bullet");
  assertEquals(inlineMarkStateAt("2. item", 4, 4).list, "ordered");
  assertEquals(inlineMarkStateAt("plain", 2, 2).list, undefined);
});
