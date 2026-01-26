import { Slide } from "lib";

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
      ? slide.heading
      : "";
    return {
      type: "cover",
      title: title || undefined,
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
      ? slide.heading
      : "";
    return {
      type: "section",
      sectionTitle: title,
      sectionSubtitle: undefined,
    };
  }

  // Convert TO content
  const heading = slide.type === "cover"
    ? slide.title || ""
    : slide.type === "section"
    ? slide.sectionTitle
    : "";

  return {
    type: "content",
    heading: heading,
    layout: {
      type: "item",
      id: crypto.randomUUID(),
      data: { type: "placeholder" }
    }
  };
}
