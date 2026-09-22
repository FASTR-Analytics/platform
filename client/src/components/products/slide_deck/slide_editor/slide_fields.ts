import type { SlideType } from "lib";
import { t3 } from "lib";

// The title-level text of each slide type: the panther text primitive that
// draws it, the slide field it shows, and (for cover and section fields) the
// per-field size / bold / italic keys with their defaults.
export type SlideTextField = {
  primitiveId: string;
  field: string;
  slideType: SlideType;
  label: () => string;
  /** Cleared (undefined) when emptied; required fields keep "". */
  optional: boolean;
  style?: {
    size: string;
    sizeDefault: number;
    min: number;
    max: number;
    bold: string;
    boldDefault: boolean;
    italic: string;
  };
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
    label: () => t3({ en: "Sub header", fr: "Sous-en-tête", pt: "Subcabeçalho" }),
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
    style: {
      size: "titleTextRelFontSize",
      sizeDefault: 10,
      min: 5,
      max: 20,
      bold: "titleBold",
      boldDefault: true,
      italic: "titleItalic",
    },
  },
  {
    primitiveId: "coverSubTitle",
    field: "subtitle",
    slideType: "cover",
    label: () => t3({ en: "Subtitle", fr: "Sous-titre", pt: "Subtítulo" }),
    optional: true,
    style: {
      size: "subTitleTextRelFontSize",
      sizeDefault: 6,
      min: 3,
      max: 12,
      bold: "subTitleBold",
      boldDefault: false,
      italic: "subTitleItalic",
    },
  },
  {
    primitiveId: "coverAuthor",
    field: "presenter",
    slideType: "cover",
    label: () => t3({ en: "Presenter", fr: "Présentateur", pt: "Apresentador" }),
    optional: true,
    style: {
      size: "presenterTextRelFontSize",
      sizeDefault: 4,
      min: 2,
      max: 12,
      bold: "presenterBold",
      boldDefault: false,
      italic: "presenterItalic",
    },
  },
  {
    primitiveId: "coverDate",
    field: "date",
    slideType: "cover",
    label: () => t3({ en: "Date", fr: "Date", pt: "Data" }),
    optional: true,
    style: {
      size: "dateTextRelFontSize",
      sizeDefault: 3,
      min: 2,
      max: 10,
      bold: "dateBold",
      boldDefault: false,
      italic: "dateItalic",
    },
  },
  {
    primitiveId: "sectionTitle",
    field: "sectionTitle",
    slideType: "section",
    label: () => t3({ en: "Section title", fr: "Titre de section", pt: "Título da secção" }),
    optional: false,
    style: {
      size: "sectionTextRelFontSize",
      sizeDefault: 8,
      min: 4,
      max: 16,
      bold: "sectionTitleBold",
      boldDefault: true,
      italic: "sectionTitleItalic",
    },
  },
  {
    primitiveId: "sectionSubTitle",
    field: "sectionSubtitle",
    slideType: "section",
    label: () => t3({ en: "Subtitle", fr: "Sous-titre", pt: "Subtítulo" }),
    optional: true,
    style: {
      size: "smallerSectionTextRelFontSize",
      sizeDefault: 5,
      min: 2,
      max: 10,
      bold: "sectionSubTitleBold",
      boldDefault: false,
      italic: "sectionSubTitleItalic",
    },
  },
];

export function slideTextField(primitiveId: string): SlideTextField | undefined {
  return SLIDE_TEXT_FIELDS.find((f) => f.primitiveId === primitiveId);
}
