// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  basicSetup,
  createEffect,
  EditorState,
  EditorView,
  markdown,
  on,
  onCleanup,
  onMount,
} from "./deps.ts";
import type { TextEditorProps } from "./types.ts";

export function TextEditor(p: TextEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let isInternalChange = false;

  onMount(() => {
    if (!containerRef) {
      return;
    }

    const extensions = [
      basicSetup,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && p.onChange && !isInternalChange) {
          p.onChange(update.state.doc.toString());
        }
        if (update.selectionSet && p.onSelectionChange) {
          const sel = update.state.selection.main;
          if (sel.from === sel.to) {
            p.onSelectionChange(null);
          } else {
            const fromLine = update.state.doc.lineAt(sel.from).number;
            const toLine = update.state.doc.lineAt(sel.to).number;
            p.onSelectionChange({
              from: sel.from,
              to: sel.to,
              fromLine,
              toLine,
              text: update.state.sliceDoc(sel.from, sel.to),
            });
          }
        }
      }),
    ];

    if (p.language === "markdown") {
      extensions.push(markdown());
    }

    if (p.readonly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    if (p.lineWrapping) {
      extensions.push(EditorView.lineWrapping);
    }

    if (p.fullHeight) {
      extensions.push(
        EditorView.theme({
          "&.cm-editor": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content, .cm-gutter": { minHeight: "100%" },
        }),
      );
    }

    view = new EditorView({
      doc: p.value,
      extensions,
      parent: containerRef,
    });
  });

  // Sync external value changes to editor
  createEffect(
    on(
      () => p.value,
      (newValue) => {
        if (!view) {
          return;
        }
        const currentValue = view.state.doc.toString();
        if (newValue !== currentValue) {
          isInternalChange = true;
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: newValue,
            },
          });
          isInternalChange = false;
        }
      },
    ),
  );

  onCleanup(() => {
    if (view) {
      view.destroy();
    }
  });

  return (
    <div
      ref={containerRef}
      style={{
        height: p.fullHeight ? "100%" : p.height,
        "min-height": p.fullHeight ? 0 : undefined,
        overflow: p.fullHeight ? undefined : "auto",
      }}
    />
  );
}
