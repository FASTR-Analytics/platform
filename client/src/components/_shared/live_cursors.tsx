import { t3 } from "lib";
import type { Awareness } from "y-protocols/awareness";
import {
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

// =============================================================================
// Figma-style live cursors — shared broadcaster + overlay
// =============================================================================
//
// Each collaborator's mouse pointer renders as a colored arrow + name chip on
// the surfaces that support it (slide canvas, viz editor preview/panel). Rides
// the existing per-session Yjs awareness (ephemeral, relayed, never persisted)
// in its OWN field "pointer" — the fields "cursor" (yCollab text carets; nulled
// on every CodeMirror blur) and "user" (identity; rewritten wholesale on every
// presence_state) are reserved by existing machinery and must not be touched.
//
// Coordinates are stored in surface-relative spaces (slide DU / normalized
// rects / panel content-px), never viewport px, so they survive different
// window sizes, zoom and scroll positions. Cross-user drift on reflowing
// surfaces (the viz panel is user-resizable, the chart preview reflows) is
// accepted — cursors land approximately, not pixel-exactly, there.
//
// Liveness: y-protocols keeps connected peers alive automatically (internal
// ~15s local-state renewal our WS handlers ship) and sweeps silent peers after
// 30s (fires "change" with removed ids). The overlay additionally tracks its
// own per-client last-move time (bumped only when the pointer CONTENT changes,
// never trusting wire clocks) to fade the name chip after 4s and hide
// connected-but-idle cursors after 30s.
//
// CURSOR CHAT rides a second awareness field "pointerChat" ({ text } | null):
// press "/" over a cursor surface to type a short message that streams live in
// a bubble attached to your cursor (CursorChatInput below is the sender side;
// the overlay renders peers' bubbles). Cleared on Enter (after a short linger),
// Escape, disable, and unmount.

export type PointerAwarenessState =
  // x,y in slide DU (PAGE_WIDTH_DU × PAGE_HEIGHT_DU)
  | { surface: "slide"; scope: string; x: number; y: number }
  // x,y normalized 0..1 of the viz preview canvas rect
  | { surface: "viz-preview"; scope: string; x: number; y: number }
  // x normalized 0..1 of the tab scroll-container width; y in content px
  | {
    surface: "viz-panel";
    scope: string;
    tab: "data" | "style" | "text";
    x: number;
    y: number;
  };

const CHIP_FADE_MS = 4_000;
const IDLE_HIDE_MS = 30_000;
const DEFAULT_MIN_INTERVAL_MS = 50;
const CHAT_LINGER_MS = 4_000;
const CHAT_MAX_LEN = 120;

// Evaluated once — dropping the transform transition makes positions snap
// instead of glide, which is exactly what reduced-motion asks for.
const REDUCED_MOTION =
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Pure mappers (DOM-free; exercised by the scratch harness) ────────────────

type RectLike = { left: number; top: number; width: number; height: number };

/** Surface-space (DU) → viewport px, given the canvas rect. */
export function duToViewport(
  rect: RectLike,
  du: { x: number; y: number },
  duW: number,
  duH: number,
): { x: number; y: number } {
  return {
    x: rect.left + (du.x / duW) * rect.width,
    y: rect.top + (du.y / duH) * rect.height,
  };
}

/** Viewport px → surface-space (DU) — mirrors panther's getCanvasCoords. */
export function viewportToDu(
  rect: RectLike,
  client: { x: number; y: number },
  duW: number,
  duH: number,
): { x: number; y: number } {
  return {
    x: ((client.x - rect.left) / rect.width) * duW,
    y: ((client.y - rect.top) / rect.height) * duH,
  };
}

/** Viewport px → panel space (x normalized to rect width, y in content px). */
export function panelContentFromClient(
  rect: RectLike,
  scrollTop: number,
  client: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (client.x - rect.left) / rect.width,
    y: client.y - rect.top + scrollTop,
  };
}

/** Panel space → viewport px (inverse of panelContentFromClient). */
export function panelClientFromContent(
  rect: RectLike,
  scrollTop: number,
  content: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: rect.left + content.x * rect.width,
    y: rect.top + (content.y - scrollTop),
  };
}

// ── Broadcaster ───────────────────────────────────────────────────────────────

/**
 * Track the local mouse and publish it to the session awareness "pointer"
 * field. Document-level listeners (immune to the keyed re-creation of canvas
 * wrappers); rAF + min-interval throttled with a trailing send so the resting
 * position always ships; identical values (incl. repeated null) are never
 * re-sent — every setLocalStateField call is one WS message.
 */
export function createPointerBroadcast(opts: {
  /** Reactive — the session (and its awareness) may appear after mount. */
  awareness: () => Awareness | undefined | null;
  /** When false, the pointer is cleared and stays cleared (e.g. modal open). */
  enabled: () => boolean;
  /** Map a client (viewport) position into a surface pointer, or null when
   *  outside every broadcastable zone. */
  toPointer: (clientX: number, clientY: number) => PointerAwarenessState | null;
  minIntervalMs?: number;
}): { resend: () => void } {
  const minInterval = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  let lastClientX: number | undefined;
  let lastClientY: number | undefined;
  let rafId: number | undefined;
  let trailingTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSendTime = 0;
  let lastSentJson: string | undefined;

  function send(value: PointerAwarenessState | null) {
    const aw = opts.awareness();
    if (!aw) return;
    const json = JSON.stringify(value);
    if (json === lastSentJson) return;
    // Safe after awareness destroy: getLocalState() is null → no-op field set.
    aw.setLocalStateField("pointer", value);
    lastSentJson = json;
    lastSendTime = performance.now();
  }

  function fire() {
    if (!opts.enabled() || lastClientX === undefined || lastClientY === undefined) {
      send(null);
      return;
    }
    send(opts.toPointer(lastClientX, lastClientY));
  }

  function schedule() {
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = undefined;
      const wait = minInterval - (performance.now() - lastSendTime);
      if (wait > 0) {
        // Trailing send: coalesce into one shot at the interval boundary so
        // the final resting position is never dropped.
        if (trailingTimer) clearTimeout(trailingTimer);
        trailingTimer = setTimeout(() => {
          trailingTimer = undefined;
          fire();
        }, wait);
        return;
      }
      fire();
    });
  }

  function onMove(e: PointerEvent) {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    schedule();
  }
  // Sender scrolling under a stationary pointer changes what it points AT —
  // recompute from the stored client coords.
  function onScroll() {
    if (lastClientX !== undefined) schedule();
  }
  function onLeaveDocument() {
    send(null);
  }
  function onVisibility() {
    if (document.visibilityState === "hidden") send(null);
    else if (lastClientX !== undefined) schedule();
  }

  onMount(() => {
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("scroll", onScroll, true);
    document.documentElement.addEventListener("pointerleave", onLeaveDocument);
    document.addEventListener("visibilitychange", onVisibility);
  });

  // Disabled (modal over the surface, collab dropped) → clear immediately;
  // re-enabled → re-broadcast the current position without waiting for a move.
  createEffect(on(opts.enabled, (en) => {
    if (!en) send(null);
    else if (lastClientX !== undefined) schedule();
  }, { defer: true }));

  onCleanup(() => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("scroll", onScroll, true);
    document.documentElement.removeEventListener("pointerleave", onLeaveDocument);
    document.removeEventListener("visibilitychange", onVisibility);
    if (rafId !== undefined) cancelAnimationFrame(rafId);
    if (trailingTimer) clearTimeout(trailingTimer);
    send(null);
  });

  return {
    resend: () => {
      if (lastClientX !== undefined) schedule();
    },
  };
}

// ── Overlay ──────────────────────────────────────────────────────────────────

type CursorSprite = {
  clientID: number;
  name: string;
  color: string;
  x: number;
  y: number;
  chipVisible: boolean;
  /** Live cursor-chat message, when the peer is typing/showing one. */
  chat?: string;
};

/**
 * Render remote collaborators' cursors. `accepts` both gates (wrong surface/
 * scope/tab → null) and maps a pointer into viewport px against the CALLER's
 * current layout — it reads live rects, so it must be cheap.
 */
export function LiveCursorsOverlay(p: {
  awareness: Awareness | undefined | null;
  accepts: (pointer: PointerAwarenessState) => { x: number; y: number } | null;
  suppressed?: boolean;
}) {
  // Recompute triggers: layout movement (resize/scroll) + a 1s sweep that
  // drives the chip fade and idle hide without any awareness traffic.
  const [tick, setTick] = createSignal(0);
  const bump = () => setTick((t) => t + 1);
  // Bumped on awareness "change" (content changes + joins/leaves; keepalives
  // with deep-equal state deliberately don't fire it).
  const [version, setVersion] = createSignal(0);

  // Receiver-side move tracking: lastMoveAt bumps only when the pointer
  // CONTENT changes, so caret/user-field churn never resets idle timers.
  const moveInfo = new Map<number, { json: string; lastMoveAt: number }>();

  onMount(() => {
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    const sweep = setInterval(bump, 1000);
    onCleanup(() => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
      clearInterval(sweep);
    });
  });

  createEffect(() => {
    const aw = p.awareness;
    if (!aw) return;
    const onChange = (changes: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      const now = performance.now();
      for (const id of [...changes.added, ...changes.updated]) {
        const state = aw.getStates().get(id);
        const json = JSON.stringify(state?.pointer ?? null);
        const prev = moveInfo.get(id);
        if (!prev || prev.json !== json) {
          moveInfo.set(id, { json, lastMoveAt: now });
        }
      }
      for (const id of changes.removed) moveInfo.delete(id);
      setVersion((v) => v + 1);
    };
    aw.on("change", onChange);
    onCleanup(() => {
      aw.off("change", onChange);
      moveInfo.clear();
    });
  });

  const cursors = (): CursorSprite[] => {
    tick();
    version();
    const aw = p.awareness;
    if (!aw || p.suppressed) return [];
    const now = performance.now();
    const out: CursorSprite[] = [];
    for (const [clientID, state] of aw.getStates()) {
      if (clientID === aw.clientID) continue;
      const user = state.user as { name?: string; color?: string } | undefined;
      const pointer = state.pointer as PointerAwarenessState | null | undefined;
      if (!user?.name || !user.color || pointer == null) continue;
      const chatState = state.pointerChat as { text?: string } | null | undefined;
      const chat = typeof chatState?.text === "string"
        ? chatState.text.slice(0, CHAT_MAX_LEN)
        : undefined;
      const info = moveInfo.get(clientID);
      const idle = info ? now - info.lastMoveAt : 0;
      // An active chat message keeps the cursor (and its name) fully visible
      // even when the mouse itself has been still.
      if (idle > IDLE_HIDE_MS && !chat) continue;
      const pos = p.accepts(pointer);
      if (!pos) continue;
      out.push({
        clientID,
        name: user.name,
        color: user.color,
        x: pos.x,
        y: pos.y,
        chipVisible: idle < CHIP_FADE_MS || !!chat,
        chat,
      });
    }
    return out;
  };

  return (
    <Portal mount={document.body}>
      <div class="pointer-events-none fixed inset-0 z-[90]">
        <For each={cursors()}>
          {(c) => (
            <div
              class="pointer-events-none absolute left-0 top-0"
              style={{
                transform: `translate(${c.x}px, ${c.y}px)`,
                "will-change": "transform",
                ...(REDUCED_MOTION ? {} : { transition: "transform 100ms linear" }),
              }}
            >
              {/* Figma-style arrow; hotspot at the SVG origin. */}
              <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
                <path
                  d="M1 1 L1 13.5 L4.2 10.6 L6.4 15.8 L8.9 14.7 L6.7 9.6 L11 9.6 Z"
                  fill={c.color}
                  stroke="white"
                  stroke-width="1.2"
                  stroke-linejoin="round"
                />
              </svg>
              <div
                class="absolute whitespace-nowrap rounded px-1 text-[10px] font-semibold text-white"
                style={{
                  left: "12px",
                  top: "15px",
                  "background-color": c.color,
                  opacity: c.chipVisible ? 1 : 0,
                  transition: "opacity 500ms",
                }}
              >
                {c.name}
              </div>
              <Show when={c.chat}>
                <div
                  class="absolute rounded-2xl px-2.5 py-1 text-xs text-white shadow-md"
                  style={{
                    left: "12px",
                    top: "33px",
                    "background-color": c.color,
                    "max-width": "240px",
                    width: "max-content",
                    "overflow-wrap": "break-word",
                  }}
                >
                  {c.chat}
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
}

// ── Cursor chat (sender side) ─────────────────────────────────────────────────

/**
 * Figma-style cursor chat: press "/" while over a cursor surface to open a
 * small input attached to your pointer; what you type streams live into the
 * "pointerChat" awareness field so peers see it in a bubble on your cursor.
 * Enter keeps the message up for a few seconds; Escape discards it.
 */
export function CursorChatInput(p: {
  awareness: () => Awareness | undefined | null;
  /** Same gate as the surface's pointer broadcaster. */
  enabled: () => boolean;
  /** True when the given viewport point is over a broadcastable zone (reuse
   *  the surface's toPointer: `(x, y) => toPointer(x, y) !== null`). */
  isOverSurface: (clientX: number, clientY: number) => boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [text, setText] = createSignal("");
  const [pos, setPos] = createSignal({ x: 0, y: 0 });
  let inputEl: HTMLInputElement | undefined;
  let lastX = 0;
  let lastY = 0;
  let lingerTimer: ReturnType<typeof setTimeout> | undefined;

  function sendChat(value: string | null) {
    // Safe after awareness destroy (setLocalStateField no-ops).
    p.awareness()?.setLocalStateField(
      "pointerChat",
      value ? { text: value } : null,
    );
  }
  function clearNow() {
    if (lingerTimer) clearTimeout(lingerTimer);
    lingerTimer = undefined;
    sendChat(null);
  }
  function close(commit: boolean) {
    // Re-entry guard: closing unmounts the focused input, which fires its own
    // blur → close(true) again — by then the text is cleared and the second
    // pass would take the discard branch and kill the linger immediately.
    if (!open()) return;
    setOpen(false);
    const t = text().trim();
    setText("");
    if (commit && t) {
      // Leave the message on the cursor briefly, then clear it for everyone.
      if (lingerTimer) clearTimeout(lingerTimer);
      lingerTimer = setTimeout(() => {
        lingerTimer = undefined;
        sendChat(null);
      }, CHAT_LINGER_MS);
    } else {
      clearNow();
    }
  }

  function onDocKeyDown(e: KeyboardEvent) {
    if (open() || e.key !== "/" || !p.enabled()) return;
    const target = e.target as HTMLElement | null;
    // Never hijack "/" from real text inputs (CodeMirror, forms).
    if (
      target &&
      target.closest("input, textarea, [contenteditable='true'], .cm-editor")
    ) {
      return;
    }
    if (!p.isOverSurface(lastX, lastY)) return;
    e.preventDefault();
    if (lingerTimer) {
      clearTimeout(lingerTimer);
      lingerTimer = undefined;
    }
    sendChat(null);
    setPos({ x: lastX, y: lastY });
    setOpen(true);
    queueMicrotask(() => inputEl?.focus());
  }
  function onMove(e: PointerEvent) {
    lastX = e.clientX;
    lastY = e.clientY;
    if (open()) setPos({ x: lastX, y: lastY }); // the bubble follows the cursor
  }

  onMount(() => {
    document.addEventListener("keydown", onDocKeyDown);
    document.addEventListener("pointermove", onMove, { passive: true });
  });
  // Surface covered / collab dropped → discard any open or lingering message.
  createEffect(on(p.enabled, (en) => {
    if (!en) {
      setOpen(false);
      setText("");
      clearNow();
    }
  }, { defer: true }));
  onCleanup(() => {
    document.removeEventListener("keydown", onDocKeyDown);
    document.removeEventListener("pointermove", onMove);
    clearNow();
  });

  const ownColor = () => {
    const user = p.awareness()?.getLocalState()?.user as
      | { color?: string }
      | undefined;
    return user?.color ?? "#2563eb";
  };

  return (
    <Show when={open()}>
      <Portal mount={document.body}>
        <div
          class="fixed z-[95]"
          style={{ left: `${pos().x + 12}px`, top: `${pos().y + 16}px` }}
        >
          <input
            ref={inputEl}
            value={text()}
            maxLength={CHAT_MAX_LEN}
            placeholder={t3({
              en: "Say something…",
              fr: "Dites quelque chose…",
              pt: "Diga algo…",
            })}
            class="rounded-full px-3 py-1 text-sm text-white shadow-md outline-none placeholder:text-white/70"
            style={{
              "background-color": ownColor(),
              "min-width": "150px",
              "max-width": "260px",
            }}
            onInput={(e) => {
              setText(e.currentTarget.value);
              sendChat(e.currentTarget.value.trim() || null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation(); // keep editor shortcuts (undo, Esc) out
              if (e.key === "Enter") close(true);
              else if (e.key === "Escape") close(false);
            }}
            onBlur={() => close(true)}
          />
        </div>
      </Portal>
    </Show>
  );
}
