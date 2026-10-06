import {
  type DerivedConfig,
  hasOneLinePerPane,
  type PackageScope,
  type ResolvedView,
} from "lib";
import {
  type CustomFigureStyleOptions,
  FigureHolder,
  StateHolderWrapper,
} from "panther";
import { createFigurePreview } from "~/components/_shared/mod.ts";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { liveFigureStyle } from "~/generate_visualization/mod";
import { geoJsonFamilyFor, getGeoJsonSync } from "~/state/instance/t2_geojson";

// The figure types' body: the derived config fetched and built through
// `createFigurePreview`, so it shares the scope-keyed items cache with
// products, and rendered by `FigureHolder` under the live figure style, laid
// out at the container width so a design unit is a CSS pixel. The over-time
// and chart types take their ideal height in a pane that scrolls; the map
// fills the pane. An over-time view whose every pane holds one line draws it
// in the success colour; any other figure keeps its own colours and its
// legend. Boundaries a map lacks surface as the preview's error until they
// arrive.
export function FigureView(p: {
  scope: PackageScope;
  view: ResolvedView;
  derived: DerivedConfig;
}) {
  const figure = createFigurePreview(() => {
    // The preview reads a map's boundaries after an await, where the read
    // tracks nothing; reading them here rebuilds a map when they arrive.
    const mapLevel = getAdminAreaLevelFromMapConfig(p.derived.config);
    if (mapLevel !== undefined) {
      getGeoJsonSync(
        geoJsonFamilyFor(p.derived.metric.datasetFamily),
        mapLevel,
      );
    }
    return {
      scope: p.scope,
      metric: p.derived.metric,
      config: p.derived.config,
    };
  });
  const style = (own: CustomFigureStyleOptions): CustomFigureStyleOptions =>
    liveFigureStyle(
      hasOneLinePerPane(p.view.type, p.view.metric)
        ? { ...own, seriesColorFunc: () => ({ key: "success" }) }
        : own,
    );
  const fills = () => p.view.type.type === "map";
  return (
    <div
      class="ui-pad-x h-full w-full pb-4"
      classList={{ "overflow-y-auto": !fills() }}
    >
      <StateHolderWrapper state={figure()}>
        {(inputs) => (
          <FigureHolder
            figureInputs={{ ...inputs, style: style(inputs.style ?? {}) }}
            height={fills() ? "flex" : "ideal"}
          />
        )}
      </StateHolderWrapper>
    </div>
  );
}
