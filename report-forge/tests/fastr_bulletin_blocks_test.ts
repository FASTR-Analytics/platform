// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Pins the bulletin blocks: the masthead (a logos row's first and last logo
// either side of its lines), the sign-off and its signers, and the bulletin
// cover's issue strip and date, in HTML and in the plain Word export.
//
// Run: deno test -A report-forge/tests/fastr_bulletin_blocks_test.ts

import { assert, assertStringIncludes } from "@std/assert";
import { Packer } from "docx";
import JSZip from "jszip";
import {
  buildFastrWordDocument,
  createFastrMarkdownIt,
  FASTR_BLOCK_SNIPPETS,
  FASTR_COVER_LAYOUTS,
  FASTR_PAGED_ATOMIC_SELECTORS,
  listFastrContainerDefects,
  renderFastrMarkdownToHtml,
} from "../engine/mod.ts";

const BODY =
  `:::cover{layout=bulletin fill=page issue="N°07/2026" date="Août 2026"}
:::masthead
:::logos{src="image:a image:b" align=spread}
Ministère de la Santé
Direction préfectorale
:::

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
  assertStringIncludes(html, `class="fm-masthead"`);
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

Deno.test("they keep whole on a page, and the Widgets menu offers them", () => {
  assert(FASTR_PAGED_ATOMIC_SELECTORS.includes(".fm-masthead"));
  assert(FASTR_PAGED_ATOMIC_SELECTORS.includes(".fm-signoff"));
  const names = FASTR_BLOCK_SNIPPETS.map((r) => r.name);
  assert(names.includes("masthead") && names.includes("signoff"));
  for (const r of FASTR_BLOCK_SNIPPETS) {
    if (r.name !== "masthead" && r.name !== "signoff") continue;
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
