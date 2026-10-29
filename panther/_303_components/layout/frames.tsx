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
import type { PadSize } from "../types.ts";
import { padClass, spyClass } from "../_internal/pad_classes.ts";

// A JSX prop is a getter that builds its element on each read, so a frame
// reads its panel prop once (through `Show`'s accessor, or the three-column
// frame's memo) and renders what it read.
type FrameBaseProps = {
  panelChildren?: JSX.Element;
  children: JSX.Element;
  pad?: PadSize;
  spy?: PadSize;
  panelPad?: PadSize;
  panelSpy?: PadSize;
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
  pad?: PadSize;
  spy?: PadSize;
};

function slotClass(base: string, pad?: PadSize, spy?: PadSize): string {
  return [base, padClass(pad), spyClass(spy)].filter(Boolean).join(" ");
}

// The grab strip's width, spelled as literals in the handle classes below
// because Tailwind needs them literal. Two handles are centred on their own
// boundary, so their strips overlap whenever less than this separates the two
// boundaries, and the later one in the DOM then takes the earlier one's mouse
// events. The three-column frame keeps at least this much centre pane for that
// reason: without it a drag could leave the centre at 0, stack both handles on
// one pixel and strand the frame in a state no drag could leave.
const HANDLE_STRIP_PX = 9;
const HANDLE_STRIP_NO_BORDER_PX = 8;

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
      fallback={
        <div class={slotClass("h-full w-full overflow-auto", p.pad, p.spy)}>
          {p.children}
        </div>
      }
    >
      {(panel) => (
        <div class="flex h-full w-full">
          <div
            class={slotClass(
              "h-full flex-none overflow-auto",
              p.panelPad,
              p.panelSpy,
            )}
            classList={{ "border-r": !p.noBorder }}
          >
            {panel()}
          </div>
          {
            /* Every content slot of a side frame is a padded scroller inside an
              unpadded flex item, never a padded flex item: a flex item cannot
              shrink below its own padding, so a padded slot would stop the row
              fitting its container and push the panel beside it past the edge.
              The three-column centre pane has the same shape. */
          }
          <div class="h-full w-0 flex-1 overflow-hidden">
            <div
              class={slotClass("h-full w-full overflow-auto", p.pad, p.spy)}
            >
              {p.children}
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}

export function FrameRight(p: SideFrameProps) {
  return (
    <Show
      when={p.panelChildren}
      fallback={
        <div class={slotClass("h-full w-full overflow-auto", p.pad, p.spy)}>
          {p.children}
        </div>
      }
    >
      {(panel) => (
        <div class="flex h-full w-full">
          <div class="h-full w-0 flex-1 overflow-hidden">
            <div
              class={slotClass("h-full w-full overflow-auto", p.pad, p.spy)}
            >
              {p.children}
            </div>
          </div>
          <div
            class={slotClass(
              "h-full flex-none overflow-auto",
              p.panelPad,
              p.panelSpy,
            )}
            classList={{ "border-l": !p.noBorder }}
          >
            {panel()}
          </div>
        </div>
      )}
    </Show>
  );
}

export function FrameTop(p: FrameBaseProps) {
  return (
    <div class="flex h-full w-full flex-col">
      <Show when={p.panelChildren}>
        {(panel) => (
          <div
            class={slotClass(
              "w-full flex-none overflow-auto",
              p.panelPad,
              p.panelSpy,
            )}
          >
            {panel()}
          </div>
        )}
      </Show>
      <div class={slotClass("h-0 w-full flex-1 overflow-auto", p.pad, p.spy)}>
        {p.children}
      </div>
    </div>
  );
}

type ResizablePanelOptions = {
  side: "left" | "right";
  startingWidth: () => number;
  minWidth: () => number;
  maxWidth: () => number;
  // After the first drag, keep the panel's share of the container as the
  // container resizes.
  followContainer: boolean;
  isShown?: () => boolean;
  // Pixels of the container the panel may not take: what a sibling panel
  // already holds, plus any floor the frame keeps between them.
  reservedWidth?: () => number;
};

// One resizable panel: its width, the drag handle's handlers, and the container
// observation that bounds it and, after a drag in follow mode, keeps its share.
// Every resizable frame is one or two of these.
function createResizablePanel(o: ResizablePanelOptions) {
  // The width a drag chose, in pixels. Undefined until the first drag, so the
  // undragged panel reads the starting width live rather than a snapshot of it:
  // a consumer that derives its starting width from the window's width expects
  // the panel to track it until someone drags.
  const [draggedWidth, setDraggedWidth] = createSignal<number | undefined>(
    undefined,
  );
  // The share of the container a drag chose, in follow mode only. Undefined
  // until the first drag, so a panel shows the width it was given rather than
  // a share of however wide its container first happened to be: a frame made
  // in a container narrower than its starting width took a share above one and
  // then asked for more than the whole container at every later width. Taking
  // the share at the first measure at which the panel fits does not work
  // either, because as a window is dragged wider that measure comes when the
  // container is only just wide enough and the share is still close to one.
  const [targetPercentage, setTargetPercentage] = createSignal<
    number | undefined
  >(undefined);
  // Undefined until the observer's first callback. The container is measured
  // one way throughout, as the fraction the observer reports: reading it once
  // as a whole-number offsetWidth and then applying the share to fractional
  // contentRect widths moved a frame made again at a kept width by a fraction
  // of a pixel each time.
  const [containerWidth, setContainerWidth] = createSignal<
    number | undefined
  >(undefined);
  // The room the panel may take: its container, less what it may not have.
  // Undefined until the container has been measured.
  const room = () => {
    const c = containerWidth();
    if (c === undefined) return undefined;
    return Math.max(0, c - (o.reservedWidth?.() ?? 0));
  };

  // The panel may fill its room but never run past it, so the room caps the
  // minimum as well as the maximum: a container narrower than minWidth holds a
  // panel as wide as the container, where clamping to a maximum alone would
  // return the minimum and overflow.
  const boundWidth = (width: number): number => {
    const r = room();
    if (r === undefined) return clamp(width, o.minWidth(), o.maxWidth());
    return clamp(width, Math.min(o.minWidth(), r), Math.min(o.maxWidth(), r));
  };

  const chosenWidth = () => {
    const pct = targetPercentage();
    const c = containerWidth();
    if (o.followContainer && pct !== undefined && c !== undefined) {
      return pct * c;
    }
    return draggedWidth() ?? o.startingWidth();
  };

  const actualWidth = createMemo(() => boundWidth(chosenWidth()));
  const displayWidth = createMemo(() =>
    o.isShown?.() === false ? 0 : actualWidth()
  );

  // A signal, not a `let`: the handle styles from it. `:active` cannot cover a
  // drag (once the pointer leaves the 8px strip mid-drag both :hover and
  // :active drop), so the drag state has to be projected as a data attribute.
  const [isDragging, setIsDragging] = createSignal(false);
  let handleMouseMove: ((e: MouseEvent) => void) | undefined;
  let handleMouseUp: (() => void) | undefined;
  let resizeObserver: ResizeObserver | undefined;

  function observe(container: HTMLDivElement) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(container);
  }

  function reset() {
    // Back to the starting width in pixels, not to its share of whatever the
    // container happens to be now.
    batch(() => {
      setDraggedWidth(undefined);
      setTargetPercentage(undefined);
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
      const newWidth = boundWidth(startWidth + deltaX);
      batch(() => {
        setDraggedWidth(newWidth);
        const c = containerWidth();
        if (o.followContainer && c !== undefined && c > 0) {
          setTargetPercentage(newWidth / c);
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
    // Observed in both modes: preventPanelResizeOnParentResize stops the panel
    // following the container's width, not the container bounding it.
    setContainerRef: (el: HTMLDivElement) => {
      onMount(() => panel.observe(el));
    },
  };
}

export function FrameLeftResizable(p: ResizableFrameProps) {
  const { setContainerRef, displayWidth, handleMouseDown, isDragging } =
    createFramePanel(p, "left");

  return (
    <Show
      when={p.panelChildren}
      fallback={
        <div class={slotClass("h-full w-full overflow-auto", p.pad, p.spy)}>
          {p.children}
        </div>
      }
    >
      {(panel) => (
        <div ref={setContainerRef} class="flex h-full w-full">
          <div
            class="relative h-full flex-none"
            style={{ width: `${displayWidth()}px` }}
          >
            <div
              class={slotClass("h-full overflow-auto", p.panelPad, p.panelSpy)}
              classList={{ "mr-px": !p.noBorder }}
              style={{ display: p.isShown === false ? "none" : "block" }}
            >
              {panel()}
            </div>
            <div
              class="group absolute -right-[4px] top-0 z-40 h-full cursor-col-resize"
              classList={{ "w-[9px]": !p.noBorder, "w-[8px]": !!p.noBorder }}
              onMouseDown={handleMouseDown}
              data-dragging={isDragging()}
              style={{ display: p.isShown === false ? "none" : "block" }}
            >
              <ResizeHandleLine side="left" noBorder={p.noBorder} />
            </div>
          </div>
          <div class="h-full w-0 flex-1 overflow-hidden">
            <div
              class={slotClass("h-full w-full overflow-auto", p.pad, p.spy)}
            >
              {p.children}
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}

export function FrameRightResizable(p: ResizableFrameProps) {
  const { setContainerRef, displayWidth, handleMouseDown, isDragging } =
    createFramePanel(p, "right");

  return (
    <Show
      when={p.panelChildren}
      fallback={
        <div class={slotClass("h-full w-full overflow-auto", p.pad, p.spy)}>
          {p.children}
        </div>
      }
    >
      {(panel) => (
        <div ref={setContainerRef} class="flex h-full w-full">
          <div class="h-full w-0 flex-1 overflow-hidden">
            <div
              class={slotClass("h-full w-full overflow-auto", p.pad, p.spy)}
            >
              {p.children}
            </div>
          </div>
          <div
            class="relative h-full flex-none"
            style={{ width: `${displayWidth()}px` }}
          >
            <div
              class="group absolute -left-[4px] top-0 z-40 h-full cursor-col-resize"
              classList={{ "w-[9px]": !p.noBorder, "w-[8px]": !!p.noBorder }}
              onMouseDown={handleMouseDown}
              data-dragging={isDragging()}
              style={{ display: p.isShown === false ? "none" : "block" }}
            >
              <ResizeHandleLine side="right" noBorder={p.noBorder} />
            </div>
            <div
              class={slotClass("h-full overflow-auto", p.panelPad, p.panelSpy)}
              classList={{ "ml-px": !p.noBorder }}
              style={{ display: p.isShown === false ? "none" : "block" }}
            >
              {panel()}
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}

export function FrameThreeColumnResizable(p: ThreeColumnResizableProps) {
  const minWidths = () => p.minWidths ?? [100, 100];
  const maxWidths = () => p.maxWidths ?? [2000, 2000];

  const leftChild = createMemo(() => p.leftChild);
  const rightChild = createMemo(() => p.rightChild);
  const hasLeft = () => !!leftChild();
  const hasRight = () => !!rightChild();
  const stripWidth = () =>
    p.noBorder ? HANDLE_STRIP_NO_BORDER_PX : HANDLE_STRIP_PX;

  const left = createResizablePanel({
    side: "left",
    startingWidth: () => p.startingWidths[0],
    minWidth: () => minWidths()[0],
    maxWidth: () => maxWidths()[0],
    followContainer: true,
    // A collapsed pane is not rendered and holds no room, so it must report a
    // width of 0 to the panel that is bounded by what it leaves.
    isShown: hasLeft,
    reservedWidth: stripWidth,
  });
  const right = createResizablePanel({
    side: "right",
    startingWidth: () => p.startingWidths[1],
    minWidth: () => minWidths()[1],
    maxWidth: () => maxWidths()[1],
    followContainer: true,
    reservedWidth: () => left.displayWidth() + stripWidth(),
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
        <Show when={leftChild()}>
          {(child) => (
            <div
              class="relative h-full flex-none"
              style={{ width: `${left.displayWidth()}px` }}
            >
              <div
                class="h-full overflow-auto"
                classList={{ "mr-px": !p.noBorder }}
              >
                {child()}
              </div>
              <div
                class="group absolute -right-[4px] top-0 z-40 h-full cursor-col-resize"
                classList={{ "w-[9px]": !p.noBorder, "w-[8px]": !!p.noBorder }}
                data-dragging={left.isDragging()}
                onMouseDown={left.handleMouseDown}
              >
                <ResizeHandleLine side="left" noBorder={p.noBorder} />
              </div>
            </div>
          )}
        </Show>

        <div class="relative h-full w-0 flex-1">
          <div
            class={slotClass("h-full overflow-auto", p.pad, p.spy)}
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
              class="group absolute -right-[4px] top-0 z-40 h-full cursor-col-resize"
              classList={{ "w-[9px]": !p.noBorder, "w-[8px]": !!p.noBorder }}
              data-dragging={right.isDragging()}
              onMouseDown={right.handleMouseDown}
            >
              <ResizeHandleLine side="left" noBorder={p.noBorder} />
            </div>
          </Show>
        </div>

        <Show when={rightChild()}>
          {(child) => (
            <div
              class="relative h-full flex-none"
              style={{ width: `${right.displayWidth()}px` }}
            >
              <div class="h-full overflow-auto">{child()}</div>
            </div>
          )}
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
