import { t3 } from "lib";
import { FrameTop, HeadingBar } from "panther";

// The Explore tab's page. Empty by design: the results explorer that fills it
// (the metric and preset gallery for an ephemeral package and scope) is a
// separate plan (PLAN_PRODUCTS_RESTRUCTURE D6); this settles the tab set.
export function Explore() {
  return (
    <FrameTop
      panelChildren={
        <div class="h-full w-full">
          <HeadingBar
            tonal
            heading={t3({ en: "Explore", fr: "Explorer", pt: "Explorar" })}
          />
        </div>
      }
    >
      <div class="ui-pad" />
    </FrameTop>
  );
}
