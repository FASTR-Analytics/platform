// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// A cover's head and logos in the source: its ministry lines and its logos
// rows by position (the top, the bottom) read and written back, and what
// the compiler and the stylesheet make of them.

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildFastrReportCss,
  coverLogosSnippet,
  fastrCoverHeadOf,
  fastrCoverLogosAlign,
  fastrCoverLogosEdit,
  fastrCoverLogosOf,
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
  "",
  "Body.",
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

Deno.test("a cover's logos are found by position, nested blocks skipped", () => {
  const doc = [
    ":::cover{layout=classic}",
    ":::logos{src=image:a}",
    "# T",
    ":::callout",
    ":::logos{src=image:x at=bottom}",
    ":::",
    ":::logos{src=image:b at=bottom}",
    ":::",
  ];
  const logos = fastrCoverLogosOf(doc, 0);
  assertEquals(logos.top?.line, 1);
  assertEquals(logos.bottom?.line, 6);
  assertEquals(logos.end, 7);
  // A bottom row is never the head's.
  assertEquals(
    fastrCoverHeadOf([":::cover", ":::logos{at=bottom}", "# T", ":::"], 0)
      .logosLine,
    undefined,
  );
});

Deno.test("a position's row is replaced, removed, or added where it stands", () => {
  const gone = apply(COVER, fastrCoverLogosEdit(COVER, 2, "top", undefined));
  assertEquals(gone[3], "REPUBLIQUE DE GUINEE");
  assertEquals(fastrCoverLogosOf(gone, 2).top, undefined);
  const top = apply(
    gone,
    fastrCoverLogosEdit(gone, 2, "top", coverLogosSnippet(["b"], "l", "top")),
  );
  assertEquals(top.slice(3, 5), [
    ':::logos{src="image:b" size=l}',
    "REPUBLIQUE DE GUINEE",
  ]);
  const bottom = apply(
    top,
    fastrCoverLogosEdit(
      top,
      2,
      "bottom",
      coverLogosSnippet(["c"], undefined, "bottom"),
    ),
  );
  assertEquals(bottom.slice(7, 9), [
    ':::logos{src="image:c" at=bottom}',
    ":::",
  ]);
  assertEquals(fastrCoverLogosOf(bottom, 2).bottom?.line, 7);
  const swapped = apply(
    bottom,
    fastrCoverLogosEdit(bottom, 2, "bottom", ":::logos{src=image:d at=bottom}"),
  );
  assertEquals(swapped[7], ":::logos{src=image:d at=bottom}");
  assertEquals(swapped.length, bottom.length);
});

Deno.test("a bulletin splits its logos either side; a bottom row marks its cover", () => {
  const html = renderFastrMarkdownToHtml(
    ':::cover{layout=bulletin date="Mai"}\n:::logos{src="image:a image:b image:c"}\nLINE\n# T\n\n:::logos{src="image:d" at=bottom}\n:::\n',
    { lineAnchors: false },
  );
  assertStringIncludes(html, "fm-cover--foot fm-cover--dated");
  assertStringIncludes(
    html,
    '<span class="fm-logos__side fm-logos__side--start"><img class="fm-logo" src="image:a" alt=""><img class="fm-logo" src="image:b" alt=""></span><span class="fm-logos__side fm-logos__side--end"><img class="fm-logo" src="image:c" alt=""></span>',
  );
  assertStringIncludes(html, "fm-logos--at-bottom");
  // Elsewhere a row is not split, and a plain cover with no date is not dated.
  const plain = renderFastrMarkdownToHtml(
    ':::cover{layout=letterhead date="Mai"}\n:::logos{src="image:a image:b"}\n# T\n:::\n',
    { lineAnchors: false },
  );
  assertEquals(plain.includes("fm-logos__side"), false);
  assertEquals(plain.includes("fm-cover--foot"), false);
});

Deno.test("a cover's logos take align= only where the layout leaves it to them", () => {
  assertEquals(
    ["bulletin", "letterhead", "seal", "banner"].map(fastrCoverLogosAlign),
    [false, true, false, false],
  );
  assertEquals(
    ["classic", "centered", "frame", "split", undefined].map(
      fastrCoverLogosAlign,
    ),
    [true, false, false, true, true],
  );
  const css = buildFastrReportCss("default", undefined, "", {});
  const rule = css.slice(
    css.indexOf(".fm-cover--letterhead > .fm-cover__head > .fm-logos {"),
  );
  assertEquals(
    rule.slice(0, rule.indexOf("}")).includes("align-self: stretch"),
    true,
  );
  assertStringIncludes(css, ".fm-cover > .fm-logos--at-bottom {");
  assertStringIncludes(css, ".fm-logos--at-bottom.fm-logos--xl {");
});
