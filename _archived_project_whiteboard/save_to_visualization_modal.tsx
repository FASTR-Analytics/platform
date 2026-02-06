import type {
  AiContentSlideInput,
  VisualizationFolder,
  MetricWithStatus,
} from "lib";
import { AlertComponentProps, AlertFormHolder, Select, timActionForm } from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { buildConfigFromMetric } from "~/components/slide_deck/utils/build_config_from_metric";

type Props = {
  projectId: string;
  input: AiContentSlideInput;
  folders: VisualizationFolder[];
  metrics: MetricWithStatus[];
};

type ReturnType = { visualizationId: string } | undefined;

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
        const buildResult = buildConfigFromMetric(firstFigureBlock, p.metrics);

        if (!buildResult.success) {
          return { success: false as const, err: buildResult.error };
        }

        const { resultsValue, config } = buildResult;

        // Override caption with the whiteboard heading
        config.t.caption = label;

        const res = await serverActions.createPresentationObject({
          projectId: p.projectId,
          label,
          resultsValue,
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
