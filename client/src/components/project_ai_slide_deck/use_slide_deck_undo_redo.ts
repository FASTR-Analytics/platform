import { createSignal } from "solid-js";
import type { AISlideDeckConfig } from "lib";

export function createSlideDeckUndoRedo(initialValue: AISlideDeckConfig) {
  const [undoStack, setUndoStack] = createSignal<AISlideDeckConfig[]>([]);
  const [redoStack, setRedoStack] = createSignal<AISlideDeckConfig[]>([]);
  const [current, setCurrent] = createSignal<AISlideDeckConfig>(initialValue);

  function pushChange(newValue: AISlideDeckConfig) {
    const currentJson = JSON.stringify(current());
    const newJson = JSON.stringify(newValue);
    if (newJson === currentJson) return;

    setUndoStack((prev) => [...prev, current()]);
    setRedoStack([]);
    setCurrent(newValue);
  }

  function undo(): AISlideDeckConfig | undefined {
    const stack = undoStack();
    if (stack.length === 0) return undefined;
    const prev = stack[stack.length - 1];
    setUndoStack(stack.slice(0, -1));
    setRedoStack((r) => [...r, current()]);
    setCurrent(prev);
    return prev;
  }

  function redo(): AISlideDeckConfig | undefined {
    const stack = redoStack();
    if (stack.length === 0) return undefined;
    const next = stack[stack.length - 1];
    setRedoStack(stack.slice(0, -1));
    setUndoStack((u) => [...u, current()]);
    setCurrent(next);
    return next;
  }

  return {
    current,
    pushChange,
    undo,
    redo,
    canUndo: () => undoStack().length > 0,
    canRedo: () => redoStack().length > 0,
  };
}
