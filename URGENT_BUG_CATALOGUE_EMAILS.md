# Emails for the bug catalogue fixes

One email per thread, to send after the next deploy. The denominator labels in
Claire's email appear only once the modules push is live and a new results
package has been generated.

## To Ashley: V2 bugs / IG demo, and the two bug reports

Subject: Re: V2 bugs / IG demo

Hi Ashley,

Thanks for the three reports. Here is what has changed on the platform since
then.

The "full deck view" message. That screen does not exist. The assistant meant
the deck's Settings screen or its version History screen, which it cannot work
from. From those screens it now tells you to press the back button to return to
the deck. A prompt from the prompt library only works when the deck itself is
open.

The second tab. Each person has one AI chat, and it runs in one browser tab at a
time. You opened the report in a second tab and pressed "Use it here". That
stopped the prompt that was running in the first tab. The second tab now refuses
while a prompt is running and tells you to wait for it to finish. So one person
cannot run two prompts at once, for example one in a slide deck and one in a
report. Different people never affect each other, and no conversation is shared
between users.

The figure edit errors. I could not read the screenshots, so I went through
every error message the figure tools can show. The deck's figure tools do not
work while a figure is open in the figure editor. If you are in the figure
editor, ask the assistant to change the figure and it uses the editor's own
tools. The error messages now also spell out the exact identifiers they expect.
Before, the assistant sometimes kept repeating a display name that the tool
rejected. If you hit an error again, expand the "Tool feedback" line under the
assistant's message and send me its text.

Your three suggestions are all in:

- The results package dropdown now shows each package's date and marks the
  pinned one, which is the package the platform uses by default.
- "Add slide" is written out next to the plus, and the Insert menu also offers a
  new slide.
- The AI panel is open by default and remembers whether you closed it.

For demo speed: open AI settings from the chat menu and set Effort to Low. That
makes the biggest difference. Choosing the Haiku model there, a smaller and
faster AI model, is faster again, with some loss in answer quality.

Tim

## To Angelica: scopes, duplicate, profile, testing site

Subject: Re: Scopes and users / Small platform bugs

Hi Angelica,

A few of the things you raised are now live.

Scopes and Explore. Users limited to a scope now have the Explore page, over the
scopes they hold. One thing to check when a scoped user cannot see the data: a
new slide deck or report is created with the scope "All data", and a user
limited to a scope cannot see a deck or report with that scope. Change the deck
or report's scope to the user's scope and it appears for them.

"View as another user" is not built. For now, the way to check a scope is to
sign in with a test account that holds it.

Duplicating. The copy now opens straight away, and the list expands to show the
folder it is in.

Last updated. The list of slide decks and reports has a "Last updated" column
that you can sort by. It has been there since the 2.0 release.

Affiliation and role. On their first visit after approval, users are asked for
their organisation and role. They can edit both from their profile (click your
initials, top right). Both show as columns on the Users page, so you no longer
have to cross-check emails elsewhere.

The French testing site. The v2 testing site is retired. demo-fr has been
running version 2 since 20 October, so that is the one to use for Mali and
Mauritania.

Tim

## To Angelica and Fran: tables in slide decks

Subject: Re: Uganda: Markdown tables in slide decks

Hi Angelica and Fran,

A slide's text box cannot show tables, whatever the number of columns, so the
four-column table did not appear. Reports use different software to display
text, so tables work there.

For your slide, use a table visualisation. Insert a visualisation on the slide
and choose a table layout for the coverage indicator. This gives you the column
that updates as data arrives. Then put the three fixed columns in a text box
beside it.

Showing tables inside slide text is on the list. It needs a large change to how
slides are drawn.

Tim

## To Claire: viz and platform questions

Subject: Re: Viz and platform questions before check in with Ashley

Hi Claire,

Answers to the five points, with what has changed.

1. The AI and the adjustment. The assistant cannot choose an adjustment. The
   adjustment (none, outliers, completeness, or both) is set once for the whole
   results package when it is generated. A figure cannot change it, so a figure
   always shows the adjustment its package was generated with. Ashley is right
   about the footnotes. The footnote text is the same for every chart of a given
   type and does not check the package's adjustment setting. So the coverage
   footnote says "adjusted for data quality" even on a package generated without
   adjustment. Making the footnote follow the package's setting needs a change
   to how figures are built. It is on the list.

2. Switching coverage between the four adjustments. Today the coverage analysis
   calculates coverage from one version of the data, the adjustment the package
   was generated with. To switch between the four adjustments in a chart, the
   analysis would have to calculate all four and store all four in the results
   package. That change belongs in the analysis modules, and the coverage part
   of each results package would become four times larger.

3. Redundant default visualisations. Since version 2.0 every ready-made chart
   option gets its own card on the package page. There are 50 cards. Before,
   only a selected set had cards. Some are near duplicates. Examples are the
   same coverage chart at national, region and district level, the same service
   volume chart in three modules, and pairs where one chart shows observed
   values and the other shows values carried forward from earlier months. Which
   ones to remove is a decision I would like your view on.

4. The denominator table labels. The coverage analysis had display names for
   most denominators but was missing 27. The missing ones include the SBA
   series, the BCG and Penta-1 derived targets, and all the vitamin A and fully
   immunised denominators. Without a display name, the table showed the internal
   code. I have fixed the display names in the analysis module, and the
   drop-down menus for choosing a denominator now use them too. The names show
   once a new results package is generated.

5. Survey source on hover. The survey source (DHS or MICS, and which round) is
   in the survey file the coverage analysis reads. The analysis drops it before
   writing the coverage results, so the platform never receives it. Keeping it
   needs a change to the analysis. Showing it when you point at a chart needs a
   second change, because charts show nothing on pointing today. Both are on the
   list.

Tim

## To Joshua, copying Angelica: the JAR compendium differences

Subject: Re: JAR 2026 Compendium: Historical Data Discrepancies Between August
and September version

Dear Joshua,

Thank you for the careful comparison. To your two questions:

Outlier detection runs on the full time series every time a package is
generated, so adding September re-runs it on every month. This can change
individual months. It cannot explain a drop of 15 to 75 percent across a whole
series.

The adjustment setting is chosen per results package when it is generated. A
change of that size across every month means the two packages used different
adjustment settings or different data, for example a dataset or an
administrative area that is in one package and missing from the other. Every
package records its settings and its data, so the two can be compared directly.
Angelica is doing this comparison.

The two definition changes you noticed are intended. Version 2 of the coverage
analysis names the indicator "Measles 1" where it used to say "Fully immunized".
It also uses a different denominator, the population count used to calculate
coverage, for the 2020 Penta 1 figure, which is why that value changed.

Kind regards, Tim
