# Integration Plan: Migrating to Panther _305_ai Module

This document outlines how to refactor the `project_chatbot` component to use the new `_305_ai` module from Panther.

## Current Implementation Analysis

### Files to Replace/Remove
- `chat_engine.ts` → Replaced by `useAIChat` hook
- `tool_handlers.ts` → Replaced by tool registration system
- `display_items.ts` → Replaced by built-in display item handling
- `types.ts` → Replaced by Panther types
- `index.tsx` → Simplified significantly

### Files to Keep
- `VisualizationPreview.tsx` → Becomes a tool result renderer
- `SlidePreview.tsx` → Becomes a tool result renderer

## Migration Steps

### Step 1: Define Tools

Create `tools.ts`:

```typescript
// tools.ts
import { TOOL_DEFINITIONS } from "lib";
import { serverActions } from "~/server_actions";
import type { AITool } from "panther";

export function createProjectTools(projectId: string): AITool[] {
  return [
    {
      name: TOOL_DEFINITIONS.GET_MODULE_INFORMATION.name,
      description: TOOL_DEFINITIONS.GET_MODULE_INFORMATION.description,
      input_schema: TOOL_DEFINITIONS.GET_MODULE_INFORMATION.input_schema,
      handler: async () => {
        const res = await serverActions.getModulesList({ projectId });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
    },
    {
      name: TOOL_DEFINITIONS.GET_MODULE_R_SCRIPT.name,
      description: TOOL_DEFINITIONS.GET_MODULE_R_SCRIPT.description,
      input_schema: TOOL_DEFINITIONS.GET_MODULE_R_SCRIPT.input_schema,
      handler: async (input: { id: string }) => {
        const res = await serverActions.getScript({
          projectId,
          module_id: input.id,
        });
        if (!res.success) throw new Error(res.err);
        return res.data.script;
      },
    },
    {
      name: TOOL_DEFINITIONS.GET_MODULE_LOG.name,
      description: TOOL_DEFINITIONS.GET_MODULE_LOG.description,
      input_schema: TOOL_DEFINITIONS.GET_MODULE_LOG.input_schema,
      handler: async (input: { id: string }) => {
        const res = await serverActions.getLogs({
          projectId,
          module_id: input.id,
        });
        if (!res.success) throw new Error(res.err);
        return res.data.logs;
      },
    },
    {
      name: TOOL_DEFINITIONS.GET_VISUALIZATIONS_AND_METADATA.name,
      description: TOOL_DEFINITIONS.GET_VISUALIZATIONS_AND_METADATA.description,
      input_schema: TOOL_DEFINITIONS.GET_VISUALIZATIONS_AND_METADATA.input_schema,
      handler: async () => {
        const res = await serverActions.getVisualizationsList({ projectId });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
    },
    {
      name: TOOL_DEFINITIONS.GET_DATA_FOR_ONE_VISUALIZATION.name,
      description: TOOL_DEFINITIONS.GET_DATA_FOR_ONE_VISUALIZATION.description,
      input_schema: TOOL_DEFINITIONS.GET_DATA_FOR_ONE_VISUALIZATION.input_schema,
      handler: async (input: { id: string }) => {
        const res = await serverActions.getVisualizationDataForAI({
          projectId,
          po_id: input.id,
        });
        if (!res.success) throw new Error(res.err);
        return res.data;
      },
    },
    {
      name: TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.name,
      description: TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.description,
      input_schema: TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.input_schema,
      handler: async () => {
        return "User has seen these visualizations";
      },
      // Custom renderer defined below
    },
    {
      name: TOOL_DEFINITIONS.CREATE_SLIDE.name,
      description: TOOL_DEFINITIONS.CREATE_SLIDE.description,
      input_schema: TOOL_DEFINITIONS.CREATE_SLIDE.input_schema,
      handler: async () => {
        return "Slide has been created and shown to user";
      },
      // Custom renderer defined below
    },
  ];
}
```

### Step 2: Create Custom Display Extractor

For tools that need custom display items (visualizations, slides):

```typescript
// display_extractors.ts
import { TOOL_DEFINITIONS } from "lib";
import type { DisplayItemExtractor } from "panther";

export const visualizationExtractor: DisplayItemExtractor = (block, allContent) => {
  if (block.type === "tool_use" && block.name === TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.name) {
    return {
      type: "custom",
      data: {
        displayType: "visualizations",
        ids: (block.input as { ids: string[] }).ids,
      },
    };
  }
  return null;
};

export const slideExtractor: DisplayItemExtractor = (block, allContent) => {
  if (block.type === "tool_use" && block.name === TOOL_DEFINITIONS.CREATE_SLIDE.name) {
    return {
      type: "custom",
      data: {
        displayType: "slide",
        slideData: block.input,
      },
    };
  }
  return null;
};
```

### Step 3: Create Custom Renderers

Update existing preview components to be renderers:

```typescript
// custom_renderers.tsx
import type { Component } from "solid-js";
import { For } from "solid-js";
import type { DisplayItem } from "panther";
import { VisualizationPreview } from "./VisualizationPreview";
import { SlidePreview } from "./SlidePreview";

export const CustomRenderer: Component<{
  item: Extract<DisplayItem, { type: "custom" }>;
  projectId: string;
}> = (props) => {
  const data = props.item.data as { displayType: string; [key: string]: unknown };

  if (data.displayType === "visualizations") {
    const ids = data.ids as string[];
    return (
      <div class="ui-gap grid w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
        <For each={ids}>
          {(id) => (
            <VisualizationPreview
              projectId={props.projectId}
              presentationObjectId={id}
            />
          )}
        </For>
      </div>
    );
  }

  if (data.displayType === "slide") {
    return (
      <SlidePreview
        projectId={props.projectId}
        slideDataFromAI={data.slideData}
      />
    );
  }

  return <div>Unknown custom display type</div>;
};
```

### Step 4: Create Welcome Component

```typescript
// WelcomeMessage.tsx
import { t2, T } from "lib";
import type { Component } from "solid-js";

export const WelcomeMessage: Component = () => {
  return (
    <div class="ui-pad bg-base-200 rounded font-mono text-sm">
      <div class="mb-2 font-bold">Welcome to the AI Assistant</div>
      <div class="mb-3">
        I can help you analyze and understand your project data. Ask me about:
      </div>
      <ul class="ml-5 list-disc space-y-1">
        <li>
          <strong>Module information:</strong> Module status, configurations,
          and relationships
        </li>
        <li>
          <strong>R scripts and logs:</strong> Analysis scripts and execution
          logs for a module
        </li>
        <li>
          <strong>Visualizations:</strong> Explore charts and tables, and their
          underlying data
        </li>
        <li>
          <strong>Data insights:</strong> Ask questions about trends,
          comparisons, or patterns in your data
        </li>
        <li>
          <strong>Report creation:</strong> Generate custom slides with
          visualizations and analysis
        </li>
      </ul>
      <div class="text-neutral mt-3 italic">
        Example: "Show me the latest vaccination coverage data" or "What errors
        occurred in the data quality module?"
      </div>
    </div>
  );
};
```

### Step 5: Create Markdown Text Renderer

Replace default text renderer with markdown support:

```typescript
// MarkdownTextRenderer.tsx
import MarkdownIt from "markdown-it";
import type { Component } from "solid-js";
import type { DisplayItem } from "panther";

const md = new MarkdownIt();

export const MarkdownTextRenderer: Component<{
  item: Extract<DisplayItem, { type: "text" }>;
}> = (props) => {
  if (props.item.role === "user") {
    return (
      <div class="ui-pad ml-auto max-w-[80%] rounded bg-blue-100 text-right">
        <div class="whitespace-pre-wrap font-mono text-sm text-blue-900">
          {props.item.text}
        </div>
      </div>
    );
  }

  return (
    <div
      class="ui-pad bg-primary/10 text-primary w-fit max-w-full rounded font-mono text-sm [&_code]:bg-base-200 [&_pre]:bg-base-200 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_em]:italic [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold [&_li]:ml-2 [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:my-3 [&_pre]:rounded [&_pre]:p-2 [&_strong]:font-bold [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc"
      innerHTML={md.render(props.item.text)}
    />
  );
};
```

### Step 6: Refactor Main Component

Replace `index.tsx` with simplified version:

```typescript
// index.tsx
import { Button, FrameTop, HeadingBar, AIChatProvider, AIChat } from "panther";
import { isFrench, t, t2, T, type ProjectDetail, type OpenEditorProps } from "lib";
import { createMemo } from "solid-js";
import { _SERVER_HOST } from "~/server_actions/config";
import { createProjectTools } from "./tools";
import { visualizationExtractor, slideExtractor } from "./display_extractors";
import { CustomRenderer } from "./custom_renderers";
import { WelcomeMessage } from "./WelcomeMessage";
import { MarkdownTextRenderer } from "./MarkdownTextRenderer";

type Props = {
  projectDetail: ProjectDetail;
  attemptGetProjectDetail: () => Promise<void>;
  silentRefreshProject: () => Promise<void>;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectChatbot(p: Props) {
  const projectId = p.projectDetail.id;

  const tools = createMemo(() => createProjectTools(projectId));

  const customRenderers = {
    text: MarkdownTextRenderer,
    custom: (props: { item: Extract<DisplayItem, { type: "custom" }> }) => (
      <CustomRenderer item={props.item} projectId={projectId} />
    ),
  };

  return (
    <AIChatProvider
      config={{
        apiConfig: {
          endpoint: `${_SERVER_HOST}/chatbot`,
          transformRequest: async (payload) => ({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              ...payload,
              projectId,
            }),
          }),
          transformResponse: async (response) => {
            const data = await response.json();
            if (!data.success) {
              throw new Error(data.err);
            }
            return data.data;
          },
        },
        tools: tools(),
        conversationId: projectId,
        displayExtractors: [visualizationExtractor, slideExtractor],
      }}
    >
      <FrameTop
        panelChildren={
          <HeadingBar heading="AI Assistant" french={isFrench()}>
            <ProjectChatbotActions />
          </HeadingBar>
        }
      >
        <AIChat
          customRenderers={customRenderers}
          fallbackContent={WelcomeMessage}
        />
      </FrameTop>
    </AIChatProvider>
  );
}

// Separate component to access chat context
function ProjectChatbotActions() {
  const { clearConversation, isLoading } = useAIChat();

  return (
    <Button
      onClick={clearConversation}
      disabled={isLoading()}
      outline
      iconName="trash"
    >
      Clear conversation
    </Button>
  );
}
```

## Server-Side Changes

Your server endpoint at `${_SERVER_HOST}/chatbot` should already be compatible. Verify it:

1. Accepts `{ messages, tools, projectId }` payload
2. Proxies to Anthropic Messages API
3. Returns response in format: `{ success: true, data: anthropicResponse }`

If not, update server or use `transformRequest`/`transformResponse` to adapt.

## File Structure After Migration

```
project_chatbot/
├── index.tsx                     # Main component (simplified)
├── tools.ts                      # Tool definitions
├── display_extractors.ts         # Custom display logic
├── custom_renderers.tsx          # Custom display components
├── WelcomeMessage.tsx            # Fallback content
├── MarkdownTextRenderer.tsx      # Markdown text renderer
├── VisualizationPreview.tsx      # Keep (used as renderer)
├── SlidePreview.tsx              # Keep (used as renderer)
└── INTEGRATION_PLAN.md           # This file

// Delete after migration:
├── chat_engine.ts                # ❌ Replaced by useAIChat
├── tool_handlers.ts              # ❌ Replaced by tools.ts
├── display_items.ts              # ❌ Replaced by display_extractors.ts
└── types.ts                      # ❌ Replaced by Panther types
```

## Benefits of Migration

1. **Less Code**: ~200 lines removed (chat_engine, tool_handlers, display_items)
2. **Better Types**: Full TypeScript support from Panther
3. **More Maintainable**: Standard patterns instead of custom implementation
4. **More Flexible**: Easy to add new tools and custom renderers
5. **Better Tested**: Panther module includes tests
6. **Reusable**: Can use same patterns in other projects

## Testing Checklist

After migration, verify:

- [ ] Messages display correctly (user and assistant)
- [ ] Markdown renders in assistant messages
- [ ] Tools execute and show loading state
- [ ] Tool errors display properly
- [ ] Visualizations display in grid
- [ ] Visualization modal expansion works
- [ ] Slides render correctly
- [ ] Slide modal expansion works
- [ ] Clear conversation button works
- [ ] Conversation persists on remount
- [ ] Auto-scroll works
- [ ] Manual scroll disables auto-scroll
- [ ] Loading state shows "Thinking..."
- [ ] Welcome message shows when empty

## Rollback Plan

If issues arise:

1. Keep old files in `_old/` subdirectory during migration
2. Revert by restoring old files
3. Report issues to Panther maintainer

## Timeline

Estimated time: 2-3 hours

1. Create new files (1 hour)
2. Test thoroughly (1 hour)
3. Delete old files (15 minutes)
4. Final verification (30 minutes)

## Notes

- Consider adding more tools specific to your domain
- Custom renderers can be extracted to separate Panther components if reusable
- The `useAIChat` hook can be used directly for even more custom UIs
