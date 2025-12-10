import { createSignal } from "solid-js";

type TextEditorMode = "editable_text" | "presentation";
type RightPanelMode = "text_editor" | "debug";

// Stable UI state for long-form editor, persisted across component remounts
const [textEditorMode, setTextEditorMode] = createSignal<TextEditorMode>("editable_text");
const [rightPanelMode, setRightPanelMode] = createSignal<RightPanelMode>("text_editor");

export const longFormEditorState = {
  textEditorMode,
  setTextEditorMode,
  rightPanelMode,
  setRightPanelMode,
};
