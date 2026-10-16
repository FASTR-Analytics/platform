# PLAN: Demo video assembly

Assemble the 5-minute platform demo from Tim's narration, the title cards, the
two schematic clips and screen recordings of the app, into one mp4 Tim finishes
in Descript.

**Next step: Step 1.** Tim sets this line as each step finishes. Step 3 deletes
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

The visuals exist for the opening, Parts 1, 2 and 6, and the cards for every
section; Parts 3, 4 and 5 have no screen recordings yet. The rough cut cannot be
built until they exist.

## §2 The model

**Assets, all 1920x1080.**

- Cards: `demo_video/cards/card_00_title.png` to `card_07_end.png`, one per
  section plus title and end.
- Schematic clips: `demo_video/schematic_v1.mp4` (today, 24 s, builds in the
  order the opening names things) and `schematic_v2.mp4` (future, 30 s, the
  automation items appear in the order Part 6 names them). Both hold their last
  frame; cut to length.
- Screen recordings in `demo_video/snippets/`: `explore.mp4` (35.6 s: table,
  chart grid, data-quality table), `results_wizard.mp4` (30.0 s: packages list,
  the three wizard steps), `data.mp4` (50.0 s: Data page, the HMIS data heat
  map, the DHIS2 wizard with indicators and period) and `scheduled_import.mp4`
  (42.1 s: the Future tab, the wizard set to Recurring, Monthly). All show the
  local dev instance with its header renamed Mozambique; the data is the
  Mozambique dev copy.
- Sources: `demo_video/src/` holds the card and schematic pages, the timeline
  script, and `record.js`, the Playwright recording script.

**Recording.** The dev stack, started as `./run` does but with two overrides and
no file edits:

```
./pg_run; ./valkey_run
INSTANCE_NAME="Mozambique" nohup deno run --allow-all --env-file --unstable-broadcast-channel main.ts &
(cd client && VITE_BYPASS_AUTH=true nohup npm run dev &)
```

Then `browser_run_code_unsafe` with `filename: demo_video/src/record.js` and
`SNIPPET` set at the top of the file. The script opens a fresh browser context
that records video, expands the nav rail, hides the onboarding tours (their
seen-flags live in Clerk metadata, which the bypass has no user for) and draws a
cursor. The take lands as `demo_video/src/_rec/<take>/*.webm`; the first two
seconds are page load:

```
ffmpeg -y -ss 2.0 -i demo_video/src/_rec/<take>/<file>.webm -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -movflags +faststart demo_video/snippets/<take>.mp4
```

**Assembly.** One section = one audio clip + one visual track exactly as long as
the clip: the section's card for about 3 seconds, then clips and recordings
trimmed or held (last frame) to fill the rest. Sections concatenate in order;
the end card follows clip-7. Timing is approximate on purpose: an element may
appear a little before its words, never long after.

| Clip   | Visual track                                                              |
| ------ | ------------------------------------------------------------------------- |
| clip-1 | card_00 for the first sentence (about 12 s), then schematic_v1, held      |
| clip-2 | card_01 3 s, then data.mp4 trimmed to fit                                 |
| clip-3 | card_02 3 s, results_wizard.mp4, then explore.mp4 trimmed to fit          |
| clip-4 | card_03 3 s, then the Part 3 recordings (Step 1)                          |
| clip-5 | card_04 3 s, then the Part 4 recordings (Step 1)                          |
| clip-6 | card_05 3 s, then the Part 5 recordings (Step 1)                          |
| clip-7 | card_06 3 s, scheduled_import.mp4 to the first sentence, schematic_v2.mp4 |
| end    | card_07 for 4 s, silent                                                   |

## §3 Rulings

1. Cards carry a part number and a plain title only; the schematic shows the few
   boxes the narration names. Nothing else is drawn: everything else is a screen
   recording.
2. The schematic's future items are tagged Future, not Next or Soon.
3. Recordings never show a page listing real people's emails: the Users page,
   the Assets page, and the Results list's Created-by column are out, or covered
   by a dialog within a second.
4. The AI recordings spend Anthropic credits through the dev `.env` key. Tim
   says go before Step 1 records them.
5. The dev database is used as found. Any product created for a recording goes
   in a folder named "Demo video" and is deleted when the plan closes.
6. The videos do not need to match the narration exactly.

## §4 Steps

### Step 1: The remaining recordings

Surface: `demo_video/src/record.js`, `demo_video/snippets/`.

Add takes to `record.js` and record them, in this order:

1. `deck` (Part 3): open a deck with content (create one in the "Demo video"
   folder if none is presentable: a deck from the pinned package with a few
   preset figures), add a slide, insert a figure, change the theme, open
   Present, open the Download menu.
2. `report` (Part 3): create a report from the policy brief template, insert a
   figure, open the Download menu.
3. `update_figures` (Part 3): a deck attached to an older package, the
   out-of-date badge, Update figures.
4. `collab` (Part 3): two browser contexts on the same deck, both cursors
   visible, one editing; then History and a version preview.
5. `ai_question`, `ai_figure`, `ai_deck` (Part 4): the chat beside a deck; a
   question answered from the results; a draft figure card added to the deck; a
   deck built from a topic. The deck build runs for minutes; record it whole and
   cut later.
6. `ai_prompt_library` (Part 4): the prompt library open, a prompt chosen.
7. `guardrails` (Part 5): the data tool call expanded to show what was read; a
   report edit proposed as a diff; the delete confirmation; version history with
   the AI's edits.

Each take is converted as in §2 and reviewed by frame before it counts.

Done when every section in the §2 table has recordings that cover its clip's
length.

### Step 2: The rough cut

Surface: `demo_video/src/assemble.ts` (new), `demo_video/rough_cut.mp4` (new).

A Deno script that reads a cut list (one row per visual: section, source, start,
duration, hold) and runs ffmpeg: trims each source, pads the last one of a
section with its final frame to the clip's length, concatenates the sections,
muxes the seven audio clips in order, and writes `demo_video/rough_cut.mp4`
(H.264, yuv420p, 1920x1080, 30 fps, AAC). The cut list is the §2 table made
exact, kept beside the script.

Done when `ffprobe` shows the file's length equal to the audio total plus the
end card, and a frame from each section shows the right visual.

### Step 3: Review and close

Watch the rough cut against the transcript. Fix timing in the cut list and
rebuild. Delete the "Demo video" folder in the dev database, delete this file.

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
  schematic clips rendered from `demo_video/src/`. Four screen recordings made
  through the Playwright MCP against the dev stack (Explore, results wizard,
  Data and DHIS2 wizard, scheduled import), converted to `snippets/`. The
  Explore map views were left out: on this package the map renders without data.
  Narration clips received in `demo_video/audio/`.
