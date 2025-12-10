import {
  Button,
  FrameTop,
  HeadingBar,
  TextArea,
  type OpenEditorProps,
} from "panther";
import { isFrench, type ProjectDetail } from "lib";
import { createSignal, For, Show, Switch, Match, createEffect } from "solid-js";
import { useProjectDirtyStates } from "../project_runner/mod";
import {
  getOrCreateConversationStore,
  sendMessageToServer,
} from "./chat_engine";
// @ts-expect-error - markdown-it package.json exports issue
import MarkdownIt from "markdown-it";
import { SlidePreview } from "./SlidePreview";
import { VisualizationPreview } from "./VisualizationPreview";

const md = new MarkdownIt();

type Props = {
  projectDetail: ProjectDetail;
  attemptGetProjectDetail: () => Promise<void>;
  silentRefreshProject: () => Promise<void>;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectChatbot(p: Props) {
  const [inputValue, setInputValue] = createSignal("");
  const projectId = p.projectDetail.id;

  // Get persistent signals for conversation
  const store = getOrCreateConversationStore(projectId);
  const [displayItems] = store.displayItems;
  const [isLoading, setIsLoading] = store.isLoading;

  let scrollContainer: HTMLDivElement | undefined;
  let shouldAutoScroll = true;

  const clearConversation = () => {
    const [, setMessages] = store.messages;
    const [, setDisplayItems] = store.displayItems;
    const [, setIsLoading] = store.isLoading;
    setMessages([]);
    setDisplayItems([]);
    setIsLoading(false);
  };

  const checkScrollPosition = () => {
    if (!scrollContainer) return;
    const threshold = 50;
    const distanceFromBottom =
      scrollContainer.scrollHeight -
      scrollContainer.scrollTop -
      scrollContainer.clientHeight;
    shouldAutoScroll = distanceFromBottom < threshold;
  };

  const scrollToBottom = () => {
    if (!scrollContainer || !shouldAutoScroll) return;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  };

  createEffect(() => {
    displayItems();
    isLoading();
    requestAnimationFrame(scrollToBottom);
  });

  const handleSubmit = async () => {
    const message = inputValue().trim();
    if (!message || isLoading()) return;

    setInputValue("");
    setIsLoading(true);
    try {
      await sendMessageToServer(projectId, message);
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading="AI Assistant" french={isFrench()}>
          <Button
            onClick={clearConversation}
            disabled={isLoading()}
            outline
            iconName="trash"
          >
            Clear conversation
          </Button>
        </HeadingBar>
      }
    >
      <div class="flex h-full w-full flex-col">
        <div
          ref={scrollContainer}
          class="ui-pad h-0 w-full flex-1 overflow-y-auto"
          onScroll={checkScrollPosition}
        >
          <div class="ui-gap flex flex-col">
            <For
              each={displayItems()}
              fallback={
                <div class="ui-pad bg-base-200 rounded font-mono text-sm">
                  <div class="mb-2 font-bold">Welcome to the AI Assistant</div>
                  <div class="mb-3">
                    I can help you analyze and understand your project data. Ask
                    me about:
                  </div>
                  <ul class="ml-5 list-disc space-y-1">
                    <li>
                      <strong>Module information:</strong> Module status,
                      configurations, and relationships
                    </li>
                    <li>
                      <strong>R scripts and logs:</strong> Analysis scripts and
                      execution logs for a module
                    </li>
                    <li>
                      <strong>Visualizations:</strong> Explore charts and
                      tables, and their underlying data
                    </li>
                    <li>
                      <strong>Data insights:</strong> Ask questions about
                      trends, comparisons, or patterns in your data
                    </li>
                    <li>
                      <strong>Report creation:</strong> Generate custom slides
                      with visualizations and analysis
                    </li>
                  </ul>
                  <div class="text-neutral mt-3 italic">
                    Example: "Show me the latest vaccination coverage data" or
                    "What errors occurred in the data quality module?"
                  </div>
                </div>
              }
            >
              {(item) => (
                <Switch>
                  <Match when={item.type === "text" && item}>
                    {(textItem) => (
                      <Switch>
                        <Match when={textItem().role === "user"}>
                          <div class="ui-pad ml-auto max-w-[80%] rounded bg-blue-100 text-right">
                            <div class="whitespace-pre-wrap font-mono text-sm text-blue-900">
                              {textItem().text}
                            </div>
                          </div>
                        </Match>
                        <Match when={textItem().role === "assistant"}>
                          <div
                            class="ui-pad bg-primary/10 text-primary [&_code]:bg-base-200 [&_pre]:bg-base-200 w-fit max-w-full rounded font-mono text-sm [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_em]:italic [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold [&_li]:ml-2 [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:my-3 [&_pre]:rounded [&_pre]:p-2 [&_strong]:font-bold [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc"
                            innerHTML={md.render(textItem().text)}
                          />
                        </Match>
                      </Switch>
                    )}
                  </Match>
                  <Match when={item.type === "tool_in_progress" && item}>
                    {(toolItem) => (
                      <div class="text-neutral italic">
                        {toolItem().toolInProgressActionLabel ||
                          `Loading ${toolItem().toolName}...`}
                      </div>
                    )}
                  </Match>
                  <Match when={item.type === "tool_error" && item}>
                    {(errorItem) => (
                      <div class="ui-pad w-fit max-w-full rounded bg-red-100">
                        <div class="font-mono text-sm text-red-900">
                          <div class="font-bold">
                            Error: {errorItem().toolName}
                          </div>
                          <div class="whitespace-pre-wrap">
                            {errorItem().errorMessage}
                          </div>
                        </div>
                      </div>
                    )}
                  </Match>
                  <Match when={item.type === "visualizations_to_show" && item}>
                    {(vizItem) => (
                      <div class="ui-gap grid w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
                        <For each={vizItem().ids}>
                          {(id) => (
                            <VisualizationPreview
                              projectId={p.projectDetail.id}
                              presentationObjectId={id}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </Match>
                  <Match when={item.type === "show_slide" && item}>
                    {(slideItem) => (
                      <SlidePreview
                        projectId={p.projectDetail.id}
                        slideDataFromAI={slideItem().slideDataFromAI}
                      />
                    )}
                  </Match>
                </Switch>
              )}
            </For>
            <Show
              when={
                isLoading() &&
                displayItems().every((item) => item.type !== "tool_in_progress")
              }
            >
              <div class="">
                <div class="text-neutral italic">Thinking...</div>
              </div>
            </Show>
          </div>
        </div>
        <div class="ui-pad ui-gap bg-primary/10 flex w-full flex-none">
          <div class="w-0 flex-1">
            <TextArea
              value={inputValue()}
              onChange={setInputValue}
              onKeyDown={handleKeyDown}
              fullWidth
              height="100px"
              placeholder="Type your message... (Shift+Enter for new line)"
            />
          </div>
          <div class="flex-none">
            <Button onClick={handleSubmit} disabled={isLoading()}>
              Submit
            </Button>
          </div>
        </div>
      </div>
    </FrameTop>
  );
}
