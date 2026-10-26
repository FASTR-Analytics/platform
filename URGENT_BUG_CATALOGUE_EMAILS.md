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

Here is where the HFA requests stand. I keep a list of everything your team has
raised by email, in the wish list tracker and in the two testing threads with
Safia, Viviane and Leenisha; if something is missing here, tell me and I will
add it.

In the next release:

- Facilities and survey data are uploaded in one step. The survey data import
  reads the facility id, admin areas, name and type from the survey file, shows
  every new facility and every change before it starts, and saves them with the
  data. There is no separate facility upload. A new country can also create its
  first round from inside the import.
- "Apply to all time points" in the indicator workbook import applies the one
  code column to every round.
- Indicator code is no longer written in the R programming language. It is a
  simpler expression syntax of the platform's own: comparisons (== != < > <=
  > =), AND, OR, NOT, arithmetic, and "x IN (1, 2)" for a list of values. The
  > operators are listed under the code box. Any other syntax is refused with a
  > message saying what was not understood, and a variable typed in the wrong
  > case gets the correct spelling suggested. Existing indicators were
  > converted. The default workbook on the resource hub has 47 cells still
  > written as "%in% c(...)"; I will send you a find-and-replace that changes
  > them to the "IN (...)" form.
- Tables and charts order HFA indicators as the workbook does, and categories in
  the order set on the category management screen, instead of alphabetically.
- The indicator editor, the workbook import and the delete screens are fully
  translated into French and Portuguese.
- The unused-variables list no longer shows the identification variables
  (id_admin1, id_fac_type and so on).
- The "Service categories" box in the indicator editor no longer overlaps its
  neighbour. Safia reported that overlap as a duplicated field.
- The workbook import reads label_en, label_fr and label_pt.

Next, in order:

1. Indicator search also matches the variables used in the code, and the list
   can be filtered by round.
2. Variables already used by another indicator in a round are marked in the
   editor's variable list.
3. An indicator whose code fails in every round is flagged in the list.
4. The survey data import reports values that are not among the questionnaire's
   response options. This is why some Guinea variables were not listed as
   unused: the survey used response codes the questionnaire did not list, so
   those variables were never created.
5. The "Use sampling weights" setting is removed. Weights are always used when a
   round has them.
6. Results by facility type on the Explore page. In figures this already works
   once "Facility types" is switched on in the HFA configuration and the package
   is regenerated.
7. More colour scales for heatmap tables; a note on figures that show values
   copied from a previous round; a label and a stronger border for the "All
   facilities" column; gauge charts and dotted lines.
8. Deleting one facility's rows for a round; a time point with a start and an
   end month; a finite population correction column (an adjustment for a sample
   that is a large share of all facilities) next to the stratum column in the
   weights table; the AI assistant checking that an indicator's variables fit
   its label.

Larger pieces waiting for a decision from you or a design from me: confidence
intervals and significance tests, the standard HFA report, recoding "Other"
responses, detecting questionnaire changes between rounds, questionnaires that
are not XLSForms, Russian for Tajikistan, the sample distribution table, the
immunisation readiness module, and linking HFA facilities to HMIS facilities.

Three questions are still open with your team:

- What should the default HFA module settings be? There are two: how "don't
  know" is treated (today, as missing) and whether a failing indicator stops the
  run (today, it does not).
- Is "not applicable" coded -98 or -999998? Today the platform treats both as
  normal answer values and does not count them as missing.
- When a round has no values for an indicator, the platform copies the value
  from the previous round. Is that what the team means by cross-round
  carry-forward?

Tim
