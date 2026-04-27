import { t3 } from "lib";
import type { SlideDeckConfig } from "lib";
import {
  PageHolder,
  type PageInputs,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  Color,
  getTreatmentPreset,
  getKeyColorsFromPrimaryColor,
  getColor,
  type TreatmentPresetId,
} from "panther";
import { createResource } from "solid-js";
import { buildStyleForSlide } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { getOverlayImage } from "~/generate_slide_deck/get_overlay_image";
import { getImgFromCacheOrFetch } from "~/state/img_cache";

type StylePreviewProps = {
  config: SlideDeckConfig;
};

const FASTR_LOGO_WHITE = "/images/FASTR_White_Horiz.png";
const FASTR_LOGO_COLORED = "/images/FASTR_Primary_01_Horiz.png";

function getCoverBackgroundColor(primaryColor: string, treatment: TreatmentPresetId): string {
  const preset = getTreatmentPreset(treatment);
  const background = preset.surfaces.cover.background;
  if (background === "primary") {
    return primaryColor;
  }
  const palette = getKeyColorsFromPrimaryColor(primaryColor);
  return getColor(palette[background]);
}

function shouldUseWhiteLogo(primaryColor: string, treatment: TreatmentPresetId): boolean {
  const bgColor = getCoverBackgroundColor(primaryColor, treatment);
  return !new Color(bgColor).isLight();
}

async function loadPreviewLogo(primaryColor: string, treatment: TreatmentPresetId): Promise<HTMLImageElement[]> {
  const logoPath = shouldUseWhiteLogo(primaryColor, treatment) ? FASTR_LOGO_WHITE : FASTR_LOGO_COLORED;
  const resImg = await getImgFromCacheOrFetch(logoPath);
  if (resImg.success) {
    return [resImg.data];
  }
  return [];
}

function getCoverPageInputs(
  config: SlideDeckConfig,
  overlay: HTMLImageElement | undefined,
  logos: HTMLImageElement[],
): PageInputs {
  const style = buildStyleForSlide({ type: "cover", title: "" }, config);
  return {
    type: "cover",
    title: t3({ en: "Title", fr: "Titre" }),
    subTitle: t3({ en: "Subtitle", fr: "Sous-titre" }),
    style,
    overlay,
    titleLogos: logos,
  };
}

function getSectionPageInputs(
  config: SlideDeckConfig,
  overlay: HTMLImageElement | undefined,
): PageInputs {
  const style = buildStyleForSlide({ type: "section", sectionTitle: "" }, config);
  return {
    type: "section",
    sectionTitle: t3({ en: "Section", fr: "Section" }),
    style,
    overlay,
  };
}

const LOREM_TEXT = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.

Consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.`;

function getContentPageInputs(config: SlideDeckConfig): PageInputs {
  const style = buildStyleForSlide(
    { type: "content", layout: { type: "item", id: "a", data: { type: "text", markdown: "" } } },
    config,
  );
  return {
    type: "freeform",
    header: t3({ en: "Header", fr: "En-tête" }),
    footer: config.deckFooter?.text || t3({ en: "Footer", fr: "Pied de page" }),
    content: {
      type: "item",
      id: "a",
      data: {
        markdown: LOREM_TEXT,
        style: { text: { base: { fontSize: 60 } } },
      },
    },
    style,
  };
}

export function StylePreview(p: StylePreviewProps) {
  const canvasH = Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16);

  const [overlay] = createResource(
    () => ({ overlay: p.config.overlay, primaryColor: p.config.primaryColor }),
    (source) => getOverlayImage({ ...p.config, overlay: source.overlay, primaryColor: source.primaryColor }),
  );

  const [logos] = createResource(
    () => ({ primaryColor: p.config.primaryColor, treatment: p.config.treatment }),
    (source) => loadPreviewLogo(source.primaryColor, source.treatment),
  );

  const coverInputs = () => getCoverPageInputs(p.config, overlay(), logos() ?? []);
  const sectionInputs = () => getSectionPageInputs(p.config, overlay());
  const contentInputs = () => getContentPageInputs(p.config);

  return (
    <div>
      <div class="ui-label">
        {t3({ en: "Preview", fr: "Aperçu" })}
      </div>
      <div class="flex gap-4">
        <div class="flex-1">
          <div class="text-xs text-neutral mb-1">
            {t3({ en: "Cover", fr: "Couverture" })}
          </div>
          <div class="border border-base-300 rounded overflow-hidden">
            <PageHolder
              pageInputs={coverInputs()}
              fixedCanvasH={canvasH}
              scalePixelResolution={0.2}
            />
          </div>
        </div>
        <div class="flex-1">
          <div class="text-xs text-neutral mb-1">
            {t3({ en: "Section", fr: "Section" })}
          </div>
          <div class="border border-base-300 rounded overflow-hidden">
            <PageHolder
              pageInputs={sectionInputs()}
              fixedCanvasH={canvasH}
              scalePixelResolution={0.2}
            />
          </div>
        </div>
        <div class="flex-1">
          <div class="text-xs text-neutral mb-1">
            {t3({ en: "Content", fr: "Contenu" })}
          </div>
          <div class="border border-base-300 rounded overflow-hidden">
            <PageHolder
              pageInputs={contentInputs()}
              fixedCanvasH={canvasH}
              scalePixelResolution={0.2}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
