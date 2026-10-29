import {
  describeMapCoverage,
  MAP_COVERAGE_PROMINENT_BELOW,
  type MapCoverage,
} from "~/generate_visualization/mod";

export function MapCoverageLine(p: { coverage: MapCoverage }) {
  const low = () => p.coverage.matchedShare < MAP_COVERAGE_PROMINENT_BELOW;
  return (
    <div
      class="pt-2 text-sm"
      classList={{
        "text-base-content-muted": !low(),
        "text-warning font-700": low(),
      }}
    >
      {describeMapCoverage(p.coverage)}
    </div>
  );
}
