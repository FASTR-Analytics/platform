// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { clamp } from "../deps.ts";

type FrameBaseProps = {
  panelChildren?: JSX.Element;
  children: JSX.Element;
};

// A side frame creates the boundary between its panel and its content, so it
// draws the divider on that boundary. `noBorder` opts out — for a panel that is
// tonal against its content, or one drawing a deliberately non-default border
// colour. FrameTop is deliberately not in this family: its panel is a component
// that knows its own tone (see HeadingBar) and owns its own bottom edge.
type SideFrameProps = FrameBaseProps & {
  noBorder?: boolean;
};

type ResizableFrameProps = SideFrameProps & {
  startingWidth: number;
  minWidth?: number;
  maxWidth?: number;
  preventPanelResizeOnParentResize?: boolean;
  isShown?: boolean;
  onToggleShow?: () => void;
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
  noBorder?: boolean;
};

// The resize handle: a hit strip that paints nothing, with a 1px line inside
// it sitting exactly on the boundary pixel — the same pixel the non-resizable
// frames' wrapper border occupies, which is what makes swapping FrameLeft <->
// FrameLeftResizable a rename. The panel content div reserves that pixel with
// a 1px margin (mirroring border-r consuming a pixel of the border box) so
// the line never paints over content. The strip is symmetric about the
// boundary it grabs: 9px (4+1+4) around the 1px divider, or 8px (4+4) around
// the bare 0-width edge when `noBorder` — which renders no line at all; the
// cursor is the only affordance. Offsets and widths are exact-px arbitrary
// values, never spacing-scale utilities, so an app `--spacing` override
// cannot skew the geometry. The strip must stay borderless: a border on the
// panel wrapper would move its padding box and shift the hit area by 1px.
function ResizeHandleLine(p: { side: "left" | "right"; noBorder?: boolean }) {
  return (
    <Show when={!p.noBorder}>
      <div
        class="bg-border group-hover:bg-primary group-data-[dragging=true]:bg-primary absolute top-0 h-full w-px"
        classList={{
          "right-[4px]": p.side === "left",
          "left-[4px]": p.side === "right",
        }}
        style={{
          transition: "background-color var(--ui-dur-fast) var(--ui-ease)",
        }}
      />
    </Show>
  );
}

export function FrameLeft(p: SideFrameProps) {
  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div class="flex h-full w-full">
        <div
          class="h-full flex-none overflow-auto"
          classList={{ "border-r": !p.noBorder }}
        >
          {p.panelChildren}
        </div>
        <div class="h-full w-0 flex-1 overflow-auto">{p.children}</div>
      </div>
    </Show>
  );
}

export function FrameRight(p: SideFrameProps) {
  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div class="flex h-full w-full">
        <div class="h-full w-0 flex-1 overflow-auto">{p.children}</div>
        <div
          class="h-full flex-none overflow-auto"
          classList={{ "border-l": !p.noBorder }}
        >
          {p.panelChildren}
        </div>
      </div>
    </Show>
  );
}

export function FrameTop(p: FrameBaseProps) {
  return (
    <div class="flex h-full w-full flex-col">
      <Show when={p.panelChildren}>
        <div class="w-full flex-none overflow-auto">{p.panelChildren}</div>
      </Show>
      <div class="h-0 w-full flex-1 overflow-auto">{p.children}</div>
    </div>
  );
}

type ResizablePanelOptions = {
  side: "left" | "right";
  startingWidth: () => number;
  minWidth: () => number;
  maxWidth: () => number;
  // Keep the panel's share of the container as the container resizes.
  followContainer: boolean;
  isShown?: () => boolean;
};

// One resizable panel: its width, the drag handle's handlers, and the
// container observation that keeps the width proportional. Every resizable
// frame is one or two of these.
function createResizablePanel(o: ResizablePanelOptions) {
  const [actualWidth, setActualWidth] = createSignal(
    clamp(o.startingWidth(), o.minWidth(), o.maxWidth()),
  );
  const displayWidth = createMemo(() =>
    o.isShown?.() === false ? 0 : actualWidth()
  );
  const [targetPercentage, setTargetPercentage] = createSignal<number>(0);
  const [containerWidth, setContainerWidth] = createSignal<number>(0);
  // A signal, not a `let`: the handle styles from it. `:active` cannot cover a
  // drag (once the pointer leaves the 8px strip mid-drag both :hover and
  // :active drop), so the drag state has to be projected as a data attribute.
  const [isDragging, setIsDragging] = createSignal(false);
  let handleMouseMove: ((e: MouseEvent) => void) | undefined;
  let handleMouseUp: (() => void) | undefined;
  let resizeObserver: ResizeObserver | undefined;

  function observe(container: HTMLDivElement) {
    const initialWidth = container.offsetWidth;
    setContainerWidth(initialWidth);
    setTargetPercentage(actualWidth() / initialWidth);
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        batch(() => {
          const newContainerWidth = entry.contentRect.width;
          setContainerWidth(newContainerWidth);
          setActualWidth(
            clamp(
              targetPercentage() * newContainerWidth,
              o.minWidth(),
              o.maxWidth(),
            ),
          );
        });
      }
    });
    resizeObserver.observe(container);
  }

  function reset() {
    const width = clamp(o.startingWidth(), o.minWidth(), o.maxWidth());
    batch(() => {
      setActualWidth(width);
      if (containerWidth() > 0) {
        setTargetPercentage(width / containerWidth());
      }
    });
  }

  const handleMouseDown = (e: MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = actualWidth();

    handleMouseMove = (e: MouseEvent) => {
      if (!isDragging()) return;
      // A right panel grows as the pointer moves left.
      const deltaX = o.side === "left"
        ? e.clientX - startX
        : startX - e.clientX;
      const newWidth = clamp(startWidth + deltaX, o.minWidth(), o.maxWidth());
      batch(() => {
        setActualWidth(newWidth);
        if (o.followContainer && containerWidth() > 0) {
          setTargetPercentage(newWidth / containerWidth());
        }
      });
    };

    handleMouseUp = () => {
      setIsDragging(false);
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
    resizeObserver?.disconnect();
  });

  return { displayWidth, handleMouseDown, isDragging, observe, reset };
}

function createFramePanel(p: ResizableFrameProps, side: "left" | "right") {
  const panel = createResizablePanel({
    side,
    startingWidth: () => p.startingWidth,
    minWidth: () => p.minWidth ?? 100,
    maxWidth: () => p.maxWidth ?? 600,
    followContainer: !p.preventPanelResizeOnParentResize,
    isShown: () => p.isShown !== false,
  });
  return {
    ...panel,
    setContainerRef: (el: HTMLDivElement) => {
      if (!p.preventPanelResizeOnParentResize) {
        onMount(() => panel.observe(el));
      }
    },
  };
}

export function FrameLeftResizable(p: ResizableFrameProps) {
  const { setContainerRef, displayWidth, handleMouseDown, isDragging } =
    createFramePanel(p, "left");

  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div ref={setContainerRef} class="flex h-full w-full">
        <div
          class="relative h-full flex-none"
          style={{ width: `${displayWidth()}px` }}
        >
          <div
            class="h-full overflow-auto"
            classList={{ "mr-px": !p.noBorder }}
            style={{ display: p.isShown === false ? "none" : "block" }}
          >
            {p.panelChildren}
          </div>
          <div
            class="group absolute -right-[4px] top-0 z-50 h-full cursor-col-resize"
            classList={{ "w-[9px]": !p.noBorder, "w-[8px]": !!p.noBorder }}
            onMouseDown={handleMouseDown}
            data-dragging={isDragging()}
            style={{ display: p.isShown === false ? "none" : "block" }}
          >
            <ResizeHandleLine side="left" noBorder={p.noBorder} />
          </div>
        </div>
        <div class="h-full w-0 flex-1 overflow-auto">{p.children}</div>
      </div>
    </Show>
  );
}

export function FrameRightResizable(p: ResizableFrameProps) {
  const { setContainerRef, displayWidth, handleMouseDown, isDragging } =
    createFramePanel(p, "right");

  return (
    <Show
      when={p.panelChildren}
      fallback={<div class="h-full w-full overflow-auto">{p.children}</div>}
    >
      <div ref={setContainerRef} class="flex h-full w-full">
        <div class="h-full w-0 flex-1 overflow-auto">{p.children}</div>
        <div
          class="relative h-full flex-none"
          style={{ width: `${displayWidth()}px` }}
        >
          <div
            class="group absolute -left-[4px] top-0 z-50 h-full cursor-col-resize"
            classList={{ "w-[9px]": !p.noBorder, "w-[8px]": !!p.noBorder }}
            onMouseDown={handleMouseDown}
            data-dragging={isDragging()}
            style={{ display: p.isShown === false ? "none" : "block" }}
          >
            <ResizeHandleLine side="right" noBorder={p.noBorder} />
          </div>
          <div
            class="h-full overflow-auto"
            classList={{ "ml-px": !p.noBorder }}
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
  const minWidths = () => p.minWidths ?? [100, 100];
  const maxWidths = () => p.maxWidths ?? [2000, 2000];

  const left = createResizablePanel({
    side: "left",
    startingWidth: () => p.startingWidths[0],
    minWidth: () => minWidths()[0],
    maxWidth: () => maxWidths()[0],
    followContainer: true,
  });
  const right = createResizablePanel({
    side: "right",
    startingWidth: () => p.startingWidths[1],
    minWidth: () => minWidths()[1],
    maxWidth: () => maxWidths()[1],
    followContainer: true,
  });

  let containerRef!: HTMLDivElement;
  onMount(() => {
    left.observe(containerRef);
    right.observe(containerRef);
  });

  createEffect(() => {
    if (p.resetKey !== undefined) {
      untrack(() => {
        left.reset();
        right.reset();
      });
    }
  });

  const hasLeft = createMemo(
    () => p.leftChild !== undefined && p.leftChild !== null,
  );
  const hasRight = createMemo(
    () => p.rightChild !== undefined && p.rightChild !== null,
  );

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
            style={{ width: `${left.displayWidth()}px` }}
          >
            <div
              class="h-full overflow-auto"
              classList={{ "mr-px": !p.noBorder }}
            >
              {p.leftChild}
            </div>
            <div
              class="group absolute -right-[4px] top-0 z-50 h-full cursor-col-resize"
              classList={{ "w-[9px]": !p.noBorder, "w-[8px]": !!p.noBorder }}
              data-dragging={left.isDragging()}
              onMouseDown={left.handleMouseDown}
            >
              <ResizeHandleLine side="left" noBorder={p.noBorder} />
            </div>
          </div>
        </Show>

        <div class="relative h-full w-0 flex-1">
          <div
            class="h-full overflow-auto"
            classList={{ "mr-px": hasRight() && !p.noBorder }}
          >
            {p.centerChild}
          </div>
          <Show when={hasRight()}>
            {
              /* Rendered on the CENTRE pane, so its line occupies the centre
                pane's last pixel rather than the right pane's first: the same
                boundary, and the one handle whose pane is not the pane the
                divider "belongs" to. */
            }
            <div
              class="group absolute -right-[4px] top-0 z-50 h-full cursor-col-resize"
              classList={{ "w-[9px]": !p.noBorder, "w-[8px]": !!p.noBorder }}
              data-dragging={right.isDragging()}
              onMouseDown={right.handleMouseDown}
            >
              <ResizeHandleLine side="left" noBorder={p.noBorder} />
            </div>
          </Show>
        </div>

        <Show when={hasRight()}>
          <div
            class="relative h-full flex-none"
            style={{ width: `${right.displayWidth()}px` }}
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
                class="ui-hoverable-base-200 ui-focusable border-primary flex h-10 flex-1 items-center justify-center border-r px-3 last:border-r-0"
                role="button"
                tabindex="0"
                onClick={pane.onClick}
                onKeyDown={(evt) => {
                  if (evt.key === "Enter" || evt.key === " ") {
                    evt.preventDefault();
                    pane.onClick();
                  }
                }}
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
