import type {
  AiContentSlideInput,
  PresentationOption,
  DisaggregationOption,
  VisualizationFolder,
} from "lib";
import {
  getStartingConfigForPresentationObject,
} from "lib";
import { AlertComponentProps, AlertFormHolder, Select, timActionForm } from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  input: AiContentSlideInput;
  folders: VisualizationFolder[];
};

type ReturnType = { visualizationId: string } | undefined;

function mapChartTypeToPresentationOption(
  chartType: "bar" | "line" | "table" | undefined
): PresentationOption {
  switch (chartType) {
    case "line":
      return "timeseries";
    case "table":
      return "table";
    case "bar":
    default:
      return "chart";
  }
}

export function SaveToVisualizationModal(p: AlertComponentProps<Props, ReturnType>) {
  const [selectedFolderId, setSelectedFolderId] = createSignal<string>("_none");

  const folderOptions = () => [
    { value: "_none", label: "General" },
    ...p.folders.map((f) => ({ value: f.id, label: f.label })),
  ];

  const firstFigureBlock = p.input.blocks.find(
    (b) => b.type === "from_visualization" || b.type === "from_metric"
  );

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      if (!firstFigureBlock) {
        return { success: false as const, err: "No figure found in whiteboard content" };
      }

      const label = p.input.heading.trim() || "Untitled Visualization";
      const folderId = selectedFolderId() === "_none" ? null : selectedFolderId();

      if (firstFigureBlock.type === "from_visualization") {
        const res = await serverActions.duplicatePresentationObject({
          projectId: p.projectId,
          po_id: firstFigureBlock.visualizationId,
          label,
          folderId,
        });
        if (!res.success) {
          return res;
        }
        return { success: true as const, data: { visualizationId: res.data.newPresentationObjectId } };
      }

      if (firstFigureBlock.type === "from_metric") {
        const { metricQuery, chartType } = firstFigureBlock;
        const { metricId, disaggregations: inputDisaggregations, filters: inputFilters, periodFilter } = metricQuery;

        // Fetch all metrics to get the full ResultsValue
        const metricsRes = await serverActions.getAllMetrics({ projectId: p.projectId });
        if (!metricsRes.success) {
          return metricsRes;
        }

        const metric = metricsRes.data.find((m) => m.id === metricId);
        if (!metric) {
          return { success: false as const, err: `Metric not found: ${metricId}` };
        }

        const presentationType = mapChartTypeToPresentationOption(chartType);

        // Merge required disaggregations with input disaggregations
        const requiredDisaggregations = metric.disaggregationOptions
          .filter((d) => d.isRequired)
          .map((d) => d.value);
        const allDisaggregations = [
          ...requiredDisaggregations,
          ...(inputDisaggregations || []),
        ];
        const uniqueDisaggregations = [...new Set(allDisaggregations)] as DisaggregationOption[];

        // Build config
        const config = getStartingConfigForPresentationObject(
          metric,
          presentationType,
          uniqueDisaggregations,
        );

        // Apply filters
        if (inputFilters && inputFilters.length > 0) {
          config.d.filterBy = inputFilters.map((f) => ({
            disOpt: f.col as DisaggregationOption,
            values: f.vals,
          }));
        }

        // Apply period filter
        if (periodFilter) {
          config.d.periodFilter = periodFilter;
        }

        // Set caption to label
        config.t.caption = label;

        const res = await serverActions.createPresentationObject({
          projectId: p.projectId,
          label,
          resultsValue: metric,
          config,
          makeDefault: false,
          folderId,
        });

        if (!res.success) {
          return res;
        }

        return { success: true as const, data: { visualizationId: res.data.newPresentationObjectId } };
      }

      return { success: false as const, err: "Unsupported block type" };
    },
    (data) => {
      p.close(data);
    }
  );

  const hasValidFigure = !!firstFigureBlock;

  return (
    <AlertFormHolder
      formId="save-to-visualization"
      header="Save as Visualization"
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={!hasValidFigure}
    >
      {hasValidFigure ? (
        <div class="space-y-4">
          <div class="space-y-2">
            <p>
              This will create a new visualization from the first figure in the whiteboard.
            </p>
            <p class="text-sm text-neutral">
              <span class="font-medium">Label:</span> {p.input.heading || "Untitled Visualization"}
            </p>
            <p class="text-sm text-neutral">
              <span class="font-medium">Source:</span>{" "}
              {firstFigureBlock.type === "from_visualization"
                ? "Duplicate of existing visualization"
                : "New visualization from metric"}
            </p>
          </div>
          <Select
            label="Folder"
            options={folderOptions()}
            value={selectedFolderId()}
            onChange={setSelectedFolderId}
            fullWidth
          />
        </div>
      ) : (
        <p class="text-error">
          No figure found in whiteboard content. Only figures (charts, tables) can be saved as
          visualizations.
        </p>
      )}
    </AlertFormHolder>
  );
}
