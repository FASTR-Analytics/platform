// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomMarkdownStyleOptions,
  ImageMap,
  MarkdownImageRenderer,
  MarkdownPresentation,
  MarkdownPresentationJsx,
  Match,
  Switch,
} from "./deps.ts";
import { TextEditor } from "./text_editor.tsx";
import type { TextEditorSelection } from "./types.ts";

type Props = {
  value: string;
  onChange?: (value: string) => void;
  onSelectionChange?: (selection: TextEditorSelection) => void;
  mode: "editable_text" | "presentation";
  style?: CustomMarkdownStyleOptions;
  scale?: number;
  images?: ImageMap;
  contentWidth?: string;
  renderImage?: MarkdownImageRenderer;
};

export function MarkdownTextEditor(p: Props) {
  return (
    <Switch>
      <Match when={p.mode === "editable_text"}>
        <div class="h-full w-full overflow-auto">
          <TextEditor
            value={p.value}
            onChange={p.onChange}
            onSelectionChange={p.onSelectionChange}
            language="markdown"
            fullHeight
            lineWrapping
          />
        </div>
      </Match>
      <Match when={p.mode === "presentation"}>
        <div class="h-full w-full overflow-auto px-8 py-12">
          <Switch>
            <Match when={p.renderImage}>
              <MarkdownPresentationJsx
                markdown={p.value}
                style={p.style}
                scale={p.scale}
                images={p.images}
                contentWidth={p.contentWidth}
                renderImage={p.renderImage}
              />
            </Match>
            <Match when={!p.renderImage}>
              <MarkdownPresentation
                markdown={p.value}
                style={p.style}
                scale={p.scale}
                images={p.images}
                contentWidth={p.contentWidth}
              />
            </Match>
          </Switch>
        </div>
      </Match>
    </Switch>
  );
}
