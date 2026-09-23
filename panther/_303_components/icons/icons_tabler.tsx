// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import type { IconComponent, IconName } from "./icon_types.ts";

// Tabler Icons (https://tabler.io/icons) -- MIT licensed. See TABLER_LICENSE.txt.
// Stroked line glyphs on a 24 viewBox (vs Phosphor's filled 256 viewBox).

function TablerWrapper(
  p: { class?: string; children: JSX.Element },
) {
  return (
    <svg
      class={p.class ?? "h-[1.25em] w-[1.25em]"}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {p.children}
    </svg>
  );
}

function AlertCircleIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </TablerWrapper>
  );
}

function ArrowDownIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 5l0 14" />
      <path d="M16 15l-4 4" />
      <path d="M8 15l4 4" />
    </TablerWrapper>
  );
}

function ArrowLeftIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M5 12l14 0" />
      <path d="M5 12l6 6" />
      <path d="M5 12l6 -6" />
    </TablerWrapper>
  );
}

function ArrowRightIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M5 12l14 0" />
      <path d="M15 16l4 -4" />
      <path d="M15 8l4 4" />
    </TablerWrapper>
  );
}

function ArrowUpIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 5l0 14" />
      <path d="M16 9l-4 -4" />
      <path d="M8 9l4 -4" />
    </TablerWrapper>
  );
}

function ArrowsDiagonalIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M16 4l4 0l0 4" />
      <path d="M14 10l6 -6" />
      <path d="M8 20l-4 0l0 -4" />
      <path d="M4 20l6 -6" />
    </TablerWrapper>
  );
}

function ArrowsDiagonal2Icon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M16 20l4 0l0 -4" />
      <path d="M14 14l6 6" />
      <path d="M8 4l-4 0l0 4" />
      <path d="M4 4l6 6" />
    </TablerWrapper>
  );
}

function ArrowsDiagonalMinimizeIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M6 10h4v-4" />
      <path d="M4 4l6 6" />
      <path d="M18 14h-4v4" />
      <path d="M14 14l6 6" />
    </TablerWrapper>
  );
}

function ArrowsDiagonalMinimize2Icon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M18 10h-4v-4" />
      <path d="M20 4l-6 6" />
      <path d="M6 14h4v4" />
      <path d="M10 14l-6 6" />
    </TablerWrapper>
  );
}

function ArrowsUpDownIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M7 3l0 18" />
      <path d="M10 6l-3 -3l-3 3" />
      <path d="M20 18l-3 3l-3 -3" />
      <path d="M17 21l0 -18" />
    </TablerWrapper>
  );
}

function BackspaceIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M20 6a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-11l-5 -5a1.5 1.5 0 0 1 0 -2l5 -5l11 0" />
      <path d="M12 10l4 4m0 -4l-4 4" />
    </TablerWrapper>
  );
}

function BadgeIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M17 17v-13l-5 3l-5 -3v13l5 3z" />
    </TablerWrapper>
  );
}

function BellIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
      <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
    </TablerWrapper>
  );
}

function BookmarkIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4" />
    </TablerWrapper>
  );
}

function BoxIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
      <path d="M12 12l8 -4.5" />
      <path d="M12 12l0 9" />
      <path d="M12 12l-8 -4.5" />
    </TablerWrapper>
  );
}

function CalendarIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M4 11h16" />
      <path d="M11 15h1" />
      <path d="M12 15v3" />
    </TablerWrapper>
  );
}

function ChartIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 19l16 0" />
      <path d="M4 15l4 -6l4 2l4 -5l4 4" />
    </TablerWrapper>
  );
}

function CheckIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M5 12l5 5l10 -10" />
    </TablerWrapper>
  );
}

function ChevronDownIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M6 9l6 6l6 -6" />
    </TablerWrapper>
  );
}

function ChevronLeftIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M15 6l-6 6l6 6" />
    </TablerWrapper>
  );
}

function ChevronRightIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M9 6l6 6l-6 6" />
    </TablerWrapper>
  );
}

function ChevronUpIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M6 15l6 -6l6 6" />
    </TablerWrapper>
  );
}

function CircleXIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M10 10l4 4m0 -4l-4 4" />
    </TablerWrapper>
  );
}

function ClearAllIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M8 6h12" />
      <path d="M6 12h12" />
      <path d="M4 18h12" />
    </TablerWrapper>
  );
}

function ClockIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 7v5l3 3" />
    </TablerWrapper>
  );
}

function CodeIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M7 8l-4 4l4 4" />
      <path d="M17 8l4 4l-4 4" />
      <path d="M14 4l-4 16" />
    </TablerWrapper>
  );
}

function CopyIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
      <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
    </TablerWrapper>
  );
}

function DashboardIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M10 13a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M13.45 11.55l2.05 -2.05" />
      <path d="M6.4 20a9 9 0 1 1 11.2 0l-11.2 0" />
    </TablerWrapper>
  );
}

function DatabaseIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 6m-8 0a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" />
      <path d="M4 6v6a8 3 0 0 0 16 0v-6" />
      <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
    </TablerWrapper>
  );
}

function DatabaseImportIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3" />
      <path d="M4 6v6c0 1.657 3.582 3 8 3c.856 0 1.68 -.05 2.454 -.144m5.546 -2.856v-6" />
      <path d="M4 12v6c0 1.657 3.582 3 8 3c.171 0 .341 -.002 .51 -.006" />
      <path d="M19 22v-6" />
      <path d="M22 19l-3 -3l-3 3" />
    </TablerWrapper>
  );
}

function DocumentIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
      <path d="M9 9l1 0" />
      <path d="M9 13l6 0" />
      <path d="M9 17l6 0" />
    </TablerWrapper>
  );
}

function DownloadIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 11l5 5l5 -5" />
      <path d="M12 4l0 12" />
    </TablerWrapper>
  );
}

function EyeIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
      <path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />
    </TablerWrapper>
  );
}

function EyeOffIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" />
      <path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" />
      <path d="M3 3l18 18" />
    </TablerWrapper>
  );
}

function EraserIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" />
      <path d="M18 13.3l-6.3 -6.3" />
    </TablerWrapper>
  );
}

function FileIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    </TablerWrapper>
  );
}

function FilterIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227" />
    </TablerWrapper>
  );
}

function FilterFilledIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path
        d="M20 3h-16a1 1 0 0 0 -1 1v2.227l.008 .223a3 3 0 0 0 .772 1.795l4.22 4.641v8.114a1 1 0 0 0 1.316 .949l6 -2l.108 -.043a1 1 0 0 0 .576 -.906v-6.586l4.121 -4.12a3 3 0 0 0 .879 -2.123v-2.171a1 1 0 0 0 -1 -1z"
        fill="currentColor"
        stroke="none"
      />
    </TablerWrapper>
  );
}

function FoldIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 3v6l3 -3m-6 0l3 3" />
      <path d="M12 21v-6l3 3m-6 0l3 -3" />
      <path d="M4 12l1 0" />
      <path d="M9 12l1 0" />
      <path d="M14 12l1 0" />
      <path d="M19 12l1 0" />
    </TablerWrapper>
  );
}

function FolderIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
    </TablerWrapper>
  );
}

function GripVerticalIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="19" r="1" />
    </TablerWrapper>
  );
}

function HelpIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 16v.01" />
      <path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" />
    </TablerWrapper>
  );
}

function HelpSquareIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" />
      <path d="M12 16v.01" />
      <path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" />
    </TablerWrapper>
  );
}

function ImportIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3" />
    </TablerWrapper>
  );
}

function InfoIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 9h.01" />
      <path d="M11 12h1v4h1" />
    </TablerWrapper>
  );
}

function InfoSmallIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 9h.01" />
      <path d="M11 12h1v4h1" />
    </TablerWrapper>
  );
}

function InfoSquareIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" />
      <path d="M12 9h.01" />
      <path d="M11 12h1v4h1" />
    </TablerWrapper>
  );
}

function LayoutDashboardIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1" />
      <path d="M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1" />
      <path d="M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1" />
      <path d="M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1" />
    </TablerWrapper>
  );
}

function LayoutGridIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
    </TablerWrapper>
  );
}

function LifebuoyIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M15 15l3.35 3.35" />
      <path d="M9 15l-3.35 3.35" />
      <path d="M5.65 5.65l3.35 3.35" />
      <path d="M18.35 5.65l-3.35 3.35" />
    </TablerWrapper>
  );
}

function LoaderIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </TablerWrapper>
  );
}

function LockIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" />
      <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M8 11v-4a4 4 0 1 1 8 0v4" />
    </TablerWrapper>
  );
}

function LoginIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M15 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" />
      <path d="M21 12h-13l3 -3" />
      <path d="M11 15l-3 -3" />
    </TablerWrapper>
  );
}

function MaximizeIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
      <path d="M4 16v2a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
    </TablerWrapper>
  );
}

function MinimizeIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M15 19v-2a2 2 0 0 1 2 -2h2" />
      <path d="M15 5v2a2 2 0 0 0 2 2h2" />
      <path d="M5 15h2a2 2 0 0 1 2 2v2" />
      <path d="M5 9h2a2 2 0 0 0 2 -2v-2" />
    </TablerWrapper>
  );
}

function MinusIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M5 12l14 0" />
    </TablerWrapper>
  );
}

function MoreVerticalIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    </TablerWrapper>
  );
}

function MoveIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M18 9l3 3l-3 3" />
      <path d="M15 12h6" />
      <path d="M6 9l-3 3l3 3" />
      <path d="M3 12h6" />
      <path d="M9 18l3 3l3 -3" />
      <path d="M12 15v6" />
      <path d="M15 6l-3 -3l-3 3" />
      <path d="M12 3v6" />
    </TablerWrapper>
  );
}

function PackageIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
      <path d="M12 12l8 -4.5" />
      <path d="M12 12l0 9" />
      <path d="M12 12l-8 -4.5" />
      <path d="M16 5.25l-8 4.5" />
    </TablerWrapper>
  );
}

function PaperclipIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5" />
    </TablerWrapper>
  );
}

function PencilIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
      <path d="M13.5 6.5l4 4" />
    </TablerWrapper>
  );
}

function PhotoIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M15 8h.01" />
      <path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" />
      <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" />
      <path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />
    </TablerWrapper>
  );
}

function PlusIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </TablerWrapper>
  );
}

function PointerFilledIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path
        d="M3.039 4.277l3.904 13.563c.185 .837 .92 1.516 1.831 1.642l.17 .016a2.2 2.2 0 0 0 1.982 -1.006l.045 -.078l1.4 -2.072l4.05 4.05a2.067 2.067 0 0 0 2.924 0l1.047 -1.047c.388 -.388 .606 -.913 .606 -1.461l-.008 -.182a2.067 2.067 0 0 0 -.598 -1.28l-4.047 -4.048l2.103 -1.412c.726 -.385 1.18 -1.278 1.053 -2.189a2.2 2.2 0 0 0 -1.701 -1.845l-13.524 -3.89a1 1 0 0 0 -1.236 1.24z"
        fill="currentColor"
        stroke="none"
      />
    </TablerWrapper>
  );
}

function PresentationIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3 4l18 0" />
      <path d="M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10" />
      <path d="M12 16l0 4" />
      <path d="M9 20l6 0" />
      <path d="M8 12l3 -3l2 2l3 -3" />
    </TablerWrapper>
  );
}

function PresentationAnalyticsIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M9 12v-4" />
      <path d="M15 12v-2" />
      <path d="M12 12v-1" />
      <path d="M3 4h18" />
      <path d="M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10" />
      <path d="M12 16v4" />
      <path d="M9 20h6" />
    </TablerWrapper>
  );
}

function PrintIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" />
      <path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" />
      <path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" />
    </TablerWrapper>
  );
}

function QuestionMarkIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M8 8a3.5 3 0 0 1 3.5 -3h1a3.5 3 0 0 1 3.5 3a3 3 0 0 1 -2 3a3 4 0 0 0 -2 4" />
      <path d="M12 19l0 .01" />
    </TablerWrapper>
  );
}

function RedoIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M15 14l4 -4l-4 -4" />
      <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
    </TablerWrapper>
  );
}

function RefreshIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </TablerWrapper>
  );
}

function ReportIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
      <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
      <path d="M9 17v-4" />
      <path d="M12 17v-1" />
      <path d="M15 17v-2" />
    </TablerWrapper>
  );
}

function RestoreIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3.06 13a9 9 0 1 0 .49 -4.087" />
      <path d="M3 4.001v5h5" />
      <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    </TablerWrapper>
  );
}

function RotateIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5" />
    </TablerWrapper>
  );
}

function SaveIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" />
      <path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M14 4l0 4l-6 0l0 -4" />
    </TablerWrapper>
  );
}

function SearchIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M21 21l-6 -6" />
    </TablerWrapper>
  );
}

function SelectorIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M8 9l4 -4l4 4" />
      <path d="M16 15l-4 4l-4 -4" />
    </TablerWrapper>
  );
}

function SettingsIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </TablerWrapper>
  );
}

function SettingsCogIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12.003 21c-.732 .001 -1.465 -.438 -1.678 -1.317a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c.886 .215 1.325 .957 1.318 1.694" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M17.001 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M19.001 15.5v1.5" />
      <path d="M19.001 21v1.5" />
      <path d="M22.032 17.25l-1.299 .75" />
      <path d="M17.27 20l-1.3 .75" />
      <path d="M15.97 17.25l1.3 .75" />
      <path d="M20.733 20l1.3 .75" />
    </TablerWrapper>
  );
}

function SlideshowIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M15 6l.01 0" />
      <path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3l0 -8" />
      <path d="M3 13l4 -4a3 5 0 0 1 3 0l4 4" />
      <path d="M13 12l2 -2a3 5 0 0 1 3 0l3 3" />
      <path d="M8 21l.01 0" />
      <path d="M12 21l.01 0" />
      <path d="M16 21l.01 0" />
    </TablerWrapper>
  );
}

function SparklesIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z" />
    </TablerWrapper>
  );
}

function SwitchHorizontalIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M16 3l4 4l-4 4" />
      <path d="M10 7l10 0" />
      <path d="M8 13l-4 4l4 4" />
      <path d="M4 17l9 0" />
    </TablerWrapper>
  );
}

function TextIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M6 4l12 0" />
      <path d="M12 4l0 16" />
    </TablerWrapper>
  );
}

function TransformIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M3 6a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      <path d="M21 11v-3a2 2 0 0 0 -2 -2h-6l3 3m0 -6l-3 3" />
      <path d="M3 13v3a2 2 0 0 0 2 2h6l-3 -3m0 6l3 -3" />
      <path d="M15 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </TablerWrapper>
  );
}

function TrashIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </TablerWrapper>
  );
}

function UndoIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M9 14l-4 -4l4 -4" />
      <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
    </TablerWrapper>
  );
}

function UnfoldIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M8 7l4 -4l4 4" />
      <path d="M8 17l4 4l4 -4" />
      <path d="M12 3l0 18" />
    </TablerWrapper>
  );
}

function UnlockIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M5 11m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
      <path d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M8 11v-5a4 4 0 0 1 8 0" />
    </TablerWrapper>
  );
}

function UploadIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 9l5 -5l5 5" />
      <path d="M12 4l0 12" />
    </TablerWrapper>
  );
}

function UserIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    </TablerWrapper>
  );
}

function UserCircleIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" />
    </TablerWrapper>
  );
}

function UserPlusIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <path d="M16 19h6" />
      <path d="M19 16v6" />
      <path d="M6 21v-2a4 4 0 0 1 4 -4h4" />
    </TablerWrapper>
  );
}

function UsersIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
      <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
    </TablerWrapper>
  );
}

function VersionsIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M10 5m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" />
      <path d="M7 7l0 10" />
      <path d="M4 8l0 8" />
    </TablerWrapper>
  );
}

function XIcon(p: { class?: string }) {
  return (
    <TablerWrapper class={p.class}>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </TablerWrapper>
  );
}

export const _ICON_MAP_TABLER: Record<IconName, IconComponent> = {
  alertCircle: AlertCircleIcon,
  arrowDown: ArrowDownIcon,
  arrowLeft: ArrowLeftIcon,
  arrowRight: ArrowRightIcon,
  arrowUp: ArrowUpIcon,
  arrowsDiagonal: ArrowsDiagonalIcon,
  arrowsDiagonal2: ArrowsDiagonal2Icon,
  arrowsDiagonalMinimize: ArrowsDiagonalMinimizeIcon,
  arrowsDiagonalMinimize2: ArrowsDiagonalMinimize2Icon,
  arrowsUpDown: ArrowsUpDownIcon,
  backspace: BackspaceIcon,
  badge: BadgeIcon,
  bell: BellIcon,
  bookmark: BookmarkIcon,
  box: BoxIcon,
  calendar: CalendarIcon,
  chart: ChartIcon,
  check: CheckIcon,
  chevronDown: ChevronDownIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  chevronUp: ChevronUpIcon,
  circleX: CircleXIcon,
  clearAll: ClearAllIcon,
  clock: ClockIcon,
  code: CodeIcon,
  copy: CopyIcon,
  dashboard: DashboardIcon,
  database: DatabaseIcon,
  databaseImport: DatabaseImportIcon,
  document: DocumentIcon,
  download: DownloadIcon,
  eye: EyeIcon,
  eyeOff: EyeOffIcon,
  eraser: EraserIcon,
  file: FileIcon,
  filter: FilterIcon,
  filterFilled: FilterFilledIcon,
  fold: FoldIcon,
  folder: FolderIcon,
  gripVertical: GripVerticalIcon,
  help: HelpIcon,
  helpSquare: HelpSquareIcon,
  import: ImportIcon,
  info: InfoIcon,
  infoSmall: InfoSmallIcon,
  infoSquare: InfoSquareIcon,
  layoutDashboard: LayoutDashboardIcon,
  layoutGrid: LayoutGridIcon,
  lifebuoy: LifebuoyIcon,
  loader: LoaderIcon,
  lock: LockIcon,
  login: LoginIcon,
  maximize: MaximizeIcon,
  minimize: MinimizeIcon,
  minus: MinusIcon,
  moreVertical: MoreVerticalIcon,
  move: MoveIcon,
  package: PackageIcon,
  paperclip: PaperclipIcon,
  pencil: PencilIcon,
  photo: PhotoIcon,
  plus: PlusIcon,
  pointerFilled: PointerFilledIcon,
  presentation: PresentationIcon,
  presentationAnalytics: PresentationAnalyticsIcon,
  print: PrintIcon,
  questionMark: QuestionMarkIcon,
  redo: RedoIcon,
  refresh: RefreshIcon,
  report: ReportIcon,
  restore: RestoreIcon,
  rotate: RotateIcon,
  save: SaveIcon,
  search: SearchIcon,
  selector: SelectorIcon,
  settings: SettingsIcon,
  settingsCog: SettingsCogIcon,
  slideshow: SlideshowIcon,
  sparkles: SparklesIcon,
  switchHorizontal: SwitchHorizontalIcon,
  text: TextIcon,
  transform: TransformIcon,
  trash: TrashIcon,
  undo: UndoIcon,
  unfold: UnfoldIcon,
  unlock: UnlockIcon,
  upload: UploadIcon,
  user: UserIcon,
  userCircle: UserCircleIcon,
  userPlus: UserPlusIcon,
  users: UsersIcon,
  versions: VersionsIcon,
  x: XIcon,
};
