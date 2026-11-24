import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  analyzeSlideMarkdown,
  assignRunsToUnit,
  escapeTypedSlideText,
  findSlideTableOrImage,
  slideBackspace,
  slideDeleteForward,
  slideDeleteRange,
  type SlideEditResult,
  slideInsertText,
  slideRenderMarkdown,
  slideSourceFromRender,
  slideToggleStyle,
  slideWordAt,
  SRC_BLOCK,
  SRC_INLINE_SYNTAX,
  SRC_VISIBLE,
} from "../../lib/slide_text_offsets.ts";
import {
  describeSlideTableOrImageForAI,
  validateTextOnlyMarkdown,
} from "../../lib/ai_tools/slide_text_for_ai.ts";
import {
  AIToolFailure,
  createMarkdownIt,
  parseMarkdown,
} from "@timroberton/panther";

// The canvas slide editor draws the caret from these maps, so a wrong offset
// is a caret painted on the wrong glyph, and a wrong edit is markdown syntax
// leaking onto a slide. Every shape below was a real case while building it.

const CORPUS = [
  "**bold** x",
  "1. 1st\n2. two",
  "[a](http://u) up",
  'it\'s "quoted"',
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

const CURLY: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
};

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
        assertEquals(
          CURLY[u.text[k]] ?? u.text[k],
          src[s],
          JSON.stringify(src),
        );
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

function apply(
  src: string,
  r: SlideEditResult | undefined,
): string | undefined {
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
    const got = apply(
      src,
      slideDeleteRange(analyzeSlideMarkdown(src), from, to),
    );
    assertEquals(got, want, `${JSON.stringify(src)} [${from},${to})`);
    // And what remains renders exactly the undeleted text.
    const rendered = analyzeSlideMarkdown(got!).units.map((u) => u.text).join(
      "|",
    ).trim();
    const expectText = analyzeSlideMarkdown(src).units
      .map((u) =>
        [...u.text].filter((_, k) => u.toSrc[k] < from || u.toSrc[k] >= to)
          .join("")
      )
      .join("")
      .trim();
    assertEquals(
      rendered.replace(/\s+/g, " "),
      expectText.replace(/\s+/g, " "),
    );
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

Deno.test("a caret that restyles the word it sits in stays a caret", () => {
  const an = analyzeSlideMarkdown("say hello world");
  const r = slideToggleStyle(an, 4, 9, "bold", 6)!;
  assertEquals(apply("say hello world", r), "say **hello** world");
  // Two chars into the word, after the opener now.
  assertEquals([r.anchor, r.head], [8, 8]);
  const back = slideToggleStyle(
    analyzeSlideMarkdown("say **hello** world"),
    6,
    11,
    "bold",
    8,
  )!;
  assertEquals(apply("say **hello** world", back), "say hello world");
  assertEquals([back.anchor, back.head], [6, 6]);
});

Deno.test("typed text is escaped so it renders literally", () => {
  assertEquals(escapeTypedSlideText("a*b_c"), "a\\*b\\_c");
  assertEquals(escapeTypedSlideText("<b>"), "\\<b>");
  assertEquals(escapeTypedSlideText("x < y"), "x < y");
  // Round trip: the escaped text renders as typed.
  const typed = "5 * 3 [x] `y` ~~z~~";
  assertEquals(
    analyzeSlideMarkdown(escapeTypedSlideText(typed)).units[0].text,
    typed,
  );
});

Deno.test("word ranges come from rendered text, spanning syntax", () => {
  const an = analyzeSlideMarkdown("say **hel**lo now");
  assertEquals(slideWordAt(an, 7), { from: 6, to: 13 }); // "hel**lo", from the h
  assertEquals(slideWordAt(an, 0), { from: 0, to: 3 });
});

Deno.test("typing continues the formatting it is typed into, validly", () => {
  const typeAt = (
    src: string,
    pos: number,
    text: string,
    want?: { bold?: boolean; italic?: boolean },
  ) => {
    const r = slideInsertText(analyzeSlideMarkdown(src), pos, text, want);
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
  // A typing state set by a toggle with nothing selected wins over the
  // inherited style, and the text lands where it renders that way.
  assertEquals(typeAt("**hello**", 7, "x", { bold: false }).doc, "**hello**x");
  const off = typeAt("**hello** ", 10, "w", { bold: false });
  assertEquals(off.doc, "**hello** w");
  assert(!analyzeSlideMarkdown(off.doc).srcStyle[off.caret - 1]?.bold);
  const on = typeAt("hello ", 6, "w", { bold: true });
  assertEquals(on.doc, "hello **w**");
  assertEquals(
    typeAt("a *b* c", 4, "d", { italic: false, bold: true }).doc,
    "a *b***d** c",
  );
});

Deno.test("an empty list item is drawn (Enter on a bullet shows the bullet)", () => {
  const items = (src: string) =>
    parseMarkdown(slideRenderMarkdown(src)).items.map((i) => i.type);
  assertEquals(items("- a\n- "), ["list-item", "list-item"]);
  assertEquals(items("1. a\n2. "), ["list-item", "list-item"]);
  // Without it, the indented empty item made "a" a setext heading.
  assertEquals(items("- a\n  - "), ["list-item", "list-item"]);
  // Fenced code and a bare marker are left alone.
  assertEquals(slideRenderMarkdown("```\n- \n```"), "```\n- \n```");
  assertEquals(slideRenderMarkdown("a\n-"), "a\n-");
  for (const src of ["- a\n- ", "- a\n- \n- b", "1. x\n2.  ", "- a\n  - "]) {
    assertEquals(slideSourceFromRender(slideRenderMarkdown(src)), src);
  }

  // The empty item is a unit whose text starts at the end of its line, and
  // every other offset is still the source's.
  const src = "- a\n- \n- **b**";
  const an = analyzeSlideMarkdown(src);
  assert(an.editable);
  assertEquals(an.src, src);
  assertEquals(an.kind.length, src.length);
  assertEquals(an.units.map((u) => u.emptyAt), [undefined, 6, undefined]);
  assertEquals(an.units[1].toSrc, [-1]);
  assertEquals(an.units[2].toSrc, [11]);
  assertEquals(an.kind[11], SRC_VISIBLE);
  assert(an.srcStyle[11]?.bold);

  // Typing into it fills the item.
  const r = slideInsertText(an, 6, "x");
  assertEquals(apply(src, r), "- a\n- x\n- **b**");
  assertEquals(r.anchor, 7);
});

// A text block draws text only, so the copilot refuses one holding a table or
// an image: MarkdownRenderer cannot draw a table outside a quote or an image
// alone in a top-level paragraph, and drops or runs together any other.
Deno.test("every table and image a text block draws is found and refused, and nothing else", () => {
  const tables = [
    "a | b\n--- | ---\n1 | 2",
    "a | b | c\n-|-|-",
    "| a | b |\n|---|---|\n| 1 | 2 |",
    "| a\n---\n| b",
    "intro\n\n- x\n\n  a | b\n  --- | ---",
    "> a | b\n> --- | ---",
  ];
  const images = [
    "![a](b.png)",
    "see ![a](b.png) here",
    "- ![a](b.png)",
    "> ![a](b.png)",
    "# ![a](b.png)",
    "[![a](b.png)](http://u)",
    "![a](b.png)\n![c](d.png)",
  ];
  const text = [
    "Region A | Region B | Region C",
    "a || b || c",
    "x | y\n---",
    "`![a](b)` and `a | b`",
    "!\\[a\\](b)",
    "```\na | b\n--- | ---\n```",
    // Drawn with its empty item filled (slideRenderMarkdown), the table rows
    // continue the item's text.
    "- \na | b\n--- | ---",
  ];
  const found = (src: string) => findSlideTableOrImage(src)?.kind;
  for (const src of tables) assertEquals(found(src), "table", src);
  for (const src of images) assertEquals(found(src), "image", src);
  for (const src of text) assertEquals(found(src), undefined, src);
  for (const src of [...tables, ...images, ...text]) {
    const refused = parseMarkdown(slideRenderMarkdown(src)).items.some((i) =>
      i.type === "table" || i.type === "image"
    );
    if (refused) assert(found(src), src);
  }
  assertEquals(findSlideTableOrImage("one\n\ntwo\n\n![a](b.png)"), {
    kind: "image",
    line: 4,
  });
  for (const src of [...tables, ...images]) {
    assertThrows(
      () => validateTextOnlyMarkdown(src),
      AIToolFailure,
      `${
        describeSlideTableOrImageForAI(
          "This text block",
          findSlideTableOrImage(src)!,
        )
      }.`,
    );
  }
  for (const src of text) validateTextOnlyMarkdown(src);
});

// A table in a text block cannot be drawn, so a table pasted or typed on the
// canvas must stay the text it was.
Deno.test("table syntax pasted or typed on the canvas stays text", () => {
  const paste = (src: string, text: string) =>
    apply(src, slideInsertText(analyzeSlideMarkdown(src), src.length, text))!;
  const type = (text: string) => {
    let doc = "";
    let caret = 0;
    for (const ch of text) {
      const r = slideInsertText(analyzeSlideMarkdown(doc), caret, ch);
      doc = apply(doc, r)!;
      caret = r.anchor;
    }
    return doc;
  };
  const drawn = (src: string) =>
    analyzeSlideMarkdown(src).units.map((u) => u.text).join("\n");
  const asText = (doc: string, text: string) => {
    assertEquals(findSlideTableOrImage(doc), undefined, doc);
    assert(analyzeSlideMarkdown(doc).editable, doc);
    assertEquals(drawn(doc), text, doc);
  };
  assertEquals(escapeTypedSlideText("a | b"), "a &#124; b");
  for (
    const table of [
      "a | b\n--- | ---\n1 | 2",
      "a | b | c\n-|-|-",
      "| a | b |\n|---|---|\n| 1 | 2 |",
      "| Region |\n|---|\n| A |",
    ]
  ) {
    asText(paste("", table), table);
    asText(type(table), table);
  }
  asText(paste("Intro", "\na | b\n--- | ---"), "Intro\na | b\n--- | ---");
  asText(paste("a | b", "\n--- | ---"), "a | b\n--- | ---");
  // A one-column table whose delimiter row holds no pipe, and the heading an
  // escaped `\|` would turn into one.
  for (const text of ["| a\n---\n| b", "x | y\n---"]) {
    assertEquals(findSlideTableOrImage(paste("", text)), undefined, text);
  }
  assertEquals(findSlideTableOrImage(type("x | y\n--")), undefined);
  // Inside inline code an entity draws as written, so a pipe is stored as
  // typed.
  assertEquals(
    apply("`ab`", slideInsertText(analyzeSlideMarkdown("`ab`"), 2, "|")),
    "`a|b`",
  );
  // A restyle rewrites the line without turning a pipe back into one.
  const bold = apply(
    "x &#124; y",
    slideToggleStyle(analyzeSlideMarkdown("x &#124; y"), 0, 1, "bold"),
  )!;
  assertEquals(bold, "**x** &#124; y");
});

// An insert no candidate renders as typed is stored as typed, so typing is
// never lost, and it must still store nothing slide text cannot draw. A table
// it would make (a pipe typed above a row of dashes, dashes typed under pipes
// the canvas did not write) loses its delimiter row to an escape that draws
// nothing; an insert whose escape would draw, inside a code span, or that
// makes an image is refused; a quoted table the text held stays as it was.
Deno.test("an insert the canvas cannot render as typed stores no table or image", () => {
  const insert = (src: string, pos: number, text: string) => {
    const r = slideInsertText(analyzeSlideMarkdown(src), pos, text);
    return { doc: apply(src, r)!, caret: r.anchor };
  };
  const drawn = (src: string) =>
    analyzeSlideMarkdown(src).units.map((u) => u.text).join("\n");
  let typed = { doc: "| a |", caret: 5 };
  for (const ch of ["\n", "-", "-", "-"]) {
    typed = insert(typed.doc, typed.caret, ch);
  }
  assertEquals(typed, { doc: "| a |\n\\---", caret: 10 });
  assertEquals(drawn(typed.doc), "| a |\n---");
  assertEquals(insert("> | a |\n> -", 11, "-"), {
    doc: "> | a |\n> \\--",
    caret: 13,
  });
  assertEquals(insert("- | a |\n  -", 11, "-"), {
    doc: "- | a |\n  \\--",
    caret: 13,
  });
  assertEquals(insert("x `code`\n--|--", 5, "|"), {
    doc: "x `co|de`\n\\--|--",
    caret: 6,
  });
  assertEquals(drawn("x `co|de`\n\\--|--"), "x co|de\n--|--");
  assertEquals(insert("x\n--|--", 5, "\n"), {
    doc: "x\n--|\n\\--",
    caret: 6,
  });
  for (
    const [src, pos, text] of [
      ["x `code` y", 5, "a | b\n--- | ---\n"],
      ["a `b\nc` d\n--|--", 4, "a | b\n--- | ---"],
      ["![a](b", 6, ")"],
      ["x [a](b)", 2, "!"],
    ] as const
  ) {
    assertEquals(insert(src, pos, text), { doc: src, caret: pos }, src);
  }
  assertEquals(insert("> a | b\n> --- | ---", 3, "x"), {
    doc: "> ax | b\n> --- | ---",
    caret: 4,
  });
});

// Nothing typed or pasted on the canvas stores a table or an image the text
// did not hold, at any offset of any corpus source.
Deno.test("no insert at any offset of the corpus makes a table or an image", () => {
  const count = (src: string) => {
    const tokens = createMarkdownIt({ html: true }).parse(
      slideRenderMarkdown(src),
      {},
    );
    return [
      tokens.filter((t) => t.type === "table_open").length,
      tokens.flatMap((t) => t.children ?? []).filter((c) => c.type === "image")
        .length,
    ];
  };
  for (const src of CORPUS) {
    const [tables, images] = count(src);
    for (let pos = 0; pos <= src.length; pos++) {
      for (const text of ["|", "-", "\n", "!", ")", "a | b\n--- | ---"]) {
        const r = slideInsertText(analyzeSlideMarkdown(src), pos, text);
        const [t, i] = count(apply(src, r)!);
        assert(
          t <= tables && i <= images,
          `${JSON.stringify(text)} at ${pos} of ${JSON.stringify(src)}`,
        );
      }
    }
  }
});
