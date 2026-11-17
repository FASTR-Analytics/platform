// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Pins the bulletin blocks: the official covers (their head of logos and
// ministry lines, issue strip and date), the sign-off and its signers, in
// HTML and in the plain Word export.
//
// Run: deno test -A report-forge/tests/fastr_bulletin_blocks_test.ts

import { assert, assertStringIncludes } from "@std/assert";
import { Packer } from "docx";
import JSZip from "jszip";
import {
  buildFastrStructureCss,
  buildFastrWordDocument,
  coverSnippet,
  createFastrMarkdownIt,
  FASTR_BLOCK_SNIPPETS,
  FASTR_COVER_LAYOUTS,
  FASTR_COVER_LOGO_EM,
  FASTR_LOGO_ROW_EM,
  FASTR_LOGO_SIZES,
  FASTR_OFFICIAL_COVER_LAYOUTS,
  FASTR_PAGED_ATOMIC_SELECTORS,
  listFastrContainerDefects,
  logosSnippet,
  renderFastrMarkdownToHtml,
} from "../engine/mod.ts";

const BODY =
  `:::cover{layout=bulletin fill=page issue="N°07/2026" date="Août 2026"}
:::logos{src="image:a image:b" align=spread}
Ministère de la Santé
Direction préfectorale

# Bulletin mensuel
:::

Texte.

:::signoff{place="Exemple" date="11 septembre 2026"}
:::signer{label="Rédacteur"}
**M. Nom**
Gestionnaire de données
:::
:::signer{label="Approuvé par"}
**Dr Nom**
Directeur
:::
:::
`;

Deno.test("the blocks render with their classes and lines", () => {
  const html = renderFastrMarkdownToHtml(BODY, { lineAnchors: false });
  assertStringIncludes(html, `class="fm-band fm-cover fm-cover--bulletin`);
  assertStringIncludes(html, `<div class="fm-cover__issue">N°07/2026</div>`);
  assertStringIncludes(html, `<div class="fm-cover__date">Août 2026</div>`);
  // The logos row and the lines are the cover's head.
  assertStringIncludes(
    html,
    `<div class="fm-cover__head">\n<div class="fm-logos`,
  );
  assertStringIncludes(
    html,
    `<p class="fm-cover__lines">Ministère de la Santé<br>\nDirection préfectorale</p>\n</div>`,
  );
  assertStringIncludes(html, `src="image:a"`);
  assertStringIncludes(html, `<div class="fm-signer__label">Rédacteur</div>`);
  assertStringIncludes(
    html,
    `<p class="fm-signoff__at">Exemple, 11 septembre 2026</p>`,
  );
  assert(FASTR_COVER_LAYOUTS.includes("bulletin"));
  assert(listFastrContainerDefects(BODY).length === 0, "no defects");
});

Deno.test("a bulletin cover takes its own colours, and a sign-off may stand right", () => {
  const html = renderFastrMarkdownToHtml(
    BODY
      .replace("layout=bulletin", `layout=bulletin boxcolor="#c4e0a0 #548235"`)
      .replace(`:::signoff{`, ":::signoff{align=right "),
    { lineAnchors: false },
  );
  // The box is light, so its ink is dark; the strip is dark, so light.
  assertStringIncludes(
    html,
    `style="--fm-title-chars: 8; background-color: #c4e0a0; color: #1a1a1a"`,
  );
  assertStringIncludes(
    html,
    `<div class="fm-cover__issue" style="background-color: #548235; color: #ffffff">N°07/2026</div>`,
  );
  assertStringIncludes(html, `class="fm-signoff fm-signoff--right"`);
  // Without the attributes, nothing inline.
  const plain = renderFastrMarkdownToHtml(BODY, { lineAnchors: false });
  assert(!plain.includes("background-color: #"));
  assert(!plain.includes("fm-signoff--right"));
});

Deno.test("every official cover has a head, with or without logos and lines", () => {
  for (const layout of FASTR_OFFICIAL_COVER_LAYOUTS) {
    const cover = BODY.replace("layout=bulletin", `layout=${layout}`);
    const html = renderFastrMarkdownToHtml(cover, { lineAnchors: false });
    assertStringIncludes(html, `fm-cover--${layout}`);
    assertStringIncludes(html, `<div class="fm-cover__head">`);
    assertStringIncludes(html, `<div class="fm-cover__issue">N°07/2026</div>`);
    // Lines only, logos only, neither: a head while there is something to
    // hold, and the cover renders all the same.
    const linesOnly = renderFastrMarkdownToHtml(
      cover.replace(/:::logos\{[^}]*\}\n/, ""),
      { lineAnchors: false },
    );
    assertStringIncludes(linesOnly, `<div class="fm-cover__head">\n<p`);
    const bare = renderFastrMarkdownToHtml(
      `:::cover{layout=${layout} fill=page}\n# Titre\n:::\n`,
      { lineAnchors: false },
    );
    assert(!bare.includes("fm-cover__head"), layout);
    assertStringIncludes(bare, "<h1");
    assert(listFastrContainerDefects(cover).length === 0, layout);
    // The snippet the cover picker inserts is clean too.
    const snippet = coverSnippet({ layout, tone: "default" }, {
      kicker: "K",
      title: "Titre",
      sub: "Sous-titre",
      lines: ["MINISTÈRE"],
      issue: "N°1",
      date: "Mai",
    });
    assert(!snippet.includes("kicker"), snippet);
    assertStringIncludes(snippet, ":::logos\nMINISTÈRE\n# Titre");
    assert(listFastrContainerDefects(snippet).length === 0, snippet);
  }
  // Not on any other cover: its lines are an ordinary paragraph.
  const classic = renderFastrMarkdownToHtml(
    BODY.replace("layout=bulletin", "layout=centered"),
    { lineAnchors: false },
  );
  assert(!classic.includes("fm-cover__head"));
  // A banner's own colour paints its band.
  const banner = renderFastrMarkdownToHtml(
    BODY.replace("layout=bulletin", `layout=banner boxcolor="#1f4e79"`),
    { lineAnchors: false },
  );
  assertStringIncludes(
    banner,
    `<div class="fm-cover__head" style="background-color: #1f4e79; color: #ffffff">`,
  );
});

Deno.test("logos come in five sizes, each larger than the last, on a cover too", () => {
  for (const ems of [FASTR_LOGO_ROW_EM, FASTR_COVER_LOGO_EM]) {
    const steps = FASTR_LOGO_SIZES.map((z) => ems[z]);
    assert(steps.every((v, k) => k === 0 || v > steps[k - 1]), String(steps));
  }
  const css = buildFastrStructureCss();
  for (const z of FASTR_LOGO_SIZES) {
    const html = renderFastrMarkdownToHtml(
      BODY.replace(":::logos{", `:::logos{size=${z} `),
      { lineAnchors: false },
    );
    assertStringIncludes(html, `fm-logos--${z}`);
    if (z === "m") continue;
    assertStringIncludes(
      css,
      `.fm-logos--${z} { height: ${FASTR_LOGO_ROW_EM[z]}em; }`,
    );
    assertStringIncludes(
      css,
      `.fm-cover__head > .fm-logos--${z} { --fm-logo-h: ${
        FASTR_COVER_LOGO_EM[z]
      }em; }`,
    );
  }
  // An unknown size is the default; the default is never written.
  assertStringIncludes(
    renderFastrMarkdownToHtml(`:::logos{size=huge}`, { lineAnchors: false }),
    "fm-logos--m",
  );
  assert(!logosSnippet(["a"], "m").includes("size"));
  assertStringIncludes(logosSnippet(["a"], "xl"), `size=xl}`);
});

Deno.test("they keep whole on a page, and the masthead block is gone", () => {
  assert(FASTR_PAGED_ATOMIC_SELECTORS.includes(".fm-signoff"));
  const names = FASTR_BLOCK_SNIPPETS.map((r) => r.name);
  assert(
    !(names as string[]).includes("masthead") && names.includes("signoff"),
  );
  for (const r of FASTR_BLOCK_SNIPPETS) {
    if (r.name !== "signoff") continue;
    assert(listFastrContainerDefects(r.snippet).length === 0, r.name);
  }
});

Deno.test("Word prints them plainly: labels, lines, issue and date", async () => {
  const tokens = createFastrMarkdownIt().parse(BODY, {});
  const doc = buildFastrWordDocument({
    tokens,
    body: BODY,
    title: "Bulletin",
    theme: "default",
    footer: { title: "Bulletin", pageWord: "Page", ofWord: "of" },
    figure: () => undefined,
    image: () => undefined,
  });
  const zip = await JSZip.loadAsync(
    await (await Packer.toBlob(doc)).arrayBuffer(),
  );
  const xml = await zip.file("word/document.xml")!.async("string");
  for (
    const text of [
      "N°07/2026",
      "Août 2026",
      "Ministère de la Santé",
      "Rédacteur",
      "Approuvé par",
      "Exemple, 11 septembre 2026",
    ]
  ) assertStringIncludes(xml, text);
});
