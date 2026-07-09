import { t3 } from "lib";
import type { PresenceEntry } from "lib";
import { For, Show } from "solid-js";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const REDUCED_MOTION = typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Size = "sm" | "md";

export function PresenceAvatars(p: {
  peers: PresenceEntry[];
  size?: Size;
  max?: number;
  /** Show a pulsing "editing now" badge on peers actively applying edits —
   *  enabled on list cards (deck/report/viz), where present ≠ editing. */
  showEditingPulse?: boolean;
}) {
  const dim = () =>
    (p.size ?? "md") === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]";
  const max = () => p.max ?? 5;
  const shown = () => p.peers.slice(0, max());
  const overflow = () => Math.max(0, p.peers.length - max());
  // A stale idle flag never dims someone the server says is editing right now.
  const isDimmed = (peer: PresenceEntry) => Boolean(peer.idle && !peer.isEditing);
  const title = (peer: PresenceEntry) => {
    if (p.showEditingPulse && peer.isEditing) {
      return `${peer.name} — ${
        t3({ en: "editing now", fr: "modification en cours", pt: "a editar" })
      }`;
    }
    if (isDimmed(peer)) {
      return `${peer.name} — ${t3({ en: "idle", fr: "inactif", pt: "inativo" })}`;
    }
    return peer.name;
  };

  return (
    <Show when={p.peers.length > 0}>
      <div class="flex items-center -space-x-2">
        <For each={shown()}>
          {(peer) => (
            <div class="relative" title={title(peer)}>
              <div
                class={`${dim()} flex items-center justify-center overflow-hidden rounded-full font-semibold text-white ring-2 ring-white transition-opacity duration-500`}
                classList={{ "opacity-40 grayscale": isDimmed(peer) }}
                style={{ "background-color": peer.color }}
              >
                <Show
                  when={peer.avatarUrl}
                  fallback={<span>{initials(peer.name)}</span>}
                >
                  <img
                    src={peer.avatarUrl}
                    alt={peer.name}
                    class="h-full w-full object-cover"
                  />
                </Show>
              </div>
              <Show when={p.showEditingPulse && peer.isEditing}>
                {/* z-10: overlapped avatars paint later-over-earlier, so the
                    next avatar in the stack would otherwise cover this badge. */}
                <span
                  class="bg-primary absolute -right-0.5 -top-0.5 z-10 block h-2 w-2 rounded-full ring-1 ring-white"
                  classList={{ "animate-pulse": !REDUCED_MOTION }}
                />
              </Show>
            </div>
          )}
        </For>
        <Show when={overflow() > 0}>
          <div
            class={`${dim()} bg-base-300 text-base-content flex items-center justify-center rounded-full font-semibold ring-2 ring-white`}
          >
            +{overflow()}
          </div>
        </Show>
      </div>
    </Show>
  );
}
