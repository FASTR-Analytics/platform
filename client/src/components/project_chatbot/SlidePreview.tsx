import {
  ReportType,
  getStartingConfigForReport,
  getStartingConfigForReportItem,
  type ProjectDirtyStates,
} from "lib";
import type { PageInputs } from "panther";
import { Button, StateHolder } from "panther";
import { Show, createSignal, onMount } from "solid-js";
import { unwrap } from "solid-js/store";
import { ReportItemMiniDisplayStateHolderWrapper } from "~/components/ReportItemMiniDisplay";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { getPageInputs_SlideDeck_Freeform } from "~/generate_report/slide_deck/get_page_inputs_slide_deck_freeform";

type Props = {
  projectId: string;
  slideDataFromAI: unknown;
};

export function SlidePreview(p: Props) {
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Loading slide...",
  });

  const [isExpanded, setIsExpanded] = createSignal(false);

  async function attemptGetPageInputs() {
    const format = (
      p.slideDataFromAI as {
        format:
          | "only_figure"
          | "figure_on_left"
          | "figure_on_right"
          | "only_text";
      }
    ).format;
    const ric = getStartingConfigForReportItem();
    ric.type = "freeform";
    ric.freeform = {
      useHeader: true,
      headerText: (p.slideDataFromAI as { header: string }).header,
      content: [
        //@ts-ignore
        format === "figure_on_left"
          ? [
              {
                type: "figure",
                span: 8,
                //@ts-ignore
                presentationObjectInReportInfo: {
                  id: (p.slideDataFromAI as { visualizationId: string })
                    .visualizationId,
                },
              },
              //@ts-ignore
              {
                type: "text",
                markdown: (p.slideDataFromAI as { commentaryText: string })
                  .commentaryText,
              },
            ]
          : format === "figure_on_right"
            ? [
                {
                  type: "figure",
                  span: 8,
                  //@ts-ignore
                  presentationObjectInReportInfo: {
                    id: (p.slideDataFromAI as { visualizationId: string })
                      .visualizationId,
                  },
                },
                //@ts-ignore
                {
                  type: "text",
                  markdown: (p.slideDataFromAI as { commentaryText: string })
                    .commentaryText,
                },
              ]
            : format === "only_figure"
              ? [
                  {
                    type: "figure",
                    //@ts-ignore
                    presentationObjectInReportInfo: {
                      id: (p.slideDataFromAI as { visualizationId: string })
                        .visualizationId,
                    },
                  },
                ]
              : [
                  //@ts-ignore
                  {
                    type: "text",
                    markdown: (p.slideDataFromAI as { commentaryText: string })
                      .commentaryText,
                  },
                ],
      ],
    };
    const res = await getPageInputs_SlideDeck_Freeform(
      p.projectId,
      getStartingConfigForReport("AI Generated Slide"),
      ric,
      undefined,
    );
    if (!res.success) {
      setPageInputs({ status: "error", err: res.err });
      return;
    }
    setPageInputs({ status: "ready", data: res.data });
  }

  onMount(() => {
    attemptGetPageInputs();
  });

  return (
    <>
      <div
        class="border-base-300 max-w-[400px] cursor-pointer rounded border p-1.5 transition-opacity hover:opacity-80"
        onClick={() => setIsExpanded(true)}
      >
        <ReportItemMiniDisplayStateHolderWrapper
          state={pageInputs()}
          reportType={"slide_deck" as ReportType}
          scalePixelResolution={0.2}
        />
      </div>

      <Show when={isExpanded()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setIsExpanded(false)}
        >
          <div
            class="bg-base-100 ui-pad relative max-h-[90vh] max-w-[80%] overflow-hidden rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ReportItemMiniDisplayStateHolderWrapper
              state={pageInputs()}
              reportType={"slide_deck" as ReportType}
              scalePixelResolution={1}
            />
            <div class="absolute right-4 top-4">
              <Button onClick={() => setIsExpanded(false)}>Close</Button>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
