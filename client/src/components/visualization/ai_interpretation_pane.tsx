import { createSignal, Show, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  ADTFigure,
  throwIfErrWithData,
  Button,
  StateHolder,
  TextArea,
} from "panther";
import { ProjectDetail, t, t2, T } from "lib";
import {
  createInterpretationKey,
  getInterpretationData,
  updateInterpretationData,
} from "~/state/ai_interpretations";

type Props = {
  projectDetail: ProjectDetail;
  presentationObjectId: string;
  figureInputs: StateHolder<ADTFigure>;
};

export function AiInterpretationPane(p: Props) {
  // Create a unique key for this visualization
  const interpretationKey = createMemo(() =>
    createInterpretationKey(p.projectDetail.id, p.presentationObjectId),
  );

  // Get stored data from global state
  const storedData = createMemo(() =>
    getInterpretationData(interpretationKey()),
  );

  // Local state that doesn't need to persist
  const [isLoadingInterpretation, setIsLoadingInterpretation] =
    createSignal<boolean>(false);
  const [error, setError] = createSignal<string>("");

  // Use stored values or defaults
  const interpretation = createMemo(() => storedData().interpretation);
  const additionalInstructions = createMemo(
    () => storedData().additionalInstructions,
  );
  const hasBeenTriggered = createMemo(() => storedData().hasBeenTriggered);

  console.log("Re-rendering with key:", interpretationKey());

  // Helper to update stored data
  const updateStoredData = (
    updates: Partial<ReturnType<typeof getInterpretationData>>,
  ) => {
    updateInterpretationData(interpretationKey(), updates);
  };

  async function getInterpretation(): Promise<void> {
    try {
      // Check if figure inputs are ready
      const figureInputsState = p.figureInputs;
      if (figureInputsState.status !== "ready") {
        setError("Visualization data is not ready yet");
        return;
      }

      setIsLoadingInterpretation(true);
      setError("");

      // Call the server action with the actual figure inputs data
      const resInterpretation = await serverActions.getAiInterpretation({
        projectId: p.projectDetail.id,
        figureInputs: figureInputsState.data,
        additionalInstructions: additionalInstructions(),
        additionalContext: p.projectDetail.aiContext,
      });

      throwIfErrWithData(resInterpretation);

      // Update stored state with the result and set hasBeenTriggered + lastInterpretedInputs together
      updateStoredData({
        interpretation: resInterpretation.data,
        lastInterpretedInputs: figureInputsState.data,
        hasBeenTriggered: true,
      });
    } catch (error) {
      console.error("Error getting interpretation:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get interpretation";
      setError(errorMessage);
      updateStoredData({ interpretation: "" });
    } finally {
      setIsLoadingInterpretation(false);
    }
  }

  return (
    <div class="flex h-full flex-col">
      {/* Header */}
      <div class="ui-pad border-b bg-base-200">
        <h3 class="text-lg font-700">{t("AI interpretation")}</h3>
      </div>

      {/* Prompt Input Section */}
      <div class="ui-pad ui-spy-sm border-b">
        <label class="font-700 text-sm" for="ai-instructions">
          {t("Additional instructions (optional)")}
        </label>
        <TextArea
          // id="ai-instructions"
          // class="ui-input h-36 w-full resize-none"
          placeholder={t(
            "e.g., Focus on trends over the last 3 months, highlight any anomalies...",
          )}
          value={additionalInstructions()}
          onChange={(v) => updateStoredData({ additionalInstructions: v })}
          fullWidth
          height="150px"
        />
        <div class="flex items-center justify-between">
          <Button
            onClick={() => getInterpretation()}
            intent="primary"
            fullWidth
            disabled={
              isLoadingInterpretation() || p.figureInputs.status !== "ready"
            }
            iconName={hasBeenTriggered() ? "refresh" : "sparkles"}
          >
            {hasBeenTriggered()
              ? t("Update interpretation")
              : t("Generate interpretation")}
          </Button>
        </div>
      </div>

      {/* Content Section */}
      <div class="ui-pad flex-1 overflow-auto">
        <Show
          when={!hasBeenTriggered() && !isLoadingInterpretation()}
          fallback={
            <Show
              when={!error()}
              fallback={
                <div class="ui-spy-sm">
                  <div class="flex items-center gap-2 text-danger">
                    <span class="text-lg">⚠</span>
                    <span class="font-700">{t2(T.Modules.error)}</span>
                  </div>
                  <div class="text-sm text-danger">{error()}</div>
                  <Button
                    onClick={() => getInterpretation()}
                    intent="danger"
                    outline
                    iconName="refresh"
                  >
                    {t("Try Again")}
                  </Button>
                </div>
              }
            >
              <Show
                when={!isLoadingInterpretation()}
                fallback={
                  <div class="ui-spy-sm">
                    <div class="animate-pulse text-sm text-neutral">
                      {t("Analyzing visualization data...")}
                    </div>
                    <div class="h-1 w-full overflow-hidden rounded-full bg-base-200">
                      <div
                        class="h-full bg-primary transition-all duration-300"
                        style={{
                          width: "30%",
                          animation: "shimmer 1.5s ease-in-out infinite",
                        }}
                      />
                    </div>
                  </div>
                }
              >
                <div class="whitespace-pre-wrap text-sm leading-relaxed">
                  {interpretation()}
                </div>
              </Show>
            </Show>
          }
        >
          <div class="text-center text-sm text-neutral">
            <p>
              {t("AI analysis can provide insights about your visualization.")}
            </p>
            <p class="mt-2">{t("Click 'Generate interpretation' to begin.")}</p>
          </div>
        </Show>
      </div>
    </div>
  );
}
