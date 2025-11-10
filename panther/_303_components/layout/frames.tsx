// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";

type FrameProps = {
  panelChildren?: JSX.Element;
  children: JSX.Element;
};

type ResizableFrameProps = FrameProps & {
  startingWidth: number;
  minWidth?: number;
  maxWidth?: number;
  preventPanelResizeOnParentResize?: boolean;
};

export function FrameLeft(p: FrameProps) {
  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div class="flex h-full w-full">
        <div class="h-full flex-none overflow-auto">{p.panelChildren}</div>
        <div class="h-full w-0 flex-1 overflow-auto">{p.children}</div>
      </div>
    </Show>
  );
}

export function FrameRight(p: FrameProps) {
  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div class="flex h-full w-full">
        <div class="h-full w-0 flex-1 overflow-auto">{p.children}</div>
        <div class="h-full flex-none overflow-auto">{p.panelChildren}</div>
      </div>
    </Show>
  );
}

export function FrameTop(p: FrameProps) {
  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div class="flex h-full w-full flex-col">
        <div class="w-full flex-none overflow-auto">{p.panelChildren}</div>
        <div class="h-0 w-full flex-1 overflow-auto">{p.children}</div>
      </div>
    </Show>
  );
}

export function FrameBottom(p: FrameProps) {
  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div class="flex h-full w-full flex-col">
        <div class="h-0 w-full flex-1 overflow-auto">{p.children}</div>
        <div class="w-full flex-none overflow-auto">{p.panelChildren}</div>
      </div>
    </Show>
  );
}

export function FrameLeftResizable(p: ResizableFrameProps) {
  const minWidth = p.minWidth ?? 100;
  const maxWidth = p.maxWidth ?? 600;
  const [width, setWidth] = createSignal(
    Math.max(minWidth, Math.min(maxWidth, p.startingWidth)),
  );
  const [targetPercentage, setTargetPercentage] = createSignal<number>(0);
  const [containerWidth, setContainerWidth] = createSignal<number>(0);

  let containerRef!: HTMLDivElement;
  let isDragging = false;
  let handleMouseMove: ((e: MouseEvent) => void) | undefined;
  let handleMouseUp: (() => void) | undefined;
  let resizeObserver: ResizeObserver | undefined;

  onMount(() => {
    if (!p.preventPanelResizeOnParentResize && containerRef) {
      const initialWidth = containerRef.offsetWidth;
      setContainerWidth(initialWidth);
      setTargetPercentage(width() / initialWidth);

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newContainerWidth = entry.contentRect.width;
          setContainerWidth(newContainerWidth);
          const newWidth = Math.max(
            minWidth,
            Math.min(maxWidth, targetPercentage() * newContainerWidth),
          );
          setWidth(newWidth);
        }
      });

      resizeObserver.observe(containerRef);
    }
  });

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = width();

    handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const newWidth = Math.max(
        minWidth,
        Math.min(maxWidth, startWidth + deltaX),
      );
      setWidth(newWidth);

      if (!p.preventPanelResizeOnParentResize && containerWidth() > 0) {
        setTargetPercentage(newWidth / containerWidth());
      }
    };

    handleMouseUp = () => {
      isDragging = false;
      if (handleMouseMove) {
        document.removeEventListener("mousemove", handleMouseMove);
        handleMouseMove = undefined;
      }
      if (handleMouseUp) {
        document.removeEventListener("mouseup", handleMouseUp);
        handleMouseUp = undefined;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  onCleanup(() => {
    if (handleMouseMove) {
      document.removeEventListener("mousemove", handleMouseMove);
    }
    if (handleMouseUp) {
      document.removeEventListener("mouseup", handleMouseUp);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });

  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div ref={containerRef} class="flex h-full w-full">
        <div
          class="relative h-full flex-none"
          style={{ width: `${width()}px` }}
        >
          <div class="h-full overflow-auto">{p.panelChildren}</div>
          <div
            class="absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize hover:bg-[lightblue] active:bg-[lightblue]"
            onMouseDown={handleMouseDown}
          />
        </div>
        <div class="h-full w-0 flex-1 overflow-auto">{p.children}</div>
      </div>
    </Show>
  );
}

export function FrameRightResizable(p: ResizableFrameProps) {
  const minWidth = p.minWidth ?? 100;
  const maxWidth = p.maxWidth ?? 600;
  const [width, setWidth] = createSignal(
    Math.max(minWidth, Math.min(maxWidth, p.startingWidth)),
  );
  const [targetPercentage, setTargetPercentage] = createSignal<number>(0);
  const [containerWidth, setContainerWidth] = createSignal<number>(0);

  let containerRef!: HTMLDivElement;
  let isDragging = false;
  let handleMouseMove: ((e: MouseEvent) => void) | undefined;
  let handleMouseUp: (() => void) | undefined;
  let resizeObserver: ResizeObserver | undefined;

  onMount(() => {
    if (!p.preventPanelResizeOnParentResize && containerRef) {
      const initialWidth = containerRef.offsetWidth;
      setContainerWidth(initialWidth);
      setTargetPercentage(width() / initialWidth);

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newContainerWidth = entry.contentRect.width;
          setContainerWidth(newContainerWidth);
          const newWidth = Math.max(
            minWidth,
            Math.min(maxWidth, targetPercentage() * newContainerWidth),
          );
          setWidth(newWidth);
        }
      });

      resizeObserver.observe(containerRef);
    }
  });

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = width();

    handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = startX - e.clientX; // Reversed for right panel
      const newWidth = Math.max(
        minWidth,
        Math.min(maxWidth, startWidth + deltaX),
      );
      setWidth(newWidth);

      if (!p.preventPanelResizeOnParentResize && containerWidth() > 0) {
        setTargetPercentage(newWidth / containerWidth());
      }
    };

    handleMouseUp = () => {
      isDragging = false;
      if (handleMouseMove) {
        document.removeEventListener("mousemove", handleMouseMove);
        handleMouseMove = undefined;
      }
      if (handleMouseUp) {
        document.removeEventListener("mouseup", handleMouseUp);
        handleMouseUp = undefined;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  onCleanup(() => {
    if (handleMouseMove) {
      document.removeEventListener("mousemove", handleMouseMove);
    }
    if (handleMouseUp) {
      document.removeEventListener("mouseup", handleMouseUp);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });

  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div ref={containerRef} class="flex h-full w-full">
        <div class="h-full w-0 flex-1 overflow-auto">{p.children}</div>
        <div
          class="relative h-full flex-none"
          style={{ width: `${width()}px` }}
        >
          <div
            class="absolute -left-1 top-0 z-50 h-full w-2 cursor-col-resize hover:bg-[lightblue] active:bg-[lightblue]"
            onMouseDown={handleMouseDown}
          />
          <div class="h-full overflow-auto">{p.panelChildren}</div>
        </div>
      </div>
    </Show>
  );
}
