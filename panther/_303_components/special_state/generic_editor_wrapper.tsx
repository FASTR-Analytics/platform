// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

export type EditorComponentProps<TProps, TReturn> = TProps & {
  close: (p: TReturn | undefined) => void;
};

export type OpenEditorProps<TProps, TReturn> = {
  element: (p: EditorComponentProps<TProps, TReturn>) => JSX.Element;
  props: TProps;
};

type EditorState<TProps, TReturn> = {
  element: (p: EditorComponentProps<TProps, TReturn>) => JSX.Element;
  props: TProps;
  componentResolver: (p: TReturn | undefined) => void;
};

type EditorWrapperProps = {
  children: JSX.Element;
  // "visibility-hidden" keeps the hidden children's layout alive (scroll
  // positions survive, and scrollTop writes on remounted descendants work
  // while an editor is open). Default is "display-none".
  hideMode?: "display-none" | "visibility-hidden";
};

export function getEditorWrapper() {
  const [editorState, setEditorState] = createSignal<
    // deno-lint-ignore no-explicit-any -- heterogeneous editor props/return; per-instance generics can't be expressed without `any`
    EditorState<any, any> | undefined
  >();
  function openEditor<TProps, TReturn>(v: OpenEditorProps<TProps, TReturn>) {
    return new Promise<TReturn | undefined>(
      (resolve: (p: TReturn | undefined) => void, _reject) => {
        setEditorState({
          element: v.element,
          props: v.props,
          componentResolver: resolve,
        });
      },
    );
  }
  function EditorWrapper(p: EditorWrapperProps) {
    return (
      <div class="relative z-0 h-full w-full">
        <div
          class="h-full w-full data-[hidden=display-none]:hidden data-[hidden=visibility-hidden]:invisible"
          data-hidden={editorState() ? (p.hideMode ?? "display-none") : "false"}
        >
          {p.children}
        </div>
        <Show when={editorState()} keyed>
          {(keyedEditorState) => {
            return (
              <div class="bg-base-100 absolute inset-0 z-10">
                <Dynamic
                  component={keyedEditorState.element}
                  close={(p: unknown) => {
                    keyedEditorState.componentResolver(p);
                    setEditorState(undefined);
                  }}
                  {...keyedEditorState.props}
                />
              </div>
            );
          }}
        </Show>
      </div>
    );
  }
  return { openEditor, EditorWrapper };
}
