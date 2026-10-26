# Emails for the bug catalogue fixes

One email per thread, to send after the next deploy. The denominator labels in
Claire's email appear only once the modules push is live and a new results
package has been generated.

## To Ashley: V2 bugs / IG demo, and the two bug reports

Subject: Re: V2 bugs / IG demo

Hi Ashley,

Thanks for the reports. All of these are now fixed:

- The "full deck view" message. That view does not exist. The assistant now
  tells you to press the back button when you are in the deck's Settings or
  History.
- The second tab. "Use it here" in a second tab was stopping the prompt in the
  first. It now waits until the prompt has finished. Each person has one chat,
  so one person cannot run two prompts at once. Other users are never affected.
- The figure edit errors. The error messages now give the assistant exactly what
  it needs, so it stops looping. If one comes back, expand the "Tool feedback"
  line and send me the text.
- The package dropdown shows each package's date and marks the pinned one.
- "Add slide" is written out next to the plus, and Insert also offers a new
  slide.
- The AI panel is open by default and remembers if you close it.

For the demo: in AI settings (chat menu), set Effort to Low. That is the main
speed gain.

Tim

## To Angelica: scopes, duplicate, profile, testing site

Subject: Re: Scopes and users / Small platform bugs

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
