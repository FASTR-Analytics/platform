import type { CoverSlide, SectionSlide, SlideTextStyle, SlideType } from "lib";
import { COVER_TEXT_STYLES, SECTION_TEXT_STYLES, t3 } from "lib";
import type { PageHitTargetText } from "panther";

// The title-level text of each slide type: the panther text primitive that
// draws it, the slide field it shows, and (for cover and section fields) its
// size and emphasis keys.
export type SlideTextField = {
  primitiveId: PageHitTargetText["type"];
  field: string;
  slideType: SlideType;
  label: () => string;
  /** Cleared (undefined) when emptied; required fields keep "". */
  optional: boolean;
  style?: SlideTextStyle<CoverSlide> | SlideTextStyle<SectionSlide>;
};

export const SLIDE_TEXT_FIELDS: SlideTextField[] = [
  {
    primitiveId: "headerText",
    field: "header",
    slideType: "content",
    label: () => t3({ en: "Header", fr: "En-tête", pt: "Cabeçalho" }),
    optional: true,
  },
  {
    primitiveId: "subHeaderText",
    field: "subHeader",
    slideType: "content",
    label: () =>
      t3({ en: "Sub header", fr: "Sous-en-tête", pt: "Subcabeçalho" }),
    optional: true,
  },
  {
    primitiveId: "dateText",
    field: "date",
    slideType: "content",
    label: () => t3({ en: "Date", fr: "Date", pt: "Data" }),
    optional: true,
  },
  {
    primitiveId: "footerText",
    field: "footer",
    slideType: "content",
    label: () => t3({ en: "Footer", fr: "Pied de page", pt: "Rodapé" }),
    optional: true,
  },
  {
    primitiveId: "coverTitle",
    field: "title",
    slideType: "cover",
    label: () => t3({ en: "Title", fr: "Titre", pt: "Título" }),
    optional: false,
    style: COVER_TEXT_STYLES.title,
  },
  {
    primitiveId: "coverSubtitle",
    field: "subtitle",
    slideType: "cover",
    label: () => t3({ en: "Subtitle", fr: "Sous-titre", pt: "Subtítulo" }),
    optional: true,
    style: COVER_TEXT_STYLES.subtitle,
  },
  {
    primitiveId: "coverAuthor",
    field: "presenter",
    slideType: "cover",
    label: () =>
      t3({ en: "Presenter", fr: "Présentateur", pt: "Apresentador" }),
    optional: true,
    style: COVER_TEXT_STYLES.presenter,
  },
  {
    primitiveId: "coverDate",
    field: "date",
    slideType: "cover",
    label: () => t3({ en: "Date", fr: "Date", pt: "Data" }),
    optional: true,
    style: COVER_TEXT_STYLES.date,
  },
  {
    primitiveId: "sectionTitle",
    field: "sectionTitle",
    slideType: "section",
    label: () =>
      t3({
        en: "Section title",
        fr: "Titre de section",
        pt: "Título da secção",
      }),
    optional: false,
    style: SECTION_TEXT_STYLES.sectionTitle,
  },
  {
    primitiveId: "sectionSubtitle",
    field: "sectionSubtitle",
    slideType: "section",
    label: () => t3({ en: "Subtitle", fr: "Sous-titre", pt: "Subtítulo" }),
    optional: true,
    style: SECTION_TEXT_STYLES.sectionSubtitle,
  },
];

export function slideTextField(
  primitiveId: string,
): SlideTextField | undefined {
  return SLIDE_TEXT_FIELDS.find((f) => f.primitiveId === primitiveId);
}
