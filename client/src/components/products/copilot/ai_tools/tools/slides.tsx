import { serverActions } from "~/server_actions";
import { AIToolFailure, createAITool, plural } from "panther";
import { z } from "zod";
import {
  AiContentSlideSchema,
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  type AiSlideInput,
  COPILOT_TOOL_VIEWS,
  DECK_BLUEPRINT_MAX_BLOCKS,
  DECK_BLUEPRINT_SLIDE_WORDS_MAX,
  getSlideTitle,
  type MetricWithStatus,
  type Slide,
  t3,
  TC,
  validateTextOnlyMarkdown,
  withKeptSlideSettings,
} from "lib";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import {
  type ClientAIToolEnv,
  copilotViewController,
  copilotViews,
} from "~/components/instance/copilot/mod.ts";
import {
  convertAiInputToSlide,
  getDeckSummaryForAI,
} from "../../slide_ai/mod.ts";
import {
  assertSplitImageAsset,
  validateMaxContentBlocks,
  validateSlideTotalWordCount,
} from "../../_shared/mod.ts";
import { assertSlidesNotBusy } from "../validators/mod.ts";
import {
  createUpdateDeckSettingsTool,
  formatDeckSettings,
} from "./deck_settings.ts";
import { createGetSlidesTool } from "./get_slides.ts";
import { createGetSlideImagesTool } from "./get_slide_images.ts";
import { createUpdateSlideTool } from "./update_slide.ts";
import { slidesLabel } from "./tool_labels.ts";
import { createUpdateFigureTool } from "./update_figure.ts";
import {
  assertSlidesInDeck,
  readSlideTarget,
  slideTargetOutcome,
  writeSlideTarget,
} from "./slide_target.ts";
import {
  figureBlockIds,
  prepareSlideWriteResult,
} from "./slide_write_result.ts";

// A figure is `{ metricId, config }` resolved under the deck's own results
// package and scope: there is no figure library to point at, so every
// figure block starts from a metric and one of that metric's presets.
const CONTENT_BLOCKS_NOTE =
  "\n\nA content block is one of:\n- from_metric: a figure built from a metric + one of its presets. IMPORTANT: always call get_metric_data FIRST to see the data and its time range; get_dimension_values lists the values a filter or selectedReplicant takes. The figure resolves under the deck's results package and scope.\n- text: markdown content with autofit. IMPORTANT: Markdown tables are NOT allowed. To display tabular data, use a from_metric block with a table-type preset.\n- image: one of the instance's image assets, named by its file as get_image_assets lists it.";

// The content checks a whole new slide must pass before it is converted.
function validateAiSlideInput(slide: AiSlideInput): void {
  if (slide.type !== "content") return;
  assertSplitImageAsset(slide.split);
  if (slide.blocks.length === 0) {
    throw new AIToolFailure("Content slide must have at least 1 block.");
  }
  // An exact layout (a blueprint's grid) skips the optimizer, whose block
  // limit is what MAX_CONTENT_BLOCKS guards; the grid has its own.
  if (slide.layoutRows) {
    if (slide.blocks.length > DECK_BLUEPRINT_MAX_BLOCKS) {
      throw new AIToolFailure(
        `A slide with layoutRows holds at most ${DECK_BLUEPRINT_MAX_BLOCKS} blocks.`,
      );
    }
  } else {
    validateMaxContentBlocks(slide.blocks.length);
  }
  const texts = slide.blocks.flatMap((b) =>
    b.type === "text" ? [b.markdown] : []
  );
  for (const text of texts) validateTextOnlyMarkdown(text);
  validateSlideTotalWordCount(
    texts,
    slide.layoutRows ? DECK_BLUEPRINT_SLIDE_WORDS_MAX : undefined,
  );
}

export function getClientToolsForSlides(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "get_deck",
      description:
        "Get the current state of the slide deck: a summary outline of all slides, giving the deck's structure, existing content, slide order and, for each slide, whether it overflows the page, then the deck's settings: its cover, header and footer logos, the logos that can be selected, the footer text and the watermark.",
      inputSchema: z.strictObject({}),
      availableIn: COPILOT_TOOL_VIEWS.get_deck,
      kind: "read",
      handler: async (_input, view) => {
        const deckConfig = view.context.getDeckConfig();
        const outline = await getDeckSummaryForAI(
          view.params.deckId,
          view.context.getSlideIds(),
          view.context.getOpenSlide(),
          deckConfig,
        );
        return `${outline}\n${formatDeckSettings(deckConfig)}`;
      },
      inProgressLabel: t3({
        en: "Getting the slide deck...",
        fr: "Récupération de la présentation...",
        pt: "A obter a apresentação...",
      }),
      successMessage: () => {
        const view = copilotViewController.current();
        if (view.id !== "editing_slide_deck") {
          return t3({
            en: "Retrieved the slide deck",
            fr: "Présentation récupérée",
            pt: "Apresentação obtida",
          });
        }
        const slides = slidesLabel(view.context.getSlideIds().length);
        return t3({
          en: `Retrieved the slide deck (${slides})`,
          fr: `Présentation récupérée (${slides})`,
          pt: `Apresentação obtida (${slides})`,
        });
      },
    }),

    createGetSlidesTool(env, metrics),

    createGetSlideImagesTool(),

    createAITool({
      viewRegistry: copilotViews,
      name: "create_slide",
      description:
        "Create a new slide and insert it into the deck at a specified position. Supports three slide types: 'cover' (title slide), 'section' (section divider), and 'content' (main content with text, figures and images)." +
        CONTENT_BLOCKS_NOTE,
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
      availableIn: COPILOT_TOOL_VIEWS.create_slide,
      kind: "write",
      handler: async (input, view) => {
        validateAiSlideInput(input.slide);
        const deckConfig = view.context.getDeckConfig();
        const convertedSlide = await convertAiInputToSlide(
          view.context.getScope(),
          input.slide,
          metrics,
          deckConfig,
        );
        const result = await prepareSlideWriteResult(
          env,
          metrics,
          convertedSlide,
          deckConfig,
          figureBlockIds(convertedSlide),
        );

        const res = await serverActions.createSlide({
          product_id: view.params.deckId,
          position: input.position,
          slide: convertedSlide,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        copilotViewController.markAIEdit(`slide:${res.data.slideId}`);
        copilotViewController.markAIEdit(`product:${view.params.deckId}`);

        return result(
          res.data.slideId,
          `Created slide ${res.data.slideId}: "${
            getSlideTitle(convertedSlide)
          }".`,
        );
      },
      inProgressLabel: t3({
        en: "Creating a slide...",
        fr: "Création d'une diapositive...",
        pt: "A criar um diapositivo...",
      }),
      successMessage: (input) => {
        const title = getSlideTitle(input.slide as Slide);
        return t3({
          en: `Created a slide: "${title}"`,
          fr: `Diapositive créée : « ${title} »`,
          pt: `Diapositivo criado: "${title}"`,
        });
      },
    }),

    createUpdateSlideTool(env, metrics),

    createUpdateFigureTool(env, metrics),

    createAITool({
      viewRegistry: copilotViews,
      name: "replace_slide",
      description:
        "Rebuild an existing slide from new content: its content and its layout, which is optimized again, so a layout the user arranged is lost. A slide that keeps its type keeps the settings the input does not name: a cover's or section's text sizes, bold and italic, a cover's logos, and a content slide's sub-header, date, footer, header and footer logos and side panel (split). Use this ONLY when:\n- Rebuilding a slide from scratch with different structure\n- Changing slide types (content → section, etc.)\n\nFor any other change to text, settings, blocks or layout, use update_slide, which keeps what it is not told to change. An edit to the open slide shows on its canvas at once and saves automatically; an edit to any other slide is saved immediately." +
        CONTENT_BLOCKS_NOTE,
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
      availableIn: COPILOT_TOOL_VIEWS.replace_slide,
      kind: "write",
      handler: async (input, view) => {
        validateAiSlideInput(input.slide);
        // Read before the conversion: the settings the slide keeps (a side
        // panel, a sub-header) shape the layout the optimizer chooses.
        const target = await readSlideTarget(view, input.slideId);
        const deckConfig = view.context.getDeckConfig();
        const convertedSlide = await convertAiInputToSlide(
          view.context.getScope(),
          withKeptSlideSettings(target.slide, input.slide),
          metrics,
          deckConfig,
        );
        const result = await prepareSlideWriteResult(
          env,
          metrics,
          convertedSlide,
          deckConfig,
          figureBlockIds(convertedSlide),
        );
        await writeSlideTarget(view, target, convertedSlide);

        return result(
          input.slideId,
          `Replaced slide ${input.slideId}: "${
            getSlideTitle(convertedSlide)
          }". ${slideTargetOutcome(target)}`,
        );
      },
      inProgressLabel: t3({
        en: "Replacing a slide...",
        fr: "Remplacement d'une diapositive...",
        pt: "A substituir um diapositivo...",
      }),
      successMessage: (input) => {
        const title = getSlideTitle(input.slide as Slide);
        return t3({
          en: `Replaced a slide: "${title}"`,
          fr: `Diapositive remplacée : « ${title} »`,
          pt: `Diapositivo substituído: "${title}"`,
        });
      },
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "delete_slides",
      description:
        "Permanently remove one or more slides from the deck. The user confirms the deletion in a dialog that lists the slides by title; once confirmed the slides cannot be recovered. Remaining slides will maintain their relative order.",
      inputSchema: z.strictObject({
        slideIds: z
          .array(z.string())
          .describe(
            "Array of slide IDs to delete (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
          ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.delete_slides,
      kind: "write",
      // The one deck write that asks first (the others are the catalogue's
      // approval exemptions): a deletion cannot be undone, so the user sees
      // the slides by title and confirms before anything is written.
      approval: {
        presentation: "modal",
        propose: async (input, view) => {
          assertSlidesNotBusy(input.slideIds);

          if (input.slideIds.length === 0) {
            throw new AIToolFailure(
              "No slide IDs provided. Specify at least one slide to delete.",
            );
          }

          assertSlidesInDeck(view, input.slideIds);

          const deckId = view.params.deckId;
          const titles = await Promise.all(
            input.slideIds.map(async (slideId) => {
              const res = await getSlideFromCacheOrFetch(deckId, slideId);
              return res.success ? getSlideTitle(res.data.slide) : slideId;
            }),
          );
          return {
            preview: {
              title: t3({
                en: `Delete ${titles.length} ${
                  plural(titles.length, { one: "slide", other: "slides" })
                }`,
                fr: `Supprimer ${titles.length} ${
                  plural(titles.length, {
                    one: "diapositive",
                    other: "diapositives",
                  })
                }`,
                pt: `Eliminar ${titles.length} ${
                  plural(titles.length, {
                    one: "diapositivo",
                    other: "diapositivos",
                  })
                }`,
              }),
              description: titles.map((title) => `- ${title}`).join("\n"),
              intent: "danger",
              confirmLabel: t3(TC.delete),
            },
            // The deck's own delete, as the rail runs it: a deleted open
            // slide hands the editor to its neighbour before the request.
            commit: async () => {
              const res = await view.context.deleteSlides(input.slideIds);
              if (!res.success) throw new AIToolFailure(res.err);

              for (const slideId of res.data.deletedIds) {
                copilotViewController.markAIEdit(`slide:${slideId}`);
              }
              copilotViewController.markAIEdit(`product:${deckId}`);

              return `Deleted ${res.data.deletedIds.length} slide(s).`;
            },
          };
        },
      },
      inProgressLabel: (input) => {
        const slides = slidesLabel(input.slideIds.length);
        return t3({
          en: `Proposing to delete ${slides}...`,
          fr: `Proposition de supprimer ${slides}...`,
          pt: `A propor eliminar ${slides}...`,
        });
      },
      successMessage: t3({
        en: "Not proposed: no slide to delete",
        fr: "Non proposé : aucune diapositive à supprimer",
        pt: "Não proposto: nenhum diapositivo a eliminar",
      }),
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "duplicate_slides",
      description:
        "Create copies of one or more slides. All duplicates are inserted after the last original slide (preserving their relative order). The duplicated slides have identical content but receive new unique IDs. This is also the only way to reuse a figure: there is no figure library, so copying the slide that holds it is how a figure is reused.",
      inputSchema: z.strictObject({
        slideIds: z
          .array(z.string())
          .describe(
            "Array of slide IDs to duplicate (3-char alphanumeric, e.g. ['a3k', 'x7m']). Get these from get_deck.",
          ),
      }),
      availableIn: COPILOT_TOOL_VIEWS.duplicate_slides,
      kind: "write",
      handler: async (input, view) => {
        if (input.slideIds.length === 0) {
          throw new AIToolFailure(
            "No slide IDs provided. Specify at least one slide to duplicate.",
          );
        }

        assertSlidesInDeck(view, input.slideIds);

        const res = await serverActions.duplicateSlides({
          product_id: view.params.deckId,
          slideIds: input.slideIds,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        for (const slideId of res.data.newSlideIds) {
          copilotViewController.markAIEdit(`slide:${slideId}`);
        }
        copilotViewController.markAIEdit(`product:${view.params.deckId}`);

        return `Duplicated ${input.slideIds.length} slide(s). Created ${res.data.newSlideIds.length} new slide(s) with IDs: ${
          res.data.newSlideIds.join(", ")
        }.`;
      },
      inProgressLabel: (input) => {
        const slides = slidesLabel(input.slideIds.length);
        return t3({
          en: `Duplicating ${slides}...`,
          fr: `Duplication de ${slides}...`,
          pt: `A duplicar ${slides}...`,
        });
      },
      successMessage: (input) => {
        const n = input.slideIds.length;
        const slides = slidesLabel(n);
        return t3({
          en: `Duplicated ${slides}`,
          fr: `${slides} ${
            plural(n, { one: "dupliquée", other: "dupliquées" })
          }`,
          pt: `${slides} ${
            plural(n, { one: "duplicado", other: "duplicados" })
          }`,
        });
      },
    }),

    createAITool({
      viewRegistry: copilotViews,
      name: "move_slides",
      description:
        "Reposition one or more slides to a new location in the deck. This is the recommended way to reorder slides, as it's safer and more precise than trying to recreate the entire deck. The moved slides will maintain their relative order to each other.",
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
      availableIn: COPILOT_TOOL_VIEWS.move_slides,
      kind: "write",
      handler: async (input, view) => {
        if (input.slideIds.length === 0) {
          throw new AIToolFailure(
            "No slide IDs provided. Specify at least one slide to move.",
          );
        }

        const position = input.position;
        if ("after" in position && input.slideIds.includes(position.after)) {
          throw new AIToolFailure(
            `Cannot move slide(s) relative to themselves. Slide "${position.after}" is in both the move set and target position.`,
          );
        }
        if ("before" in position && input.slideIds.includes(position.before)) {
          throw new AIToolFailure(
            `Cannot move slide(s) relative to themselves. Slide "${position.before}" is in both the move set and target position.`,
          );
        }

        const res = await serverActions.moveSlides({
          product_id: view.params.deckId,
          slideIds: input.slideIds,
          position: input.position,
        });
        if (!res.success) throw new AIToolFailure(res.err);

        for (const slideId of input.slideIds) {
          copilotViewController.markAIEdit(`slide:${slideId}`);
        }
        copilotViewController.markAIEdit(`product:${view.params.deckId}`);

        return `Moved ${input.slideIds.length} slide(s).`;
      },
      inProgressLabel: (input) => {
        const slides = slidesLabel(input.slideIds.length);
        return t3({
          en: `Moving ${slides}...`,
          fr: `Déplacement de ${slides}...`,
          pt: `A mover ${slides}...`,
        });
      },
      successMessage: (input) => {
        const n = input.slideIds.length;
        const slides = slidesLabel(n);
        return t3({
          en: `Moved ${slides}`,
          fr: `${slides} ${plural(n, { one: "déplacée", other: "déplacées" })}`,
          pt: `${slides} ${plural(n, { one: "movido", other: "movidos" })}`,
        });
      },
    }),

    createUpdateDeckSettingsTool(),
  ];
}
