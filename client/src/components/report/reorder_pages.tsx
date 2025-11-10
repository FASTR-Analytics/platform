import { ReportType, t, t2, T } from "lib";
import {
  AlertComponentProps,
  Button,
  FrameRight,
  FrameTop,
  HeaderBarCanGoBack,
  TimSortableGrid,
  timActionButton,
} from "panther";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { ReportItemMiniDisplay } from "../ReportItemMiniDisplay";

export function ReorderPages(
  p: AlertComponentProps<
    {
      projectId: string;
      reportId: string;
      itemIdsInOrder: string[];
      reportType: ReportType;
      silentGetReportDetail: (lastUpdated: string) => Promise<void>;
    },
    undefined
  >,
) {
  const [tempIdsInOrder, setTempIdsInOrder] = createStore(
    structuredClone(
      p.itemIdsInOrder.map((id) => {
        return { id };
      }),
    ),
  );

  const save = timActionButton(
    async () => {
      const newIdsInOrder = unwrap(tempIdsInOrder);
      const res = await serverActions.moveAndDeleteAllReportItems({
        projectId: p.projectId,
        report_id: p.reportId,
        itemIdsInOrder: newIdsInOrder.map((item) => item.id),
      });
      if (res.success === false) {
        return res;
      }
      await p.silentGetReportDetail(res.data.lastUpdated);
      return res;
    },
    () => p.close(undefined),
  );

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={
            <>
              {t("Organize")}{" "}
              {p.reportType === "slide_deck" ? "slides" : "pages"}
            </>
          }
        >
          <div class="ui-gap-sm flex items-center">
            <Button
              onClick={save.click}
              state={save.state()}
              intent="success"
              iconName="save"
            >
              {t2(T.FRENCH_UI_STRINGS.save)}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.cancel)}
            </Button>
          </div>
        </HeaderBarCanGoBack>
      }
    >
      <FrameRight
        panelChildren={
          <div class="ui-pad ui-spy-sm h-full border-l text-xs">
            <div class="font-700">{"Keyboard shortcuts"}:</div>
            <div class="text-base-content/70 space-y-1">
              <div>
                • {"Click"}: {"Select single item"}
              </div>
              <div>
                • {"Ctrl/Cmd + Click"}: {"Toggle selection"}
              </div>
              <div>
                • {"Shift + Click"}: {"Select range"}
              </div>
              <div>
                • {"Drag"}: {"Reorder items"}
              </div>
            </div>
          </div>
        }
      >
        <TimSortableGrid
          tempIdsInOrder={tempIdsInOrder}
          setTempIdsInOrder={setTempIdsInOrder}
        >
          {(item, index) => {
            return (
              <>
                <ReportItemMiniDisplay
                  projectId={p.projectId}
                  reportId={p.reportId}
                  reportItemId={item.id}
                  reportType={p.reportType}
                />
                <div class="text-center text-sm">{index + 1}</div>
              </>
            );
          }}
        </TimSortableGrid>
      </FrameRight>
    </FrameTop>
  );
}
