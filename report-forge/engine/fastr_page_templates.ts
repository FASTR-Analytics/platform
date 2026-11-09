// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// Page templates: `:::page{layout=…}`, a whole printed page with a fixed
// composition, holding named `:::slot{name=…}` areas. Text in the page but in
// no slot is the page's MAIN text. This is THE declaration of every layout:
// the renderer, the stylesheet (one grid per layout, report_fastr_css.ts),
// the validator (listFastrContainerDefects), the AI brief's index and its
// get_page_template tool, the Insert menu's gallery and the Word export all
// read it, so a layout cannot exist in one and not another.
//
// Data only: no runtime import from the block layer, which imports this.
// =============================================================================

// What a slot holds, which is what the validator counts against min/max:
//   markdown    free prose; not counted
//   paragraphs  prose where each paragraph is one item (a finding, an event)
//   stats       `:::stat` lines directly in the slot
//   cards       `:::card` blocks directly in the slot
//   media       one image or figure embed, or nothing (the editor then shows
//               an Add photo box, and print leaves the area to the ground)
//   figure      one figure or image embed
//   table       a markdown table
//   quote       the words of a pull quote
export type FastrTemplateAccepts =
  | "markdown"
  | "paragraphs"
  | "stats"
  | "cards"
  | "media"
  | "figure"
  | "table"
  | "quote";

export type FastrTemplateSlot = {
  name: string;
  accepts: FastrTemplateAccepts;
  required: boolean;
  // Item bounds for paragraphs, stats and cards.
  min?: number;
  max?: number;
  // The fence attributes the slot reads (`title`, `label`, `cite`, `tone`).
  attrs?: readonly string[];
  // The ground the slot takes when its fence names none (the renderer
  // applies it, so a theme switch still restyles it).
  defaultTone?: string;
  // Model-facing: what goes here.
  purpose: string;
};

export type FastrTemplateAttr = {
  name: string;
  // A closed list, or undefined for free text.
  values?: readonly string[];
  purpose: string;
};

export type FastrPageTemplate = {
  layout: string;
  // English; the editor translates through fastrTemplateLabel.
  label: string;
  // Model-facing, one line: the page this is for.
  useWhen: string;
  // The page fence's own attributes, beyond `layout` and `tone`.
  attrs: readonly FastrTemplateAttr[];
  main: { required: boolean; purpose: string };
  // Where the page's heading stands: `main`, or a slot. A heading there is
  // a document section (outline, contents, numbering); one anywhere else in
  // the page is not.
  headingArea: string;
  slots: readonly FastrTemplateSlot[];
  // A whole page as an author would write it, with real content:
  // get_page_template shows it to the model as the page to follow. Tests hold
  // every example to the validator.
  example: string;
  // The same page with generic text that says what goes where, at the
  // example's length so the page and its gallery tile fill the same: what
  // the Insert menu inserts and previews. Validated like the example.
  placeholder: string;
};

const KICKER: FastrTemplateAttr = {
  name: "kicker",
  purpose: "the small letterspaced line above the heading",
};

export const FASTR_PAGE_TEMPLATES: readonly FastrPageTemplate[] = [
  {
    layout: "story",
    label: "Story",
    useWhen:
      "a case study or district success story: the headline in a gutter column beside the prose, a photo across the page",
    attrs: [KICKER, {
      name: "media",
      values: ["bottom", "top"],
      purpose: "where the photo stands (default bottom)",
    }],
    main: { required: true, purpose: "the story, three or four paragraphs" },
    headingArea: "side",
    slots: [
      {
        name: "side",
        accepts: "markdown",
        required: true,
        purpose: "the story's heading, nothing else",
      },
      {
        name: "media",
        accepts: "media",
        required: false,
        purpose: "one photo or figure; leave empty for the user to add one",
      },
    ],
    example: `:::page{layout=story kicker="Kenema District"}
:::slot{name=side}
## Closing the reporting gap
:::
In 2024 only six in ten facilities in Kenema sent their monthly report on time. Nurses filled the registers, but the forms waited in the facility until someone travelled to the district office.

The district health team paired every late facility with a neighbour that reported reliably, and the two travelled together on the first Monday of each month.

By the third quarter of 2025, nine in ten facilities were on time, and the district's data meeting had numbers to discuss instead of gaps.
:::slot{name=media}
:::
:::`,
    placeholder: `:::page{layout=story kicker="Place or programme"}
:::slot{name=side}
## Story headline
:::
Open with the situation before the change: what was not working, for whom, and how the numbers showed it.

Then say what was done about it: who acted, what they changed and when, in plain words a reader outside the programme can follow.

Close with what changed in the data and what it meant on the ground, with the number that shows it.
:::slot{name=media}
:::
:::`,
  },
  {
    layout: "summary",
    label: "Year in numbers",
    useWhen:
      "a year or quarter in numbers: two or three headline totals, then the same story broken down by region, district or programme",
    attrs: [KICKER],
    main: {
      required: true,
      purpose: "a heading and one or two sentences of standfirst",
    },
    headingArea: "main",
    slots: [
      {
        name: "headline",
        accepts: "stats",
        required: true,
        min: 2,
        max: 3,
        purpose: "the headline totals",
      },
      {
        name: "breakdown",
        accepts: "stats",
        required: false,
        min: 2,
        max: 12,
        attrs: ["title"],
        purpose: "the breakdown, one stat per region or programme",
      },
    ],
    example: `:::page{layout=summary}
## 2025 in numbers
In 2025 the health system recorded more visits than in any year since reporting began.
:::slot{name=headline}
:::stat{value="4.1M" label="Outpatient visits"}
:::stat{value="1.2M" label="Antenatal visits"}
:::stat{value="186k" label="Facility deliveries"}
:::
:::slot{name=breakdown title="Outpatient visits by region"}
:::stat{value="1.3M" label="Western Area"}
:::stat{value="1.0M" label="Eastern"}
:::stat{value="0.9M" label="Southern"}
:::stat{value="0.6M" label="Northern"}
:::stat{value="0.3M" label="North West"}
:::
:::`,
    placeholder: `:::page{layout=summary}
## The period in numbers
One or two sentences on what the numbers below show, and over what period.
:::slot{name=headline}
:::stat{value="0.0M" label="First headline total"}
:::stat{value="0.0M" label="Second headline total"}
:::stat{value="000k" label="Third headline total"}
:::
:::slot{name=breakdown title="First headline total by area"}
:::stat{value="0.0M" label="Area A"}
:::stat{value="0.0M" label="Area B"}
:::stat{value="0.0M" label="Area C"}
:::stat{value="0.0M" label="Area D"}
:::stat{value="0.0M" label="Area E"}
:::
:::`,
  },
  {
    layout: "findings",
    label: "Key findings",
    useWhen:
      "the findings at a glance, for a reader who reads one page: five or six findings, numbered",
    attrs: [KICKER],
    main: { required: true, purpose: "the page's heading" },
    headingArea: "main",
    slots: [
      {
        name: "items",
        accepts: "paragraphs",
        required: true,
        min: 3,
        max: 6,
        purpose:
          "one paragraph per finding, five or six of them (fewer leave the page a third gaps): a bold lead sentence, then two sentences of support with the number behind it. Mark a bad-news lead `**[…]{.danger}**` and its number turns warm",
      },
    ],
    example: `:::page{layout=findings kicker="At a glance"}
## What the third quarter's data says
:::slot{name=items}
**Antenatal care held up.** ANC4 rose 4 points to 64%, the third quarter of growth in a row.

**Deliveries moved into facilities.** Facility births were 9% above the 2024 trend.

**[Penta3 has not recovered.]{.danger}** Doses are still 8% below trend in three districts.

**Reporting is nearly complete.** 91% of facilities reported on time, up from 58% two years ago.

**Kono trails on every measure.** ANC4, deliveries and Penta3 are all below the district milestone, the only district behind on all three.
:::
:::`,
    placeholder: `:::page{layout=findings kicker="At a glance"}
## Key findings
:::slot{name=items}
**The first finding, in one sentence.** The number behind it, and the period it covers.

**The second finding, in one sentence.** The number behind it, and how it compares with the last period.

**[A finding that is bad news.]{.danger}** Mark its lead this way and its number turns warm.

**The fourth finding, in one sentence.** Where it holds, and where it does not.

**The fifth finding, in one sentence.** What it means for the reader.
:::
:::`,
  },
  {
    layout: "exec",
    label: "Executive summary",
    useWhen:
      "an executive summary: the headline numbers stacked in a sidebar, the summary and next steps beside them",
    attrs: [],
    main: {
      required: true,
      purpose: "a heading, two or three short paragraphs and a :::steps block",
    },
    headingArea: "main",
    slots: [
      {
        name: "side",
        accepts: "stats",
        required: true,
        min: 2,
        max: 4,
        attrs: ["tone"],
        defaultTone: "ink",
        purpose: "the headline numbers (tone=ink by default)",
      },
    ],
    example: `:::page{layout=exec}
:::slot{name=side}
:::stat{value="64%" label="ANC4 coverage" delta="+4pp" dir=up}
:::stat{value="91%" label="Reporting completeness" delta="+2pp" dir=up}
:::stat{value="-8%" label="Penta3 doses against trend" dir=down}
:::
# Executive summary
Antenatal care and facility deliveries kept growing through the third quarter, and reporting is now close to complete. Immunisation is the exception: Penta3 doses have not returned to trend since the strike.

The gap is concentrated in Kono, Kailahun and Bombali, where outreach sessions restarted late.
:::steps
Restore Penta3 outreach in Kono, Kailahun and Bombali.

Extend the tablet rollout to private facilities.

Re-read these figures once the annual data review is done.
:::
:::`,
    placeholder: `:::page{layout=exec}
:::slot{name=side}
:::stat{value="00%" label="First headline measure" delta="+0pp" dir=up}
:::stat{value="00%" label="Second headline measure" delta="+0pp" dir=up}
:::stat{value="-0%" label="Third headline measure" dir=down}
:::
# Executive summary
Summarise what the report found in two or three sentences: the main result, the period it covers, and how it compares with the last one.

Then name the exception: where results fell short, and what seems to drive the gap.
:::steps
The first recommendation: what should be done, and by whom.

The second recommendation.

The third recommendation.
:::
:::`,
  },
  {
    layout: "opener",
    label: "Section opener",
    useWhen:
      "the opening page of a main section in a long report: a large section number, the title and one or two lines on what the section answers",
    attrs: [{
      name: "number",
      purpose: 'the section\'s number, set large (number="03")',
    }],
    main: {
      required: true,
      purpose: "the section's # heading and one or two sentences",
    },
    headingArea: "main",
    slots: [
      {
        name: "media",
        accepts: "media",
        required: false,
        purpose: "an optional photo across the foot of the page",
      },
    ],
    example: `:::page{layout=opener tone=ink number="03"}
# Service utilisation
How many people used the health system this year, and where they stopped coming.
:::`,
    placeholder: `:::page{layout=opener tone=ink number="01"}
# Section title
One or two sentences on the question this section answers.
:::`,
  },
  {
    layout: "back",
    label: "Back cover",
    useWhen:
      "the closing page of a formal report: logos, the citation, contacts and a disclaimer at the foot",
    attrs: [],
    main: {
      required: true,
      purpose:
        "the citation, contacts and disclaimer as short paragraphs; keep a :::logos line the user placed",
    },
    headingArea: "main",
    slots: [],
    example: `:::page{layout=back tone=ink}
Suggested citation: Ministry of Health (2026). Quarterly FASTR bulletin, Q3 2026. Freetown.

fastr-analytics.org

The figures are drawn from routine health facility data and are provisional until the annual data review.
:::`,
    placeholder: `:::page{layout=back tone=ink}
Suggested citation: Organisation (Year). Report title. Place.

website.org

A note on the data: where the figures come from, and when they become final.
:::`,
  },
  {
    layout: "boxed",
    label: "Text with a box",
    useWhen:
      "a reading page with a boxed aside across its foot: a method, a definition, a country example",
    attrs: [],
    main: {
      required: true,
      purpose: "a heading and running prose, set in two columns",
    },
    headingArea: "main",
    slots: [
      {
        name: "box",
        accepts: "markdown",
        required: true,
        attrs: ["title"],
        purpose: "the aside, two or three paragraphs, with a title",
      },
      {
        name: "notes",
        accepts: "markdown",
        required: false,
        purpose: "small-type notes under the box",
      },
    ],
    example: `:::page{layout=boxed}
## Why completeness fell in the north
Reporting completeness in the Northern region fell from 88% to 71% between the first and third quarters. The fall is not spread evenly: two districts account for nearly all of it.

In both, the drop began the month the district's data officer post fell vacant, and recovered in neither once the post was filled. Facilities that had reported on paper through the officer had no one to hand their forms to.
:::slot{name=box title="Box 2.1 How completeness is calculated"}
A facility counts as reporting for a month when its monthly form reaches the national system by the fifteenth of the following month.

Completeness is the share of open facilities that reported. A facility opened during the quarter counts from its first full month.
:::
:::slot{name=notes}
Facilities closed for more than half the quarter are excluded.
:::
:::`,
    placeholder: `:::page{layout=boxed}
## Page heading
Write the page's running prose here. It sets in two columns, so three or four paragraphs fill the page: the finding, the evidence behind it, and what it means.

Use the box below for what a reader may need beside the argument but not inside it: how a measure is calculated, a definition, or an example from one place.
:::slot{name=box title="Box title"}
Two or three short paragraphs: the method, the definition or the example the prose refers to.

Keep it to what the reader needs to follow the page.
:::
:::slot{name=notes}
Small-type notes: exclusions, sources or caveats.
:::
:::`,
  },
  {
    layout: "targets",
    label: "Target board",
    useWhen:
      "national targets as a board of cards: each goal with its number set large, then where the country is today",
    attrs: [KICKER],
    main: { required: true, purpose: "a heading and one sentence" },
    headingArea: "main",
    slots: [
      {
        name: "cards",
        accepts: "cards",
        required: true,
        min: 3,
        max: 9,
        purpose:
          'one :::card per target, with title, progress="…" and progress-label="…"; its **bold** figure is the target, set large',
      },
    ],
    example: `:::page{layout=targets tone=accent}
## Six targets for 2030
Each target comes from a scorecard indicator and has a yearly milestone.
:::slot{name=cards}
:::card{title="ANC4" progress="64%" progress-label="Coverage, Q3 2026"}
Reach **80%** of pregnant women with four antenatal visits.
:::
:::card{title="Skilled delivery" progress="71%" progress-label="Coverage, Q3 2026"}
**90%** of births attended by a skilled provider.
:::
:::card{title="Penta3" progress="88%" progress-label="Coverage, Q3 2026"}
**95%** of infants receive their third pentavalent dose.
:::
:::card{title="Postnatal care" progress="41%" progress-label="Coverage, Q3 2026"}
**70%** of mothers seen within two days of birth.
:::
:::card{title="Reporting" progress="91%" progress-label="On time, Q3 2026"}
**95%** of facilities report on time every month.
:::
:::card{title="Stock-outs" progress="12%" progress-label="Facilities, Q3 2026"}
Fewer than **5%** of facilities out of tracer medicines.
:::
:::
:::`,
    placeholder: `:::page{layout=targets tone=accent}
## Targets
One sentence on where the targets come from, and the year they are set for.
:::slot{name=cards}
:::card{title="Indicator A" progress="00%" progress-label="Latest value"}
Reach **00%** by the target year.
:::
:::card{title="Indicator B" progress="00%" progress-label="Latest value"}
Reach **00%** by the target year.
:::
:::card{title="Indicator C" progress="00%" progress-label="Latest value"}
Reach **00%** by the target year.
:::
:::card{title="Indicator D" progress="00%" progress-label="Latest value"}
Reach **00%** by the target year.
:::
:::card{title="Indicator E" progress="00%" progress-label="Latest value"}
Reach **00%** by the target year.
:::
:::card{title="Indicator F" progress="00%" progress-label="Latest value"}
Reach **00%** by the target year.
:::
:::
:::`,
  },
  {
    layout: "compare",
    label: "Then and now",
    useWhen:
      "two sides side by side on contrasting grounds, with the change between them: before and after, two regions, public and private",
    attrs: [{
      name: "delta",
      purpose: 'the change, shown on the seam (delta="+33pp")',
    }],
    main: { required: true, purpose: "a heading and one sentence" },
    headingArea: "main",
    slots: [
      {
        name: "left",
        accepts: "markdown",
        required: true,
        attrs: ["label", "tone"],
        defaultTone: "paper",
        purpose: "one :::stat and two to four short bullets",
      },
      {
        name: "right",
        accepts: "markdown",
        required: true,
        attrs: ["label", "tone"],
        defaultTone: "accent",
        purpose: "one :::stat and two to four short bullets",
      },
    ],
    example: `:::page{layout=compare delta="+33pp"}
## Reporting completeness, then and now
Two years of tablets, training and paired facilities.
:::slot{name=left label="Q3 2024" tone=paper}
:::stat{value="58%" label="of facilities reported on time"}
- Six districts below 50%
- Paper forms in 40% of facilities
:::
:::slot{name=right label="Q3 2026" tone=accent}
:::stat{value="91%" label="of facilities reported on time"}
- No district below 80%
- Tablets in every public facility
:::
:::`,
    placeholder: `:::page{layout=compare delta="+0pp"}
## Then and now
One sentence on what changed between the two.
:::slot{name=left label="Before" tone=paper}
:::stat{value="00%" label="The measure, before"}
- A point about the earlier period
- A second point
:::
:::slot{name=right label="After" tone=accent}
:::stat{value="00%" label="The measure, after"}
- A point about the later period
- A second point
:::
:::`,
  },
  {
    layout: "timeline",
    label: "Timeline",
    useWhen:
      "milestones down a spine: rollouts, strikes, policy changes, the context the charts assume",
    attrs: [KICKER],
    main: { required: true, purpose: "a heading" },
    headingArea: "main",
    slots: [
      {
        name: "events",
        accepts: "paragraphs",
        required: true,
        min: 3,
        max: 8,
        purpose:
          "one paragraph per event, starting with its date in bold (`**Mar 2024** …`). Mark a setback's date `**[Sep 2024]{.danger}**`",
      },
    ],
    example: `:::page{layout=timeline}
## From paper registers to monthly data
:::slot{name=events}
**Mar 2022** The national health information system reaches all 16 districts.

**Jan 2023** The first quarterly FASTR bulletin.

**[Sep 2024]{.danger}** A nurses' strike halves reporting for two months.

**Jan 2025** Tablets reach every public facility.

**Aug 2025** Service volumes back on their pre-strike trend.
:::
:::`,
    placeholder: `:::page{layout=timeline}
## Timeline heading
:::slot{name=events}
**Month Year** The first event, in one sentence.

**Month Year** The next event.

**[Month Year]{.danger}** A setback: mark its date this way and it turns warm.

**Month Year** The next event.

**Month Year** The latest event.
:::
:::`,
  },
  {
    layout: "voices",
    label: "Voices",
    useWhen:
      "a photo and a pull quote from a health worker or district officer, with a short paragraph of context",
    attrs: [],
    main: {
      required: true,
      purpose: "one or two short paragraphs of context",
    },
    headingArea: "main",
    slots: [
      {
        name: "media",
        accepts: "media",
        required: false,
        purpose: "the photo; leave empty for the user to add one",
      },
      {
        name: "quote",
        accepts: "quote",
        required: true,
        attrs: ["cite"],
        purpose: "the quote, one to three sentences, with cite=",
      },
    ],
    example: `:::page{layout=voices}
:::slot{name=media}
:::
:::slot{name=quote cite="Fatmata K., midwife, Kailahun"}
We used to send the register at the end of the year. Now we see our own numbers every month.
:::
Kailahun moved to tablets in January 2025. Within a quarter its facilities were reviewing their own antenatal numbers at the monthly district meeting.
:::`,
    placeholder: `:::page{layout=voices}
:::slot{name=media}
:::
:::slot{name=quote cite="Name, role, place"}
The quote, in the speaker's own words: one to three sentences.
:::
One or two short paragraphs of context: who is speaking, and what changed that they are speaking about.
:::`,
  },
  {
    layout: "spotlight",
    label: "Quote panel",
    useWhen:
      "a story told at length beside one strong quote: the prose in a column, a portrait and the quote on a panel running to the page's edge",
    attrs: [],
    main: {
      required: true,
      purpose:
        "the story: a heading if it opens a section, then four or five paragraphs (about 250 words) that fill the column to the page's foot",
    },
    headingArea: "main",
    slots: [
      {
        name: "top",
        accepts: "markdown",
        required: false,
        purpose:
          "one short paragraph above the panel, closing the story or setting up the quote",
      },
      {
        name: "media",
        accepts: "media",
        required: false,
        defaultTone: "accent",
        purpose:
          "a portrait of the person quoted, shown round; leave empty for the user to add one",
      },
      {
        name: "quote",
        accepts: "quote",
        required: true,
        attrs: ["cite"],
        defaultTone: "accent",
        purpose: "the quote, one to three sentences, with cite= (name, role)",
      },
    ],
    example: `:::page{layout=spotlight}
## Bringing the data home
Until 2024, the monthly reports from Bo District's 126 facilities travelled one way: up to the district office, and on to Freetown. Facility staff filled the forms, but rarely saw the numbers again.

The district health team changed that with a single sheet. Each month, every facility receives its own antenatal, delivery and immunisation counts beside the district's, with the months it missed marked in red.

The sheet costs almost nothing to produce. The district's information officer prints it from the national system on the first working day of the month, and the supervisors carry it out on their routine visits, so no facility waits for a special trip.

Within two quarters, on-time reporting rose from 71 to 93 percent, and the facilities furthest behind made the largest gains. Nurses began querying their own figures at the monthly meeting, and corrections that once took a quarter now arrive within the month.

The numbers themselves changed too. Antenatal visits that had been recorded in the register but left off the form began to appear in the monthly report, and the district's first-visit count for 2025 rose by a tenth without a single new client.
:::slot{name=top}
The district now plans to extend the sheet to nutrition and malaria indicators in 2026.
:::
:::slot{name=media}
:::
:::slot{name=quote cite="Aminata Sesay, District Health Information Officer, Bo"}
When a nurse sees her own numbers next to everyone else's, she does not need to be told to report on time.
:::
:::`,
    placeholder: `:::page{layout=spotlight}
## Story heading
Open the story with the situation before the change: where it happened, who was involved, and what was not working. A sentence on the numbers that showed the problem sets the scene.

Then say what was done about it. Name who acted and what they changed, in plain words a reader outside the programme can follow, and when the change began.

Describe how the change worked in practice: what it cost, who carried it out, and how it fitted into the work people were already doing, so a reader in another place can picture doing the same.

Then give the results: what the data showed afterwards, by how much it moved and how quickly, and where the gains were largest.

Close with what the change meant beyond the headline number: what people now do differently, and what it made possible.
:::slot{name=top}
One short paragraph that closes the story or sets up the quote below.
:::
:::slot{name=media}
:::
:::slot{name=quote cite="Name, role, place"}
The quote, in the speaker's own words: one to three sentences.
:::
:::`,
  },
  {
    layout: "feature",
    label: "Feature photo",
    useWhen:
      "a section opening on a strong photo: the heading, a bold lead and the prose in a column, the photo filling the rest of the page to its edge",
    attrs: [KICKER],
    main: {
      required: true,
      purpose:
        "a heading, a bold lead paragraph, then three or four paragraphs (about 300 words) that fill the column to the page's foot",
    },
    headingArea: "main",
    slots: [
      {
        name: "media",
        accepts: "media",
        required: false,
        purpose:
          "one tall photo, cropped to fill; leave empty for the user to add one",
      },
    ],
    example: `:::page{layout=feature kicker="Kailahun District"}
## Reporting on time, every month
**Two years ago, fewer than half of Kailahun's facilities sent their monthly report on time. By the end of 2025, nine in ten did, and the district now reviews its own figures before they leave for Freetown.**

The change began with tablets. Each of the district's 84 facilities received one in January 2024, loaded with the national reporting forms and a simple check that flags a missing or unusual value before the report is sent.

Training came first. Every facility's in-charge spent two days with the district's information officer, entering a month of real registers and correcting the errors the tablet caught.

The results showed within a quarter. On-time reporting rose from 46 to 78 percent by mid-2024, and to 91 percent by the end of 2025. Antenatal and delivery counts, once revised for months after the fact, now settle within weeks.

The district team now meets on the tenth of each month to read the figures together. Facilities that fall behind receive a call the same week, and the conversation is about the register, not the deadline.
:::slot{name=media}
:::
:::`,
    placeholder: `:::page{layout=feature kicker="Place or programme"}
## Feature heading
**Open with the bold lead: the one or two sentences a reader should take from this page, with the number that shows what changed and over what period.**

Then tell how it began: what was introduced, where and when, and what it was meant to fix. Give the reader enough of the starting point to see how far things have come.

Say what it took: the people, the training or the tools, and how the work was organised so that it held once the first push was over.

Give the results: what the data showed, by how much and how quickly, and what settled or improved along the way.

Close with how the work carries on now, and what the people involved do differently because of it.
:::slot{name=media}
:::
:::`,
  },
  {
    layout: "profile",
    label: "District profile",
    useWhen:
      "one page per district or region: a map, a column of key facts and a short reading; repeat it for each district in an annex",
    attrs: [KICKER],
    main: {
      required: true,
      purpose: "the district's name as a heading and a short reading",
    },
    headingArea: "main",
    slots: [
      {
        name: "map",
        accepts: "figure",
        required: false,
        purpose: "a map or chart figure",
      },
      {
        name: "facts",
        accepts: "stats",
        required: true,
        min: 3,
        max: 6,
        purpose: "the key facts, one :::stat each",
      },
    ],
    example: `:::page{layout=profile kicker="District profile"}
## Bombali
Reporting is strong, but antenatal coverage trails the national figure by six points, and the gap has widened since 2024.
:::slot{name=map}
:::
:::slot{name=facts}
:::stat{value="606,000" label="Population"}
:::stat{value="112" label="Health facilities"}
:::stat{value="91%" label="Reporting completeness"}
:::stat{value="58%" label="ANC4 coverage" delta="-6pp" dir=down}
:::
:::`,
    placeholder: `:::page{layout=profile kicker="Area profile"}
## Area name
A short reading of this area: where it stands against the national figure, and what has changed since the last period.
:::slot{name=map}
:::
:::slot{name=facts}
:::stat{value="000,000" label="Population"}
:::stat{value="000" label="Health facilities"}
:::stat{value="00%" label="A key measure"}
:::stat{value="00%" label="A second key measure" delta="-0pp" dir=down}
:::
:::`,
  },
  {
    layout: "method",
    label: "About the data",
    useWhen:
      "sources, coverage, methods and limitations as short panels, with the suggested citation",
    attrs: [],
    main: { required: true, purpose: "a heading" },
    headingArea: "main",
    slots: [
      {
        name: "panels",
        accepts: "cards",
        required: true,
        min: 2,
        max: 4,
        purpose:
          "one :::card per topic, with title= and icon=: a short paragraph of about 80 to 100 words each, so the panels fill the page down to the citation",
      },
      {
        name: "cite",
        accepts: "markdown",
        required: false,
        purpose:
          "the suggested citation, when the report has no back page; a report that closes on `back` carries the citation there, so leave this slot out rather than print it twice",
      },
    ],
    example: `:::page{layout=method}
## About the data
:::slot{name=panels}
:::card{title="Sources" icon=database}
Monthly reports from 1,320 public facilities, entered by district data officers in the national health information system. Each facility submits one summary form a month covering antenatal care, deliveries, immunisation and outpatient visits. Hospital and health centre reports are combined; community health worker returns are held in a separate system and are not included here. The figures use the database as it stood at the October 2026 extract.
:::
:::card{title="Coverage" icon=map}
All 16 districts, January 2022 to September 2026: 57 months in all. A facility counts as expected to report from the first month it ever reported, so newly opened facilities join the denominator as they open rather than lowering early completeness. The 2026 figures are a partial year through September and are compared with the same months of earlier years, never with full years. Regional tables use the latest twelve months.
:::
:::card{title="Methods" icon=chart}
Outliers are values more than ten median absolute deviations from a facility's own monthly median; they are replaced by that median before any volume is summed. Volumes are then compared with each facility's own trend to estimate service disruption. Completeness is the share of expected facility-months that reported. Consistency checks pairs that should move together, such as first and fourth antenatal visits, and a district passes when the pair holds.
:::
:::card{title="Limitations" icon=alert}
Private facilities report irregularly and are under-counted, so national totals understate services in urban districts where private care is common. Completeness says whether a form arrived, not whether every service was recorded on it. Population denominators come from projections of the 2015 census and grow less reliable each year, so coverage figures carry more uncertainty than the volumes they rest on.
:::
:::
:::slot{name=cite}
Ministry of Health (2026). Quarterly FASTR bulletin, Q3 2026. Freetown.
:::
:::`,
    placeholder: `:::page{layout=method}
## About the data
:::slot{name=panels}
:::card{title="Sources" icon=database}
Where the data come from: the system or survey, how many facilities or people it covers, and who records the data and how often. Say which parts of the health system are included and which are left out, and the date the data were extracted, so a reader knows exactly which version of the figures this report describes.
:::
:::card{title="Coverage" icon=map}
The areas and the period the report covers, and how many months or rounds that makes. Say how a facility or an area enters the figures, which years are partial, and what each comparison in the report is made against, so that no partial year is read beside a full one.
:::
:::card{title="Methods" icon=chart}
How each figure is calculated: how unusual values are found and treated, how completeness and consistency are measured, and how any adjustment or estimate is made. Name the thresholds used, so a reader can check a headline number against the rule behind it.
:::
:::card{title="Limitations" icon=alert}
What the data cannot show, and where they are weakest: groups or facilities that report poorly, measures that say whether a form arrived but not what it holds, and estimates that grow less certain over time. Say how each limitation could move the headline figures.
:::
:::
:::slot{name=cite}
Suggested citation: Organisation (Year). Report title. Place.
:::
:::`,
  },
  {
    layout: "ladder",
    label: "Impact ladder",
    useWhen:
      "what a programme delivered: three to six headline results stacked as full-width bars stepping from the accent to the ink",
    attrs: [KICKER],
    main: { required: true, purpose: "a heading and one sentence" },
    headingArea: "main",
    slots: [
      {
        name: "rows",
        accepts: "stats",
        required: true,
        min: 3,
        max: 6,
        purpose: "one :::stat per result, each with icon=",
      },
    ],
    example: `:::page{layout=ladder kicker="Programme reach, 2025"}
## What the programme delivered
From the facilities supported in 2025.
:::slot{name=rows}
:::stat{value="1.2M" label="Antenatal visits recorded" icon=clipboard}
:::stat{value="412" label="Facilities reporting every month" icon=clinic}
:::stat{value="94%" label="Reporting completeness" icon=check}
:::stat{value="38k" label="Deliveries with a skilled attendant" icon=baby}
:::stat{value="16" label="Districts on the national system" icon=map}
:::
:::`,
    placeholder: `:::page{layout=ladder kicker="Programme reach"}
## What the programme delivered
One sentence on where the results come from, and the period they cover.
:::slot{name=rows}
:::stat{value="0.0M" label="The first result" icon=clipboard}
:::stat{value="000" label="The second result" icon=clinic}
:::stat{value="00%" label="The third result" icon=check}
:::stat{value="00k" label="The fourth result" icon=baby}
:::stat{value="00" label="The fifth result" icon=map}
:::
:::`,
  },
  {
    layout: "scorecard",
    label: "Scorecard",
    useWhen:
      "districts against indicators, each cell filled by its status from the role marks in the table",
    attrs: [],
    main: { required: true, purpose: "a heading and one sentence" },
    headingArea: "main",
    slots: [
      {
        name: "table",
        accepts: "table",
        required: true,
        purpose:
          "a markdown table; mark each value cell [71%]{.success}, [68%]{.warning} or [44%]{.danger} and the cell fills with that status",
      },
      {
        name: "notes",
        accepts: "markdown",
        required: false,
        purpose: "what the statuses mean",
      },
    ],
    example: `:::page{layout=scorecard}
## District scorecard, Q3 2026
Each cell against the district's 2026 milestone.
:::slot{name=table}
| District | ANC4 | Delivery | Penta3 | Reporting |
|---|---|---|---|---|
| Bo | [71%]{.success} | [68%]{.warning} | [92%]{.success} | [97%]{.success} |
| Bombali | [58%]{.warning} | [63%]{.warning} | [79%]{.danger} | [91%]{.success} |
| Kailahun | [61%]{.warning} | [70%]{.success} | [74%]{.danger} | [88%]{.success} |
| Kono | [44%]{.danger} | [52%]{.danger} | [81%]{.warning} | [84%]{.warning} |
| Western Area | [76%]{.success} | [81%]{.success} | [90%]{.success} | [95%]{.success} |
:::
:::slot{name=notes}
On track: at or above the milestone. Close: within ten points. Behind: further than that.
:::
:::`,
    placeholder: `:::page{layout=scorecard}
## Scorecard
One sentence on what each cell is measured against.
:::slot{name=table}
| Area | Indicator 1 | Indicator 2 | Indicator 3 | Indicator 4 |
|---|---|---|---|---|
| Area A | [00%]{.success} | [00%]{.warning} | [00%]{.success} | [00%]{.success} |
| Area B | [00%]{.warning} | [00%]{.warning} | [00%]{.danger} | [00%]{.success} |
| Area C | [00%]{.warning} | [00%]{.success} | [00%]{.danger} | [00%]{.success} |
| Area D | [00%]{.danger} | [00%]{.danger} | [00%]{.warning} | [00%]{.warning} |
| Area E | [00%]{.success} | [00%]{.success} | [00%]{.success} | [00%]{.success} |
:::
:::slot{name=notes}
On track: at or above the target. Close: within ten points. Behind: further than that.
:::
:::`,
  },
];

export const FASTR_PAGE_LAYOUTS: readonly string[] = FASTR_PAGE_TEMPLATES.map(
  (t) => t.layout,
);

export function fastrPageTemplate(
  layout: string | undefined,
): FastrPageTemplate | undefined {
  if (layout === undefined) return undefined;
  const l = layout.toLowerCase();
  return FASTR_PAGE_TEMPLATES.find((t) => t.layout === l);
}

// The icons a stat or a card may carry (`icon=clinic`). Drawn by the
// stylesheet as masks (report_fastr_css.ts), so a body never holds an SVG.
export const FASTR_ICONS = [
  "alert",
  "baby",
  "calendar",
  "chart",
  "check",
  "clinic",
  "clipboard",
  "database",
  "droplet",
  "globe",
  "heart",
  "map",
  "money",
  "people",
  "phone",
  "pill",
  "shield",
  "stethoscope",
  "truck",
  "vaccine",
] as const;
export type FastrIcon = (typeof FASTR_ICONS)[number];

export function isFastrIcon(v: string): v is FastrIcon {
  return (FASTR_ICONS as readonly string[]).includes(v);
}

// One model-facing line per layout: the brief's index.
export function fastrPageTemplateIndex(): string {
  return FASTR_PAGE_TEMPLATES.map((t) =>
    `    ${t.layout.padEnd(10)}${t.useWhen}`
  )
    .join("\n");
}

// Everything the model needs to write one layout: what get_page_template
// returns.
export function fastrPageTemplateSpec(t: FastrPageTemplate): string {
  const lines: string[] = [];
  lines.push(`layout=${t.layout} (${t.label}): ${t.useWhen}.`);
  lines.push("");
  const pageAttrs = t.attrs.map((a) =>
    `${a.name}${a.values ? `=${a.values.join("|")}` : '="…"'}  ${a.purpose}`
  );
  lines.push("Page attributes: tone=paper|ink|accent|warm (optional)");
  for (const a of pageAttrs) lines.push(`  ${a}`);
  lines.push("");
  lines.push(
    `Main text (outside every slot, one run${
      t.main.required ? ", required" : ""
    }): ${t.main.purpose}.`,
  );
  lines.push(
    `The page's heading belongs in ${
      t.headingArea === "main"
        ? "the main text"
        : `the \`${t.headingArea}\` slot`
    }; it is a section of the document.`,
  );
  if (t.slots.length > 0) {
    lines.push("");
    lines.push("Slots:");
    for (const s of t.slots) {
      const count = s.min !== undefined || s.max !== undefined
        ? `, ${s.min ?? 0} to ${s.max ?? "any"}`
        : "";
      const attrs = s.attrs && s.attrs.length > 0
        ? `; attributes: ${s.attrs.join(", ")}`
        : "";
      lines.push(
        `  ${s.name} (${
          s.required ? "required" : "optional"
        }, ${s.accepts}${count}${attrs}): ${s.purpose}.`,
      );
    }
  }
  lines.push("");
  lines.push("Example:");
  lines.push(t.example);
  return lines.join("\n");
}

// What get_page_template answers: one layout's full spec and example, or,
// for no layout or one that does not exist, the list to choose from.
export const FASTR_PAGE_TEMPLATE_TOOL_DESCRIPTION =
  "Look up FASTR page templates (`:::page{layout=…}`) before writing them: each one's slots, what each holds and how many items, its attributes, where its heading goes, and a complete example to follow. Pass every layout the report will use in ONE call (`layouts`); with none it lists them all.";

export function fastrPageTemplateLookup(layout: string | undefined): string {
  const t = fastrPageTemplate(layout);
  if (t !== undefined) return fastrPageTemplateSpec(t);
  const head = layout === undefined || layout.trim().length === 0
    ? "The page templates:"
    : `There is no page template \`${layout}\`. The page templates:`;
  return `${head}\n${fastrPageTemplateIndex()}\n\nCall again with one of these layouts for its slots and example.`;
}

// Several layouts in one answer, each as fastrPageTemplateLookup gives it: a
// model that looked layouts up one call at a time spent eight to ten of a
// turn's model round trips on them. No layouts lists them all.
export function fastrPageTemplatesLookup(layouts: readonly string[]): string {
  const wanted = [...new Set(layouts.map((l) => l.trim()).filter(Boolean))];
  if (wanted.length === 0) return fastrPageTemplateLookup(undefined);
  return wanted.map((l) => fastrPageTemplateLookup(l)).join("\n\n---\n\n");
}
