import { Slide } from "lib";
import { generateUniqueBlockId } from "~/utils/id_generation";

export function convertSlideType(
  slide: Slide,
  targetType: "cover" | "section" | "content"
): Slide {
  if (slide.type === targetType) {
    return slide;
  }

  // Convert TO cover
  if (targetType === "cover") {
    const title = slide.type === "section"
      ? slide.sectionTitle
      : slide.type === "content"
      ? slide.header || ""
      : "";
    return {
      type: "cover",
      title: title,
      subtitle: undefined,
      presenter: undefined,
      date: undefined,
    };
  }

  // Convert TO section
  if (targetType === "section") {
    const title = slide.type === "cover"
      ? slide.title || ""
      : slide.type === "content"
      ? slide.header || ""
      : "";
    return {
      type: "section",
      sectionTitle: title,
      sectionSubtitle: undefined,
    };
  }

  // Convert TO content
  const header = slide.type === "cover"
    ? slide.title || ""
    : slide.type === "section"
    ? slide.sectionTitle
    : "";

  return {
    type: "content",
    header: header || undefined,
    layout: {
      type: "item",
      id: generateUniqueBlockId(),
      data: { type: "text", markdown: "" }
    }
  };
}
