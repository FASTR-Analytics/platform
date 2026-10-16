# PLAN: Demo video assembly

Assemble the 5-minute platform demo from Tim's narration, the title cards, the
two schematic clips and screen recordings of the demo instance, into one mp4 Tim
finishes in Descript.

**Next step: Step 0.** Tim sets this line as each step finishes. Step 3 deletes
the file.

## §0 Bindings

[PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md), with these differences: the
branch is `version2`; the plan touches no code under `server/`, `lib/` or
`client/src/`, so the floor is `deno fmt --check demo_video` alone; nothing
deploys. Everything lives under [demo_video/](demo_video/) and the deliverable
is a file, not a release.

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

The cards and the two schematic clips are done. Every screen recording is still
to make, on the demo instance: the four in `demo_video/snippets/` were recorded
on the local dev copy of another country's data and are replaced by Step 1.

## §2 The model

**Assets, all 1920x1080.**

- Cards: `demo_video/cards/card_00_title.png` to `card_07_end.png`, one per
  section plus title and end.
- Schematic clips: `demo_video/schematic_v1.mp4` (today, 24 s, builds in the
  order the opening names things) and `schematic_v2.mp4` (future, 30 s, the
  automation items appear in the order Part 6 names them). Both hold their last
  frame; cut to length.
- Screen recordings: `demo_video/snippets/<take>.mp4`, one per take in
  `demo_video/src/record.js`.
- Sources: `demo_video/src/` holds the card and schematic pages, the timeline
  script, and `record.js`.

**The demo instance.** `https://demo-v2-testing.fastr-analytics.org`, header
"Demo V2 Testing". It holds all three data families (HMIS from the DHIS2 play
server with 14 indicators and 957 facilities, HFA with 4 time points and 239
indicators, ICEH), 25 results packages with "Results package 2026-10-06 (Demo
3)" pinned and carrying 14 products, and a "V2 Presentation" folder with the
deck "Presentation Example - ANC" (scope "Only HMIS antenatal care data") and
the reports "V2 Presentation 1" to "4". Tim is signed in there in the Playwright
browser window; a recording context copies that session's cookies and is signed
in too (verified).

**Recording.** `browser_run_code_unsafe` with
`filename:
demo_video/src/record.js` and `SNIPPET` set at the top of the file.
The script opens a fresh context that records video, copies the session cookies,
expands the nav rail, hides the onboarding tours and draws a cursor. The take
lands as `demo_video/src/_rec/<take>/*.webm`; the first two seconds are page
load:

```
ffmpeg -y -ss 2.0 -i demo_video/src/_rec/<take>/<file>.webm -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -movflags +faststart demo_video/snippets/<take>.mp4
```

The four takes in `record.js` were written against the dev copy: their indicator
ids (`tickRows`) and Explore module names are that instance's, and Step 0
replaces them with the demo instance's.

**Assembly.** One section = one audio clip + one visual track exactly as long as
the clip: the section's card for about 3 seconds, then clips and recordings
trimmed or held (last frame) to fill the rest. Sections concatenate in order;
the end card follows clip-7. Timing is approximate on purpose: an element may
appear a little before its words, never long after.

| Clip   | Visual track                                                                 |
| ------ | ---------------------------------------------------------------------------- |
| clip-1 | card_00 for the first sentence (about 12 s), then schematic_v1, held         |
| clip-2 | card_01 3 s, then `data` trimmed to fit                                      |
| clip-3 | card_02 3 s, `results_wizard`, then `explore` trimmed to fit                 |
| clip-4 | card_03 3 s, then `deck`, `report`, `update_figures`, `collab`               |
| clip-5 | card_04 3 s, then `ai_question`, `ai_figure`, `ai_deck`, `ai_prompt_library` |
| clip-6 | card_05 3 s, then `guardrails`                                               |
| clip-7 | card_06 3 s, `scheduled_import` to the first sentence, then schematic_v2     |
| end    | card_07 for 4 s, silent                                                      |

## §3 Rulings

1. Cards carry a part number and a plain title only; the schematic shows the few
   boxes the narration names. Nothing else is drawn: everything else is a screen
   recording.
2. The schematic's future items are tagged Future, not Next or Soon.
3. Every recording is made on the demo instance. The local dev stack is not
   used.
4. Recordings never linger on a page listing people's emails: the Users page and
   the Assets page are out, and the Results list's Created-by column is covered
   by the wizard within a second or two.
5. The AI takes run on the demo instance and spend its credits. Tim has said go.
6. Products needed for a take are reused from the "V2 Presentation" folder where
   one fits; anything created goes in a folder named "Demo video" and is deleted
   when the plan closes. Nothing else on the instance is renamed or deleted.
7. The videos do not need to match the narration exactly.
8. No import or results-package generation is launched: every wizard is
   cancelled at its last step.

## §4 Steps

### Step 0: Survey the demo instance and retarget the four takes

Surface: `demo_video/src/record.js`, `demo_video/snippets/`.

Without recording, dump what each page offers: the Explore module menu and view
types per family; the HMIS indicator ids in the DHIS2 wizard's first step; the
packages list; the "V2 Presentation" folder's deck and reports (open each, note
what they contain and whether the deck's figures are out of date against the
pinned package). Then put the demo instance's names into the four takes, record
them, convert them, and check a frame from each. The Explore take shows the
table, the chart grid and a map if the demo package's maps render with data; if
the data-quality module exists, its coloured table too.

Done when the four `snippets/` files come from the demo instance and each has
been checked by frame.

### Step 1: The remaining recordings

Surface: `demo_video/src/record.js`, `demo_video/snippets/`.

Add these takes and record them:

1. `deck` (Part 3): open "Presentation Example - ANC", move through its slides,
   add a slide, insert a figure, change the theme, open Present, open the
   Download menu.
2. `report` (Part 3): open "V2 Presentation 1" (or create a report from the
   policy brief template in "Demo video"), insert a figure, open the Download
   menu.
3. `update_figures` (Part 3): a deck attached to an older package, the
   out-of-date badge, Update figures. If no such deck exists, duplicate the ANC
   deck into "Demo video" and reattach the copy to "Results package 2026-10-06
   (Demo 2)".
4. `collab` (Part 3): two recording contexts on the same deck, both cursors
   visible, one editing; then History and a version preview.
5. `ai_question`, `ai_figure`, `ai_deck` (Part 4): the chat beside the ANC deck;
   a question answered from the results; a draft figure card added to the deck;
   a deck built from a topic in a new deck in "Demo video". The build runs for
   minutes; record it whole and cut later.
6. `ai_prompt_library` (Part 4): the prompt library open, a prompt chosen.
7. `guardrails` (Part 5): the data tool call expanded to show what was read; a
   report edit proposed as a diff; the delete confirmation; version history with
   the AI's edits.

Each take is converted as in §2 and reviewed by frame before it counts.

Done when every section in the §2 table has recordings that cover its clip's
length.

### Step 2: The rough cut

Surface: `demo_video/src/assemble.ts` (new), `demo_video/src/cut_list.json`
(new), `demo_video/rough_cut.mp4` (new).

A Deno script that reads the cut list (one row per visual: section, source,
start, duration, hold) and runs ffmpeg: trims each source, pads the last one of
a section with its final frame to the clip's length, concatenates the sections,
muxes the seven audio clips in order, and writes `demo_video/rough_cut.mp4`
(H.264, yuv420p, 1920x1080, 30 fps, AAC). The cut list is the §2 table made
exact.

Done when `ffprobe` shows the file's length equal to the audio total plus the
end card, and a frame from each section shows the right visual.

### Step 3: Review and close

Watch the rough cut against the transcript. Fix timing in the cut list and
rebuild. Delete the "Demo video" folder on the demo instance, delete this file.

## §5 Gates catalogue

- `deno fmt --check demo_video` green.
- Every path named in `transcript_v2.md` and in the cut list exists.
- `ffprobe` on every mp4: 1920x1080, h264, 30 fps.

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
