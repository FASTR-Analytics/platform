// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// The one authoritative FASTR Markdown reference. A host's AI authoring brief
// and the in-editor guide both read from here, so the syntax cannot drift
// between what the model is told and what an author is shown. The blocks themselves are defined in fastr_markdown_blocks.ts.
// =============================================================================

import type { FastrBlockName } from "./fastr_markdown_blocks.ts";
import {
  FASTR_PAGE_TEMPLATES,
  fastrPageTemplateIndex,
} from "./fastr_page_templates.ts";

// Insertable examples, used by the editor guide's click-to-insert rows. Labels
// are translated in the component; these snippets are syntax, not prose.
export const FASTR_BLOCK_SNIPPETS: { name: FastrBlockName; snippet: string }[] =
  [
    {
      name: "callout",
      snippet:
        `:::callout{kind=warning title="Data caveat"}\nReporting completeness was 62% this quarter.\n:::`,
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
      name: "logos",
      snippet: `:::logos{align=center}`,
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
      snippet: `:::report{orientation=portrait}`,
    },
    {
      name: "page",
      snippet: FASTR_PAGE_TEMPLATES[0].placeholder,
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

  :::band{tone=accent}
  A FULL-BLEED section: its background runs edge to edge while the text stays
  in the column. The strongest device you have — use it to mark the two or
  three moments in a report that matter. Inside a report give it a light
  tone (accent, warm, cool); ink is for covers.
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
  3), and a cover's title is never an entry. From 14 entries the list runs
  in two columns. It is always a page of its own: the page ends before and
  after it. One line, no closing \`:::\`.

  :::pagebreak
  Ends the printed page here. One line, no closing \`:::\`. A section does
  not need one: the next \`#\` section follows on the same page, and the
  paginator never leaves a heading at a page's foot. Use one only for a
  chapter turn in a long report, below a page that is already about full,
  and never to tidy a page.

  :::logos{src="image:<id> image:<id>" align=left|center|right|spread size=s|m|l}
  A row of logos: the ministry's, the partners', FASTR's. One line, no
  closing \`:::\`. Each logo is an image the USER placed from Widgets → Logos,
  so never invent an \`image:\` id: keep, move or re-align a logos line that
  is already there, and when the user asks for logos you cannot see, leave
  the line out and tell them to add it from Widgets → Logos. It sits well as
  the first or last line inside a cover, or as the report's last line.

  :::report{orientation=portrait}
  The document header. Sections are unnumbered by default. Write
  \`numbering=sections\` on it only when the user asks for numbered
  sections: it numbers the TOP-LEVEL headings (1., 1.1), and a heading
  inside a block is not a section, so it is skipped.
  The page prints white: never write \`background=\` on the header unless
  the user asks for a coloured page.
  Reports print on A4. \`orientation\` is portrait or landscape: the
  printed sheet, and what the editor's page boxes show. Landscape suits a
  report built around wide tables. Never write a page size.

  :::page{layout=story kicker="Kenema District"}
  :::slot{name=side}
  ## Closing the reporting gap
  :::
  The story's prose: the page's main text.
  :::slot{name=media}
  :::
  :::
  A PAGE TEMPLATE: a whole printed page laid out to a fixed design that
  plain blocks cannot compose. Its named areas are \`:::slot{name=…}\`
  blocks directly inside it; whatever stands in the page outside every slot
  is its MAIN text, and must be one run. Each layout has its own slots,
  attributes and limits, so call get_page_template with every layout you
  will use (all in one call) before you write one, and follow each example's
  shape. The layouts:
${fastrPageTemplateIndex()}

Backgrounds — say the ROLE, not the colour:

  tone = paper | ink | accent | warm

  Every block takes \`tone\`, and so does \`:::report\` (as \`background=\`)
  — except the \`tiles\` and \`columns\` grids themselves: never tone a grid,
  tone the cards or columns inside it.
  A theme is four colours, and the four tones are those colours as grounds,
  each with the type that reads on it: \`paper\` a pale panel, \`ink\` the
  dark band (light on a dark theme), \`accent\` the theme's own colour, and
  \`warm\` its warm pole, which is whatever that is ON THAT THEME: a rust, a
  wine, a sepia, or on Minimal a warm grey. A tone stays readable when the
  user switches themes. Prefer a tone.

  \`warm\` and \`accent\` also MEAN something: they are the colours the callout
  kinds and the stat deltas use for the bad news and the good (the meaning
  rides on the TEMPERATURE, not on a red and a green), so \`tone=warm\` on
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

Aligning a PARAGRAPH — \`{align=…}\` at the end of its LAST line, after a
space:

  The service held up in every region this quarter, and the gains of the
  last two years were kept. {align=justify}

  \`left\` (the default, never written), \`center\`, \`right\` or
  \`justify\`. It aligns that whole paragraph. A heading takes it at
  the end of its own line: \`## Findings {align=center}\`. Lists and blocks
  do not. Leave text to the theme unless the user asks for an alignment.

A figure is as wide as the text column, at its own aspect, and the same size
wherever it falls, unless its line says otherwise. Leave every chart at the
column width (write no width): that is the house size, and it prints its
labels large enough to read. ![caption](figure:<id>){width=medium} takes
three quarters of the column: use it only when the user asks, or for a chart
that will not otherwise fit any page (a tall, square one under its section's
opening paragraph). {width=small} (half the column) prints labels too small
to read: never write it unless the user asks. Never shrink a chart to make a
page fit; move prose instead. {width=full} runs edge to edge like a band: for
the one chart a report is built around, at most, never for emphasis.

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
    so the reader can see the shape of it. It takes that page alone, so
    nothing shares it. A bulletin or a brief does not,
    whatever its section count: on a handful of pages a contents list is a
    page of noise.
  - Headings are not numbered, whatever kind of report it is. Write
    \`numbering=sections\` on the \`:::report\` header only when the user
    asks for numbered sections, and keep it when the report already has it.
  - A \`:::tiles\` row of \`:::stat\` blocks is OPTIONAL, and most reports
    should not have one. Use it only when the report rests on two to four
    separate headline numbers that each stand on their own (different
    indicators, or a level beside its change) and the reader needs them
    before anything else. Do not use it to restate one trend as several
    numbers, to repeat what a figure right below shows, to fill the cover's
    page, or because the format has it: one key number goes in the
    standfirst or a sentence, and a report about a single indicator rarely
    needs tiles at all. When you do use one, give the stat that matters most
    \`tone=accent\` so it reads as the finding, not one of three.
  - Mark the two or three TURNING POINTS of the argument with \`:::band\`.
    A band is the strongest device you have; three is a rhythm, seven is noise.
    A band inside the report takes a light tone (warm, cool or accent), never
    ink: a dark bar across the middle of a page reads as a divider. A band is
    the turning point in a sentence or two (up to about 40 words), never a
    paragraph of analysis with its numbers: that is a callout. Never end a
    section on a band straight before a page template: the page goes white
    under it.
  - When the story has two sides — gaining and slipping, before and after,
    what changed and what did not — put them in \`:::columns\` and give the
    two columns DIFFERENT tones. The contrast does the explaining.
  - Recommendations and next steps belong in \`:::steps\`, not a bare list.
  - Caveats, definitions and sources belong in \`:::callout\`. Put a
    section's callout between its paragraphs rather than last when the
    section runs near a page's foot: a closing callout that misses the foot
    lands alone at the top of the next page, cut off above the next
    section, while a paragraph runs on across the page.
  - Page templates (\`:::page\`) are what make a long report read as
    DESIGNED, and a full report without them falls short of the format.
    Give a full report (a review, an assessment, an annual report: anything
    past a short brief) about ONE TEMPLATE PAGE IN THREE: three or four in
    a ten-page report, eight to ten in a twenty-page one. A short brief
    takes one or two. Wherever a section's content has the shape a layout
    is built for, write it as that template rather than as plain blocks.
    A twenty-page assessment runs like this, and a shorter report keeps the
    order and drops the pages it has no content for:
      1. a \`fill=page\` cover, then the \`:::contents\` alone on page 2,
         and a short reading-guide section opening page 3;
      2. \`exec\`: the headline numbers in its sidebar, the summary and a
         \`:::steps\` of recommendations beside them;
      3. a prose section on why the subject matters, with a callout;
      4. \`opener\` before each main part (usually one or two; its
         \`number\` counts the parts, "01", "02");
      5. the analysis: prose sections, each with its figure and the
         paragraphs that read it, and a template after every one or two of
         them where the content fits one: \`summary\` for the headline
         totals and the same measure by region, \`timeline\` for the
         events behind the trends, \`compare\` for then and now or two
         regions;
      6. \`findings\` for the findings at a glance, then \`scorecard\` for
         the regions against bands straight after it, then a prose section
         reading the scorecard;
      7. \`targets\` for the benchmarks or national goals, measured;
      8. \`method\` for sources, coverage, methods and limitations;
      9. the conclusion, closing on its \`:::steps\`;
      10. \`back\` as the last page, holding the citation (leave
          \`method\`'s cite slot out then, so it is not printed twice).
    That is ten templates. A report with no executive summary may put
    \`findings\` or \`summary\` straight after the cover instead. The rest of
    the catalogue serves when the content does: \`ladder\` for what a
    programme delivered, \`profile\` for one area (repeated per district in
    an annex), \`boxed\` for a reading page with a method or definition
    aside; \`story\`, \`voices\`, \`spotlight\` and \`feature\` only when the
    user has given you the story or the quote: never invent one.
    Look every layout up with get_page_template (all of them in one call) before you write it. Two
    templates may run back to back when they belong together (findings,
    then the scorecard); never three. A template's
    numbers come from the same data as the figures, and a template does
    not replace a section's figure. A template is a page of its own: it starts a
    fresh page, the next block starts another, and its own heading is a
    section, so a template can open a section with no \`:::pagebreak\`
    above it. The page before it therefore ends where the template starts,
    so put a template where a page ends anyway (straight after a
    \`fill=page\` cover, after another template, or as the last page) or
    make the page before it full (75 units or more) with its own section's
    content: end the section on its callout or steps, carry a paragraph
    across, and never write a section only to fill it.
    Write one only when you have what its layout is built for (every slot,
    and the item counts get_page_template gives): a template whose content
    stops part way down prints the rest of its page empty, and
    get_report_pages flags it UNDERFILLED. Its areas are fixed: what does
    not fit is cut off, and get_report_pages flags it OVERFULL. Leave a
    photo slot (\`media\`) empty: the user adds the photo, and you never
    invent an \`image:\` id.
  - END with the last section's own content (the caveats, the next steps).
    Do not close on a band: in print a band stops wherever the text above it
    does, so a closing band floats in the middle of the last page. A source
    or colophon line is a short plain paragraph at the very end.

  Vary the tones so consecutive blocks differ, and keep ordinary analysis in
  ordinary paragraphs: a report where everything is a block has no emphasis
  left. Aim for roughly one block per two or three paragraphs of prose.

  The report prints on pages, and the pages are what the reader holds.
  Every block keeps itself whole on one page (a callout, a band, a steps
  list, a table, a figure, a paragraph), and a heading always travels with
  what follows it, so a big block that misses the foot of a page by a line
  takes its whole height to the next page and leaves that much white
  behind. A figure does NOT bend to its page: it is the size it is wherever
  it falls, so a full-width chart is a large block and plans like one. Only
  a block taller than a page continues onto the next, and that reads badly,
  so keep every block you write shorter than half a page (a figure is the
  exception: it is as tall as its width and aspect make it, and is never
  taller than a page):
  - Think in pages. A section is a heading, two or three paragraphs and
    one figure or one block: about a page. A section twice that long reads
    as two, so split it under its own heading.
  - A tiles row is three or four stats, never cards of prose. A columns
    pair is a few lines a side. A figure gets a one-line caption that
    states what it shows as a finding ("Completeness held above 90% until
    early 2025"), not the chart's title again: the chart already names its
    measure and period.
  - Open a section with a paragraph, then the figure, then the paragraph
    that reads it, not the figure straight under the heading: the heading
    and the figure would otherwise move together, and that is most of a
    page.
  - Give every chart the analysis that reads it: two or three paragraphs,
    about 120 words or more per chart. Lead with the finding, then say what
    the chart shows, the exceptions and what drives them, and what it means
    for the reader. A sentence, a chart and another sentence reads as a
    caption, not an analysis.
  - Never place two figures back to back; put prose between them.
  - Alternate blocks with prose. Two big blocks in a row leave the page
    nothing to fill the gap with. And the other way: every page but a
    template's carries a figure, a table or a block. A page of nothing but
    paragraphs reads as a wall of text between the designed pages, so give
    it its section's callout, columns or steps.
  - Let the sections FLOW: a new \`#\` section starts straight under the
    last one, on the same page, with no \`:::pagebreak\` above it. Short
    sections share a page, as in any professionally set report; a break
    before every section leaves most pages half empty. The paginator
    carries a heading over to the next page with what follows it, so a
    heading never ends a page. The one place for a break is a chapter turn
    in a long report, below a page that is already about full.

  Plan the pages before you write, and check them after. A page holds 100
  units of height. What things cost, at the default page size:
    a line of prose (about 14 words, paragraph spacing included) 3, a
    heading 10 (an h1 section heading 11), a blank line of space 2.5, a
    cover 60 (page 1 only; fill=page takes the whole page), a tiles row
    22, a band of two or three lines 25, a columns pair of a few lines a
    side 30, a callout 8 plus 4 a line, a steps block 12 a step, a
    figure at the column width 45 to 75 by its shape (a wide chart the
    low end, a square one the high end; {width=medium} 35 to 55), a table 6 a row plus 6, a logos row 8, a
    contents block 100 (a page of its own, straight after the cover),
    a page template 100 (always a page of its own).
  Lay the report out page by page: page 1 is the cover, the standfirst
  paragraph and the opening of the first section (or a tiles row, when the
  report has one); the sections then follow one another down the pages,
  each starting where the last one ended. Fill every page but the last to
  between 85 and 100 units. A page over 100 pushes its last block whole
  onto the next page and leaves its own foot empty, and a page under 75
  reads as a hole: when a figure or a table will not fit the foot of a
  page, move a paragraph from after it to before it, or end the page with
  a callout, so the page fills and the big block opens the next; never
  shrink the figure to make it fit. A page template and the contents each
  take a page alone, so the page before one ends where it starts: count
  that page as well.
  The draft is then laid out exactly as the PDF will be (rewrite_report
  does it when you propose, and holds a draft it flags for small fixes;
  get_report_pages does it for the report as it stands), which flags
  every page left short (SHORT, including a page
  a \`:::pagebreak\` or a template leaves short, and SPILL for one that
  holds only a section's overrun), a template whose content stops part way
  down its page (UNDERFILLED) or holds more than it shows (OVERFULL), and
  a last page that is a stub, as well as a chart set small (SMALL), a
  section whose charts have too little prose around them (THIN), a block
  cut off above the next section (DETACHED), a page of prose alone
  (PLAIN), a band of analysis (LONG BAND) or one straight before a template
  (BAND BEFORE TEMPLATE), a findings page of fewer than five (SPARSE) and a
  paragraph printed twice (REPEATED). A page more than half empty is marked
  MUST FIX: a draft is never proposed with one. Fix what it flags by moving prose or a block
  across the page boundary, trimming, or dropping a break, never with
  blank lines, until only the last page is short. The
  last page may be short but it carries the closing section: a lone
  caveat callout on a page of its own is a stub, so fold it into the page
  before or give the last page its section.

Rules:
- \`stat\`, \`contents\`, \`pagebreak\`, \`logos\` and \`report\` are ONE-LINE blocks:
  they take no closing \`:::\`. Every other block must be closed.
- \`report\` is the document header — put it on the first line, once.
- \`band\` and \`cover\` are TOP-LEVEL sections; nesting one inside a card or a
  column cannot bleed correctly.
- \`page\` is TOP-LEVEL too, never inside another block; a \`slot\` stands
  directly inside a \`page\`, each slot name once, and a page never holds a
  band or a cover.
- Blocks nest: \`card\` belongs inside \`tiles\`, \`col\` inside \`columns\`.
  A stat is a tile of its own: it sits DIRECTLY in a \`:::tiles\` row (a row
  of bare \`:::stat\` lines) or in a page template's slot,
  never inside a \`card\` or a \`col\` — a stat nested that way is rejected.
- Attribute values with spaces need quotes; a bare word is a flag.
- Figures and images use the markdown embed token on its own line —
  ![caption](figure:<id>) — and render as a figure with the caption beneath.
  Do not wrap them in HTML.
- A heading inside a block is not a document section; keep \`#\` headings at the
  top level so sections stay addressable.`;
