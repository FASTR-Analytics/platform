import { createEffect, For, Show } from "solid-js";
import { Button } from "../kit/mod.ts";
import { type FastrTocItem } from "../../engine/mod.ts";
import { t3 } from "../../engine/i18n.ts";

// The sidebar's width, in px so the host can keep the page clear of it.
export const REPORT_OUTLINE_WIDTH_PX = 240;

// The FASTR editor's outline sidebar, Google Docs' "document outline": every
// heading the report's own contents block would list, indented by level, the
// section in view highlighted, a click jumping there. The host owns the
// headings (fastrDocumentOutline over the live body), the line in view and
// the jump, so this is presentation only.
export function ReportDocumentOutline(p: {
  items: FastrTocItem[];
  // The 1-based source line the reader is looking at, undefined until read.
  viewLine: number | undefined;
  onSelect: (line: number) => void;
  onClose: () => void;
}) {
  const minLevel = () => Math.min(...p.items.map((it) => it.level));
  // The section in view: the last heading at or above the line being read.
  const activeLine = () => {
    const at = p.viewLine;
    if (at === undefined) return undefined;
    let active: number | undefined;
    for (const it of p.items) {
      if (it.line > at) break;
      active = it.line;
    }
    return active;
  };

  let list: HTMLDivElement | undefined;
  // A long outline follows the reader: the highlighted entry stays visible.
  createEffect(() => {
    const line = activeLine();
    if (line === undefined || !list) return;
    list
      .querySelector<HTMLElement>(`[data-outline-line="${line}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });

  return (
    <div
      class="rf:flex rf:h-full rf:flex-none rf:flex-col"
      style={{ width: `${REPORT_OUTLINE_WIDTH_PX}px` }}
      data-tour="report-outline"
    >
      <div class="rf:flex rf:flex-none rf:items-center rf:gap-1 rf:py-2 rf:pl-4 rf:pr-2">
        <div class="rf:ui-text-caption rf:flex-1 rf:truncate">
          {t3({
            en: "Report tabs",
            fr: "Onglets du rapport",
            pt: "Separadores do relatório",
          })}
        </div>
        <Button
          ghost
          size="sm"
          iconName="chevronLeft"
          ariaLabel={t3({
            en: "Hide report tabs",
            fr: "Masquer les onglets du rapport",
            pt: "Ocultar separadores do relatório",
          })}
          onClick={p.onClose}
        />
      </div>
      <div
        class="rf:min-h-0 rf:flex-1 rf:overflow-y-auto rf:pb-4 rf:pr-2"
        ref={list}
      >
        <Show
          when={p.items.length > 0}
          fallback={
            <div class="rf:ui-text-caption rf:px-4">
              {t3({
                en: "Headings you add to the report appear here.",
                fr: "Les titres que vous ajoutez au rapport apparaissent ici.",
                pt: "Os títulos que adicionar ao relatório aparecem aqui.",
              })}
            </div>
          }
        >
          <For each={p.items}>
            {(it) => (
              <button
                type="button"
                class="rf:block rf:w-full rf:truncate rf:border-l-2 rf:py-1 rf:pr-2 rf:text-left"
                classList={{
                  "rf:border-primary rf:text-primary": activeLine() === it.line,
                  "rf:ui-hoverable-ghost rf:border-transparent":
                    activeLine() !== it.line,
                  "rf:font-700": it.level === minLevel(),
                }}
                style={{
                  "padding-left": `${
                    0.875 + (it.level - minLevel()) * 0.75
                  }rem`,
                }}
                title={it.text}
                data-outline-line={it.line}
                // On the press, so the editor keeps its focus handling to
                // goToLine: a click would first blur the editor.
                onMouseDown={(e) => {
                  e.preventDefault();
                  p.onSelect(it.line);
                }}
              >
                {it.text}
              </button>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
