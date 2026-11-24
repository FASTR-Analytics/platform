// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  autocompletion,
  bracketMatching,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  createEffect,
  crosshairCursor,
  defaultHighlightStyle,
  defaultKeymap,
  drawSelection,
  dropCursor,
  EditorState,
  EditorView,
  type Extension,
  foldGutter,
  foldKeymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSelectionMatches,
  highlightSpecialChars,
  history,
  historyKeymap,
  indentOnInput,
  keymap,
  lineNumbers,
  lintKeymap,
  markdown,
  on,
  onCleanup,
  onMount,
  rectangularSelection,
  searchKeymap,
  syntaxHighlighting,
} from "./deps.ts";
import type { TextEditorProps } from "./types.ts";

// CodeMirror's basicSetup, written out because it cannot leave out its line
// numbers: here they come only with showLineNumbers.
function editorSetup(showLineNumbers: boolean): Extension[] {
  return [
    ...(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
  ];
}

// CodeMirror's base theme sets the browser's monospace; the editor wears the
// app's mono face, as every other code surface does.
const APP_MONO_FONT = EditorView.theme({
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
});

export function TextEditor(p: TextEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let isInternalChange = false;

  onMount(() => {
    if (!containerRef) {
      return;
    }

    const extensions = [
      editorSetup(p.showLineNumbers ?? false),
      APP_MONO_FONT,
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
