import { createSignal } from "solid-js";

const DEBOUNCE_MS = 1000;

export function createUndoRedo(initialValue: string) {
  const [undoStack, setUndoStack] = createSignal<string[]>([]);
  const [redoStack, setRedoStack] = createSignal<string[]>([]);
  const [current, setCurrent] = createSignal(initialValue);

  let debounceTimeout: ReturnType<typeof setTimeout> | undefined;
  let pendingSnapshot: string | undefined;

  function flushPendingSnapshot() {
    if (pendingSnapshot !== undefined) {
      setUndoStack((prev) => [...prev, pendingSnapshot!]);
      pendingSnapshot = undefined;
    }
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = undefined;
    }
  }

  // For manual typing - debounced push to undo stack
  function pushChange(newValue: string) {
    if (newValue === current()) return;

    // Capture snapshot before first change in this batch
    if (pendingSnapshot === undefined) {
      pendingSnapshot = current();
    }

    // Clear redo on any edit
    setRedoStack([]);
    setCurrent(newValue);

    // Reset debounce timer
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      flushPendingSnapshot();
    }, DEBOUNCE_MS);
  }

  // For AI edits - immediate push to undo stack
  function pushChangeImmediate(newValue: string) {
    if (newValue === current()) return;
    flushPendingSnapshot();
    setUndoStack((prev) => [...prev, current()]);
    setRedoStack([]);
    setCurrent(newValue);
  }

  function undo(): string | undefined {
    flushPendingSnapshot();
    const stack = undoStack();
    if (stack.length === 0) return undefined;
    const prev = stack[stack.length - 1];
    setUndoStack(stack.slice(0, -1));
    setRedoStack((r) => [...r, current()]);
    setCurrent(prev);
    return prev;
  }

  function redo(): string | undefined {
    flushPendingSnapshot();
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
    pushChangeImmediate,
    undo,
    redo,
    canUndo: () => undoStack().length > 0 || pendingSnapshot !== undefined,
    canRedo: () => redoStack().length > 0,
  };
}
