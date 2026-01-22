import {
  SimpleSlide,
  CustomUserSlide,
  MixedSlide,
  ReportItemConfig,
  isSimpleSlide,
  isCustomUserSlide,
} from "lib";
import {
  transformSlideToReportItem,
  transformReportItemToSlide,
  getAllItems,
} from "./transform";

/**
 * Convert SimpleSlide to CustomUserSlide
 * Used when user opens editor modal for a simple slide
 */
export function simpleSlideToCustomUserSlide(
  slide: SimpleSlide
): CustomUserSlide {
  const reportItemConfig = transformSlideToReportItem(slide);
  return {
    type: "custom",
    slideType: slide.type === "content" ? "freeform" : slide.type,
    config: reportItemConfig,
    _originalSimpleSlide: slide,
  };
}

/**
 * Convert CustomUserSlide to SimpleSlide
 * Used for rendering - CustomUserSlide contains full ReportItemConfig
 */
export function customUserSlideToSimpleSlide(
  customSlide: CustomUserSlide
): SimpleSlide {
  return transformReportItemToSlide(customSlide.config, 0);
}

/**
 * Attempt to simplify a CustomUserSlide back to SimpleSlide
 * Returns undefined if slide has complex features that can't be simplified
 */
export function trySimplifyCustomSlide(
  customSlide: CustomUserSlide
): SimpleSlide | undefined {
  // Cover and section slides can always be simplified
  if (customSlide.config.type !== "freeform") {
    return transformReportItemToSlide(customSlide.config, 0);
  }

  const content = customSlide.config.freeform.content;

  // Check if layout tree is complex (has rows/cols nodes)
  const hasComplexLayout = content.type !== "item";
  if (hasComplexLayout) {
    return undefined;
  }

  // Extract all items from layout tree
  const items = getAllItems(content);

  // Check for advanced properties that prevent simplification
  const hasAdvancedFeatures = items.some(
    (item) =>
      item.span !== undefined ||
      item.useFigureAdditionalScale ||
      item.textSize !== 1 ||
      item.textBackground !== "none" ||
      item.type === "image" ||
      item.type === "placeholder"
  );

  // Has advanced features - can't simplify
  if (hasAdvancedFeatures) {
    return undefined;
  }

  // No advanced features and simple layout - can simplify
  return transformReportItemToSlide(customSlide.config, 0);
}

/**
 * Convert any MixedSlide to a SimpleSlide representation
 * Used for preview/rendering where we need SimpleSlide format
 */
export function mixedSlideToSimpleSlide(slide: MixedSlide): SimpleSlide {
  if (isSimpleSlide(slide)) {
    return slide;
  }
  return customUserSlideToSimpleSlide(slide);
}
