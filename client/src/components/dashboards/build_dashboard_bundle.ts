import type { DashboardDetail, PublicDashboardBundle } from "lib";

// Canonical DashboardDetail → PublicDashboardBundle transform. Shared so the
// editor grid and the public viewer can never silently diverge.
export function buildDashboardBundle(
  dashboard: DashboardDetail,
): PublicDashboardBundle {
  return {
    title: dashboard.title,
    layout: dashboard.layout,
    items: dashboard.items
      .map((item) => {
        const source = item.figureBlock.source;
        const fi = item.figureBlock.figureInputs;
        if (!fi || !source || source.type !== "from_data") return undefined;
        return {
          id: item.id,
          label: item.label,
          sortOrder: item.sortOrder,
          strippedFigureInputs: fi,
          source: {
            config: source.config,
            metricId: source.metricId,
            formatAs: "number" as const,
            indicatorMetadata: source.indicatorMetadata,
          },
          geoData: item.geoData,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== undefined),
  };
}
