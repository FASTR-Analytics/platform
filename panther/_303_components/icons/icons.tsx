// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";

type IconWrapperProps = {
  children: JSX.Element;
  class?: string;
};

function IconWrapper(p: IconWrapperProps) {
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

export function DownloadIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 11l5 5l5 -5" />
      <path d="M12 4l0 12" />
    </IconWrapper>
  );
}

export function BadgeIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M17 17v-13l-5 3l-5 -3v13l5 3z" />
    </IconWrapper>
  );
}

export function CopyIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
      <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
    </IconWrapper>
  );
}

export function SaveIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" />
      <path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M14 4l0 4l-6 0l0 -4" />
    </IconWrapper>
  );
}

export function ChevronLeftIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M15 6l-6 6l6 6" />
    </IconWrapper>
  );
}

export function TrashIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </IconWrapper>
  );
}

export function PlusIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </IconWrapper>
  );
}

export function MoreVerticalIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    </IconWrapper>
  );
}

export function MoveIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M18 9l3 3l-3 3" />
      <path d="M15 12h6" />
      <path d="M6 9l-3 3l3 3" />
      <path d="M3 12h6" />
      <path d="M9 18l3 3l3 -3" />
      <path d="M12 15v6" />
      <path d="M15 6l-3 -3l-3 3" />
      <path d="M12 3v6" />
    </IconWrapper>
  );
}

export function MaximizeIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
      <path d="M4 16v2a2 2 0 0 0 2 2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
    </IconWrapper>
  );
}

export function MinimizeIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M15 19v-2a2 2 0 0 1 2 -2h2" />
      <path d="M15 5v2a2 2 0 0 0 2 2h2" />
      <path d="M5 15h2a2 2 0 0 1 2 2v2" />
      <path d="M5 9h2a2 2 0 0 0 2 -2v-2" />
    </IconWrapper>
  );
}

export function MinusIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M5 12l14 0" />
    </IconWrapper>
  );
}

export function ChevronDownIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M6 9l6 6l6 -6" />
    </IconWrapper>
  );
}

export function ChevronUpIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M6 15l6 -6l6 6" />
    </IconWrapper>
  );
}

export function ChevronRightIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M9 6l6 6l-6 6" />
    </IconWrapper>
  );
}

export function RefreshIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </IconWrapper>
  );
}

export function UploadIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 9l5 -5l5 5" />
      <path d="M12 4l0 12" />
    </IconWrapper>
  );
}

export function ArrowLeftIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M5 12l14 0" />
      <path d="M5 12l6 6" />
      <path d="M5 12l6 -6" />
    </IconWrapper>
  );
}

export function XIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </IconWrapper>
  );
}

export function CircleXIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M10 10l4 4m0 -4l-4 4" />
    </IconWrapper>
  );
}

export function PencilIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
      <path d="M13.5 6.5l4 4" />
    </IconWrapper>
  );
}

export function SettingsIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
      <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    </IconWrapper>
  );
}

export function SettingsCogIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M12 1v6" />
      <path d="M12 17v6" />
      <path d="M4.22 4.22l4.24 4.24" />
      <path d="M15.54 15.54l4.24 4.24" />
      <path d="M1 12h6" />
      <path d="M17 12h6" />
      <path d="M4.22 19.78l4.24 -4.24" />
      <path d="M15.54 8.46l4.24 -4.24" />
    </IconWrapper>
  );
}

export function SparklesIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z" />
    </IconWrapper>
  );
}

export function SelectorIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M8 9l4 -4l4 4" />
      <path d="M16 15l-4 4l-4 -4" />
    </IconWrapper>
  );
}

export function FolderIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
    </IconWrapper>
  );
}

export function DatabaseIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M12 6m-8 0a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" />
      <path d="M4 6v6a8 3 0 0 0 16 0v-6" />
      <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
    </IconWrapper>
  );
}

export function UsersIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
      <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
    </IconWrapper>
  );
}

export function PackageIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
      <path d="M12 12l8 -4.5" />
      <path d="M12 12l0 9" />
      <path d="M12 12l-8 -4.5" />
      <path d="M16 5.25l-8 4.5" />
    </IconWrapper>
  );
}

export function SearchIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M21 21l-6 -6" />
    </IconWrapper>
  );
}

export function ChartIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M4 19l16 0" />
      <path d="M4 15l4 -6l4 2l4 -5l4 4" />
    </IconWrapper>
  );
}

export function CheckIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M5 12l5 5l10 -10" />
    </IconWrapper>
  );
}

export function BoxIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
      <path d="M12 12l8 -4.5" />
      <path d="M12 12l0 9" />
      <path d="M12 12l-8 -4.5" />
    </IconWrapper>
  );
}

export function CodeIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M7 8l-4 4l4 4" />
      <path d="M17 8l4 4l-4 4" />
      <path d="M14 4l-4 16" />
    </IconWrapper>
  );
}

export function ReportIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
      <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
      <path d="M9 17v-4" />
      <path d="M12 17v-1" />
      <path d="M15 17v-2" />
    </IconWrapper>
  );
}

export function LoginIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M15 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" />
      <path d="M21 12h-13l3 -3" />
      <path d="M11 15l-3 -3" />
    </IconWrapper>
  );
}

export function UserPlusIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <path d="M16 19h6" />
      <path d="M19 16v6" />
      <path d="M6 21v-2a4 4 0 0 1 4 -4h4" />
    </IconWrapper>
  );
}

export function UserIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
      <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    </IconWrapper>
  );
}

export function UserCircleIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" />
    </IconWrapper>
  );
}

export function ImportIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3" />
    </IconWrapper>
  );
}

export function DatabaseImportIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3" />
      <path d="M4 6v6c0 1.657 3.582 3 8 3c.856 0 1.68 -.05 2.454 -.144m5.546 -2.856v-6" />
      <path d="M4 12v6c0 1.657 3.582 3 8 3c.171 0 .341 -.002 .51 -.006" />
      <path d="M19 22v-6" />
      <path d="M22 19l-3 -3l-3 3" />
    </IconWrapper>
  );
}

export function FileIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
    </IconWrapper>
  );
}

export function DocumentIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
      <path d="M9 9l1 0" />
      <path d="M9 13l6 0" />
      <path d="M9 17l6 0" />
    </IconWrapper>
  );
}

export function LockIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" />
      <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M8 11v-4a4 4 0 1 1 8 0v4" />
    </IconWrapper>
  );
}

export function UnlockIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M5 11m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
      <path d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M8 11v-5a4 4 0 0 1 8 0" />
    </IconWrapper>
  );
}

export function InfoIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 9h.01" />
      <path d="M11 12h1v4h1" />
    </IconWrapper>
  );
}

export function VersionsIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M10 5m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" />
      <path d="M7 7l0 10" />
      <path d="M4 8l0 8" />
    </IconWrapper>
  );
}

export function GripVerticalIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="19" r="1" />
    </IconWrapper>
  );
}

export function HelpIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 16v.01" />
      <path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" />
    </IconWrapper>
  );
}

export function PrintIcon(p: { class?: string }) {
  return (
    <IconWrapper {...p}>
      <path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" />
      <path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" />
      <path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" />
    </IconWrapper>
  );
}

export const _ICON_MAP = {
  arrowLeft: ArrowLeftIcon,
  badge: BadgeIcon,
  box: BoxIcon,
  chart: ChartIcon,
  check: CheckIcon,
  chevronDown: ChevronDownIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  chevronUp: ChevronUpIcon,
  circleX: CircleXIcon,
  code: CodeIcon,
  copy: CopyIcon,
  database: DatabaseIcon,
  databaseImport: DatabaseImportIcon,
  document: DocumentIcon,
  download: DownloadIcon,
  file: FileIcon,
  folder: FolderIcon,
  gripVertical: GripVerticalIcon,
  help: HelpIcon,
  import: ImportIcon,
  info: InfoIcon,
  lock: LockIcon,
  login: LoginIcon,
  maximize: MaximizeIcon,
  minimize: MinimizeIcon,
  minus: MinusIcon,
  moreVertical: MoreVerticalIcon,
  move: MoveIcon,
  package: PackageIcon,
  pencil: PencilIcon,
  plus: PlusIcon,
  print: PrintIcon,
  refresh: RefreshIcon,
  report: ReportIcon,
  save: SaveIcon,
  search: SearchIcon,
  selector: SelectorIcon,
  settings: SettingsIcon,
  settingsCog: SettingsCogIcon,
  sparkles: SparklesIcon,
  trash: TrashIcon,
  unlock: UnlockIcon,
  upload: UploadIcon,
  user: UserIcon,
  userCircle: UserCircleIcon,
  userPlus: UserPlusIcon,
  users: UsersIcon,
  versions: VersionsIcon,
  x: XIcon,
} as const;

export type IconName = keyof typeof _ICON_MAP;
