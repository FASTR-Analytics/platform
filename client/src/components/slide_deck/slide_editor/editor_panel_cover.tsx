import { CoverSlide, t3 } from "lib";
import { TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";
import { TextStylePopover } from "./TextStylePopover.tsx";
import { LogoSelector } from "./LogoSelector.tsx";

type Props = {
  tempSlide: CoverSlide;
  setTempSlide: SetStoreFunction<any>;
  deckLogos: string[];
};

export function SlideEditorPanelCover(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <LogoSelector
        label={t3({ en: "Logos to use", fr: "Logos à utiliser" })}
        values={p.tempSlide.logos ?? []}
        customLogos={p.deckLogos}
        onChange={(logos) => p.setTempSlide("logos", logos)}
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
              // label={t3({ en: "Title style", fr: "Style du titre" })}
              size={p.tempSlide.titleTextRelFontSize ?? 10}
              onSizeChange={(v) => p.setTempSlide("titleTextRelFontSize", v)}
              bold={p.tempSlide.titleBold ?? true}
              onBoldChange={(v) => p.setTempSlide("titleBold", v)}
              italic={p.tempSlide.titleItalic ?? false}
              onItalicChange={(v) => p.setTempSlide("titleItalic", v)}
              sizeMin={5}
              sizeMax={20}
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
              // label={t3({ en: "Subtitle style", fr: "Style du sous-titre" })}
              size={p.tempSlide.subTitleTextRelFontSize ?? 6}
              onSizeChange={(v) => p.setTempSlide("subTitleTextRelFontSize", v)}
              bold={p.tempSlide.subTitleBold ?? false}
              onBoldChange={(v) => p.setTempSlide("subTitleBold", v)}
              italic={p.tempSlide.subTitleItalic ?? false}
              onItalicChange={(v) => p.setTempSlide("subTitleItalic", v)}
              sizeMin={3}
              sizeMax={12}
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
              // label={t3({ en: "Presenter style", fr: "Style du présentateur" })}
              size={p.tempSlide.presenterTextRelFontSize ?? 4}
              onSizeChange={(v) =>
                p.setTempSlide("presenterTextRelFontSize", v)
              }
              bold={p.tempSlide.presenterBold ?? true}
              onBoldChange={(v) => p.setTempSlide("presenterBold", v)}
              italic={p.tempSlide.presenterItalic ?? false}
              onItalicChange={(v) => p.setTempSlide("presenterItalic", v)}
              sizeMin={2}
              sizeMax={12}
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
              // label={t3({ en: "Date style", fr: "Style de la date" })}
              size={p.tempSlide.dateTextRelFontSize ?? 3}
              onSizeChange={(v) => p.setTempSlide("dateTextRelFontSize", v)}
              bold={p.tempSlide.dateBold ?? false}
              onBoldChange={(v) => p.setTempSlide("dateBold", v)}
              italic={p.tempSlide.dateItalic ?? false}
              onItalicChange={(v) => p.setTempSlide("dateItalic", v)}
              sizeMin={2}
              sizeMax={10}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
