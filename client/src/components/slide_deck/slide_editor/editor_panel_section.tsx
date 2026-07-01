import { SectionSlide, t3 } from "lib";
import { SetStoreFunction } from "solid-js/store";
import type { SlideSession } from "~/state/project/collab";
import { CollabTextField } from "./collab_text_field";
import { TextStylePopover } from "./TextStylePopover.tsx";

type Props = {
  tempSlide: SectionSlide;
  setTempSlide: SetStoreFunction<any>;
  session: SlideSession | null;
  collabReady: boolean;
};

export function SlideEditorPanelSection(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <CollabTextField
          session={p.session}
          collabReady={p.collabReady}
          fieldKey="sectionTitle"
          label={t3({ en: "Section Title", fr: "Titre de section", pt: "Título da secção" })}
          value={p.tempSlide.sectionTitle}
          onChange={(v: string) => p.setTempSlide("sectionTitle", v)}
          height="80px"
        />
        <div class="flex w-full justify-end">
          <TextStylePopover
            size={p.tempSlide.sectionTextRelFontSize ?? 8}
            onSizeChange={(v) => p.setTempSlide("sectionTextRelFontSize", v)}
            bold={p.tempSlide.sectionTitleBold ?? true}
            onBoldChange={(v) => p.setTempSlide("sectionTitleBold", v)}
            italic={p.tempSlide.sectionTitleItalic ?? false}
            onItalicChange={(v) => p.setTempSlide("sectionTitleItalic", v)}
            sizeMin={4}
            sizeMax={16}
            defaults={{ size: 8, bold: true, italic: false }}
            onReset={() => {
              p.setTempSlide("sectionTextRelFontSize", undefined);
              p.setTempSlide("sectionTitleBold", undefined);
              p.setTempSlide("sectionTitleItalic", undefined);
            }}
          />
        </div>
      </div>
      <div class="ui-spy-sm">
        <CollabTextField
          session={p.session}
          collabReady={p.collabReady}
          fieldKey="sectionSubtitle"
          label={t3({ en: "Section Subtitle", fr: "Sous-titre de section", pt: "Subtítulo da secção" })}
          value={p.tempSlide.sectionSubtitle ?? ""}
          onChange={(v: string) =>
            p.setTempSlide("sectionSubtitle", v || undefined)
          }
          height="60px"
        />
        <div class="flex w-full justify-end">
          <TextStylePopover
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
            defaults={{ size: 5, bold: false, italic: false }}
            onReset={() => {
              p.setTempSlide("smallerSectionTextRelFontSize", undefined);
              p.setTempSlide("sectionSubTitleBold", undefined);
              p.setTempSlide("sectionSubTitleItalic", undefined);
            }}
          />
        </div>
      </div>
    </div>
  );
}
