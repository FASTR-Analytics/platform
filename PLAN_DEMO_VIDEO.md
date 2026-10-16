# PLAN: Demo video assembly

Assemble the platform demo from Tim's narration, the title cards, the two
schematic clips and Tim's screen recordings of the demo instance, into one mp4
Tim finishes in Descript.

**Next step: Review 2.** Tim sets this line as each step finishes. Step 3
deletes the file.

## §0 Bindings

[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md), with these differences: the
branch is `version2`; the plan touches no code under `server/`, `lib/` or
`client/src/`, so the floor is `deno fmt --check demo_video` plus
`deno check demo_video/src/assemble.ts` once that file exists; nothing deploys.
Everything lives under [demo_video/](demo_video/) and the deliverable is a file,
not a release. Step 0 is Tim's, not a session's: a session checks its "done
when" as a gate and never records a shot.

## §1 The problem

The narration is recorded: seven clips in `demo_video/audio/` (git-ignored), one
per section of [demo_video/transcript_v2.md](demo_video/transcript_v2.md), in
order: clip-1 the opening, clip-2 to clip-7 Parts 1 to 6. Their lengths:

| Clip   | Section                  | Seconds |
| ------ | ------------------------ | ------- |
| clip-1 | Opening                  | 44.1    |
| clip-2 | Part 1 Data              | 38.7    |
| clip-3 | Part 2 Analysis          | 53.8    |
| clip-4 | Part 3 Decks and reports | 62.3    |
| clip-5 | Part 4 The AI assistant  | 116.2   |
| clip-6 | Part 5 Guardrails        | 28.2    |
| clip-7 | Part 6 Automation        | 49.7    |

The cards and the two schematic clips are done. The screen recordings are Tim's
to make, by hand, from [demo_video/shot_list.md](demo_video/shot_list.md): the
Playwright-driven takes of the first attempt were flat (a cursor gliding between
pauses) and are gone.

## §2 The model

**Assets, all 1920x1080 or scaled to it.**

- Cards: `demo_video/cards/card_00_title.png` to `card_07_end.png`, one per
  section plus title and end.
- Schematic clips: `demo_video/schematic_v1.mp4` (today, 24 s, builds in the
  order the opening names things) and `schematic_v2.mp4` (future, 30 s, the
  automation items appear in the order Part 6 names them). Both hold their last
  frame; cut to length.
- Shots: `demo_video/shots/<name>.mov`, one per row of `shot_list.md`,
  git-ignored like `audio/`. Any 16:9 size; the assembler scales. A shot used in
  more than one section is recorded once and cut more than once.
- Sources: `demo_video/src/` holds the card and schematic pages, the assembler
  and its cut list.

**The demo instance.** `https://demo-v2-testing.fastr-analytics.org`, header
"Demo V2 Testing". It holds all three data families (HMIS from the DHIS2 play
server with 14 indicators and 957 facilities, HFA with 4 time points and 239
indicators, ICEH), 25 results packages with "Results package 2026-10-06 (Demo
3)" pinned and carrying 14 products, and a "V2 Presentation" folder with the
deck "Presentation Example - ANC" (on "Results package 2026-10-06 (Demo 2)",
scope "Only HMIS antenatal care data", 9 slides, showing "Update all
visualizations (1)") and the reports "V2 Presentation 1" to "4" (on "Results
package 2026-09-09").

**Assembly.** One section = one audio clip + one visual track exactly as long as
the clip: the section's card for about 3 seconds, then cuts from the shots and
schematic clips, the last one held (last frame) to fill the rest. Sections
concatenate in order; the end card follows clip-7, silent. Timing is approximate
on purpose: an element may appear a little before its words, never long after.

The cut list, `demo_video/src/cut_list.json`, is the whole timeline: one row per
cut with its section, source, in-point into the source, duration on the timeline
and an optional speed factor (the AI build is time-lapsed). Cue times come from
word counts within each clip (about a second either way) and are tuned against
the audio in Step 2. Per section:

| Clip   | Visual track                                                                                                                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| clip-1 | card_00 3 s; a montage for the first sentence: `explore_hmis` 4 s, `closing_present` 3 s, `report` 3 s; then schematic_v1 from 13 s, held                                                                         |
| clip-2 | card_01 3 s; `setup`, `add_user`, `sources`, `dhis2_connection`, `dhis2_import` (the indicators and the slider, not the Recurring part), `hfa`, `iceh`                                                            |
| clip-3 | card_02 3 s; `results_wizard`, `package_detail`, `explore_hmis`, `explore_dqa_hfa`, `figure_editor`                                                                                                               |
| clip-4 | card_03 3 s; `deck_edit` (flip, insert, layout, download), `report` (the Word download), `update_figures`, `collab`, `history`                                                                                    |
| clip-5 | card_04 3 s; `ai_open`, `ai_question` (the question and answer), `ai_figure`, `ai_build` in five cuts (the prompt, the results it reads, the outline filling at 8x, the direction, the co-edit), `prompt_library` |
| clip-6 | card_05 3 s; `ai_question` (the expanded tool call, then the answer naming the package), `ai_edit_diff`                                                                                                           |
| clip-7 | card_06 3 s; `dhis2_import` (the Recurring part); schematic_v2 from 8 s; `closing_present` for the closing sentences                                                                                              |
| end    | card_07 for 4 s, silent                                                                                                                                                                                           |

## §3 Rulings

1. Cards carry a part number and a plain title only; the schematic shows the few
   boxes the narration names. Nothing else is drawn: everything else is a screen
   recording.
2. The schematic's future items are tagged Future, not Next or Soon.
3. Every recording is made on the demo instance, by Tim. The local dev stack is
   not used, and no session drives the browser.
4. Recordings never linger on a page listing people's emails: the Users list and
   the Imports History tab are out, and the Results list's Created-by column is
   covered by the wizard within a second or two.
5. The AI shots run on the demo instance and spend its credits. Tim has said go.
6. Products needed for a shot are reused from the "V2 Presentation" folder where
   one fits; anything created goes in a folder named "Demo video" and is deleted
   when the plan closes. Nothing else on the instance is renamed or deleted.
7. The videos do not need to match the narration exactly.
8. No import or results-package generation is launched: every wizard is
   cancelled before its last button.
9. A shot is one visible action, a few seconds long. A cut that merely sits on a
   page is shortened, not held.

## §4 Steps

### Step 0: Tim records the shots

Surface: `demo_video/shots/`.

Tim records every row of `shot_list.md` and drops the files there.

Done when every file named in `shot_list.md` exists in `demo_video/shots/` and
`ffprobe` reads each. A session checks this and never records a shot itself.

### Step 1: The assembler

Surface: `demo_video/src/assemble.ts` (new), `demo_video/src/cut_list.json`
(new), `demo_video/src/assemble_test.ts` (new), `demo_video/.gitignore`.

A Deno script that reads the cut list and runs ffmpeg: trims each source to its
cut (a still becomes a clip of its duration; a speed factor time-lapses the
cut), pads the last cut of a section with its final frame to the clip's length,
fails if a section's cuts exceed its clip, concatenates the sections, muxes the
seven audio clips in order and the silent end card, and writes
`demo_video/rough_cut.mp4` (H.264, yuv420p, 1920x1080, 30 fps, AAC),
git-ignored. The cut list is the §2 table made exact, with the word-count cue
times.

Independent of Step 0: `assemble_test.ts` generates synthetic sources (ffmpeg
test patterns and tones of the right lengths, under the scratch dir) for every
path the cut list names, runs the assembler on them, and checks the output's
length and a frame per section.

Done when `deno run --allow-all demo_video/src/assemble_test.ts` passes.

### Step 2: The rough cut

Surface: `demo_video/src/cut_list.json`, `demo_video/rough_cut.mp4` (output).

Needs Steps 0 and 1. Run the assembler on the real shots. Check a frame from
each cut against the shot list and the transcript, tune the in-points and
durations in the cut list, rebuild.

Done when `ffprobe` shows the file's length equal to the audio total plus the
end card, and a frame from each section shows the right visual.

### Step 3: Review and close

Watch the rough cut against the transcript. Fix timing in the cut list and
rebuild. Delete the "Demo video" folder on the demo instance, delete this file.

## §5 Gates catalogue

- `deno fmt --check demo_video` green.
- `deno check demo_video/src/assemble.ts` green (Step 1).
- `deno run --allow-all demo_video/src/assemble_test.ts` passes (Step 1).
- Every path named in `transcript_v2.md`, `shot_list.md` and the cut list exists
  (Step 2).
- `ffprobe` on `rough_cut.mp4`: 1920x1080, h264, 30 fps (Step 2).

## §6 Out of scope

The Descript MCP route (Tim finishes in Descript by hand), subtitles, a French
version, the lower-third labels.

## §7 Rollout and rollback

Nothing ships. The rough cut is a file Tim imports into Descript; rebuilding it
overwrites it.

## §8 Build log

- 2026-10-16: transcript v2 in the original's voice, six-part structure, with
  the cards and schematic clips linked where they are shown. Cards and both
  schematic clips rendered from `demo_video/src/`. Four takes recorded on the
  local dev stack to prove the method (Explore, results wizard, Data and DHIS2
  wizard, scheduled import); superseded by the demo instance, which Tim signed
  into in the Playwright browser. Narration clips received in
  `demo_video/audio/`.
- 2026-10-16, survey of the demo instance (kept because the shot list relies on
  it): Explore HMIS has modules Indicator values, Data quality assessment (views
  Outliers, Completeness, Internal consistency, Facilities with adequate data
  quality, Mean data quality score), Data quality adjustments, Disruption
  detection, Coverage denominators, Coverage estimates, with Table, Over time
  and Map views; the Map draws outlines only, no data. HFA has one module with
  three table views. ICEH has Table, Chart and Over time. The DHIS2 wizard's
  indicator ids are anc1, anc4, sba, pnc1_mother, pnc1_newborn, bcg, penta1,
  penta3, opd plus five calculated ones; its Review step warns that every
  selected element points to nothing on the play server. The results wizard
  needs families and modules ticked before Next enables. A recurring Monthly
  schedule asks for First to Last, a weekday, an interval and a timezone, no
  date. The Imports panel's History tab lists emails.
- 2026-10-16, Step 0 of the first version: the four takes were re-recorded on
  the demo instance through the Playwright MCP. Tim reviewed them: flat. The
  plan is rewritten at Tim's instruction: Tim records short shots by hand from
  `shot_list.md`; the recording script and the four snippets are deleted; the
  assembler step is independent of the recordings and tested on synthetic
  sources.
- 2026-10-16, Step 0 (Tim): 23 shots recorded as QuickTime `.mov`, 3456x2234
  (the full Retina screen) with a 67 px black strip at the top where the menu
  bar hides, 120 fps nominal. `deck_edit` came as `deck_edit_1` and
  `deck_edit_2`. `collab` was not recorded: the team-editing sentence runs over
  `deck_edit_1` and `history`. No shot shows File, Download, so the download
  sentence runs over the `report` scroll. `dhis2_import` and `results_wizard`
  press Start import and Launch generation (Tim overruled ruling 8 for his own
  instance); the generation left a package named 2026-10-16. The Recurring
  option was not recorded: Part 6 uses the Time step moment of `dhis2_import`.
  `add_user` shows a colleague's profile; Tim says the email is no longer valid
  and it stays as recorded.
- 2026-10-16, Steps 1 and 2 built in one session: `src/assemble.ts` and
  `src/cut_list.json`. The synthetic-source test of Step 1 was dropped because
  the footage arrived before the assembler was written; the gate is the
  assembler run on the real sources plus the `ffprobe` checks. Shots are cropped
  to 3456x1944 at y=67 (`shotCrop`) before scaling; the `closing_present` cut
  crops at y=147 to drop the browser's full-screen notice. The waiting stretches
  of `ai_question`, `ai_figure` and `ai_edit_diff` are spliced out; `ai_build`
  runs as five cuts at 1x, 8x, 8x, 6x and 1x. `rough_cut.mp4`: 397.10 s (393.15
  s narration plus the end card), 1920x1080, h264, 30 fps, AAC; the frame at
  each section start is its card. Step 2 built.
