// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// An official cover's head in the source: its ministry lines and logos row
// read, and the logos row (the cover's toolbar sets it) written back.

import { assertEquals } from "@std/assert";
import {
  buildFastrReportCss,
  fastrCoverHeadLogosEdit,
  fastrCoverHeadOf,
  fastrCoverLogosAlign,
  type FastrLinesEdit,
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
});
