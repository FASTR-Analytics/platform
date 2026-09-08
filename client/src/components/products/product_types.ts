import { t3, type ProductType } from "lib";
import type { EditorComponentProps, IconName } from "panther";
import type { JSX } from "solid-js";
import { ReportEditor } from "~/components/report";
import { SlideDeckEditor } from "~/components/slide_deck";

// The one place the client knows what a product type IS
// (PLAN_PRODUCTS_RESTRUCTURE §3.6). Every per-type dispatch reads this object,
// never a switch with a default, so adding a type is a compile error here
// until the entry is filled in.
export type ProductEditorComponent = (
  p: EditorComponentProps<{ productId: string }, undefined>,
) => JSX.Element;

export type ProductTypeDefinition = {
  label: () => string;
  icon: IconName;
  editor: ProductEditorComponent;
  createLabel: () => string;
};

export const PRODUCT_TYPE_REGISTRY: Record<ProductType, ProductTypeDefinition> = {
  slide_deck: {
    label: () => t3({ en: "Deck", fr: "Présentation", pt: "Apresentação" }),
    icon: "presentation",
    editor: SlideDeckEditor,
    createLabel: () =>
      t3({ en: "New deck", fr: "Nouvelle présentation", pt: "Nova apresentação" }),
  },
  report: {
    label: () => t3({ en: "Report", fr: "Rapport", pt: "Relatório" }),
    icon: "report",
    editor: ReportEditor,
    createLabel: () =>
      t3({ en: "New report", fr: "Nouveau rapport", pt: "Novo relatório" }),
  },
};
