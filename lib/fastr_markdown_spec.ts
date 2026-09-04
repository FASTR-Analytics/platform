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
    {
      name: "band",
      snippet:
        `:::band{tone=dark}\n## Where the system is failing\nThree regions have never reported on time.\n:::`,
    },
    {
      name: "cover",
      snippet:
        `:::cover{tone=dark}\n# Quarterly review\nMinistry of Health · Q3 2026\n:::`,
    },
    {
      name: "steps",
      snippet:
        `:::steps\nInvestigate the two weakest regions first.\n\nDocument what the strongest region changed.\n\nRe-read this once a full year of data is in.\n:::`,
    },
    {
      name: "contents",
      snippet: `:::contents{title="Contents" depth=2}`,
    },
    {
      name: "report",
      snippet: `:::report{background=muted}`,
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

  :::band{tone=dark}
  A FULL-BLEED section: its background runs edge to edge while the text stays
  in the column. The strongest device you have — use it to mark the two or
  three moments in a report that matter.
  :::

  :::cover{tone=dark layout=classic kicker="Ministry of Health · Q3 2026" sub="Prepared for the quarterly review"}
  # A title page
  :::
  \`kicker\` is the small letterspaced line above the title, \`sub\` the
  rule-topped standfirst below it. Both also work on \`band\`.
  \`layout\` picks the cover's COMPOSITION, the tone its ground:
    classic   left-set masthead (the default)
    centered  everything on the axis, a short centred rule over the sub
    poster    an accent bar at the head, the title set huge at the foot
    spine     a bound edge — an accent rule down the left, text hanging off it
    frame     a double hairline frame, the words centred inside it
    split     title left, sub right on a vertical rule — a spread
    minimal   top-set and quiet, a hairline foot
    block     the title set as a solid block of the accent

  :::steps
  One paragraph per step. They are numbered automatically.

  Insert or reorder a step and the numbering follows.
  :::

  :::contents{title="Contents" depth=2}
  A table of contents, built from the document's own headings — you write
  nothing inside it. \`depth\` is the deepest heading level listed (default
  3), and a cover's title is never an entry. One line, no closing \`:::\`.

  :::report{background=muted numbering=sections}
  The document header. \`numbering=sections\` numbers the TOP-LEVEL headings
  (1., 1.1) — a heading inside a block is not a section, so it is skipped.

Backgrounds — say the ROLE, not the colour:

  tone = default | muted | accent | solid | dark | inverse | gradient
       | danger | warning | success | info

  Every block takes \`tone\`, and so does \`:::report\` (as \`background=\`).
  Each theme maps the six tones to its own palette, so \`tone=dark\` is the
  theme's dark and stays readable when the user switches themes. Prefer a tone.

  The last four are MEANING grounds — a saturated red, amber, green or blue
  panel with white type, the same colours the callout kinds use. Reach for
  \`tone=danger\` when a tile IS the bad news; it stays coherent across themes
  in a way \`bg="#c62828"\` cannot.

  \`tone=gradient\` is the theme's own accent-into-dark sweep — reach for it
  before writing a gradient by hand, because it re-themes with everything else.

  Literals are available and DO NOT follow a theme switch, so use one only when
  the user asks for that exact colour, gradient or image:
    \`bg="#0b3d2e"\`
    \`bg="linear-gradient(180deg,#0b3d2e,#0a2a20)"\`  (radial/conic/repeating too)
    \`bg=image:<id>\` with \`overlay=dark|light|none\`
  Text ink flips automatically from the background's luminance (for a gradient,
  the mean of its colour stops); \`ink=light|dark\` overrides it, which a
  full-range light-to-dark sweep needs since no single ink reads at both ends.

Colouring a WORD or PHRASE — again, say the role, not the colour:

  Completeness [fell 12 points]{.danger} while ANC4 [rose 4pp]{.success}.

  Roles: \`.accent .muted .danger .warning .success .info\` — the same meanings
  the callout kinds and tones carry, so a marked phrase survives a re-theme.
  On a ground that is already that colour (inside \`tone=danger\`, or a solid
  accent card) the mark returns to the ground's ink: colour the text, or the
  panel, never both. Use it sparingly — a sentence with three colours in it
  has none.

  A literal colour is available on the same span — \`[text]{color=#c62828}\`
  (hex or a named colour) — and, like a literal \`bg=\`, it does NOT follow a
  theme switch. Use one only when the user asks for that exact colour.

Sizing a WORD or PHRASE — points, like a word processor:

  The headline number was [64%]{size=18}, [up from 58%]{size=10 .muted}.

  \`size=1\` to \`size=400\`, decimals allowed (\`size=10.5\`); combine with a
  role in either order. A literal size does NOT rescale with the theme the way
  headings do — prefer headings for structure and sizes for emphasis.

Underlining — the same span, since markdown has no underline of its own:

  The [only]{underline} district to improve, [and by a lot]{.success underline}.

Figures take a width: ![caption](figure:<id>){width=wide} overhangs the text
column, \`width=full\` goes edge to edge.

Composing a report — this matters as much as the syntax:

  A plain run of headings and paragraphs will render correctly and look
  ordinary. The blocks are what make a report read as DESIGNED, and a report
  that uses none of them wastes the format. Unless the user asks for something
  plainer, build to roughly this shape:

  - OPEN with \`:::cover\`. Do this on EVERY report unless the user asks for
    something plain. Always give it a \`kicker\` and a \`sub\`: the kicker is
    the provenance line (country, system, bulletin number) and the sub is the
    standfirst (what is measured, over what period). The cover is the ONLY
    title page — a bare \`# Heading\` renders as an ordinary heading, and a
    report that opens with one reads as typed rather than published.
  - Put the two or three headline numbers in a \`:::tiles\` row of \`:::stat\`
    blocks. Give the one that matters most \`tone=solid\` so it reads as the
    finding, not one of three.
  - Mark the two or three TURNING POINTS of the argument with \`:::band\`.
    A band is the strongest device you have; three is a rhythm, seven is noise.
  - When the story has two sides — gaining and slipping, before and after,
    what changed and what did not — put them in \`:::columns\` and give the
    two columns DIFFERENT tones. The contrast does the explaining.
  - Recommendations and next steps belong in \`:::steps\`, not a bare list.
  - Caveats, definitions and sources belong in \`:::callout\`.
  - CLOSE with a short \`:::band{tone=inverse}\` — a colophon line.

  Vary the tones so consecutive blocks differ, and keep ordinary analysis in
  ordinary paragraphs: a report where everything is a block has no emphasis
  left. Aim for roughly one block per two or three paragraphs of prose.

Rules:
- \`stat\` and \`report\` are ONE-LINE blocks: they take no closing \`:::\`.
  Every other block must be closed.
- \`report\` is the document header — put it on the first line, once.
- \`band\` and \`cover\` are TOP-LEVEL sections; nesting one inside a card or a
  column cannot bleed correctly.
- Blocks nest: \`card\` belongs inside \`tiles\`, \`col\` inside \`columns\`.
  A stat reads well inside a card or a column.
- Attribute values with spaces need quotes; a bare word is a flag.
- Figures and images use the markdown embed token on its own line —
  ![caption](figure:<id>) — and render as a figure with the caption beneath.
  Do not wrap them in HTML.
- A heading inside a block is not a document section; keep \`#\` headings at the
  top level so sections stay addressable.`;
