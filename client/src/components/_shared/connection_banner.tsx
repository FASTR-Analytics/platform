import { t3 } from "lib";
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";

// =============================================================================
// Collab connection banner — "Connection lost — reconnecting…" / "Live again"
// =============================================================================
//
// The collab WebSocket client (state/project/collab.ts) reports its connection
// transitions here; this module renders a small top-center pill so a user whose
// editors have silently fallen back to single-user mode KNOWS their edits are
// not syncing. States:
//   * "reconnecting" (a previously wanted connection dropped, retries running)
//       → warning pill with a Reload escape hatch, visible until recovery.
//   * reconnecting → "connected" → primary-green "Live again" flash for ~3s.
//   * "connecting" (initial connect) and "idle" (no project) render nothing —
//     a normal page load must not flash the banner.
//
// Mirrors presence_toasts.tsx: module signal + lazily render()-mounted host,
// imported BY collab.ts (one-way dependency, no cycle).

export type CollabConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting";

const RECOVERED_FLASH_MS = 3_000;

const REDUCED_MOTION = typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

const [connState, setConnState] = createSignal<CollabConnectionState>("idle");
const [justRecovered, setJustRecovered] = createSignal(false);
let recoveredTimer: ReturnType<typeof setTimeout> | undefined;
let hostMounted = false;

function ensureHost(): void {
  if (hostMounted) return;
  hostMounted = true;
  const el = document.createElement("div");
  document.body.appendChild(el);
  render(() => <ConnectionBannerHost />, el);
}

/** Feed every connection-state transition here (collab.ts). */
export function notifyCollabConnection(next: CollabConnectionState): void {
  const prev = connState();
  if (next === prev) return;
  setConnState(next);

  if (next === "reconnecting") {
    // First time we ever need UI — mount the host lazily.
    ensureHost();
    if (recoveredTimer) clearTimeout(recoveredTimer);
    recoveredTimer = undefined;
    setJustRecovered(false);
    return;
  }
  if (next === "connected" && prev === "reconnecting") {
    // Recovered from a real outage (never flashes on a normal initial connect).
    setJustRecovered(true);
    if (recoveredTimer) clearTimeout(recoveredTimer);
    recoveredTimer = setTimeout(() => {
      recoveredTimer = undefined;
      setJustRecovered(false);
    }, RECOVERED_FLASH_MS);
    return;
  }
  // idle / connecting / connected-from-connecting: nothing to show.
  if (recoveredTimer) clearTimeout(recoveredTimer);
  recoveredTimer = undefined;
  setJustRecovered(false);
}

function ConnectionBannerHost() {
  return (
    // Top-center, just below the header (same height as the presence toasts,
    // which sit top-right); above them in the stack.
    <div class="pointer-events-none fixed left-1/2 top-20 z-[96] -translate-x-1/2">
      <Show when={connState() === "reconnecting"}>
        <div class="bg-warning text-warning-content pointer-events-auto flex items-center gap-2 rounded px-3 py-2 text-sm shadow-floating">
          <span
            class="h-2.5 w-2.5 flex-none rounded-full bg-white/90"
            classList={{ "animate-pulse": !REDUCED_MOTION }}
          />
          <span>
            {t3({
              en: "Connection lost — reconnecting…",
              fr: "Connexion perdue — reconnexion…",
              pt: "Ligação perdida — a restabelecer…",
            })}
          </span>
          <button
            class="ml-1 font-semibold underline underline-offset-2"
            onClick={() => globalThis.location.reload()}
          >
            {t3({ en: "Reload", fr: "Recharger", pt: "Recarregar" })}
          </button>
        </div>
      </Show>
      <Show when={connState() === "connected" && justRecovered()}>
        <div class="bg-primary text-primary-content flex items-center gap-2 rounded px-3 py-2 text-sm shadow-floating">
          <span class="h-2.5 w-2.5 flex-none rounded-full bg-white/90" />
          <span>
            {t3({
              en: "Live again",
              fr: "De nouveau en direct",
              pt: "Em direto novamente",
            })}
          </span>
        </div>
      </Show>
    </div>
  );
}
