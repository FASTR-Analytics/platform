// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { clamp } from "../deps.ts";
import { Button } from "../form_inputs/button.tsx";

type FrameProps = {
  panelChildren?: JSX.Element;
  children: JSX.Element;
  allowShowHide?: boolean;
};

export type HoverOffset =
  | "offset-for-border-1-on-left"
  | "offset-for-border-2-on-left"
  | "offset-for-border-1-on-right"
  | "offset-for-border-2-on-right";

const HOVER_OFFSET_PX: Record<HoverOffset, number> = {
  "offset-for-border-1-on-left": -0.5,
  "offset-for-border-2-on-left": -1,
  "offset-for-border-1-on-right": 0.5,
  "offset-for-border-2-on-right": 1,
};

function hoverOffsetStyle(
  offset: HoverOffset | undefined,
): JSX.CSSProperties | undefined {
  if (!offset) return undefined;
  return { transform: `translateX(${HOVER_OFFSET_PX[offset]}px)` };
}

type ResizableFrameProps = FrameProps & {
  startingWidth: number;
  minWidth?: number;
  maxWidth?: number;
  preventPanelResizeOnParentResize?: boolean;
  isShown?: boolean;
  onToggleShow?: () => void;
  hoverOffset?: HoverOffset;
};

type ThreeColumnResizableProps = {
  leftChild?: JSX.Element;
  leftLabel?: string;
  onLeftExpand?: () => void;
  centerChild: JSX.Element;
  rightChild?: JSX.Element;
  rightLabel?: string;
  onRightExpand?: () => void;
  startingWidths: [number, number];
  minWidths?: [number, number];
  maxWidths?: [number, number];
  resetKey?: string | number;
  hiddenTabColor?: string;
  leftHandleHoverOffset?: HoverOffset;
  rightHandleHoverOffset?: HoverOffset;
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
  const [isPanelShown, setIsPanelShown] = createSignal(true);

  return (
    <div class="relative flex h-full w-full flex-col">
      <Show
        when={p.panelChildren && (!p.allowShowHide || isPanelShown())}
        // fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
      >
        <div class="w-full flex-none overflow-auto">{p.panelChildren}</div>
      </Show>
      <div class="h-0 w-full flex-1 overflow-auto">{p.children}</div>

      <Switch>
        <Match when={p.allowShowHide && isPanelShown()}>
          <div class="absolute right-4 top-4 z-50">
            <Button
              iconName="chevronUp"
              onClick={() => setIsPanelShown(false)}
              ariaLabel="Show panel"
              outline
            />
          </div>
        </Match>
        <Match when={p.allowShowHide}>
          <div class="absolute right-4 top-4 z-50">
            <Button
              iconName="chevronDown"
              onClick={() => setIsPanelShown(true)}
              ariaLabel="Show panel"
              outline
            />
          </div>
        </Match>
      </Switch>
    </div>
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
  const [actualWidth, setActualWidth] = createSignal(
    clamp(p.startingWidth, minWidth, maxWidth),
  );
  const displayWidth = createMemo(() =>
    p.isShown === false ? 0 : actualWidth()
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
      setTargetPercentage(actualWidth() / initialWidth);

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newContainerWidth = entry.contentRect.width;
          setContainerWidth(newContainerWidth);
          const newWidth = clamp(
            targetPercentage() * newContainerWidth,
            minWidth,
            maxWidth,
          );
          setActualWidth(newWidth);
        }
      });

      resizeObserver.observe(containerRef);
    }
  });

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = actualWidth();

    handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const newWidth = clamp(startWidth + deltaX, minWidth, maxWidth);
      setActualWidth(newWidth);

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
          style={{ width: `${displayWidth()}px` }}
        >
          <div
            class="h-full overflow-auto"
            style={{ display: p.isShown === false ? "none" : "block" }}
          >
            {p.panelChildren}
          </div>
          <div
            class="hover:bg-primary/20 active:bg-primary/20 absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize"
            onMouseDown={handleMouseDown}
            style={{
              display: p.isShown === false ? "none" : "block",
              ...hoverOffsetStyle(p.hoverOffset),
            }}
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
  const [actualWidth, setActualWidth] = createSignal(
    clamp(p.startingWidth, minWidth, maxWidth),
  );
  const displayWidth = createMemo(() =>
    p.isShown === false ? 0 : actualWidth()
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
      setTargetPercentage(actualWidth() / initialWidth);

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newContainerWidth = entry.contentRect.width;
          setContainerWidth(newContainerWidth);
          const newWidth = clamp(
            targetPercentage() * newContainerWidth,
            minWidth,
            maxWidth,
          );
          setActualWidth(newWidth);
        }
      });

      resizeObserver.observe(containerRef);
    }
  });

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = actualWidth();

    handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = startX - e.clientX; // Reversed for right panel
      const newWidth = clamp(startWidth + deltaX, minWidth, maxWidth);
      setActualWidth(newWidth);

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
          style={{ width: `${displayWidth()}px` }}
        >
          <div
            class="hover:bg-primary/20 active:bg-primary/20 absolute -left-1 top-0 z-50 h-full w-2 cursor-col-resize"
            onMouseDown={handleMouseDown}
            style={{
              display: p.isShown === false ? "none" : "block",
              ...hoverOffsetStyle(p.hoverOffset),
            }}
          />
          <div
            class="h-full overflow-auto"
            style={{ display: p.isShown === false ? "none" : "block" }}
          >
            {p.panelChildren}
          </div>
        </div>
      </div>
    </Show>
  );
}

export function FrameThreeColumnResizable(p: ThreeColumnResizableProps) {
  const minWidths = p.minWidths ?? [100, 100];
  const maxWidths = p.maxWidths ?? [2000, 2000];

  const [leftWidth, setLeftWidth] = createSignal(
    clamp(p.startingWidths[0], minWidths[0], maxWidths[0]),
  );
  const [rightWidth, setRightWidth] = createSignal(
    clamp(p.startingWidths[1], minWidths[1], maxWidths[1]),
  );

  const [leftPercent, setLeftPercent] = createSignal<number>(0);
  const [rightPercent, setRightPercent] = createSignal<number>(0);
  const [containerWidth, setContainerWidth] = createSignal<number>(0);

  let containerRef!: HTMLDivElement;
  let isDragging = false;
  let activeHandle: "left" | "right" | null = null;
  let handleMouseMove: ((e: MouseEvent) => void) | undefined;
  let handleMouseUp: (() => void) | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let rafId: number | null = null;

  const hasLeft = createMemo(
    () => p.leftChild !== undefined && p.leftChild !== null,
  );
  const hasRight = createMemo(
    () => p.rightChild !== undefined && p.rightChild !== null,
  );

  const resetWidths = () => {
    const currentContainerWidth = containerWidth() ||
      containerRef?.offsetWidth || 1;

    const newLeftWidth = clamp(p.startingWidths[0], minWidths[0], maxWidths[0]);
    const newRightWidth = clamp(
      p.startingWidths[1],
      minWidths[1],
      maxWidths[1],
    );

    setLeftWidth(newLeftWidth);
    setRightWidth(newRightWidth);
    setLeftPercent(newLeftWidth / currentContainerWidth);
    setRightPercent(newRightWidth / currentContainerWidth);
  };

  createEffect(() => {
    if (p.resetKey !== undefined) {
      resetWidths();
    }
  });

  onMount(() => {
    if (containerRef) {
      const initialWidth = containerRef.offsetWidth;
      setContainerWidth(initialWidth);
      setLeftPercent(leftWidth() / initialWidth);
      setRightPercent(rightWidth() / initialWidth);

      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newContainerWidth = entry.contentRect.width;
          setContainerWidth(newContainerWidth);

          setLeftWidth(
            clamp(
              leftPercent() * newContainerWidth,
              minWidths[0],
              maxWidths[0],
            ),
          );
          setRightWidth(
            clamp(
              rightPercent() * newContainerWidth,
              minWidths[1],
              maxWidths[1],
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
    const startRightWidth = rightWidth();

    handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        const deltaX = e.clientX - startX;

        if (activeHandle === "left") {
          const maxDelta = maxWidths[0] - startLeftWidth;
          const minDelta = minWidths[0] - startLeftWidth;
          const constrainedDelta = clamp(deltaX, minDelta, maxDelta);

          const newLeftWidth = startLeftWidth + constrainedDelta;

          setLeftWidth(newLeftWidth);

          if (containerWidth() > 0) {
            setLeftPercent(newLeftWidth / containerWidth());
          }
        } else if (activeHandle === "right") {
          const maxDelta = startRightWidth - minWidths[1];
          const minDelta = startRightWidth - maxWidths[1];
          const constrainedDelta = clamp(deltaX, minDelta, maxDelta);

          const newRightWidth = startRightWidth - constrainedDelta;

          setRightWidth(newRightWidth);

          if (containerWidth() > 0) {
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

  const collapsedPanes = () => {
    const panes: Array<{ label: string; onClick: () => void }> = [];
    if (!hasLeft() && p.leftLabel && p.onLeftExpand) {
      panes.push({ label: p.leftLabel, onClick: p.onLeftExpand });
    }
    if (!hasRight() && p.rightLabel && p.onRightExpand) {
      panes.push({ label: p.rightLabel, onClick: p.onRightExpand });
    }
    return panes;
  };

  return (
    <div ref={containerRef} class="flex h-full w-full flex-col">
      <div class="flex h-0 w-full flex-1">
        <Show when={hasLeft()}>
          <div
            class="relative h-full flex-none"
            style={{ width: `${leftWidth()}px` }}
          >
            <div class="h-full overflow-auto">{p.leftChild}</div>
            <div
              class="hover:bg-primary/20 active:bg-primary/20 absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize"
              style={hoverOffsetStyle(p.leftHandleHoverOffset)}
              onMouseDown={handleMouseDown("left")}
            />
          </div>
        </Show>

        <div class="relative h-full w-0 flex-1">
          <div class="h-full overflow-auto">{p.centerChild}</div>
          <Show when={hasRight()}>
            <div
              class="hover:bg-primary/20 active:bg-primary/20 absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize"
              style={hoverOffsetStyle(p.rightHandleHoverOffset)}
              onMouseDown={handleMouseDown("right")}
            />
          </Show>
        </div>

        <Show when={hasRight()}>
          <div
            class="relative h-full flex-none"
            style={{ width: `${rightWidth()}px` }}
          >
            <div class="h-full overflow-auto">{p.rightChild}</div>
          </div>
        </Show>
      </div>

      <Show when={collapsedPanes().length > 0}>
        <div class="border-primary flex w-full border-t">
          <For each={collapsedPanes()}>
            {(pane) => (
              <div
                class={`ui-hoverable border-primary flex h-10 flex-1 items-center justify-center border-r px-3 last:border-r-0 ${
                  p.hiddenTabColor ?? "bg-primary/20"
                }`}
                onClick={pane.onClick}
              >
                <div class="font-700 whitespace-nowrap text-sm">
                  {pane.label}
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
