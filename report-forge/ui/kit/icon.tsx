// The editor's icons: a small subset of Tabler Icons (https://tabler.io/icons),
// MIT licensed, see ./TABLER_LICENSE.txt. Stroked paths on a 24 viewBox,
// drawn in the current text colour.

import { For, type JSX } from "solid-js";

const PATHS = {
  check: [
    "M5 12l5 5l10 -10",
  ],
  chevronLeft: [
    "M15 6l-6 6l6 6",
  ],
  photo: [
    "M15 8h.01",
    "M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z",
    "M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5",
    "M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3",
  ],
  x: [
    "M18 6l-12 12",
    "M6 6l12 12",
  ],
  upload: [
    "M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2",
    "M7 9l5 -5l5 5",
    "M12 4l0 12",
  ],
  trash: [
    "M4 7l16 0",
    "M10 11l0 6",
    "M14 11l0 6",
    "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12",
    "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3",
  ],
  pencil: [
    "M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4",
    "M13.5 6.5l4 4",
  ],
  download: [
    "M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2",
    "M7 11l5 5l5 -5",
    "M12 4l0 12",
  ],
  chart: [
    "M4 19l16 0",
    "M4 15l4 -6l4 2l4 -5l4 4",
  ],
  undo: [
    "M9 14l-4 -4l4 -4",
    "M5 10h11a4 4 0 1 1 0 8h-1",
  ],
  redo: [
    "M15 14l4 -4l-4 -4",
    "M19 10h-11a4 4 0 1 0 0 8h1",
  ],
  rotate: [
    "M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5",
  ],
  plus: [
    "M12 5l0 14",
    "M5 12l14 0",
  ],
  minus: [
    "M5 12l14 0",
  ],
  chevronRight: [
    "M9 6l6 6l-6 6",
  ],
  chevronDown: [
    "M6 9l6 6l6 -6",
  ],
  arrowRight: [
    "M5 12l14 0",
    "M15 16l4 -4",
    "M15 8l4 4",
  ],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof PATHS;

export function Icon(p: { name: IconName; class?: string }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={p.class}
      aria-hidden="true"
    >
      <For each={PATHS[p.name]}>{(d) => <path d={d} />}</For>
    </svg>
  );
}
