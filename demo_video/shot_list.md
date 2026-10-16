# Demo video: recordings to make

Record each row as its own file, name it exactly as listed, and put it in
`demo_video/shots/`. The assembler cuts each file to its slots under the
narration; a file used in more than one part is listed once.

## How to record

- Browser content only: no tab bar, no bookmarks bar. 1920x1080 at 30 fps.
- Nav rail expanded. Browser zoom 125% so text reads at video size.
- Have the page in position before you start, then act. Leave about two seconds
  of padding at each end. Longer than the target is fine; shorter is not.
- Keep the cursor moving with purpose. No idle hovering, no reading pauses.
- Stay off: the Users list and the Imports History tab (they list emails), the
  Results list's Created-by column for more than two seconds, the DHIS2 wizard's
  Review step (it warns that the play server no longer holds the elements), and
  any Launch or Start button.
- AI shots: questions and figures beside "Presentation Example - ANC"; the deck
  build in a new deck inside a "Demo video" folder.

## The recordings

| File               | Target | What to do                                                                                                                                                                   |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup`            | 4 s    | Data page: open the HMIS Configuration row (admin area levels, facility columns)                                                                                             |
| `add_user`         | 4 s    | Your own or a dummy user's profile page, never a colleague's (the email shows): tick a few permissions                                                                       |
| `sources`          | 4 s    | Data page: glide down the HMIS, HFA and ICEH blocks with their Ready status                                                                                                  |
| `dhis2_connection` | 5 s    | DHIS2 connection row: the credentials form (URL, username, masked password)                                                                                                  |
| `dhis2_import`     | 16 s   | New DHIS2 import: tick five indicators quickly, Next; on the Time step click Recurring, choose Monthly and First Monday; Next; drag the slider; Cancel                       |
| `hfa`              | 5 s    | HFA dataset page: time points, 239 indicators, the upload button                                                                                                             |
| `iceh`             | 4 s    | ICEH equity data page                                                                                                                                                        |
| `recurring`        | 5 s    | New DHIS2 import already on the Time step: click Recurring, choose Monthly and First Monday                                                                                  |
| `results_wizard`   | 19 s   | Results: open the wizard within two seconds, tick the three families, Next, tick the modules one by one (dependencies auto-tick), Next, hover Launch, Cancel                 |
| `package_detail`   | 8 s    | Open the pinned package: its module list, versions, status                                                                                                                   |
| `explore_hmis`     | 12 s   | Explore HMIS: the table, click Over time, scroll the chart grid, switch indicator or level once                                                                              |
| `explore_dqa_hfa`  | 7 s    | Explore: switch module to Data quality assessment (coloured table), then the HFA tab                                                                                         |
| `figure_editor`    | 7 s    | The figure editor: change chart type or disaggregation and watch it redraw                                                                                                   |
| `deck_edit`        | 26 s   | The ANC deck: click through four slides via the thumbnails; add a slide; insert a figure from the wizard; switch to a two-figure layout; File, Download (PowerPoint and PDF) |
| `report`           | 8 s    | "V2 Presentation 1": scroll a page with figures and stat tiles; the Figures menu; File, Download as Word                                                                     |
| `update_figures`   | 10 s   | A copy of the ANC deck in "Demo video", still on Demo 2: the Update all visualizations badge, click it, figures refresh, the label changes                                   |
| `collab`           | 11 s   | Two windows side by side on one deck, both cursors visible, text typed in one appears in the other                                                                           |
| `history`          | 8 s    | History: pick an earlier version, preview it                                                                                                                                 |
| `ai_open`          | 15 s   | On Explore click the AI button, the panel slides in (context chip, suggested prompts); close it; open the ANC deck and open the panel again                                  |
| `ai_question`      | 18 s   | Type prompt 1, send; the answer arrives with numbers and names the package and module; expand the data tool call; scroll the values it read                                  |
| `ai_figure`        | 8 s    | Type prompt 2, send; the figure card and the interpretation appear                                                                                                           |
| `ai_build`         | whole  | New deck in "Demo video": type prompt 3, send, let it run; mid-build type prompt 4; later edit a slide title yourself while it works; let it finish. Record the whole build  |
| `prompt_library`   | 22 s   | Open the prompt library, scroll the prompts, pick a report prompt, it fills the box, send                                                                                    |
| `ai_edit_diff`     | 10 s   | Ask it to reword a paragraph; the diff appears; click Accept. Ask it to delete a slide; the confirmation; click Reject                                                       |
| `closing_present`  | 12 s   | A finished deck in Present mode, advancing through four strong slides                                                                                                        |

## Prompts

Prompt 1:

```
Did antenatal care service delivery improve in the past year?
```

Prompt 2:

```
Make a chart of ANC1 by region over the last two years and interpret it.
```

Prompt 3:

```
Build a deck on immunization coverage and data quality, with key messages per section.
```

Prompt 4:

```
Expand the data quality section with a regional comparison.
```

## Filenames

```
setup
add_user
sources
dhis2_connection
dhis2_import
hfa
iceh
recurring
results_wizard
package_detail
explore_hmis
explore_dqa_hfa
figure_editor
deck_edit
report
update_figures
collab
history
ai_open
ai_question
ai_figure
ai_build
prompt_library
ai_edit_diff
closing_present
```
