import { ContentSlide, ContentBlock } from "lib";
import { TextArea, OpenEditorProps, findById, LayoutNode } from "panther";
import { Match, Setter, Show, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

type Props = {
  projectId: string;
  tempSlide: ContentSlide;
  setTempSlide: SetStoreFunction<any>;
  selectedBlockId: string | undefined;
  setSelectedBlockId: Setter<string | undefined>;
  openEditor: <TProps, TReturn>(v: OpenEditorProps<TProps, TReturn>) => Promise<TReturn | undefined>;
};

export function SlideEditorPanelContent(p: Props) {
  function getCurrentBlock(): ContentBlock | undefined {
    if (!p.selectedBlockId) return undefined;
    const result = findById(p.tempSlide.layout, p.selectedBlockId);
    if (!result || result.node.type !== "item") return undefined;
    return result.node.data;
  }

  function updateSelectedBlock(updater: (block: ContentBlock) => ContentBlock) {
    if (!p.selectedBlockId) return;

    function updateNode(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
      if (node.id === p.selectedBlockId && node.type === "item") {
        return { ...node, data: updater(node.data) };
      }
      if (node.type === "rows" || node.type === "cols") {
        return { ...node, children: node.children.map(updateNode) };
      }
      return node;
    }

    const newLayout = updateNode(p.tempSlide.layout);
    p.setTempSlide("layout", newLayout);
  }

  return (
    <div class="ui-pad ui-spy">
      {/* Heading */}
      <TextArea
        label="Slide Heading"
        value={p.tempSlide.heading}
        onChange={(v: string) => p.setTempSlide("heading", v)}
        fullWidth
        height="60px"
      />

      {/* Selected block editor */}
      <Show when={getCurrentBlock()}>
        <div class="ui-spy">
          <div class="text-sm font-medium">Selected Block</div>

          <Switch>
            <Match when={getCurrentBlock()?.type === "text"}>
              <TextArea
                label="Markdown Content"
                value={(getCurrentBlock() as any).markdown}
                onChange={(v: string) => updateSelectedBlock((b: any) => ({ ...b, markdown: v }))}
                fullWidth
                height="300px"
              />
            </Match>

            <Match when={getCurrentBlock()?.type === "placeholder"}>
              <div class="text-sm text-base-content/70">
                Placeholder block - empty space
              </div>
            </Match>

            <Match when={getCurrentBlock()?.type === "figure"}>
              <div class="text-sm text-base-content/70">
                Figure block - editing not yet implemented
              </div>
            </Match>
          </Switch>
        </div>
      </Show>

      <Show when={!p.selectedBlockId}>
        <div class="text-sm text-base-content/70">
          Click a block on the canvas to edit it
        </div>
      </Show>
    </div>
  );
}
