// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// The editor's page-template operations (engine/fastr_page_template_edits.ts):
// a layout switch keeps every word and lands each slot where it belongs,
// a slot's items stop at its layout's max, and the structured scan says
// what a page lacks in the same terms the validator does.

import { assert, assertEquals } from "@std/assert";
import {
  addPageSlotEdit,
  addPageSlotItemEdit,
  type EditResult,
  FASTR_PAGE_TEMPLATES,
  fastrPageAtLine,
  fillPageSlotEdit,
  listFastrContainerDefects,
  scanFastrPages,
  switchPageLayoutEdit,
} from "../engine/mod.ts";

function apply(doc: string, r: EditResult): string {
  let out = doc;
  for (const c of [...r.changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

const TEXT = { statLabel: "New stat", card: "Text", paragraph: "New item" };

const PROFILE = `Intro paragraph.

:::page{layout=profile kicker="District profile"}
## Bombali
A short reading.
:::slot{name=map}
:::
:::slot{name=facts}
:::stat{value="1" label="A"}
:::stat{value="2" label="B"}
:::stat{value="3" label="C"}
:::
:::

After.`;

Deno.test("scan: slots with their lines, counts and emptiness", () => {
  const page = fastrPageAtLine(PROFILE, 5);
  assert(page !== undefined);
  assertEquals(page.line, 3);
  assertEquals(page.endLine, 13);
  assertEquals(page.template?.layout, "profile");
  assertEquals(
    page.slots.map((s) => [s.name, s.line, s.endLine, s.items, s.empty]),
    [["map", 6, 7, 0, true], ["facts", 8, 12, 3, false]],
  );
  assert(page.hasMain);
});

Deno.test("scan: issues carry their kind beside the model's message", () => {
  const body = `:::page{layout=profile}
## X
:::slot{name=facts}
:::stat{value="1" label="A"}
:::
:::`;
  const { issues } = scanFastrPages(body);
  const count = issues.find((i) => i.kind === "count");
  assert(count?.kind === "count");
  assertEquals([count.slot, count.n, count.min, count.max], ["facts", 1, 3, 6]);
  // The validator's words are unchanged.
  assertEquals(
    listFastrContainerDefects(body).map((d) => d.message),
    ["The `facts` slot takes 3 to 6 stats; it has 1."],
  );
});

Deno.test("add item: a stat at the slot's foot, selected to type over", () => {
  const r = addPageSlotItemEdit(PROFILE, 8, TEXT);
  const out = apply(PROFILE, r);
  assert(out.includes(`:::stat{value="3" label="C"}
:::stat{value="0" label="New stat"}
:::
:::`));
  assertEquals(out.slice(r.selection!.anchor, r.selection!.head), "0");
});

Deno.test("add item: nothing past the layout's max", () => {
  const six = PROFILE.replace(
    `:::stat{value="3" label="C"}`,
    [3, 4, 5, 6].map((n) => `:::stat{value="${n}" label="S${n}"}`).join("\n"),
  );
  assertEquals(addPageSlotItemEdit(six, 8, TEXT).changes, []);
  // Not a slot that counts items.
  assertEquals(addPageSlotItemEdit(PROFILE, 6, TEXT).changes, []);
});

Deno.test("add item: a paragraph after a blank line is a new finding", () => {
  const doc = `:::page{layout=findings}
## Findings
:::slot{name=items}
**One.** First.

**Two.** Second.
:::
:::`;
  const r = addPageSlotItemEdit(doc, 3, TEXT);
  const out = apply(doc, r);
  assert(out.includes("**Two.** Second.\n\nNew item\n:::"));
  assertEquals(out.slice(r.selection!.anchor, r.selection!.head), "New item");
  assertEquals(fastrPageAtLine(out, 1)?.slots[0].items, 3);
});

Deno.test("add slot: a missing one goes after the others, empty", () => {
  const doc = `:::page{layout=boxed}
## Aside
:::slot{name=box}
Text.
:::
:::`;
  const out = apply(doc, addPageSlotEdit(doc, 1, "notes"));
  assertEquals(
    out,
    `:::page{layout=boxed}
## Aside
:::slot{name=box}
Text.
:::
:::slot{name=notes}
:::
:::`,
  );
  // One it has, or one its layout lacks: nothing.
  assertEquals(addPageSlotEdit(out, 1, "notes").changes, []);
  assertEquals(addPageSlotEdit(doc, 1, "sidebar").changes, []);
});

Deno.test("fill slot: only an empty slot, its blank lines replaced", () => {
  const doc = PROFILE.replace(":::slot{name=map}\n", ":::slot{name=map}\n\n");
  const out = apply(doc, fillPageSlotEdit(doc, 6, "![Map](figure:abc)"));
  assert(out.includes(":::slot{name=map}\n![Map](figure:abc)\n:::\n"));
  assertEquals(fillPageSlotEdit(out, 6, "x").changes, []);
});

Deno.test("switch: stats keep their kind across layouts", () => {
  const out = apply(PROFILE, switchPageLayoutEdit(PROFILE, 3, "ladder"));
  assertEquals(
    out,
    `Intro paragraph.

:::page{layout=ladder kicker="District profile"}
## Bombali
A short reading.
:::slot{name=rows}
:::stat{value="1" label="A"}
:::stat{value="2" label="B"}
:::stat{value="3" label="C"}
:::
:::

After.`,
  );
  assertEquals(listFastrContainerDefects(out), []);
});

Deno.test("switch: the heading follows the layout's heading area", () => {
  const story = apply(PROFILE, switchPageLayoutEdit(PROFILE, 3, "story"));
  const page = fastrPageAtLine(story, 3);
  const side = page?.slots.find((s) => s.name === "side");
  assert(side !== undefined);
  assertEquals(story.split("\n")[side.line], "## Bombali");
  // The stats had nowhere of their kind to go: they join the main text.
  assert(/A short reading\.\n\n:::stat\{value="1"/.test(story));
  // And back: the heading returns to the main text, first.
  const back = apply(story, switchPageLayoutEdit(story, 3, "profile"));
  assert(
    back.includes(`kicker="District profile"}\n## Bombali\nA short reading.`),
  );
});

Deno.test("switch: attributes the new layout does not declare go", () => {
  const doc = `:::page{layout=opener number="02" tone=ink}
## Chapter
Intro.
:::`;
  const out = apply(doc, switchPageLayoutEdit(doc, 1, "exec"));
  assertEquals(out.split("\n")[0], ":::page{layout=exec tone=ink}");
  // The required side slot is there to fill.
  assert(out.includes(":::slot{name=side}\n:::"));
});

Deno.test("switch: every example keeps its words in every layout", () => {
  // Every line of text, and every word an attribute holds (a title, a
  // kicker, a cite), wherever the switch put it.
  const TEXT = /\b(?:title|label|kicker|number|delta|cite)="([^"]*)"/g;
  const words = (s: string) =>
    s.split("\n").flatMap((l) =>
      /^\s*:::/.test(l)
        ? /^\s*:::(?:page|slot)\b/.test(l)
          ? [...l.matchAll(TEXT)].map((m) => m[1])
          : /^\s*:::\s*$/.test(l)
          ? []
          : [l]
        : [l.replace(/^\*\*?(.*?)\*?\*$/, "$1")]
    ).map((l) => l.replace(/^\*\*?(.*?)\*?\*$/, "$1"))
      .filter((l) => l.trim().length > 0).sort();
  for (const from of FASTR_PAGE_TEMPLATES) {
    for (const to of FASTR_PAGE_TEMPLATES) {
      if (from.layout === to.layout) continue;
      const r = switchPageLayoutEdit(from.example, 1, to.layout);
      assert(r.changes.length > 0, `${from.layout} → ${to.layout}`);
      const out = apply(from.example, r);
      assertEquals(
        words(out),
        words(from.example),
        `${from.layout} → ${to.layout}`,
      );
      // Still one well-formed page of the new layout.
      const scan = scanFastrPages(out);
      assertEquals(scan.pages.length, 1);
      assertEquals(scan.pages[0].template?.layout, to.layout);
      assertEquals(
        scan.issues.filter((i) =>
          i.kind === "main-split" || i.kind === "slot-twice" ||
          i.kind === "slot-unknown"
        ),
        [],
        `${from.layout} → ${to.layout}`,
      );
    }
  }
});
