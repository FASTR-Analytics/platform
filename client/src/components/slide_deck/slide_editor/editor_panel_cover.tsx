import type { CoverSlide, LogoVisibility } from "lib";
import { t3 } from "lib";
import { Select, TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";
import { TextStylePopover } from "./TextStylePopover.tsx";

type Props = {
  tempSlide: CoverSlide;
  setTempSlide: SetStoreFunction<any>;
  showLogosByDefault: boolean;
};

function getLogoVisibilityOptions(showByDefault: boolean) {
  return [
    {
      value: "inherit",
      label: t3({
        en: showByDefault ? "Default (show)" : "Default (hide)",
        fr: showByDefault ? "Défaut (afficher)" : "Défaut (masquer)",
      }),
    },
    { value: "show", label: t3({ en: "Show", fr: "Afficher" }) },
    { value: "hide", label: t3({ en: "Hide", fr: "Masquer" }) },
  ];
}

export function SlideEditorPanelCover(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <Select
        label={t3({ en: "Cover logos", fr: "Logos de couverture" })}
        value={p.tempSlide.showLogos ?? "inherit"}
        options={getLogoVisibilityOptions(p.showLogosByDefault)}
        onChange={(v) => p.setTempSlide("showLogos", v === "inherit" ? undefined : v as LogoVisibility)}
      />
      <div class="ui-spy">
        <div class="">
          <TextArea
            label={t3({ en: "Title", fr: "Titre" })}
            value={p.tempSlide.title}
            onChange={(v: string) => p.setTempSlide("title", v)}
            fullWidth
            height="80px"
          />
          <div class="flex w-full justify-end">
            <TextStylePopover
              size={p.tempSlide.titleTextRelFontSize ?? 10}
              onSizeChange={(v) => p.setTempSlide("titleTextRelFontSize", v)}
              bold={p.tempSlide.titleBold ?? true}
              onBoldChange={(v) => p.setTempSlide("titleBold", v)}
              italic={p.tempSlide.titleItalic ?? false}
              onItalicChange={(v) => p.setTempSlide("titleItalic", v)}
              sizeMin={5}
              sizeMax={20}
              defaults={{ size: 10, bold: true, italic: false }}
              onReset={() => {
                p.setTempSlide("titleTextRelFontSize", undefined);
                p.setTempSlide("titleBold", undefined);
                p.setTempSlide("titleItalic", undefined);
              }}
            />
          </div>
        </div>
        <div class="">
          <TextArea
            label={t3({ en: "Subtitle", fr: "Sous-titre" })}
            value={p.tempSlide.subtitle ?? ""}
            onChange={(v: string) => p.setTempSlide("subtitle", v || undefined)}
            fullWidth
            height="60px"
          />
          <div class="flex w-full justify-end">
            <TextStylePopover
              size={p.tempSlide.subTitleTextRelFontSize ?? 6}
              onSizeChange={(v) => p.setTempSlide("subTitleTextRelFontSize", v)}
              bold={p.tempSlide.subTitleBold ?? false}
              onBoldChange={(v) => p.setTempSlide("subTitleBold", v)}
              italic={p.tempSlide.subTitleItalic ?? false}
              onItalicChange={(v) => p.setTempSlide("subTitleItalic", v)}
              sizeMin={3}
              sizeMax={12}
              defaults={{ size: 6, bold: false, italic: false }}
              onReset={() => {
                p.setTempSlide("subTitleTextRelFontSize", undefined);
                p.setTempSlide("subTitleBold", undefined);
                p.setTempSlide("subTitleItalic", undefined);
              }}
            />
          </div>
        </div>
        <div class="">
          <TextArea
            label={t3({ en: "Presenter", fr: "Présentateur" })}
            value={p.tempSlide.presenter ?? ""}
            onChange={(v: string) =>
              p.setTempSlide("presenter", v || undefined)
            }
            fullWidth
            height="80px"
          />
          <div class="flex w-full justify-end">
            <TextStylePopover
              size={p.tempSlide.presenterTextRelFontSize ?? 4}
              onSizeChange={(v) => p.setTempSlide("presenterTextRelFontSize", v)}
              bold={p.tempSlide.presenterBold ?? true}
              onBoldChange={(v) => p.setTempSlide("presenterBold", v)}
              italic={p.tempSlide.presenterItalic ?? false}
              onItalicChange={(v) => p.setTempSlide("presenterItalic", v)}
              sizeMin={2}
              sizeMax={12}
              defaults={{ size: 4, bold: true, italic: false }}
              onReset={() => {
                p.setTempSlide("presenterTextRelFontSize", undefined);
                p.setTempSlide("presenterBold", undefined);
                p.setTempSlide("presenterItalic", undefined);
              }}
            />
          </div>
        </div>
        <div class="">
          <TextArea
            label={t3({ en: "Date", fr: "Date" })}
            value={p.tempSlide.date ?? ""}
            onChange={(v: string) => p.setTempSlide("date", v || undefined)}
            fullWidth
            height="60px"
          />
          <div class="flex w-full justify-end">
            <TextStylePopover
              size={p.tempSlide.dateTextRelFontSize ?? 3}
              onSizeChange={(v) => p.setTempSlide("dateTextRelFontSize", v)}
              bold={p.tempSlide.dateBold ?? false}
              onBoldChange={(v) => p.setTempSlide("dateBold", v)}
              italic={p.tempSlide.dateItalic ?? false}
              onItalicChange={(v) => p.setTempSlide("dateItalic", v)}
              sizeMin={2}
              sizeMax={10}
              defaults={{ size: 3, bold: false, italic: false }}
              onReset={() => {
                p.setTempSlide("dateTextRelFontSize", undefined);
                p.setTempSlide("dateBold", undefined);
                p.setTempSlide("dateItalic", undefined);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
