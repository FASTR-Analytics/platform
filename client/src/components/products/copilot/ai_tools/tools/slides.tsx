import { serverActions } from "~/server_actions";
import { AIToolFailure, createAITool, plural } from "panther";
import {
  type AiSlideInput,
  copilotToolContract,
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
      ...copilotToolContract("get_deck"),
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
      ...copilotToolContract("create_slide"),
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
      ...copilotToolContract("replace_slide"),
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
      ...copilotToolContract("delete_slides"),
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
      ...copilotToolContract("duplicate_slides"),
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
      ...copilotToolContract("move_slides"),
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
