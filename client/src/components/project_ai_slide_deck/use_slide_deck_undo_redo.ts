import { createSignal } from "solid-js";
import type { SimpleSlideDeck } from "./types";

export function createSlideDeckUndoRedo(initialValue: SimpleSlideDeck) {
  const [undoStack, setUndoStack] = createSignal<SimpleSlideDeck[]>([]);
  const [redoStack, setRedoStack] = createSignal<SimpleSlideDeck[]>([]);
  const [current, setCurrent] = createSignal<SimpleSlideDeck>(initialValue);

  function pushChange(newValue: SimpleSlideDeck) {
    const currentJson = JSON.stringify(current());
    const newJson = JSON.stringify(newValue);
    if (newJson === currentJson) return;

    setUndoStack((prev) => [...prev, current()]);
    setRedoStack([]);
    setCurrent(newValue);
  }

  function undo(): SimpleSlideDeck | undefined {
    const stack = undoStack();
    if (stack.length === 0) return undefined;
    const prev = stack[stack.length - 1];
    setUndoStack(stack.slice(0, -1));
    setRedoStack((r) => [...r, current()]);
    setCurrent(prev);
    return prev;
  }

  function redo(): SimpleSlideDeck | undefined {
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
