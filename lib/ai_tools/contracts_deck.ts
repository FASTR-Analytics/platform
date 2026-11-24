import { IMAGE_LIMITS } from "@timroberton/panther";
import { z } from "zod";
import { MAX_CONTENT_BLOCKS } from "../consts.ts";
import {
  AiContentSlideSchema,
  AiCoverSlideSchema,
  AiDeckSettingsPatchSchema,
  AiFigureConfigPatchSchema,
  AiSectionSlideSchema,
  AiSlideUpdateSchema,
} from "../types/ai_input.ts";
import { MAX_LOOK_SUBJECTS } from "./read_bounds.ts";

// The deck tools' contracts: see copilot_catalogue.ts.

// A figure is `{ metricId, config }` resolved under the deck's own results
// package and scope: there is no figure library to point at, so every
// figure block starts from a metric and one of that metric's presets.
const CONTENT_BLOCKS_NOTE =
  "\n\nA content block is one of:\n- from_metric: a figure built from a metric + one of its presets. IMPORTANT: always call get_metric_data FIRST to see the data and its time range; get_dimension_values lists the values a filter or selectedReplicant takes. The figure resolves under the deck's results package and scope.\n- text: markdown content with autofit. IMPORTANT: Markdown tables are NOT allowed. To display tabular data, use a from_metric block with a table-type preset.\n- image: one of the instance's image assets, named by its file as get_image_assets lists it.";

const outlineInputSchema = z.strictObject({
  reportingPeriod: z.strictObject({
    start: z.number().int().describe("First month, YYYYMM (e.g. 202507)."),
    end: z.number().int().describe("Last month, YYYYMM (e.g. 202509)."),
  }).describe(
    "The reporting period every period role resolves from: the one the person chose, or the latest complete one you found in the data.",
  ),
  topics: z.array(
    z.strictObject({
      topicId: z.string().describe("The blueprint topic's id (t1, t2, …)."),
      slideCount: z.number().int().min(0).max(30).describe(
        "Slides planned for this topic in THIS deck; 0 drops it.",
      ),
      reason: z.string().describe(
        "Why this many, from this deck's data, in one or two sentences the person reads (e.g. '3 regions are below 70%: Bo, Kenema, Port Loko').",
      ),
      slideNotes: z.array(z.string()).optional().describe(
        "One short line per planned slide: what it is about.",
      ),
      standIns: z.array(z.strictObject({
        original: z.string().describe(
          "What the blueprint asked for (metric, preset, filter or map level).",
        ),
        replacement: z.string().describe(
          "What you propose instead, or 'drop this figure'.",
        ),
        reason: z.string(),
      })).optional().describe(
        "Every figure that cannot be built as the blueprint says.",
      ),
      translatedVerbatim: z.boolean().optional().describe(
        "True when a keep-word-for-word block of this topic will be translated.",
      ),
    }),
  ).min(1).describe(
    "Every topic of the blueprint, in its order, each exactly once.",
  ),
});

export type BlueprintOutlineToolInput = z.infer<typeof outlineInputSchema>;

export const DECK_TOOL_CONTRACTS = {
  get_deck: {
    description:
      "Get the current state of the slide deck: a summary outline of all slides, giving the deck's structure, existing content, slide order and, for each slide, whether it overflows the page, then the deck's settings: its cover, header and footer logos, the logos that can be selected, the footer text and the watermark.",
    kind: "read",
    inputSchema: z.strictObject({}),
  },

  create_slide: {
    description:
      "Create a new slide and insert it into the deck at a specified position. Supports three slide types: 'cover' (title slide), 'section' (section divider), and 'content' (main content with text, figures and images)." +
      CONTENT_BLOCKS_NOTE,
    kind: "write",
    inputSchema: z.strictObject({
      position: z
        .union([
          z.strictObject({
            after: z.string().describe(
              "Slide ID to place after (3-char, e.g. 'p4q')",
            ),
          }),
          z.strictObject({
            before: z.string().describe(
              "Slide ID to place before (3-char, e.g. 'p4q')",
            ),
          }),
          z.strictObject({
            toStart: z.literal(true).describe(
              "Set to true to insert at the beginning",
            ),
          }),
          z.strictObject({
            toEnd: z.literal(true).describe(
              "Set to true to insert at the end",
            ),
          }),
        ])
        .describe("The position to insert the new slide."),
      slide: z
        .union([
          AiCoverSlideSchema,
          AiSectionSlideSchema,
          AiContentSlideSchema,
        ])
        .describe(
          "The complete slide content. Must be one of three types: 'cover' (title slide with title and optional subtitle/presenter/date), 'section' (section divider with sectionTitle and optional sectionSubtitle), or 'content' (content slide with optional header and blocks array of text, figures and images).",
        ),
    }),
  },

  replace_slide: {
    description:
      "Rebuild an existing slide from new content: its content and its layout, which is optimized again, so a layout the user arranged is lost. A slide that keeps its type keeps the settings the input does not name: a cover's or section's text sizes, bold and italic, a cover's logos, and a content slide's sub-header, date, footer, header and footer logos and side panel (split). Use this ONLY when:\n- Rebuilding a slide from scratch with different structure\n- Changing slide types (content → section, etc.)\n\nFor any other change to text, settings, blocks or layout, use update_slide, which keeps what it is not told to change. An edit to the open slide shows on its canvas at once and saves automatically; an edit to any other slide is saved immediately." +
      CONTENT_BLOCKS_NOTE,
    kind: "write",
    inputSchema: z.strictObject({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
      slide: z
        .union([
          AiCoverSlideSchema,
          AiSectionSlideSchema,
          AiContentSlideSchema,
        ])
        .describe(
          "The slide's new content. A content slide's layout is auto-optimized. A setting left out is kept when the slide keeps its type.",
        ),
    }),
  },

  delete_slides: {
    description:
      "Permanently remove one or more slides from the deck. The user confirms the deletion in a dialog that lists the slides by title; once confirmed the slides cannot be recovered. Remaining slides will maintain their relative order.",
    kind: "write",
    inputSchema: z.strictObject({
      slideIds: z
        .array(z.string())
        .describe(
          "Array of slide IDs to delete (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
        ),
    }),
  },

  duplicate_slides: {
    description:
      "Create copies of one or more slides. All duplicates are inserted after the last original slide (preserving their relative order). The duplicated slides have identical content but receive new unique IDs. This is also the only way to reuse a figure: there is no figure library, so copying the slide that holds it is how a figure is reused.",
    kind: "write",
    inputSchema: z.strictObject({
      slideIds: z
        .array(z.string())
        .describe(
          "Array of slide IDs to duplicate (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
        ),
    }),
  },

  move_slides: {
    description:
      "Reposition one or more slides to a new location in the deck. This is the recommended way to reorder slides, as it's safer and more precise than trying to recreate the entire deck. The moved slides will maintain their relative order to each other.",
    kind: "write",
    inputSchema: z.strictObject({
      slideIds: z
        .array(z.string())
        .describe(
          "Array of slide IDs to move (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
        ),
      position: z
        .union([
          z.strictObject({
            after: z.string().describe(
              "Slide ID to place after (3-char, e.g. 'p4q')",
            ),
          }),
          z.strictObject({
            before: z.string().describe(
              "Slide ID to place before (3-char, e.g. 'p4q')",
            ),
          }),
          z.strictObject({
            toStart: z.literal(true).describe(
              "Set to true to move slides to the beginning",
            ),
          }),
          z.strictObject({
            toEnd: z.literal(true).describe(
              "Set to true to move slides to the end",
            ),
          }),
        ])
        .describe("The destination position for the slides."),
    }),
  },

  get_slides: {
    description:
      "Retrieve the content and structure of one or more slides in the open deck, in the order asked: the open slide as it stands on the canvas (including edits not yet saved), any other slide as saved. Ask for every slide you need in one call. Each entry carries the slide's ID and, first, `page`: whether the slide overflows the page. For content slides, this returns each content block with its unique ID and a summary (a figure with its full config: metric, type, disaggregations and display slots, replicant and the count of its values (get_dimension_values lists them), filters, captions) and the current layout structure (rows/columns with spans). Use the block IDs with update_slide and update_figure.",
    kind: "read",
    inputSchema: z.strictObject({
      slideIds: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of slide IDs to read (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
        ),
    }),
  },

  get_slide_images: {
    description:
      `Look at one to ${MAX_LOOK_SUBJECTS} slides of the open deck as images, each drawn as the PDF export draws its page: the open slide as it stands on the canvas (including edits not yet saved), any other slide as saved. Use it to judge what a slide's text, and whether it overflows the page, cannot tell you: whether a dense table can be read, whether several blocks sit well together. The images come back in the order asked, and the result gives each one's size in pixels and, for each slide, whether it overflows the page. You see an image for the rest of this turn and not after, so say in your reply what it showed. Looking again is one call and shows the slide as it is then. A turn takes at most ${IMAGE_LIMITS.MAX_PER_TURN} images.`,
    kind: "read",
    inputSchema: z.strictObject({
      slideIds: z
        .array(z.string())
        .min(1)
        .max(MAX_LOOK_SUBJECTS)
        .describe(
          `Array of one to ${MAX_LOOK_SUBJECTS} slide IDs to look at (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.`,
        ),
    }),
  },

  get_image_assets: {
    description:
      "List the file names of the instance's image assets: the files an image block or a content slide's image split panel can show. Call it only when an image is asked for. Assets are uploaded by users on the Assets page; no tool uploads one.",
    kind: "read",
    inputSchema: z.strictObject({}),
  },

  update_slide: {
    description:
      "Change a slide in place, keeping everything not named: a cover's title, subtitle, presenter or date, each one's size, bold and italic, and its logos; a section's title or subtitle, and each one's size, bold and italic; a content slide's header, sub-header, date, footer, header and footer logos, side panel (split), its blocks (blockUpdates) or its layout (layoutChange). get_slides shows a slide's settings as stored. Give the slideId and an `update` whose `type` matches the slide's type, with only the fields to change. A block ID comes from get_slides or from the result of the write that made the block. A from_metric block needs get_metric_data first. To tweak an existing figure use update_figure; to rebuild a slide or change its type use replace_slide. An edit to the open slide shows on its canvas at once and saves automatically; an edit to any other slide is saved immediately.",
    kind: "write",
    inputSchema: z.strictObject({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
      // Under a key: panther's createAITool (and Anthropic's input_schema
      // contract) requires the top-level schema to be an object.
      update: AiSlideUpdateSchema,
    }),
  },

  update_figure: {
    description:
      "Edit an existing FIGURE block in place: THE tool for changing anything about a figure already on a slide (the replicant, filters, disaggregation, period, captions), however it was created. Give the slideId and the figure's blockId (from get_slides, or from the result of the write that made the block) and only the fields to change (e.g. selectedReplicantValue, filterBy, disaggregateBy, periodFilter, caption); everything else is preserved and the data is re-queried automatically. To CHANGE A REPLICANT, always use this: it validates the value against the available options and errors clearly. The figure's chart type cannot be changed here (replace the block with a new from_metric figure to change it). An edit to the open slide shows on its canvas at once and saves automatically; an edit to any other slide is saved immediately. To edit a figure embedded in a REPORT, use update_report_figure instead.",
    kind: "write",
    inputSchema: z.strictObject({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
      blockId: z.string().describe(
        "Figure block ID (from get_slides, or from the result of the write that made the block).",
      ),
      patch: AiFigureConfigPatchSchema,
    }),
  },

  update_deck_settings: {
    description:
      "Change the deck's settings: its logos, the footer text every content slide shows and the watermark. Name only the settings to change; logos is replaced whole, so send it as get_deck shows it with your changes. A custom logo must be one of the instance's image assets (get_image_assets lists them), and a selected logo must be a built-in logo or one of the deck's custom logos. The change shows on every slide at once and is saved. A slide's own logo setting (a cover's showLogos, a content slide's showHeaderLogos and showFooterLogos) is set with update_slide.",
    kind: "write",
    inputSchema: AiDeckSettingsPatchSchema,
  },

  get_blueprint_run: {
    description:
      "Read the deck blueprint the person asked to apply to this deck: the steps to follow, the chosen reporting period and the blueprint itself (topics, scaling rules, slide patterns, look). Call it first whenever the person asks to apply a blueprint.",
    kind: "read",
    inputSchema: z.strictObject({}),
  },

  propose_blueprint_outline: {
    description:
      "Show the person the outline you propose for applying the blueprint to this deck: the reporting period, and for every topic the number of slides (0 drops it), why, a line per slide, and any figure stand-ins. The person edits it on a card and presses Build (or Cancel). On Build the deck is prepared (a version saved first when slides are replaced, the blueprint's look if they keep it on, old slides removed when replacing) and the result gives the approved outline and the resolved periods; then create the slides. Call it once per run, alone in its response.",
    kind: "write",
    inputSchema: outlineInputSchema,
  },

  show_draft_slide_to_user: {
    description:
      `Show an ad-hoc slide preview to the user inline in the chat. This is also how you show a single chart: put one from_metric figure on a content slide. Use it to propose slide content, display ideas, or when the user asks to see something charted. While a slide deck is open the user can add the draft to it from the preview. The result says whether the slide overflows the page.\n\nSupports three slide types:\n- 'cover': Title slide with title and optional subtitle/presenter/date\n- 'section': Section divider with sectionTitle and optional sectionSubtitle\n- 'content': Content slide with optional header and blocks (text, figures and images)\n\nFor content blocks, use the same rules as create_slide: from_metric for figures (call get_metric_data first), text for markdown, image for an image asset (get_image_assets lists them). IMPORTANT: Markdown tables are NOT allowed — to display tabular data, use a from_metric block with a table-type preset. Max ${MAX_CONTENT_BLOCKS} content blocks.`,
    kind: "read",
    inputSchema: z.strictObject({
      slide: z
        .union([
          AiCoverSlideSchema,
          AiSectionSlideSchema,
          AiContentSlideSchema,
        ])
        .describe(
          "The slide content. Must be one of: 'cover', 'section', or 'content'.",
        ),
    }),
  },
} as const;
