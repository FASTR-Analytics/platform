import { type HfaTimePoint, t3 } from "lib";
import { Button, EditorComponentProps, FrameTop, HeadingBar } from "panther";
import { HfaTimePointsEditor } from "../_shared/mod.ts";

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
      pad="md"
      panelChildren={
        <HeadingBar
          onBack={() => p.close(undefined)}
          heading={t3({
            en: "Time Points",
            fr: "Points temporels",
            pt: "Pontos temporais",
          })}
        />
      }
    >
      <HfaTimePointsEditor />
    </FrameTop>
  );
}
