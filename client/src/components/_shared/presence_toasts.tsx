import type { PresenceEntry } from "lib";
import { t3 } from "lib";
import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";

// =============================================================================
// Presence toasts — "Alice joined this deck"
// =============================================================================
//
// Small, transient, non-interactive pills (bottom-left) announcing when a
// collaborator joins or leaves the document YOU are currently in (deck, report,
// or visualization — from your own presence view). Driven by the presence
// snapshots the collab WebSocket already broadcasts; no server changes.
//
// Honesty/noise rules:
//   * People are keyed by EMAIL, not connection — a second tab is not a "join".
//   * Leaves are announced on a 4s grace so a refresh / reconnect (leave then
//     immediate rejoin) toasts nothing.
//   * Switching documents re-baselines silently — you are the one who moved;
//     the people already there did not "join".

const TOAST_MS = 4_000;
const LEAVE_GRACE_MS = 4_000;
const MAX_TOASTS = 4;

const REDUCED_MOTION = typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Toast host (lazily mounted into document.body on first toast) ────────────

type Toast = { id: number; text: string; color: string };

const [toasts, setToasts] = createSignal<Toast[]>([]);
let nextToastId = 1;
let hostMounted = false;

function ensureHost(): void {
  if (hostMounted) return;
  hostMounted = true;
  const el = document.createElement("div");
  document.body.appendChild(el);
  render(() => <PresenceToastHost />, el);
}

function pushToast(text: string, color: string): void {
  ensureHost();
  const id = nextToastId++;
  setToasts((ts) => [...ts.slice(-(MAX_TOASTS - 1)), { id, text, color }]);
  setTimeout(() => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, TOAST_MS);
}

function PresenceToastHost() {
  return (
    // top-20 sits just below the tallest editor header, clear of the AI /
    // settings / download buttons in the top-right corner.
    <div class="pointer-events-none fixed right-4 top-20 z-[95] flex flex-col items-end gap-2">
      <For each={toasts()}>
        {(t) => (
          <div
            class="bg-primary text-primary-content flex items-center gap-2 rounded px-3 py-2 text-sm shadow-lg"
            style={REDUCED_MOTION ? {} : { animation: "presence-toast-in 150ms ease-out" }}
          >
            <span
              class="h-2.5 w-2.5 flex-none rounded-full ring-1 ring-white/60"
              style={{ "background-color": t.color }}
            />
            <span>{t.text}</span>
          </div>
        )}
      </For>
      <style>
        {`@keyframes presence-toast-in {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
          }`}
      </style>
    </div>
  );
}

// ── Join/leave detection ──────────────────────────────────────────────────────

type Scope = { key: string; kind: "deck" | "report" | "po" } | null;

function scopeFromView(view: {
  deckId?: string;
  reportId?: string;
  poId?: string;
}): Scope {
  if (view.deckId) return { key: `deck:${view.deckId}`, kind: "deck" };
  if (view.reportId) return { key: `report:${view.reportId}`, kind: "report" };
  if (view.poId) return { key: `po:${view.poId}`, kind: "po" };
  return null;
}

function inScope(peer: PresenceEntry, scope: NonNullable<Scope>): boolean {
  if (scope.kind === "deck") return `deck:${peer.deckId}` === scope.key;
  if (scope.kind === "report") return `report:${peer.reportId}` === scope.key;
  return `po:${peer.poId}` === scope.key;
}

function joinedLabel(kind: "deck" | "report" | "po"): string {
  if (kind === "deck") {
    return t3({
      en: "joined this deck",
      fr: "a rejoint ce diaporama",
      pt: "entrou nesta apresentação",
    });
  }
  if (kind === "report") {
    return t3({
      en: "joined this report",
      fr: "a rejoint ce rapport",
      pt: "entrou neste relatório",
    });
  }
  return t3({
    en: "joined this visualization",
    fr: "a rejoint cette visualisation",
    pt: "entrou nesta visualização",
  });
}

function leftLabel(kind: "deck" | "report" | "po"): string {
  if (kind === "deck") {
    return t3({
      en: "left this deck",
      fr: "a quitté ce diaporama",
      pt: "saiu desta apresentação",
    });
  }
  if (kind === "report") {
    return t3({
      en: "left this report",
      fr: "a quitté ce rapport",
      pt: "saiu deste relatório",
    });
  }
  return t3({
    en: "left this visualization",
    fr: "a quitté cette visualisation",
    pt: "saiu desta visualização",
  });
}

let lastScopeKey: string | null = null;
let present = new Map<string, { name: string; color: string }>(); // email →
const pendingLeave = new Map<string, ReturnType<typeof setTimeout>>();

// Seam for harnesses: capture toast events without a DOM. Production uses the
// real pushToast; a harness swaps it to record (text, color) calls.
type ToastSink = (text: string, color: string) => void;
let toastSink: ToastSink = pushToast;
export function _setPresenceToastSinkForTests(sink: ToastSink | null): void {
  toastSink = sink ?? pushToast;
}

function clearPendingLeaves(): void {
  for (const timer of pendingLeave.values()) clearTimeout(timer);
  pendingLeave.clear();
}

/** Feed every presence snapshot here (collab.ts, on presence_state). */
export function notifyPresenceToasts(
  peers: PresenceEntry[],
  selfConnectionId: string | null,
  view: { deckId?: string; reportId?: string; poId?: string },
): void {
  const scope = scopeFromView(view);
  if (!scope) {
    lastScopeKey = null;
    present = new Map();
    clearPendingLeaves();
    return;
  }

  // My own tabs must never toast: exclude every connection with my email.
  const selfEmail = peers.find(
    (pe) => pe.connectionId === selfConnectionId,
  )?.email;
  const occupants = new Map<string, { name: string; color: string }>();
  for (const pe of peers) {
    if (pe.email === selfEmail) continue;
    if (!inScope(pe, scope)) continue;
    occupants.set(pe.email, { name: pe.name, color: pe.color });
  }

  // I moved to a different document: the people already there didn't "join".
  if (scope.key !== lastScopeKey) {
    lastScopeKey = scope.key;
    present = occupants;
    clearPendingLeaves();
    return;
  }

  // Joins (a rejoin within the leave grace is a reconnect — silent).
  for (const [email, who] of occupants) {
    const graceTimer = pendingLeave.get(email);
    if (graceTimer !== undefined) {
      clearTimeout(graceTimer);
      pendingLeave.delete(email);
      continue;
    }
    if (!present.has(email)) {
      toastSink(`${who.name} ${joinedLabel(scope.kind)}`, who.color);
    }
  }

  // Leaves, on a grace timer (refresh/reconnect churn stays silent).
  for (const [email, who] of present) {
    if (occupants.has(email) || pendingLeave.has(email)) continue;
    const scopeKeyAtSchedule = scope.key;
    pendingLeave.set(
      email,
      setTimeout(() => {
        pendingLeave.delete(email);
        // They are truly gone: drop them from the baseline too, or every later
        // presence snapshot would re-schedule this leave toast forever.
        present.delete(email);
        if (lastScopeKey === scopeKeyAtSchedule) {
          toastSink(`${who.name} ${leftLabel(scope.kind)}`, who.color);
        }
      }, LEAVE_GRACE_MS),
    );
  }

  // New baseline: occupants plus the grace-period people (still "present"
  // until their timer decides).
  const next = new Map(occupants);
  for (const email of pendingLeave.keys()) {
    const prev = present.get(email);
    if (prev && !next.has(email)) next.set(email, prev);
  }
  present = next;
}

/** Reset on disconnect / project switch (collab.ts disconnectCollab). */
export function resetPresenceToasts(): void {
  lastScopeKey = null;
  present = new Map();
  clearPendingLeaves();
}
