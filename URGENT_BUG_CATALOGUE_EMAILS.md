# Emails for the bug catalogue fixes

One email per thread, to send after the next deploy. The denominator labels in
Claire's email appear only once the modules push is live and a new results
package has been generated.

## To Ashley: V2 bugs / IG demo, and the two bug reports

Subject: Re: V2 bugs / IG demo

(Also answers the two "Fwd: [FASTR] New Bug Report from asheffel@worldbank.org"
threads Meghan forwarded on 2026-10-14 and 2026-10-21.)

Hi Ashley,

Thanks for the reports. Here is where each one stands:

- The "full deck view" message. That view does not exist. The assistant now
  tells you to press the back button when you are in the deck's Settings or
  History.
- The second tab. "Use it here" in a second tab was stopping the prompt in the
  first. It now waits until the prompt has finished. Each person has one chat,
  so one person cannot run two prompts at once. Other users are never affected.
- The figure edit errors. I could not open your screenshots, so I cannot say I
  have fixed what you saw. I went through every error the figure tools can give
  and fixed one that makes the assistant loop. Could you send the screenshots
  again, or next time expand the "Tool feedback" line under the assistant's
  reply and send me its text? Then I can fix the exact one.
- The package dropdown shows each package's date and marks the pinned one.
- "Add slide" is written out next to the plus, and Insert also offers a new
  slide.
- The AI panel is open by default and remembers if you close it.

For the demo: in AI settings (chat menu), set Effort to Low. That is the main
speed gain.

Tim

## To Angelica: scopes, duplicate, profile, testing site

Subject: Re: Scopes and users- upcoming virtual workshops and mission

(Also answers "Small platform bugs and suggestions- current version" and "V2
testing site - upcoming workshops/trainings".)

Hi Angelica,

Fixed:

- Users limited to a scope now have Explore, over their scopes. If a scoped user
  still cannot see a deck or report, check its scope: new ones are created on
  "All data", which scoped users cannot see.
- Duplicating now opens the copy.
- Users are asked for their organisation and role on first login, can edit them
  in their profile, and both show on the Users page.

The Products list already has a sortable "Last updated" column.

"View as another user" we will not build. Faking another person's session
touches every permission check in the platform, and a mistake there shows
someone data they must not see. The reliable way to check a scope is to sign in
with a test account that holds it.

The v2 testing site is retired. demo-fr has been version 2 since 20 October, so
use that for Mali and Mauritania.

Tim

## To Angelica and Fran: tables in slide decks

Subject: Re: Uganda: Markdown tables in slide decks

Hi Angelica and Fran,

Slide text boxes cannot show tables at all, whatever the number of columns.
Reports can, which is why it works there.

For this slide, insert a visualisation with a table layout for the coverage
indicator, and put the three fixed columns in a text box beside it.

Tables in slide text are on the list, but it is a large change.

Tim

## To Claire: viz and platform questions

Subject: Re: Viz and platform questions before check in with Ashley

Hi Claire,

1. The assistant cannot choose an adjustment. It is set once per results package
   when the package is generated. Ashley is right about the footnotes: they are
   fixed text and do not read that setting. Fixing that is on the list.

2. Switching coverage between the four adjustments needs the modules to
   calculate and store all four. Today they store one. That is module work.

3. Since 2.0 every chart option is a card, 50 in all, and some are near
   duplicates. Which to drop is a judgement call, and I would like your view.

4. The denominator labels are fixed: 27 ids had no label. They appear once a new
   results package is generated.

5. The survey source (DHS or MICS) is dropped by the module before it writes
   results, so the platform never sees it. Keeping it, and showing it on hover,
   are both on the list.

Tim

## To Joshua, copying Angelica: the JAR compendium differences

Subject: Re: JAR 2026 Compendium: Historical Data Discrepancies Between August
and September version

Dear Joshua,

Thank you for the careful comparison.

Outlier detection does re-run on the full series each time a package is
generated, so individual months can change. It cannot move a whole series by 15
to 75 percent.

A shift of that size means the two packages were generated with different
adjustment settings or from different data. Each package records both, so the
two can be compared directly. Angelica is doing that.

The "Fully immunized" to "Measles 1" change and the 2020 Penta 1 move are
intended: version 2 of the coverage analysis renamed the indicator and uses a
different denominator there.

Kind regards, Tim

## To Meghan: where the HFA requests stand

Subject: HFA platform: what is done and what is still to come

Hi Meghan,

Here is a summary of the HFA work, against everything your team has raised in
the emails, the wish list and the two testing threads. I keep a running list of
all of it, so if anything is missing from this email it is missing from my list
too, and I would like to know.

What is done and will be in the next release:

- Uploading facilities and survey data is one step. The data import wizard reads
  the facility id, admin areas, name and type from the survey file, shows every
  new facility and every change before it starts, and saves the facilities
  together with the survey data. There is no separate facility upload any more.
  A fresh country can create its first round from inside the wizard, and name
  and type columns are offered on every import.
- "Apply to all time points" in the indicator workbook import now does what it
  says: one code column goes to every round, whatever the column is called.
- Indicator code now uses the platform's own expression syntax instead of R. It
  accepts comparisons (== != < > <= >=), AND, OR, NOT, arithmetic, and a list
  test written as "x IN (1, 2)". The accepted operators are listed under the
  code box. Anything else is refused with a message that says what was not
  understood, and if a variable name is typed in the wrong case, the message
  suggests the correct spelling. Existing indicators in the platform were
  converted automatically from the old "%in% c(1, 2)" form. The default workbook
  on the resource hub is a separate file and still has 47 rows in the old form;
  I will send you the exact change, which is a find and replace.
- Tables and charts order HFA indicators the way the workbook orders them, and
  categories the way they are ordered in the category manager, instead of
  alphabetically.
- Every message in the indicator editor, the workbook import and the delete
  screens is in the instance language. The typed confirmation for deleting is
  "oui supprimer" in French and "sim eliminar" in Portuguese.
- The unused-variables list leaves out the five identification variables
  (id_admin1, id_admin1_corrected, id_fac_type, id_resp_consent, result).
- The "Service categories" box in the indicator editor no longer overlaps the
  box next to it, which is what looked like a duplicated field.
- The workbook import reads label_en, label_fr and label_pt and uses the
  instance's language.
- Already in place and confirmed: search ignores accents, the indicator list
  keeps its place after you edit an indicator, and service category is available
  as a figure filter.

Still to do, in the order I plan to take them:

1. Indicator search also matches the variables used in the code, and the
   indicator list can be filtered by round.
2. In the code editor, variables already used by another indicator in that round
   are marked.
3. An indicator whose code fails in every round is flagged as such in the list.
4. The import checks each value against the questionnaire's response options,
   and reports any option the survey file uses that the questionnaire does not
   list. That is the cause of the Guinea variables Safia saw missing from the
   unused list.
5. The "Use sampling weights" setting goes away: weights are used when a round
   has them and not otherwise.
6. The Explore page can break HFA results down by facility type. For figures
   this already works once "Facility types" is switched on in the HFA
   configuration and the results package is regenerated.
7. More colour scales for heatmap tables.
8. A note on figures that use values carried forward from a previous round (used
   when a round has no values for that indicator).
9. A custom label and a stronger border for the "All facilities" column.
10. Deleting one facility's rows for a round after an import.
11. The AI assistant checks that the variables an indicator's code uses fit the
    indicator's label.
12. A time point with a start month and an end month.
13. A column for the finite population correction (an adjustment to the weights
    when the sample is a large share of all facilities) in the weights table,
    beside the stratum. Strata are already stored but not yet used in the
    analysis.
14. Gauge charts and dotted lines.

Larger pieces that need a decision or a design before I start: confidence
intervals and significance tests, the standard HFA report, recoding "Other"
responses, detecting questionnaire changes between rounds, drafting notes from
the questionnaire, questionnaires that are not XLSForms, Russian for Tajikistan,
the sample distribution table, the immunisation readiness module, and linking
HFA facilities to the facilities in the routine health information system
(HMIS).

Three questions from earlier are still open on your side:

- What should the standard defaults for the HFA module settings be? Today
  weights are off, "don't know" is treated as missing, and a failing indicator
  does not stop the run. Once the "Use sampling weights" setting is removed,
  only the other two need defaults.
- Is "not applicable" coded -98 or -999998 in your surveys? Today the platform
  treats both as values specific to each question, not as missing.
- When a round has no values for an indicator, the platform fills it from the
  previous round. Is that what the team means by cross-round carry-forward?

Tim
