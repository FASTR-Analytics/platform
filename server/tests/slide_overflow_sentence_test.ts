// Pins what the model is told of a slide that overflows its page: one clause
// per overflow cause, naming in the model's words what does not fit, along
// which axis and by how much, then how an overflow shows. The client's
// describeSlideOverflow hands it the slide editor's map from a text's
// primitive id to its slide field (SLIDE_TEXT_FIELDS, through
// slideTextField), which FIELDS reads from its source: the module imports the
// client's panther, which the server's typecheck cannot resolve.
//
//   deno test -A --no-check server/tests/slide_overflow_sentence_test.ts

import { assertEquals } from "@std/assert";
import type { PageOverflowCause } from "@timroberton/panther";
import { describeSlideOverflowForAI } from "lib";

const FIELDS: Record<string, string> = Object.fromEntries(
  [
    ...Deno.readTextFileSync(
      new URL(
        "../../client/src/components/products/slide_deck/slide_editor/slide_fields.ts",
        import.meta.url,
      ),
    ).matchAll(/primitiveId: "(\w+)",\s*field: "(\w+)"/g),
  ].map((m) => [m[1], m[2]]),
);

const TAIL =
  ". Part of it is squeezed below the size it needs, or runs into the slide's margins, past the edge of the page or over other content. The slide is broken until it fits.";

const said = (...causes: PageOverflowCause[]) =>
  describeSlideOverflowForAI(causes, (id) => FIELDS[id]);

Deno.test("every text a page names in an overflow maps to the slide field it shows", () => {
  assertEquals(FIELDS, {
    headerText: "header",
    subHeaderText: "subHeader",
    dateText: "date",
    footerText: "footer",
    coverTitle: "title",
    coverSubtitle: "subtitle",
    coverAuthor: "presenter",
    coverDate: "date",
    sectionTitle: "sectionTitle",
    sectionSubtitle: "sectionSubtitle",
  });
});

Deno.test("an overflow names what does not fit, along which axis and by how much", () => {
  const cases: [PageOverflowCause, string][] = [
    [
      {
        where: "layout",
        axis: "height",
        need: 812,
        available: 640,
        neededBy: [{ id: "a1b", need: 300 }, { id: "c3d", need: 512 }],
      },
      "blocks a1b and c3d need 27% more height than the slide's content area has",
    ],
    [
      {
        where: "layout",
        axis: "height",
        need: 641,
        available: 640,
        neededBy: [{ id: "a1b", need: 641 }],
      },
      "block a1b needs 1% more height than the slide's content area has",
    ],
    [
      {
        where: "layout",
        axis: "width",
        need: 312,
        available: 300,
        neededBy: [{ id: "e5f", need: 312 }],
      },
      "block e5f needs 4% more width than its column has",
    ],
    [
      {
        where: "layout",
        axis: "width",
        need: 40,
        available: 0,
        neededBy: [{ id: "e5f", need: 40 }],
      },
      "block e5f needs width, and its column has none",
    ],
    [
      {
        where: "layout",
        axis: "width",
        need: 0,
        available: -20,
        neededBy: [{ id: "root", need: 0 }],
      },
      "the slide's margins leave its content area no width",
    ],
    [
      {
        where: "stack",
        axis: "height",
        need: 500,
        available: 388,
        neededBy: [
          { id: "coverLogos", need: 120 },
          { id: "coverTitle", need: 200 },
          { id: "coverSubtitle", need: 100 },
          { id: "coverAuthor", need: 80 },
        ],
      },
      "the cover's logos (logos.cover), title, subtitle and presenter need 29% more height than the slide has inside its margins",
    ],
    [
      {
        where: "stack",
        axis: "width",
        need: 820,
        available: 800,
        neededBy: [{ id: "sectionTitle", need: 820 }],
      },
      "the longest word of sectionTitle needs 3% more width than the slide has inside its margins",
    ],
    [
      {
        where: "header",
        axis: "width",
        need: 1500,
        available: 1300,
        neededBy: [
          { id: "headerText", need: 900 },
          { id: "headerLogos", need: 600 },
        ],
      },
      "the longest word of header and the header's logos (logos.header) need 16% more width than the header has",
    ],
    [
      {
        where: "footer",
        axis: "width",
        need: 300,
        available: 0,
        neededBy: [{ id: "footerText", need: 300 }],
      },
      "the longest word of footer needs width, and the footer has none",
    ],
  ];
  for (const [cause, clause] of cases) {
    assertEquals(said(cause), `Its content does not fit: ${clause}${TAIL}`);
  }
  assertEquals(
    said(cases[0][0], cases[2][0]),
    `Its content does not fit: ${cases[0][1]}; ${cases[2][1]}${TAIL}`,
  );
});
