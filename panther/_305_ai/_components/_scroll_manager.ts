// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, onCleanup } from "solid-js";

export type ScrollManagerOptions = {
  threshold?: number;
  enabled?: boolean;
};

export function createScrollManager(
  containerRef: () => HTMLElement | undefined,
  dependencies: () => unknown[],
  options: ScrollManagerOptions = {},
) {
  const { threshold = 50, enabled = true } = options;
  let shouldAutoScroll = true;
  let ignoreScrollEvents = false;
  let ignoreScrollTimeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(ignoreScrollTimeout));

  const checkScrollPosition = () => {
    if (ignoreScrollEvents) return;

    const container = containerRef();
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop -
      container.clientHeight;

    shouldAutoScroll = distanceFromBottom < threshold;
  };

  const scrollToBottom = (force = false) => {
    const container = containerRef();
    if (!container || !enabled) return;

    if (force) {
      shouldAutoScroll = true;
      ignoreScrollEvents = true;
      clearTimeout(ignoreScrollTimeout);
      ignoreScrollTimeout = setTimeout(() => (ignoreScrollEvents = false), 100);
    }

    if (!shouldAutoScroll) return;
    // Standard approach from SolidJS chat examples
    container.scrollTo(0, container.scrollHeight);
  };

  createEffect(() => {
    dependencies();
    if (enabled) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToBottom());
      });
    }
  });

  return {
    checkScrollPosition,
    scrollToBottom,
  };
}
