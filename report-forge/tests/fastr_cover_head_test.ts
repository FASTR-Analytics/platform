// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// An official cover's head as the cover's toolbar sets it: its ministry
// lines and logos row read from the source and written back, every line
// kept as text whatever markdown would make of it.

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  fastrCoverHeadLinesEdit,
  fastrCoverHeadLogosEdit,
  fastrCoverHeadOf,
  type FastrLinesEdit,
  renderFastrMarkdownToHtml,
} from "../engine/mod.ts";

const apply = (doc: string[], e: FastrLinesEdit) => [
  ...doc.slice(0, e.from),
  ...e.insert,
  ...doc.slice(e.to),
];

const COVER = [
  ":::report{lang=fr}",
  "",
  ":::cover{layout=letterhead fill=page}",
  ":::logos{src=image:a}",
  "REPUBLIQUE DE GUINEE",
  "Travail – Justice – Solidarité",
  "# Bulletin",
  ":::",
];

Deno.test("a cover's head reads its logos row and its lines, up to the title", () => {
  const head = fastrCoverHeadOf(COVER, 2);
  assertEquals(head.logosLine, 3);
  assertEquals(head.logos, { src: "image:a" });
  assertEquals(head.lines, [
    "REPUBLIQUE DE GUINEE",
    "Travail – Justice – Solidarité",
  ]);
  assertEquals([head.linesFrom, head.linesTo], [4, 5]);
});

Deno.test("lines written to the head stay text, and read back as typed", () => {
  const typed = [
    "# Not a heading",
    "1. Not a list",
    "- dash",
    "",
    "---",
    "Plain",
  ];
  const doc = apply(COVER, fastrCoverHeadLinesEdit(COVER, 2, typed));
  assertEquals(doc.slice(4, 9), [
    "\\# Not a heading",
    "1\\. Not a list",
    "\\- dash",
    "\\---",
    "Plain",
  ]);
  assertEquals(doc[9], "# Bulletin");
  assertEquals(fastrCoverHeadOf(doc, 2).lines, typed.filter((l) => l !== ""));
  const html = renderFastrMarkdownToHtml(doc.join("\n"), {
    lineAnchors: false,
  });
  assertStringIncludes(html, "# Not a heading<br>");
  assertStringIncludes(html, "<h1");
});

Deno.test("no lines removes them; lines on a bare cover go under its logos", () => {
  const none = apply(COVER, fastrCoverHeadLinesEdit(COVER, 2, []));
  assertEquals(none.slice(3, 5), [":::logos{src=image:a}", "# Bulletin"]);
  const back = apply(none, fastrCoverHeadLinesEdit(none, 2, ["A", "B"]));
  assertEquals(back.slice(3, 7), [
    ":::logos{src=image:a}",
    "A",
    "B",
    "# Bulletin",
  ]);
});

Deno.test("the logos row is replaced, removed, or added at the head's top", () => {
  const gone = apply(COVER, fastrCoverHeadLogosEdit(COVER, 2, undefined));
  assertEquals(gone[3], "REPUBLIQUE DE GUINEE");
  assertEquals(fastrCoverHeadOf(gone, 2).logosLine, undefined);
  const added = apply(
    gone,
    fastrCoverHeadLogosEdit(gone, 2, ":::logos{src=image:b size=l}"),
  );
  assertEquals(added.slice(3, 5), [
    ":::logos{src=image:b size=l}",
    "REPUBLIQUE DE GUINEE",
  ]);
  const swapped = apply(
    added,
    fastrCoverHeadLogosEdit(added, 2, ":::logos{src=image:c}"),
  );
  assertEquals(swapped[3], ":::logos{src=image:c}");
  assertEquals(swapped.length, added.length);
});
