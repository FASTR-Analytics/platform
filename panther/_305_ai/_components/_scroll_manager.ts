// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, onCleanup } from "solid-js";

const BOTTOM_ZONE_PX = 50;

// Following: every engine write and every resize of the transcript ends at
// the bottom, until the user scrolls up. The manager's own scrolls never lower
// scrollTop, so a scroll event that lowers it is the user's (or a clamp after
// the content shrank, which lands in the bottom zone and turns following back
// on), and no timer is needed to tell the manager's events from the user's.
export function createScrollManager(engineWrite: () => unknown) {
  let el: HTMLElement | undefined;
  let following = true;
  let lastTop = 0;

  const scrollToBottom = (force = false) => {
    if (force) following = true;
    if (!following || !el) return;
    el.scrollTo(0, el.scrollHeight);
    lastTop = el.scrollTop;
  };

  const ref = (element: HTMLElement) => {
    el = element;
    element.addEventListener("scroll", () => {
      const top = element.scrollTop;
      if (top < lastTop) following = false;
      if (element.scrollHeight - top - element.clientHeight <= BOTTOM_ZONE_PX) {
        following = true;
      }
      lastTop = top;
    });
    const observer = new ResizeObserver(() => scrollToBottom());
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  };

  // The effect runs once the DOM holds the write, and reading scrollHeight
  // lays the transcript out, so the write and its follow paint in the same
  // frame: the bottom never leaves the view between them, and a wheel that
  // lands before the next frame is judged against the followed transcript.
  createEffect(() => {
    engineWrite();
    scrollToBottom();
  });

  return { ref, scrollToBottom };
}
