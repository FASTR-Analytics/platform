// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createSignal,
  type JSX,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { Button } from "../form_inputs/button.tsx";

type FrameProps = {
  panelChildren?: JSX.Element;
  children: JSX.Element;
  allowShowHide?: boolean;
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
  resetKey?: string | number;
  hiddenTabColor?: string;
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
            class="hover:bg-primary/20 active:bg-primary/20 absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize"
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
            class="hover:bg-primary/20 active:bg-primary/20 absolute -left-1 top-0 z-50 h-full w-2 cursor-col-resize"
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

  const hasLeft = () => p.leftChild !== undefined && p.leftChild !== null;
  const hasCenter = () => p.centerChild !== undefined && p.centerChild !== null;
  const hasRight = () => p.rightChild !== undefined && p.rightChild !== null;

  const normalizeWidths = () => {
    const visiblePanes = [hasLeft(), hasCenter(), hasRight()];
    const visibleCount = visiblePanes.filter(Boolean).length;

    if (visibleCount === 0) return;

    const originalWidths = p.startingWidths;
    const totalOriginalWidth = visiblePanes.reduce(
      (sum, isVisible, i) => sum + (isVisible ? originalWidths[i] : 0),
      0,
    );

    const currentContainerWidth = containerWidth() ||
      containerRef?.offsetWidth || 1;

    if (hasLeft()) {
      const normalizedWidth = (originalWidths[0] / totalOriginalWidth) *
        currentContainerWidth;
      const clampedWidth = Math.max(
        minWidths[0],
        Math.min(maxWidths[0], normalizedWidth),
      );
      setLeftWidth(clampedWidth);
      setLeftPercent(clampedWidth / currentContainerWidth);
    }

    if (hasCenter()) {
      const normalizedWidth = (originalWidths[1] / totalOriginalWidth) *
        currentContainerWidth;
      const clampedWidth = Math.max(
        minWidths[1],
        Math.min(maxWidths[1], normalizedWidth),
      );
      setCenterWidth(clampedWidth);
      setCenterPercent(clampedWidth / currentContainerWidth);
    }

    if (hasRight()) {
      const normalizedWidth = (originalWidths[2] / totalOriginalWidth) *
        currentContainerWidth;
      const clampedWidth = Math.max(
        minWidths[2],
        Math.min(maxWidths[2], normalizedWidth),
      );
      setRightWidth(clampedWidth);
      setRightPercent(clampedWidth / currentContainerWidth);
    }
  };

  createEffect(() => {
    if (p.resetKey !== undefined) {
      p.resetKey;
      normalizeWidths();
    }
  });

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
    <div ref={containerRef} class="flex h-full w-full flex-col">
      <div class="flex h-0 w-full flex-1">
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
                class="absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize"
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
                class="absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize"
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
          when={!hasLeft() &&
            !hasCenter() &&
            !hasRight() &&
            collapsedPanes().length === 0}
        >
          <div class="h-full w-full overflow-auto" />
        </Show>
      </div>

      <Show when={collapsedPanes().length > 0}>
        <div class="border-primary flex w-full border-t">
          {collapsedPanes().map((pane) => (
            <div
              class={`ui-hoverable border-primary flex h-10 flex-1 items-center justify-center border-r px-3 last:border-r-0 ${
                p.hiddenTabColor ?? "bg-primary/20"
              }`}
              onClick={pane.onClick}
            >
              <div class="font-700 whitespace-nowrap text-sm">{pane.label}</div>
            </div>
          ))}
        </div>
      </Show>
    </div>
  );
}
