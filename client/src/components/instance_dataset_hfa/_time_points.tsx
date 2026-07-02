import { t3, type HfaTimePoint } from "lib";
import { Button, EditorComponentProps, FrameTop } from "panther";
import { HfaTimePointsEditor } from "~/components/instance_hfa_time_points";

export function TimePointsView(
  p: EditorComponentProps<
    {
      timePoints: HfaTimePoint[];
    },
    undefined
  >,
) {
  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "Time Points", fr: "Points temporels", pt: "Pontos temporais" })}
          </div>
        </div>
      }
    >
      <div class="ui-pad h-full w-full overflow-auto">
        <HfaTimePointsEditor />
      </div>
    </FrameTop>
  );
}
