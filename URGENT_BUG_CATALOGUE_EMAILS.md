# Emails for the bug catalogue fixes

One email per thread, to send after the next deploy. The denominator labels in Claire's email appear only once the modules push is live and a new results package has been generated.

## To Ashley: V2 bugs / IG demo, and the two bug reports

Subject: Re: V2 bugs / IG demo

(Also answers the two "Fwd: [FASTR] New Bug Report from asheffel@worldbank.org" threads Meghan forwarded on 2026-10-14 and 2026-10-21.)

Hi Ashley,

Thanks for the reports. Here is where each one stands:

- The "full deck view" message. No such view exists. The assistant now tells you to press the back button when you are in the deck's Settings or History.
- The second tab. "Use it here" in a second tab was stopping the prompt in the first. It now waits until the prompt has finished. Each person has one chat, so one person cannot run two prompts at once. Other people's prompts are not blocked.
- The figure edit errors. I could not open your screenshots, so I cannot say I have fixed what you saw. I went through every error the figure tools can give and fixed one that makes the assistant loop. Could you send the screenshots again, or next time expand the "Tool feedback" line under the assistant's reply and send me its text? Then I can fix the exact one.
- The package dropdown shows each package's date and marks the pinned one.
- "Add slide" is written out next to the plus, and Insert also offers a new slide.
- The AI panel is open by default and remembers if you close it.

For the demo: in AI settings (chat menu), set Effort to Low. That is the main speed gain.

Tim

## To Angelica: scopes, duplicate, profile, testing site

Subject: Re: Scopes and users- upcoming virtual workshops and mission

(Also answers "Small platform bugs and suggestions- current version" and "V2 testing site - upcoming workshops/trainings".)

Hi Angelica,

Fixed:

- Users limited to a scope can now use Explore on the data in their scopes. If a scoped user still cannot see a deck or report, check its scope: new ones are created on "All data", which scoped users cannot see.
- Duplicating now opens the copy.
- Users are asked for their organisation and role on first login, can edit them in their profile, and both show on the Users page.

The Products list already has a sortable "Last updated" column.

"View as another user" we will not build. Impersonating a user would go through every permission check in the platform, and an error in one would show someone data they must not see. The reliable way to check a scope is to sign in with a test account that holds it.

The v2 testing site is retired. The demo-fr instance has run version 2 since 20 October; use it for Mali and Mauritania.

Tim

## To Angelica and Fran: tables in slide decks

Subject: Re: Uganda: Markdown tables in slide decks

Hi Angelica and Fran,

Slide text boxes cannot show tables at all, whatever the number of columns. Reports can, which is why it works there.

For this slide, insert a visualisation with a table layout for the coverage indicator, and put the three fixed columns in a text box beside it.

Tables in slide text are planned, but they need a large change to the slide editor.

Tim

## To Claire: viz and platform questions

Subject: Re: Viz and platform questions before check in with Ashley

Hi Claire,

1. The assistant cannot choose an adjustment. It is set once per results package when the package is generated. Ashley is right about the footnotes: they are fixed text and do not show the package's adjustment. Fixing that is on the list.

2. Switching coverage between the four adjustments needs the modules to calculate and store all four. Today they store one. That is module work.

3. Since 2.0 every chart option is a card, 50 in all, and some are near duplicates. Which to drop is a judgement call, and I would like your view.

4. The denominator labels are fixed: 27 denominator ids had no label and now have one. They appear once a new results package is generated.

5. The survey source (DHS or MICS) is dropped by the module before it writes results, so the platform never sees it. Keeping it, and showing it on hover, are both on the list.

Tim

## To Joshua, copying Angelica: the JAR compendium differences

Subject: Re: JAR 2026 Compendium: Historical Data Discrepancies Between August and September version

Dear Joshua,

Thank you for the careful comparison.

Outlier detection re-runs on the full series each time a package is generated, so individual months can change. It cannot move a whole series by 15 to 75 percent.

A shift of that size means the two packages were generated with different adjustment settings or from different data. Each package records its adjustment settings and its source data, so the two packages can be compared directly. Angelica is doing that.

The "Fully immunized" to "Measles 1" change and the 2020 Penta 1 move are expected: version 2 of the coverage analysis renamed the indicator and uses a different denominator for it.

Kind regards, Tim

## To Meghan: where the HFA requests stand

Subject: HFA progress

Hi Meghan,

HFA progress, going into the next release:

- Facilities and data are uploaded in one wizard. It maps facility id, admin areas, name and type from the survey file, shows new facilities and changes before launch, and can create the first time point. There is no separate facility upload.
- "Apply to all time points" in the workbook import writes the code column to every round.
- Indicator code is the platform's own expression language: comparisons, AND, OR, NOT, arithmetic and "x IN (1, 2)". Anything else is refused with a message, and a variable in the wrong case gets the right id suggested. Existing code was migrated from "%in% c(...)" to "IN (...)". The default workbook on the resource hub needs the same find and replace in its r_code column, 47 cells.
- Tables and charts order indicators in workbook order and categories in the category manager's order.
- The indicator editor, the workbook import and the delete screens are translated.
- The unused-variables list skips the id_ and result variables.
- The service-categories field in the code editor no longer overlaps the next field (Safia's "duplicated field").
- The workbook import reads label_en, label_fr and label_pt.

Next: search by variables in the code and a time-point filter on the indicator list; marking variables already used; flagging an indicator that fails in every round; reporting survey values outside the questionnaire's options (the cause of Safia's missing Guinea variables); dropping the "Use sampling weights" parameter; facility type on the Explore page; then the smaller figure items.

Tim
