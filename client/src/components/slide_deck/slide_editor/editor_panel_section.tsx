import { SectionSlide, t3 } from "lib";
import { TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";
import { TextStylePopover } from "./TextStylePopover.tsx";

type Props = {
  tempSlide: SectionSlide;
  setTempSlide: SetStoreFunction<any>;
};

export function SlideEditorPanelSection(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <div class="">
        <TextArea
          label={t3({ en: "Section Title", fr: "Titre de section" })}
          value={p.tempSlide.sectionTitle}
          onChange={(v: string) => p.setTempSlide("sectionTitle", v)}
          fullWidth
          height="80px"
        />
        <div class="flex w-full justify-end">
          <TextStylePopover
            // label={t3({
            //   en: "Section title style",
            //   fr: "Style du titre de section",
            // })}
            size={p.tempSlide.sectionTextRelFontSize ?? 8}
            onSizeChange={(v) => p.setTempSlide("sectionTextRelFontSize", v)}
            bold={p.tempSlide.sectionTitleBold ?? true}
            onBoldChange={(v) => p.setTempSlide("sectionTitleBold", v)}
            italic={p.tempSlide.sectionTitleItalic ?? false}
            onItalicChange={(v) => p.setTempSlide("sectionTitleItalic", v)}
            sizeMin={4}
            sizeMax={16}
          />
        </div>
      </div>
      <div class="">
        <TextArea
          label={t3({ en: "Section Subtitle", fr: "Sous-titre de section" })}
          value={p.tempSlide.sectionSubtitle ?? ""}
          onChange={(v: string) =>
            p.setTempSlide("sectionSubtitle", v || undefined)
          }
          fullWidth
          height="60px"
        />
        <div class="flex w-full justify-end">
          <TextStylePopover
            // label={t3({
            //   en: "Section subtitle style",
            //   fr: "Style du sous-titre de section",
            // })}
            size={p.tempSlide.smallerSectionTextRelFontSize ?? 5}
            onSizeChange={(v) =>
              p.setTempSlide("smallerSectionTextRelFontSize", v)
            }
            bold={p.tempSlide.sectionSubTitleBold ?? false}
            onBoldChange={(v) => p.setTempSlide("sectionSubTitleBold", v)}
            italic={p.tempSlide.sectionSubTitleItalic ?? false}
            onItalicChange={(v) => p.setTempSlide("sectionSubTitleItalic", v)}
            sizeMin={2}
            sizeMax={10}
          />
        </div>
      </div>
    </div>
  );
}
