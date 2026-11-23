// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MessageParam } from "../deps.ts";

export type RecallDirection = "older" | "newer";

export type RecallKey = Pick<
  KeyboardEvent,
  "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey"
>;

export type RecallCaret = Pick<
  HTMLTextAreaElement,
  "value" | "selectionStart" | "selectionEnd"
>;

export type RecallWalk = {
  index: number;
  draft: string;
  caret: number;
};

export type RecallStep = {
  text: string;
  caret: number;
  walk: RecallWalk | undefined;
};

// Each text block is its own entry: a tool-result message carries each
// message typed during the turn as a block of its own.
export function getRecallHistory(messages: MessageParam[]): string[] {
  return messages.flatMap((msg) => {
    if (msg.role !== "user") {
      return [];
    }
    const texts = typeof msg.content === "string"
      ? [msg.content]
      : msg.content.flatMap((block) =>
        block.type === "text" ? [block.text] : []
      );
    return texts.map((text) => text.trim()).filter((text) => text !== "");
  });
}

// While the input shows a recalled message untouched, with the caret where
// the recall put it, either key walks, so a reversal takes one press. Once
// the text is typed over or the caret moved, the key walks only where the
// caret cannot move further, and otherwise moves the caret.
export function getRecallDirection(
  key: RecallKey,
  composing: boolean,
  caret: RecallCaret,
  history: string[],
  walk: RecallWalk | undefined,
): RecallDirection | undefined {
  if (
    key.shiftKey || key.altKey || key.ctrlKey || key.metaKey || composing ||
    caret.selectionStart !== caret.selectionEnd
  ) {
    return undefined;
  }
  const browsing =
    getShownWalk(history, walk, caret.value)?.caret === caret.selectionStart;
  if (key.key === "ArrowUp" && (browsing || caret.selectionStart === 0)) {
    return "older";
  }
  if (
    key.key === "ArrowDown" &&
    (browsing || caret.selectionEnd === caret.value.length)
  ) {
    return "newer";
  }
  return undefined;
}

// A text that differs from the entry the walk shows was typed over it: the
// walk has ended and that text is the draft. The caret goes to the start
// after an older step and to the end after a newer one.
export function getRecallStep(
  history: string[],
  walk: RecallWalk | undefined,
  text: string,
  direction: RecallDirection,
): RecallStep | undefined {
  const current = getShownWalk(history, walk, text);
  if (direction === "older") {
    const index = (current?.index ?? history.length) - 1;
    if (index < 0) {
      return undefined;
    }
    return {
      text: history[index],
      caret: 0,
      walk: { index, draft: current?.draft ?? text, caret: 0 },
    };
  }
  if (current === undefined) {
    return undefined;
  }
  const index = current.index + 1;
  if (index === history.length) {
    return {
      text: current.draft,
      caret: current.draft.length,
      walk: undefined,
    };
  }
  const caret = history[index].length;
  return {
    text: history[index],
    caret,
    walk: { index, draft: current.draft, caret },
  };
}

function getShownWalk(
  history: string[],
  walk: RecallWalk | undefined,
  text: string,
): RecallWalk | undefined {
  return walk !== undefined && history[walk.index] === text ? walk : undefined;
}
