import { assert, assertEquals } from "@std/assert";
import {
  analyzeSlideMarkdown,
  assignRunsToUnit,
  escapeTypedSlideText,
  type SlideEditResult,
  slideBackspace,
  slideDeleteForward,
  slideDeleteRange,
  slideInsertText,
  slideToggleStyle,
  slideWordAt,
  SRC_BLOCK,
  SRC_INLINE_SYNTAX,
  SRC_VISIBLE,
} from "../../lib/slide_text_offsets.ts";

// The canvas slide editor draws the caret from these maps, so a wrong offset
// is a caret painted on the wrong glyph, and a wrong edit is markdown syntax
// leaking onto a slide. Every shape below was a real case while building it.

const CORPUS = [
  "**bold** x",
  "1. 1st\n2. two",
  "[a](http://u) up",
  "it's \"quoted\"",
  "- a\n  - nested *em*\n- b",
  "> quote line\n> more\n>\n> second para",
  "# Heading\n\npara one\nline two<br>three",
  "a\\*b `c*d` e",
  "***bi*** tail",
  "x <span>s</span> y",
  "![img](x.png) and text",
  "---\n\nafter hr",
  "plain text with  two spaces",
];

const CURLY: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"' };

Deno.test("every drawn char maps to the source char it came from, in order", () => {
  for (const src of CORPUS) {
    const an = analyzeSlideMarkdown(src);
    assert(an.editable, src);
    for (const u of an.units) {
      let last = -1;
      for (let k = 0; k < u.text.length; k++) {
        const s = u.toSrc[k];
        if (u.text[k] === "\n") continue;
        assert(s >= 0, `${JSON.stringify(src)}: unmapped ${u.text[k]}@${k}`);
        assertEquals(CURLY[u.text[k]] ?? u.text[k], src[s], JSON.stringify(src));
        assert(s > last, `${JSON.stringify(src)}: out of order at ${k}`);
        assertEquals(an.kind[s], SRC_VISIBLE);
        last = s;
      }
    }
  }
});

Deno.test("markers, link urls and escapes are classified, not drawn", () => {
  const bold = analyzeSlideMarkdown("**bold** x");
  assertEquals([...bold.kind].join(""), "2211112211");

  const list = analyzeSlideMarkdown("1. 1st");
  assertEquals(list.units[0].toSrc, [3, 4, 5]); // not the marker's "1"
  assertEquals(list.kind[0], SRC_BLOCK);

  const link = analyzeSlideMarkdown("[a](http://u) up");
  assertEquals(link.units[0].text, "a up");
  assertEquals(link.units[0].toSrc, [1, 13, 14, 15]); // the url's "u" is skipped

  const ent = analyzeSlideMarkdown("&amp;and");
  assertEquals(ent.units[0].toSrc, [0, 5, 6, 7]);

  const esc = analyzeSlideMarkdown("a\\*b");
  assertEquals(esc.kind[1], SRC_INLINE_SYNTAX);
  assertEquals(esc.units[0].toSrc, [0, 2, 3]);

  const html = analyzeSlideMarkdown("x <span>s</span> y");
  assertEquals(html.units[0].text, "x s y");
  assertEquals(html.units[0].toSrc, [0, 1, 8, 16, 17]);
});

Deno.test("blockquotes split into the renderer's paragraphs", () => {
  const an = analyzeSlideMarkdown("> one\n> two\n>\n> three");
  assertEquals(an.units.map((u) => [u.itemIndex, u.groupIndex, u.text]), [
    [0, 0, "one\ntwo"],
    [0, 1, "three"],
  ]);
});

Deno.test("tables, fences and block images are not canvas-editable", () => {
  for (const src of ["| a |\n|---|\n| b |", "```\ncode\n```", "![x](y.png)"]) {
    assertEquals(analyzeSlideMarkdown(src).editable, false, src);
  }
});

Deno.test("measured runs are assigned their span of the unit text", () => {
  // Wrapped as panther would: the space at the wrap point has no run, and a
  // whitespace run is drawn as ONE space.
  assertEquals(
    assignRunsToUnit("hello  big world", [["hello", " ", "big"], ["world"]]),
    [
      [
        { start: 0, end: 5, isSpace: false },
        { start: 5, end: 7, isSpace: true },
        { start: 7, end: 10, isSpace: false },
      ],
      [{ start: 11, end: 16, isSpace: false }],
    ],
  );
  // A break starts a new line with no run of its own.
  assertEquals(assignRunsToUnit("a\nb", [["a"], ["b"]]), [
    [{ start: 0, end: 1, isSpace: false }],
    [{ start: 2, end: 3, isSpace: false }],
  ]);
});

function apply(src: string, r: SlideEditResult | undefined): string | undefined {
  if (!r) return undefined;
  let out = src;
  for (const c of [...r.changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

Deno.test("deletions keep the formatting of what remains", () => {
  const cases: [string, number, number, string][] = [
    ["**bold** text", 4, 11, "**bo**xt"],
    ["**a** *b*", 5, 6, "**a***b*"],
    ["**x** y", 2, 3, " y"],
    ["ab\ncd", 3, 4, "ab\nd"],
    ["x [link](u) y", 3, 7, "x  y"],
  ];
  for (const [src, from, to, want] of cases) {
    const got = apply(src, slideDeleteRange(analyzeSlideMarkdown(src), from, to));
    assertEquals(got, want, `${JSON.stringify(src)} [${from},${to})`);
    // And what remains renders exactly the undeleted text.
    const rendered = analyzeSlideMarkdown(got!).units.map((u) => u.text).join("|").trim();
    const expectText = analyzeSlideMarkdown(src).units
      .map((u) => [...u.text].filter((_, k) => u.toSrc[k] < from || u.toSrc[k] >= to).join(""))
      .join("")
      .trim();
    assertEquals(rendered.replace(/\s+/g, " "), expectText.replace(/\s+/g, " "));
  }
});

Deno.test("backspace and delete behave like a word processor", () => {
  const bs = (src: string, caret: number) =>
    apply(src, slideBackspace(analyzeSlideMarkdown(src), caret));
  assertEquals(bs("**bold** tail", 8), "**bol** tail"); // the d, not a `*`
  assertEquals(bs("- a\n- b", 6), "- a\nb"); // bullet goes first
  assertEquals(bs("- a\nb", 4), "- ab"); // then the lines join
  assertEquals(bs("one\n\ntwo", 5), "onetwo"); // paragraphs join
  const r = slideBackspace(analyzeSlideMarkdown("**bold** tail"), 8)!;
  assertEquals([r.anchor, r.head], [5, 5]); // still inside the bold

  const del = (src: string, caret: number) =>
    apply(src, slideDeleteForward(analyzeSlideMarkdown(src), caret));
  assertEquals(del("ab **cd**", 3), "ab **d**");
  assertEquals(del("ab\ncd", 2), "abcd");
});

Deno.test("bold and italic toggles are verified serializations", () => {
  const t = (src: string, from: number, to: number, prop: "bold" | "italic") =>
    apply(src, slideToggleStyle(analyzeSlideMarkdown(src), from, to, prop));
  assertEquals(t("hello world", 0, 5, "bold"), "**hello** world");
  assertEquals(t("**hello** world", 2, 7, "bold"), "hello world");
  assertEquals(t("**abcde**", 4, 5, "bold"), "**ab**c**de**");
  assertEquals(t("abcdef", 2, 4, "italic"), "ab*cd*ef");
  // Italic inside bold: bold-italic, never a `*` mistaken for the bold's own.
  const bi = t("**hello world**", 2, 7, "italic")!;
  const styles = analyzeSlideMarkdown(bi).units[0].styles;
  assert(styles[0].bold && styles[0].italic);
  assert(styles[6].bold && !styles[6].italic);
  // Structure is untouched across lines.
  assertEquals(
    t("- item one\n- item two", 2, 21, "bold"),
    "- **item one**\n- **item two**",
  );
  // A literal `*` stays literal once it sits inside emphasis.
  const esc = t("5 * 3 = x", 0, 9, "bold")!;
  assertEquals(analyzeSlideMarkdown(esc).units[0].text, "5 * 3 = x");
  assert(analyzeSlideMarkdown(esc).units[0].styles.every((s) => s.bold));
});

Deno.test("typed text is escaped so it renders literally", () => {
  assertEquals(escapeTypedSlideText("a*b_c"), "a\\*b\\_c");
  assertEquals(escapeTypedSlideText("<b>"), "\\<b>");
  assertEquals(escapeTypedSlideText("x < y"), "x < y");
  // Round trip: the escaped text renders as typed.
  const typed = "5 * 3 [x] `y` ~~z~~";
  assertEquals(analyzeSlideMarkdown(escapeTypedSlideText(typed)).units[0].text, typed);
});

Deno.test("word ranges come from rendered text, spanning syntax", () => {
  const an = analyzeSlideMarkdown("say **hel**lo now");
  assertEquals(slideWordAt(an, 7), { from: 6, to: 13 }); // "hel**lo", from the h
  assertEquals(slideWordAt(an, 0), { from: 0, to: 3 });
});

Deno.test("typing continues the formatting it is typed into, validly", () => {
  const typeAt = (src: string, pos: number, text: string) => {
    const r = slideInsertText(analyzeSlideMarkdown(src), pos, text);
    return { doc: apply(src, r)!, caret: r.anchor };
  };
  // A space at the end of a bold span goes after the closing delimiters.
  const sp = typeAt("**hello**", 7, " ");
  assertEquals(sp.doc, "**hello** ");
  // The next letter joins the bold again.
  const w = typeAt(sp.doc, sp.caret, "w");
  assertEquals(w.doc, "**hello w**");
  assert(analyzeSlideMarkdown(w.doc).units[0].styles.every((s) => s.bold));
  // Letters inside or at the end of a span just extend it.
  assertEquals(typeAt("**hello**", 7, "x").doc, "**hellox**");
  assertEquals(typeAt("a *b* c", 4, "d").doc, "a *bd* c");
  // A space typed at the start of a span goes before its opener.
  assertEquals(typeAt("x **bold**", 4, " ").doc, "x  **bold**");
  // Typed punctuation stays literal.
  assertEquals(typeAt("ab", 1, "*").doc, "a\\*b");
});
