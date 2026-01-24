import { getTextRenderingOptions, ReplicantValueOverride } from "lib";
import type { FigureInputs, MarkdownImageRenderer, StateHolder } from "panther";
import { ChartHolder, Loading } from "panther";
import { createEffect, createSignal, Match, Switch } from "solid-js";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { getPOFigureInputsFromCacheOrFetch_AsyncGenerator } from "~/state/po_cache";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIGURE_PREFIX = "figure://";

type ParsedFigureRef = {
  uuid: string;
  replicantValue?: string;
};

function parseFigureRef(src: string): ParsedFigureRef | undefined {
  // Handle figure:// prefix
  let id = src;
  if (src.startsWith(FIGURE_PREFIX)) {
    id = src.slice(FIGURE_PREFIX.length);
  }

  // Check for replicant suffix (UUID:value)
  const colonIndex = id.indexOf(":");
  if (colonIndex !== -1) {
    const uuid = id.slice(0, colonIndex);
    const replicantValue = id.slice(colonIndex + 1);
    if (UUID_REGEX.test(uuid) && replicantValue.length > 0) {
      return { uuid, replicantValue };
    }
  }

  // Bare UUID
  if (UUID_REGEX.test(id)) {
    return { uuid: id };
  }

  return undefined;
}

export function createFigureRenderer(projectId: string): MarkdownImageRenderer {
  return (src: string, alt: string) => {
    const parsed = parseFigureRef(src);
    if (!parsed) {
      return undefined;
    }
    return (
      <FigureRenderer
        projectId={projectId}
        presentationObjectId={parsed.uuid}
        replicantValue={parsed.replicantValue}
        alt={alt}
      />
    );
  };
}

type FigureRendererProps = {
  projectId: string;
  presentationObjectId: string;
  replicantValue?: string;
  alt: string;
};

function FigureRenderer(p: FigureRendererProps) {
  const pds = useProjectDirtyStates();

  const [figureInputs, setFigureInputs] = createSignal<StateHolder<FigureInputs>>({
    status: "loading",
    msg: "Loading figure...",
  });

  // Build replicant override if suffix was provided
  const replicateOverride: ReplicantValueOverride | undefined = p.replicantValue
    ? { selectedReplicantValue: p.replicantValue }
    : undefined;

  async function fetchFigureInputs() {
    const iter = getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
      p.projectId,
      p.presentationObjectId,
      replicateOverride,
    );
    for await (const state of iter) {
      setFigureInputs(state);
    }
  }

  // Refetch when presentation object or module data changes
  createEffect(() => {
    pds.lastUpdated.presentation_objects[p.presentationObjectId];
    pds.anyModuleLastRun;
    fetchFigureInputs();
  });

  return (
    <div class="my-4">
      <Switch>
        <Match when={figureInputs().status === "loading"}>
          <div class="aspect-video bg-base-200 rounded flex items-center justify-center">
            <Loading msg={(figureInputs() as { msg?: string }).msg} noPad />
          </div>
        </Match>
        <Match when={figureInputs().status === "error"}>
          <div class="aspect-video bg-base-200 rounded flex items-center justify-center text-danger text-sm">
            {(figureInputs() as { err?: string }).err ?? "Error loading figure"}
          </div>
        </Match>
        <Match when={figureInputs().status === "ready"}>
          <div class="overflow-hidden rounded">
            <ChartHolder
              chartInputs={(figureInputs() as { data: FigureInputs }).data}
              height="ideal"
              noRescaleWithWidthChange
              textRenderingOptions={getTextRenderingOptions()}
              scalePixelResolution={0.5}
            />
          </div>
        </Match>
      </Switch>
    </div>
  );
}
