import {
  getDefaultContentSlide,
  getDefaultCoverSlide,
  getDefaultSectionSlide,
  type Slide,
  t3,
} from "lib";

// The three slides a deck can add, in the order every "new slide" menu lists
// them: the header's Add slide and the open slide's Insert menu.
export const NEW_SLIDE_KINDS: ReadonlyArray<{
  label: () => string;
  make: () => Slide;
}> = [
  {
    label: () =>
      t3({
        en: "Cover slide",
        fr: "Diapositive de couverture",
        pt: "Diapositivo de capa",
      }),
    make: getDefaultCoverSlide,
  },
  {
    label: () =>
      t3({
        en: "Section slide",
        fr: "Diapositive de section",
        pt: "Diapositivo de secção",
      }),
    make: getDefaultSectionSlide,
  },
  {
    label: () =>
      t3({
        en: "Content slide",
        fr: "Diapositive de contenu",
        pt: "Diapositivo de conteúdo",
      }),
    make: getDefaultContentSlide,
  },
];
