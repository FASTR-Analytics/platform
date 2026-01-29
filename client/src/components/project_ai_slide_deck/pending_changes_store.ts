import { createStore } from "solid-js/store";

type PendingChanges = {
  edited: string[];
  added: string[];
  deleted: string[];
  duplicated: string[];
  moved: string[];
};

const [pendingChanges, setPendingChanges] = createStore<PendingChanges>({
  edited: [],
  added: [],
  deleted: [],
  duplicated: [],
  moved: [],
});

export function trackSlideChange(type: keyof PendingChanges, slideId: string) {
  setPendingChanges(type, (prev) => [...prev, slideId]);
}

export function getPendingChangesMessage(): string | null {
  const summary: string[] = [];

  if (pendingChanges.edited.length > 0) {
    summary.push(`Edited slides: ${pendingChanges.edited.join(', ')}`);
  }
  if (pendingChanges.added.length > 0) {
    summary.push(`Added slides: ${pendingChanges.added.join(', ')}`);
  }
  if (pendingChanges.deleted.length > 0) {
    summary.push(`Deleted slides: ${pendingChanges.deleted.join(', ')}`);
  }
  if (pendingChanges.duplicated.length > 0) {
    summary.push(`Duplicated slides: ${pendingChanges.duplicated.join(', ')}`);
  }
  if (pendingChanges.moved.length > 0) {
    summary.push(`Moved slides: ${pendingChanges.moved.join(', ')}`);
  }

  if (summary.length === 0) return null;

  // Wrap in special markers that will be stripped from display but sent to AI
  return `<<<[Context: User made changes since your last response:\n${summary.join('\n')}\nPlease call get_deck or get_slide to see the latest state before making modifications.]>>>`;
}

export function clearPendingChanges() {
  setPendingChanges({
    edited: [],
    added: [],
    deleted: [],
    duplicated: [],
    moved: [],
  });
}
