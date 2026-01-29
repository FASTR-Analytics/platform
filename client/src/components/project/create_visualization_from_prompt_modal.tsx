import { t, type CreateModeVisualizationData, type InstanceDetail, type ProjectDetail } from "lib";
import {
  AIChat,
  AIChatProvider,
  AlertComponentProps,
  Button,
  createAIChat,
} from "panther";
import { createSignal, Show } from "solid-js";
import { createProjectSDKClient, DEFAULT_MODEL_CONFIG } from "~/components/ai_configs/defaults";
import { getVisualizationCreationSystemPrompt } from "~/components/ai_prompts/visualization_creation";
import { getToolsForVisualizationCreation } from "../ai_tools/ai_tool_definitions";

type Props = AlertComponentProps<
  {
    projectId: string;
    instanceDetail: InstanceDetail;
    projectDetail: ProjectDetail;
  },
  CreateModeVisualizationData
>;

export function CreateVisualizationFromPromptModal(p: Props) {
  const projectId = p.projectId;
  const [result, setResult] = createSignal<CreateModeVisualizationData | null>(null);

  const sdkClient = createProjectSDKClient(projectId);
  const tools = getToolsForVisualizationCreation(projectId, p.projectDetail.metrics, setResult);
  const systemPrompt = getVisualizationCreationSystemPrompt(p.instanceDetail, p.projectDetail);

  return (
    <div class="ui-modal-backdrop" onClick={() => p.close(undefined)}>
      <div
        class="ui-modal-content w-[700px] max-w-[90vw] h-[600px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <AIChatProvider
          config={{
            sdkClient,
            modelConfig: DEFAULT_MODEL_CONFIG,
            tools,
            conversationId: `viz-create-${projectId}`,
            enablePersistence: false,
            system: () => systemPrompt,
          }}
        >
          <CreateVisualizationFromPromptInner
            result={result()}
            onClose={(data) => p.close(data)}
          />
        </AIChatProvider>
      </div>
    </div>
  );
}

function CreateVisualizationFromPromptInner(props: {
  result: CreateModeVisualizationData | null;
  onClose: (data: CreateModeVisualizationData | undefined) => void;
}) {
  const { clearConversation, isLoading } = createAIChat();

  const handleResultReady = () => {
    if (props.result) {
      props.onClose(props.result);
    }
  };

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between border-b border-base-300 ui-pad">
        <h2 class="text-lg font-700">{t("Create visualization with AI")}</h2>
        <div class="flex items-center ui-gap-sm">
          <Button
            onClick={clearConversation}
            disabled={isLoading()}
            outline
            iconName="trash"
            size="sm"
          >
            {t("Clear chat")}
          </Button>
          <Button onClick={() => props.onClose(undefined)} iconName="x" size="sm" outline />
        </div>
      </div>

      <div class="flex-1 overflow-auto">
        <AIChat
          placeholder={t("Describe the visualization you want to create...")}
          fallbackContent={WelcomeContent}
        />
      </div>

      <Show when={props.result}>
        <div class="border-t border-base-300 ui-pad flex items-center justify-between bg-base-100">
          <div class="text-sm text-neutral">
            {t("Visualization configuration ready")}:{" "}
            <span class="font-700">{props.result!.label}</span>
          </div>
          <Button onClick={handleResultReady} disabled={isLoading()}>
            {t("Open in editor")}
          </Button>
        </div>
      </Show>
    </div>
  );
}

function WelcomeContent() {
  return (
    <div class="ui-pad text-center">
      <div class="text-2xl mb-2">Create a visualization</div>
      <p class="text-neutral text-sm max-w-md mx-auto mb-4">
        {t("Describe what you want to visualize in plain language. For example:")}
      </p>
      <div class="space-y-2 text-sm text-left max-w-md mx-auto">
        <div class="bg-base-200 rounded p-2">
          "Show ANC1 coverage by region over the last 12 months"
        </div>
        <div class="bg-base-200 rounded p-2">
          "Compare Penta3 and Measles coverage quarterly"
        </div>
        <div class="bg-base-200 rounded p-2">
          "Table of immunization metrics by district for 2023"
        </div>
      </div>
    </div>
  );
}
