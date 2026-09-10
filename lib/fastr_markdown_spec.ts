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
        `:::band{tone=ink}\n## Where the system is failing\nThree regions have never reported on time.\n:::`,
    },
    {
      name: "cover",
      snippet:
        `:::cover{tone=ink}\n# Quarterly review\nMinistry of Health · Q3 2026\n:::`,
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
      name: "pagebreak",
      snippet: `:::pagebreak`,
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

One blank line separates paragraphs and blocks. Every further blank line is a
line of empty space on the page, as Enter is in a word processor, so never pad
with extra blank lines; to start something on a new page use \`:::pagebreak\`.

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

  :::band{tone=ink}
  A FULL-BLEED section: its background runs edge to edge while the text stays
  in the column. The strongest device you have — use it to mark the two or
  three moments in a report that matter.
  :::

  :::cover{tone=ink layout=classic kicker="Ministry of Health · Q3 2026" sub="Prepared for the quarterly review"}
  # A title page
  :::
  \`kicker\` is the small letterspaced line above the title, \`sub\` the
  rule-topped standfirst below it. Both also work on \`band\`. A cover is a
  tall band at the head of page 1 and the report continues below it;
  \`fill=page\` makes it a title page of its own, edge to edge, with the
  report starting on page 2.
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

  :::pagebreak
  Ends the printed page here. One line, no closing \`:::\`. Any block can
  also take \`break=before\` (start it on a fresh page) or \`break=after\`
  (end the page after it). Use these sparingly: every block already keeps
  itself on one page and a heading always stays with what follows it, so a
  break is for structure (a new chapter), not for tidiness.

  :::report{background=muted numbering=sections pagesize=a4 orientation=portrait}
  The document header. \`numbering=sections\` numbers the TOP-LEVEL headings
  (1., 1.1) — a heading inside a block is not a section, so it is skipped.
  \`pagesize\` is a4 or letter and \`orientation\` portrait or landscape:
  the printed sheet, and what the editor's page boxes show. Landscape suits
  a report built around wide tables.

Backgrounds — say the ROLE, not the colour:

  tone = paper | ink | accent | warm | cool

  Every block takes \`tone\`, and so does \`:::report\` (as \`background=\`).
  A theme is five colours, and the five tones are those colours as grounds,
  each with the type that reads on it: \`paper\` a pale panel, \`ink\` the
  dark band (light on a dark theme), \`accent\` the theme's own colour,
  \`warm\` its red, \`cool\` its green. A tone stays readable when the user
  switches themes. Prefer a tone.

  \`warm\` and \`cool\` also MEAN something: they are the colours the callout
  kinds and the stat deltas use for the bad and the good, so \`tone=warm\` on
  a tile that IS the bad news stays coherent across themes in a way
  \`bg="#c62828"\` cannot. Use them for meaning, not decoration.

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
  the callout kinds and the warm and cool tones carry, so a marked phrase
  survives a re-theme. On a ground that is already a hue (inside \`tone=warm\`,
  or an accent card) the mark returns to the ground's ink: colour the text,
  or the panel, never both. Use it sparingly — a sentence with three colours in it
  has none.

  A literal colour is available on the same span — \`[text]{color=#c62828}\`
  (hex or a named colour) — and, like a literal \`bg=\`, it does NOT follow a
  theme switch. Use one only when the user asks for that exact colour.

Sizing a WORD or PHRASE — points, like a word processor:

  The headline number was [64%]{size=18}, [up from 58%]{size=10 .muted}.

  \`size=1\` to \`size=400\`, decimals allowed (\`size=10.5\`); combine with a
  role in either order. A literal size does NOT rescale with the theme the way
  headings do — prefer headings for structure and sizes for emphasis.

Highlighting — a stripe behind the words, the same span again:

  The [only]{highlight=#ffe08a} district to improve.

  Any colour a \`bg=\` takes; it does NOT re-theme, so use it for emphasis a
  reader must not miss rather than as decoration.

Underlining — the same span, since markdown has no underline of its own:

  The [only]{underline} district to improve, [and by a lot]{.success underline}.

A figure sits in the text column, never past it. ![caption](figure:<id>){width=full}
runs edge to edge like a band: for the one chart a report is built around,
at most, never for emphasis.

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
    Pick a \`layout\` for it: \`poster\` or \`split\` for a bulletin with one
    headline, \`frame\` or \`centered\` for a formal review, \`spine\` for a
    bound annual report, \`minimal\` when the user wants it quiet. Vary it
    across reports rather than reaching for classic every time. Add
    \`fill=page\` only for a formal review or annual report that wants a
    title page of its own; a bulletin or a brief keeps the cover as a band
    with the text starting right below it.
  - A formal review or an annual report of eight or more sections gets a
    \`:::contents{title="Contents" depth=2}\` line straight after the cover,
    so the reader can see the shape of it. A bulletin or a brief does not,
    whatever its section count: on a handful of pages a contents list is a
    page of noise.
  - A formal or ministerial review takes \`numbering=sections\` on the
    \`:::report\` header, so its headings read 1., 1.1, 2. — a bulletin or a
    brief does not.
  - Put the two or three headline numbers in a \`:::tiles\` row of \`:::stat\`
    blocks. Give the one that matters most \`tone=accent\` so it reads as the
    finding, not one of three.
  - Mark the two or three TURNING POINTS of the argument with \`:::band\`.
    A band is the strongest device you have; three is a rhythm, seven is noise.
  - When the story has two sides — gaining and slipping, before and after,
    what changed and what did not — put them in \`:::columns\` and give the
    two columns DIFFERENT tones. The contrast does the explaining.
  - Recommendations and next steps belong in \`:::steps\`, not a bare list.
  - Caveats, definitions and sources belong in \`:::callout\`.
  - CLOSE with a short \`:::band{tone=ink}\` — a colophon line.

  Vary the tones so consecutive blocks differ, and keep ordinary analysis in
  ordinary paragraphs: a report where everything is a block has no emphasis
  left. Aim for roughly one block per two or three paragraphs of prose.

  The report prints on pages, and the pages are what the reader holds.
  Every block keeps itself whole on one page (a callout, a band, a steps
  list, a table, a paragraph), and a heading always travels with what
  follows it, so a big block that misses the foot of a page by a line
  takes its whole height to the next page and leaves that much white
  behind. A figure is the one block that bends: short of room at the foot
  of its page it shrinks to what is left (never below six tenths of its
  size) rather than opening the next page, so a figure placed after a
  section's opening paragraph fills the page out. Only a block taller than
  a page continues onto the next, and that reads badly, so keep every
  block shorter than half a page:
  - Think in pages. A section is a heading, two or three paragraphs and
    one figure or one block: about a page. A section twice that long reads
    as two, so split it under its own heading.
  - A tiles row is three or four stats, never cards of prose. A columns
    pair is a few lines a side. A figure gets a one-line caption.
  - Open a section with a paragraph, then the figure, then the paragraph
    that reads it, not the figure straight under the heading: the heading
    and the figure would otherwise move together, and that is most of a
    page.
  - Never place two figures back to back; put prose between them.
  - Alternate blocks with prose. Two big blocks in a row leave the page
    nothing to fill the gap with.
  - Do not add \`:::pagebreak\` to tidy a page you cannot see; leave the
    breaks to the paginator. A break is for starting a new part of the
    report on a fresh page.

  Plan the pages before you write, and check them after. A page holds 100
  units of height. What things cost, at the default page size:
    a line of prose (about 14 words, paragraph spacing included) 3, a
    section heading 12, a blank line of space 2.5, a cover 60 (page 1
    only; fill=page takes the whole page), a tiles row 22, a band of two
    or three lines 25, a columns pair of a few lines a side 30, a callout
    8 plus 4 a line, a steps block 12 a step, a figure 50, a table 6 a
    row plus 6, a contents line 8 plus 2.5 an entry.
  Lay the report out page by page to between 85 and 95 units each: page 1
  is the cover, the standfirst paragraph and the tiles row; every page
  after is about one section. A page over 100 pushes its last block whole
  onto the next page and leaves its own foot empty; a page under 80 reads
  as a hole. Then call get_report_pages with the draft: it lays the draft
  out exactly as the PDF will and flags every page left short and a last
  page that is a stub. Fix what it flags by moving prose or a block across
  the page boundary, trimming, or splitting a section under its own
  heading, never with blank lines, and check again until only the last
  page is short. The last page may be short but it carries the closing
  section: a lone colophon band, or a caveat callout and the band, on a
  page of their own is a stub, so fold them into the page before or give
  the last page its section.

Rules:
- \`stat\`, \`contents\`, \`pagebreak\` and \`report\` are ONE-LINE blocks:
  they take no closing \`:::\`. Every other block must be closed.
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
