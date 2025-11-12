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

type ThreeColumnResizableProps = {
  leftChild?: JSX.Element;
  leftLabel?: string;
  onLeftExpand?: () => void;
  centerChild?: JSX.Element;
  centerLabel?: string;
  onCenterExpand?: () => void;
  rightChild?: JSX.Element;
  rightLabel?: string;
  onRightExpand?: () => void;
  startingWidths: [number, number, number];
  minWidths?: [number, number, number];
  maxWidths?: [number, number, number];
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

export function FrameThreeColumnResizable(p: ThreeColumnResizableProps) {
  const minWidths = p.minWidths ?? [100, 100, 100];
  const maxWidths = p.maxWidths ?? [2000, 2000, 2000];

  const [leftWidth, setLeftWidth] = createSignal(
    Math.max(minWidths[0], Math.min(maxWidths[0], p.startingWidths[0])),
  );
  const [centerWidth, setCenterWidth] = createSignal(
    Math.max(minWidths[1], Math.min(maxWidths[1], p.startingWidths[1])),
  );
  const [rightWidth, setRightWidth] = createSignal(
    Math.max(minWidths[2], Math.min(maxWidths[2], p.startingWidths[2])),
  );

  const [leftPercent, setLeftPercent] = createSignal<number>(0);
  const [centerPercent, setCenterPercent] = createSignal<number>(0);
  const [rightPercent, setRightPercent] = createSignal<number>(0);
  const [containerWidth, setContainerWidth] = createSignal<number>(0);

  let containerRef!: HTMLDivElement;
  let isDragging = false;
  let activeHandle: "left" | "right" | null = null;
  let handleMouseMove: ((e: MouseEvent) => void) | undefined;
  let handleMouseUp: (() => void) | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let rafId: number | null = null;

  onMount(() => {
    if (containerRef) {
      const initialWidth = containerRef.offsetWidth;
      setContainerWidth(initialWidth);
      setLeftPercent(leftWidth() / initialWidth);
      setCenterPercent(centerWidth() / initialWidth);
      setRightPercent(rightWidth() / initialWidth);

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newContainerWidth = entry.contentRect.width;
          setContainerWidth(newContainerWidth);

          setLeftWidth(
            Math.max(
              minWidths[0],
              Math.min(maxWidths[0], leftPercent() * newContainerWidth),
            ),
          );
          setCenterWidth(
            Math.max(
              minWidths[1],
              Math.min(maxWidths[1], centerPercent() * newContainerWidth),
            ),
          );
          setRightWidth(
            Math.max(
              minWidths[2],
              Math.min(maxWidths[2], rightPercent() * newContainerWidth),
            ),
          );
        }
      });

      resizeObserver.observe(containerRef);
    }
  });

  const handleMouseDown = (handle: "left" | "right") => (e: MouseEvent) => {
    isDragging = true;
    activeHandle = handle;
    e.preventDefault();

    const startX = e.clientX;
    const startLeftWidth = leftWidth();
    const startCenterWidth = centerWidth();
    const startRightWidth = rightWidth();

    handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        const deltaX = e.clientX - startX;

        if (activeHandle === "left") {
          const newLeftWidth = Math.max(
            minWidths[0],
            Math.min(maxWidths[0], startLeftWidth + deltaX),
          );
          const newCenterWidth = Math.max(
            minWidths[1],
            Math.min(maxWidths[1], startCenterWidth - deltaX),
          );

          setLeftWidth(newLeftWidth);
          setCenterWidth(newCenterWidth);

          if (containerWidth() > 0) {
            setLeftPercent(newLeftWidth / containerWidth());
            setCenterPercent(newCenterWidth / containerWidth());
          }
        } else if (activeHandle === "right") {
          const newCenterWidth = Math.max(
            minWidths[1],
            Math.min(maxWidths[1], startCenterWidth + deltaX),
          );
          const newRightWidth = Math.max(
            minWidths[2],
            Math.min(maxWidths[2], startRightWidth - deltaX),
          );

          setCenterWidth(newCenterWidth);
          setRightWidth(newRightWidth);

          if (containerWidth() > 0) {
            setCenterPercent(newCenterWidth / containerWidth());
            setRightPercent(newRightWidth / containerWidth());
          }
        }

        rafId = null;
      });
    };

    handleMouseUp = () => {
      isDragging = false;
      activeHandle = null;
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
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });

  const hasLeft = () => p.leftChild !== undefined && p.leftChild !== null;
  const hasCenter = () => p.centerChild !== undefined && p.centerChild !== null;
  const hasRight = () => p.rightChild !== undefined && p.rightChild !== null;

  const isLastVisible = (pane: "left" | "center" | "right") => {
    if (pane === "right" && hasRight()) return true;
    if (pane === "center" && hasCenter() && !hasRight()) return true;
    if (pane === "left" && hasLeft() && !hasCenter() && !hasRight()) {
      return true;
    }
    return false;
  };

  const collapsedPanes = () => {
    const panes: Array<{ label: string; onClick: () => void }> = [];
    if (!hasLeft() && p.leftLabel && p.onLeftExpand) {
      panes.push({ label: p.leftLabel, onClick: p.onLeftExpand });
    }
    if (!hasCenter() && p.centerLabel && p.onCenterExpand) {
      panes.push({ label: p.centerLabel, onClick: p.onCenterExpand });
    }
    if (!hasRight() && p.rightLabel && p.onRightExpand) {
      panes.push({ label: p.rightLabel, onClick: p.onRightExpand });
    }
    return panes;
  };

  return (
    <div ref={containerRef} class="flex h-full w-full">
      <Show when={collapsedPanes().length > 0}>
        <div class="flex flex-col h-full border-r border-primary">
          {collapsedPanes().map((pane) => (
            <div
              class="flex items-center justify-center w-8 flex-1 bg-base-200 border-b-2 border-primary cursor-pointer hover:bg-base-300 last:border-b-0"
              onClick={pane.onClick}
            >
              <div class="transform -rotate-90 whitespace-nowrap text-sm font-700">
                {pane.label}
              </div>
            </div>
          ))}
        </div>
      </Show>

      <Show when={hasLeft()}>
        <div
          class={isLastVisible("left")
            ? "relative h-full w-0 flex-1"
            : "relative h-full flex-none"}
          style={!isLastVisible("left") ? { width: `${leftWidth()}px` } : {}}
        >
          <div class="h-full overflow-auto">{p.leftChild}</div>
          <Show when={hasCenter() || hasRight()}>
            <div
              class="absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize hover:bg-[lightblue] active:bg-[lightblue]"
              onMouseDown={handleMouseDown("left")}
            />
          </Show>
        </div>
      </Show>

      <Show when={hasCenter()}>
        <div
          class={isLastVisible("center")
            ? "relative h-full w-0 flex-1"
            : "relative h-full flex-none"}
          style={!isLastVisible("center")
            ? { width: `${centerWidth()}px` }
            : {}}
        >
          <div class="h-full overflow-auto">{p.centerChild}</div>
          <Show when={hasRight()}>
            <div
              class="absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize hover:bg-[lightblue] active:bg-[lightblue]"
              onMouseDown={handleMouseDown("right")}
            />
          </Show>
        </div>
      </Show>

      <Show when={hasRight()}>
        <div class="relative h-full w-0 flex-1">
          <div class="h-full overflow-auto">{p.rightChild}</div>
        </div>
      </Show>

      <Show
        when={!hasLeft() && !hasCenter() && !hasRight() &&
          collapsedPanes().length === 0}
      >
        <div class="h-full w-full overflow-auto" />
      </Show>
    </div>
  );
}
