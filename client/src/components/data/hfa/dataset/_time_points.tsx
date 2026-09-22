import { t3, type HfaTimePoint } from "lib";
import { HeadingBar, Button, EditorComponentProps, FrameTop } from "panther";
import { HfaTimePointsEditor } from "../_shared/time_points";

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
        <HeadingBar
          onBack={() => p.close(undefined)}
          heading={t3({ en: "Time Points", fr: "Points temporels", pt: "Pontos temporais" })}
        />
      }
    >
      <div class="ui-pad h-full w-full overflow-auto">
        <HfaTimePointsEditor />
      </div>
    </FrameTop>
  );
}
