// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, onCleanup } from "solid-js";

export type ScrollManagerOptions = {
  threshold?: number;
  enabled?: boolean;
};

export function useScrollManager(
  containerRef: () => HTMLElement | undefined,
  dependencies: () => unknown[],
  options: ScrollManagerOptions = {},
) {
  const { threshold = 50, enabled = true } = options;
  let shouldAutoScroll = true;

  const checkScrollPosition = () => {
    const container = containerRef();
    if (!container) return;

    const distanceFromBottom = container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    shouldAutoScroll = distanceFromBottom < threshold;
  };

  const scrollToBottom = () => {
    const container = containerRef();
    if (!container || !shouldAutoScroll || !enabled) return;
    container.scrollTop = container.scrollHeight;
  };

  createEffect(() => {
    dependencies();
    if (enabled) {
      requestAnimationFrame(scrollToBottom);
    }
  });

  return {
    checkScrollPosition,
    scrollToBottom,
  };
}
