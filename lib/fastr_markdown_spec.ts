// =============================================================================
// The one authoritative FASTR Markdown reference. The AI authoring brief
// (build_system_prompt.ts) and the in-editor guide both read from here, so the
// syntax cannot drift between what the model is told and what an author is
// shown. The blocks themselves are defined in fastr_markdown_blocks.ts.
// =============================================================================

import type { FastrBlockName } from "./fastr_markdown_blocks.ts";

// Insertable examples, used by the editor guide's click-to-insert rows. Labels
// are translated in the component; these snippets are syntax, not prose.
export const FASTR_BLOCK_SNIPPETS: { name: FastrBlockName; snippet: string }[] =
  [
    {
      name: "callout",
      snippet: `:::callout{kind=warning title="Data caveat"}\nReporting completeness was 62% this quarter.\n:::`,
    },
    {
      name: "tiles",
      snippet:
        `:::tiles{cols=3}\n:::card{title="ANC4"}\nCoverage rose 4pp.\n:::\n:::card{title="Deliveries"}\nFlat against last year.\n:::\n:::card{title="PNC"}\nStill the weakest link.\n:::\n:::`,
    },
    {
      name: "stat",
      snippet: `:::stat{value="64%" label="ANC4 coverage" delta="+3pp" dir=up}`,
    },
    {
      name: "columns",
      snippet:
        `:::columns{cols=2}\n:::col\nCommentary on the left.\n:::\n:::col\nCommentary on the right.\n:::\n:::`,
    },
    {
      name: "quote",
      snippet:
        `:::quote{cite="Dr N. Kamara, DHMT"}\nThe data finally matches what we see in the facilities.\n:::`,
    },
  ];

// English, model-facing. Kept terse: the model already knows markdown, so this
// documents only what is NOT standard markdown.
export const FASTR_MD_SYNTAX_DOC =
  `FASTR Markdown is ordinary markdown (headings, paragraphs, lists, tables,
links, bold/italic) PLUS a small set of \`:::\` container blocks. The report's
design comes from a theme stylesheet chosen by the user — you must NEVER write
CSS, a <style> block, class attributes, or raw layout HTML. Reach for a block
instead.

Blocks (open with \`:::name{attributes}\`, close with a bare \`:::\`):

  :::callout{kind=note|info|success|warning|danger title="optional title"}
  Any markdown. Use for caveats, key findings and definitions.
  :::

  :::tiles{cols=2|3|4}
  :::card{title="optional title" accent}
  Any markdown. \`accent\` fills the card with the theme's accent colour.
  :::
  :::

  :::stat{value="64%" label="ANC4 coverage" delta="+3pp" dir=up|down|flat}

  :::columns{cols=2|3}
  :::col{span=2}
  Any markdown. \`span\` makes a column wider.
  :::
  :::

  :::quote{cite="optional attribution"}
  A pull quote — larger and set apart from body text.
  :::

Rules:
- \`stat\` is a ONE-LINE block: it takes no closing \`:::\`. Every other block
  must be closed.
- Blocks nest: \`card\` belongs inside \`tiles\`, \`col\` inside \`columns\`.
  A stat reads well inside a card or a column.
- Attribute values with spaces need quotes; a bare word is a flag.
- Figures and images use the markdown embed token on its own line —
  ![caption](figure:<id>) — and render as a figure with the caption beneath.
  Do not wrap them in HTML.
- A heading inside a block is not a document section; keep \`#\` headings at the
  top level so sections stay addressable.`;
