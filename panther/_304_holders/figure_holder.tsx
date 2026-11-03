// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createSignal,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  loadFontsWithTimeout,
  releaseCanvasGPUMemory,
  runWithDarkKeyColors,
  trackCanvas,
  untrackCanvas,
} from "./deps.ts";
import { effectiveScheme } from "./deps.ts";
import type {
  FigureInputs,
  FigureInputsBase,
  MeasuredFigure,
  MeasuredSceneFigure,
  Primitive,
  SizingMode,
  Transition,
} from "./deps.ts";
import {
  CanvasRenderContext,
  createCanvasBrowser,
  CustomFigureStyle,
  FigureRenderer,
  getStage2Sizing,
  isMeasuredSceneFigure,
  isShapePrimitive,
  lerp,
  phaseProgress,
  RectCoordsDims,
  renderSceneTransitionFrame,
  resolveTransition,
  transitionTotalMs,
} from "./deps.ts";

type Props = {
  figureInputs: FigureInputs;
  height: "flex" | "ideal" | number;
  // "reflow" (default): lay out at the container width (1 DU = 1 CSS px).
  // "zoom": lay out at the reference frame and scale to fit.
  sizing?: SizingMode;
  // The zoom frame's width in DU, REFERENCE_WIDTH_DU when absent: a sequence
  // lays every entry out at its own frame.
  frameWidthDu?: number;
  canvasElementId?: string;
  // Sharpness only (Stage 2). 1 = native-crisp on screen. Never changes layout.
  resolution?: number;
  // Called after each render with whether shrink-to-fit hit the floor and the
  // content still overflows.
  onCramped?: (cramped: boolean) => void;
  renderError?: (err: string) => JSX.Element;
  // "follow" (default): app-surface holders resolve key colors dark when
  // effectiveScheme() is dark. "light": document surfaces (slide canvases,
  // page previews) always resolve light — the canvas twin of ui-scheme-light.
  // Exports and stored snapshots never pass through this component, so they
  // stay light regardless.
  scheme?: "follow" | "light";
  // With a transition (filled from DEFAULT_TRANSITION), a change of inputs
  // animates: between two scene-bearing figures (a scene or a diagram) the
  // old scene tweens into the new through its three phases, redrawn at
  // device pixels every frame; any other pair keeps the old picture and cuts
  // to the new at half the transition's total. Without one the change
  // repaints at once.
  transition?: Partial<Transition>;
  // A click on the canvas, resolved to the topmost element under it.
  onElementClick?: (key: string) => void;
};

type SceneMeasured = MeasuredFigure & MeasuredSceneFigure<FigureInputsBase>;

// What is on the canvas: the figure painted (mid-transition, the frame's own
// scene at its scale), its primitives for hit testing and the DU frame the
// canvas shows.
type Shown = {
  measured: MeasuredFigure;
  primitives: Primitive[];
  frameW: number;
  frameH: number;
};

function runUnscoped<T>(fn: () => T): T {
  return fn();
}

export function FigureHolder(p: Props) {
  let div!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let animationFrameId: number | undefined;
  let canvasTrackingId: string | undefined;

  const [err, setErr] = createSignal<string>("");
  const [fontsLoaded, setFontsLoaded] = createSignal(false);

  // Assigned once per static paint and once per transition frame.
  let shown: Shown | undefined;
  // The transition in progress: where it started from, the frame height it
  // started at and when. A render during it (a resize to another width)
  // re-measures the target and continues from the same start, so the
  // transition survives.
  let running:
    | { from: SceneMeasured; fromH: number; start: number }
    | undefined;
  let transitionFrameId: number | undefined;
  // A cut waiting for the midpoint of its transition: the old picture stays
  // until then. A render during it (a resize) re-measures the target and
  // keeps the moment.
  let pendingCut:
    | { at: number; timer: ReturnType<typeof setTimeout> }
    | undefined;
  // Set when the inputs prop changes, read by the next render: a change of
  // inputs animates, a resize does not.
  let inputsChanged = false;
  createEffect(on(() => p.figureInputs, () => {
    inputsChanged = true;
  }, { defer: true }));
  // The container size of the last render. The canvas sets the container's
  // height except under "flex", so a resize that changes only the height is
  // the holder's own (a transition frame, a figure of another ideal height)
  // and is not re-rendered.
  let renderedDom: { w: number; h: number } | undefined;

  const fontKey = () => {
    const style = new CustomFigureStyle(p.figureInputs?.style);
    return style
      .getFontsToRegister()
      .map((f) => `${f.fontFamily}-${f.weight}-${f.italic}`)
      .join(",");
  };

  let fontLoadVersion = 0;

  createEffect(() => {
    const _key = fontKey();
    const style = new CustomFigureStyle(p.figureInputs?.style);
    const fonts = style.getFontsToRegister();

    const thisVersion = ++fontLoadVersion;
    setFontsLoaded(false);

    loadFontsWithTimeout(fonts).then(() => {
      if (thisVersion === fontLoadVersion) {
        setFontsLoaded(true);
      }
    });
  });

  // Schedules a render on the next animation frame, cancelling any pending one.
  function scheduleRender(parentDomW: number, parentDomH: number) {
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(() => {
      animationFrameId = undefined;
      renderFigure(parentDomW, parentDomH);
    });
  }

  function renderFigure(parentDomW: number, parentDomH: number) {
    // R1 guard: a 0-width container (hidden tab, collapsed flex, pre-layout)
    // would make devicePxPerDu = 0/0 = NaN → setTransform(NaN,…) → blank canvas.
    // Bail and wait for the next resize tick.
    if (parentDomW === 0) {
      return;
    }

    try {
      setErr("");
      renderedDom = { w: parentDomW, h: parentDomH };
      const sizing: SizingMode = p.sizing ?? "reflow";
      const resolution = p.resolution ?? 1;
      const dpr = globalThis.devicePixelRatio || 1;

      const { frameWidthDu: frameW, backingWidthPx: backingW, devicePxPerDu } =
        getStage2Sizing({
          sizing,
          displayedWidthPx: parentDomW,
          devicePixelRatio: dpr,
          resolution,
          referenceWidthDu: p.frameWidthDu,
        });

      const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
      const rc = new CanvasRenderContext(ctx, createCanvasBrowser);

      // Key colors resolve during measure (primitive generation), so the
      // scope must wrap every FigureRenderer entry — including the ideal-
      // height measure. The whole path is synchronous; runWithDarkKeyColors
      // resets on return.
      const runScoped = (p.scheme ?? "follow") === "follow" &&
          effectiveScheme() === "dark"
        ? runWithDarkKeyColors
        : runUnscoped;

      // Height: "ideal" measures the figure; "flex" fills the container; a
      // number is a fixed CSS-px height. Measurement reads the font, never
      // the canvas, so the canvas is sized when a picture is painted.
      let frameH: number;
      if (p.height === "ideal") {
        frameH = runScoped(() =>
          FigureRenderer.getIdealHeight(rc, frameW, p.figureInputs).idealH
        );
      } else {
        const domH = p.height === "flex" ? parentDomH : p.height;
        frameH = Math.round(domH * dpr * resolution) / devicePxPerDu;
      }

      const animate = inputsChanged;
      inputsChanged = false;
      const transition = p.transition === undefined
        ? undefined
        : resolveTransition(p.transition);
      runScoped(() => {
        const measured = FigureRenderer.measure(
          rc,
          new RectCoordsDims([0, 0, frameW, frameH]),
          p.figureInputs,
        );
        p.onCramped?.(measured.cramped ?? false);
        const paint = () =>
          paintStatic(
            ctx,
            rc,
            measured,
            devicePxPerDu,
            frameW,
            frameH,
            backingW,
          );
        // A change of the inputs prop animates from the picture as it is; a
        // resize re-measures and repaints at once, or continues the
        // transition or the cut in progress.
        const from = animate ? shown?.measured : running?.from;
        if (
          transition !== undefined && from !== undefined &&
          isMeasuredSceneFigure(from) && isMeasuredSceneFigure(measured)
        ) {
          cancelCut();
          if (animate || running === undefined) {
            running = {
              from,
              fromH: shown?.frameH ?? frameH,
              start: performance.now(),
            };
          }
          runTransition(
            ctx,
            rc,
            running,
            measured,
            transition,
            devicePxPerDu,
            frameW,
            frameH,
            backingW,
            runScoped,
          );
          return;
        }
        cancelTransition();
        const cutAt = animate
          ? (shown === undefined || transition === undefined
            ? undefined
            : performance.now() + transitionTotalMs(transition) / 2)
          : pendingCut?.at;
        if (transition !== undefined && cutAt !== undefined) {
          scheduleCut(() => runScoped(paint), cutAt);
          return;
        }
        cancelCut();
        paint();
      });
    } catch (e) {
      console.error("FigureHolder render error:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setErr("Bad figure config: " + errorMessage);
    }
  }

  // Assigning width or height resets the 2D transform, so size first, then
  // set the absolute transform: idempotent every frame, so a double
  // application is impossible. The guards realloc only on a real change.
  function sizeCanvas(
    ctx: CanvasRenderingContext2D,
    backingW: number,
    backingH: number,
    devicePxPerDu: number,
  ) {
    if (canvas.width !== backingW) {
      canvas.width = backingW;
    }
    if (canvas.height !== backingH) {
      canvas.height = backingH;
    }
    ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);
  }

  function paintStatic(
    ctx: CanvasRenderingContext2D,
    rc: CanvasRenderContext,
    measured: MeasuredFigure,
    devicePxPerDu: number,
    frameW: number,
    frameH: number,
    backingW: number,
  ) {
    sizeCanvas(
      ctx,
      backingW,
      Math.round(frameH * devicePxPerDu),
      devicePxPerDu,
    );
    ctx.clearRect(0, 0, frameW, frameH);
    FigureRenderer.render(rc, measured);
    shown = { measured, primitives: measured.primitives, frameW, frameH };
  }

  // Frames on their own animation-frame callback: each paints the target's
  // background, the tween's lowered shapes and both figures' surrounds, at
  // the transform the static render uses, so every frame is crisp at device
  // pixels. Under height "ideal" the canvas height follows the move from the
  // height the transition started at to the target's ideal height, so no
  // frame is clipped. Mid-transition the frame's own scene is what is shown,
  // so a further change starts from where the picture is.
  function runTransition(
    ctx: CanvasRenderingContext2D,
    rc: CanvasRenderContext,
    run: NonNullable<typeof running>,
    to: SceneMeasured,
    tr: Transition,
    devicePxPerDu: number,
    frameW: number,
    toH: number,
    backingW: number,
    runScoped: <T>(fn: () => T) => T,
  ) {
    cancelFrame();
    const totalMs = transitionTotalMs(tr);
    const followHeight = p.height === "ideal";
    const paint = () => {
      transitionFrameId = undefined;
      const elapsedMs = Math.min(totalMs, performance.now() - run.start);
      const ph = phaseProgress(tr, elapsedMs);
      const frameH = followHeight ? lerp(run.fromH, toH, ph.move) : toH;
      sizeCanvas(
        ctx,
        backingW,
        Math.round(frameH * devicePxPerDu),
        devicePxPerDu,
      );
      ctx.clearRect(0, 0, frameW, frameH);
      const frame = runScoped(() =>
        renderSceneTransitionFrame(rc, run.from, to, ph)
      );
      if (elapsedMs >= totalMs) {
        shown = { measured: to, primitives: to.primitives, frameW, frameH };
        running = undefined;
        return;
      }
      shown = {
        measured: {
          ...to,
          scene: frame.scene,
          sf: frame.sf,
          origin: frame.origin,
        },
        primitives: frame.primitives,
        frameW,
        frameH,
      };
      transitionFrameId = requestAnimationFrame(paint);
    };
    paint();
  }

  function cancelFrame() {
    if (transitionFrameId !== undefined) {
      cancelAnimationFrame(transitionFrameId);
      transitionFrameId = undefined;
    }
  }

  function cancelTransition() {
    cancelFrame();
    running = undefined;
  }

  function cancelCut() {
    if (pendingCut !== undefined) {
      clearTimeout(pendingCut.timer);
      pendingCut = undefined;
    }
  }

  // A pair that cannot tween keeps the old picture until `at`, the midpoint
  // of its transition, then cuts to the new one.
  function scheduleCut(paint: () => void, at: number) {
    cancelCut();
    pendingCut = {
      at,
      timer: setTimeout(() => {
        pendingCut = undefined;
        paint();
      }, Math.max(0, at - performance.now())),
    };
  }

  // The topmost shape under a click, by z then by paint order, names its
  // element.
  function handleClick(e: MouseEvent) {
    const onElementClick = p.onElementClick;
    if (onElementClick === undefined || shown === undefined) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scale = shown.frameW / rect.width;
    const x = (e.clientX - rect.left) * scale;
    const y = (e.clientY - rect.top) * scale;
    let hit: { key: string; z: number } | undefined;
    for (const shape of shown.primitives) {
      if (!isShapePrimitive(shape) || !shape.bounds.contains(x, y)) {
        continue;
      }
      const z = shape.zIndex ?? 0;
      if (hit === undefined || z >= hit.z) {
        hit = { key: shape.meta.element, z };
      }
    }
    if (hit !== undefined) {
      onElementClick(hit.key);
    }
  }

  createEffect(() => {
    // Track the inputs and the sizing props so a change to any of them
    // re-renders even without a resize.
    const loaded = fontsLoaded();
    const inputs = p.figureInputs;
    const _height = p.height;
    const _sizing = p.sizing;
    const _frameWidthDu = p.frameWidthDu;
    const _resolution = p.resolution;
    const _schemeProp = p.scheme;
    const _scheme = effectiveScheme();
    if (loaded && inputs) {
      const rect = div.getBoundingClientRect();
      scheduleRender(rect.width, rect.height);
    }
  });

  onMount(() => {
    if (canvas) {
      canvasTrackingId = trackCanvas(canvas, "FigureHolder");
    }

    const observer = new ResizeObserver((entries) => {
      if (resizeTimer !== undefined) {
        clearTimeout(resizeTimer);
      }
      // Debounce resize updates
      resizeTimer = setTimeout(() => {
        for (const entry of entries) {
          if (entry.contentBoxSize && p.figureInputs && fontsLoaded()) {
            const parentDomW = entry.contentBoxSize[0].inlineSize;
            const parentDomH = entry.contentBoxSize[0].blockSize;
            const own = renderedDom !== undefined &&
              parentDomW === renderedDom.w &&
              (p.height !== "flex" || parentDomH === renderedDom.h);
            if (!own) {
              scheduleRender(parentDomW, parentDomH);
            }
          }
        }
      }, 10);
    });
    observer.observe(div);

    onCleanup(() => observer.disconnect());
  });

  onCleanup(() => {
    if (resizeTimer !== undefined) {
      clearTimeout(resizeTimer);
    }
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }
    cancelFrame();
    cancelCut();
    if (canvasTrackingId) {
      untrackCanvas(canvasTrackingId);
    }
    if (canvas) {
      releaseCanvasGPUMemory(canvas);
    }
  });

  return (
    <div
      ref={div!}
      class="relative w-full data-[flexToContainer=true]:h-full data-[flexToContainer=true]:overflow-hidden"
      data-flexToContainer={p.height === "flex"}
    >
      <Show when={err()}>
        <Show
          when={p.renderError}
          fallback={
            <div class="ui-pad text-danger pointer-events-none absolute text-xs">
              {err()}
            </div>
          }
        >
          {(renderError) => renderError()(err())}
        </Show>
      </Show>
      <canvas
        ref={canvas!}
        id={p.canvasElementId}
        class="w-full"
        onClick={handleClick}
      />
    </div>
  );
}
