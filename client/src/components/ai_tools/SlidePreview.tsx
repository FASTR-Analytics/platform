import {
  ReportType,
  getStartingConfigForReport,
  getStartingConfigForReportItem
} from "lib";
import type { AlertComponentProps, PageInputs } from "panther";
import { Button, openComponent, StateHolder } from "panther";
import { createSignal, onMount } from "solid-js";
import { ReportItemMiniDisplayStateHolderWrapper } from "~/components/ReportItemMiniDisplay";
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

  function openExpandedView() {
    openComponent<ExpandedSlideModalProps, void>({
      element: ExpandedSlideModal,
      props: { pageInputs: pageInputs() },
    });
  }

  return (
    <div
      class="border-base-300 max-w-[400px] cursor-pointer rounded border p-1.5 transition-opacity hover:opacity-80"
      onClick={openExpandedView}
    >
      <ReportItemMiniDisplayStateHolderWrapper
        state={pageInputs()}
        reportType={"slide_deck" as ReportType}
        scalePixelResolution={0.2}
      />
    </div>
  );
}

type ExpandedSlideModalProps = {
  pageInputs: StateHolder<PageInputs>;
};

function ExpandedSlideModal(p: AlertComponentProps<ExpandedSlideModalProps, void>) {
  return (
    <div class="ui-pad flex flex-col" style={{ "max-width": "90vw", "max-height": "90vh" }}>
      <div class="min-h-0 flex-1 overflow-auto">
        <div style={{ width: "min(80vw, 1200px)" }}>
          <ReportItemMiniDisplayStateHolderWrapper
            state={p.pageInputs}
            reportType={"slide_deck" as ReportType}
            scalePixelResolution={0.5}
          />
        </div>
      </div>
      <div class="ui-pad-top flex shrink-0 justify-end">
        <Button onClick={() => p.close(undefined)}>Close</Button>
      </div>
    </div>
  );
}
