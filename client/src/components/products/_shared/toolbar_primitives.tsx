// The Google Docs style toolbar parts shared by the report and slide editors:
// a menu-bar row of popover menus above one pill of flat tool buttons. See
// report/toolbar.tsx and slide_deck/slide_editor/slide_toolbar.tsx.

import { createSignal, type JSX, onCleanup, Show } from "solid-js";
import { Icon } from "panther";

// A menu row that opens a panel to its right on hover — the Insert menu's
// picker pattern (pure CSS, so the flyout stays up while the pointer travels
// over the row or the panel, both children of this wrapper).
export function MenuFlyout(p: { label: string; children: JSX.Element }) {
  return (
    <div class="group relative">
      <PopoverRow active={false} onClick={() => {}}>
        <span class="flex-1">{p.label}</span>
        <span class="text-base-content-muted">▸</span>
      </PopoverRow>
      <div class="absolute top-0 left-full hidden pl-1 group-hover:block">
        {p.children}
      </div>
    </div>
  );
}

export function ToolbarDivider() {
  return <div class="bg-base-300 mx-1 h-4 w-px" />;
}

export function MenuDivider() {
  return <div class="bg-base-300 my-1 h-px w-full" />;
}

// A flat pill button, as in Google Docs: a hover tint only, a primary-subtle
// fill while its state is active. Letterforms stand in for the glyphs
// panther's IconName lacks (bold, italic, lists).
export function ToolButton(p: {
  active?: () => boolean;
  onClick: () => void;
  label: string;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class="ui-focusable flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm"
      classList={{
        "bg-primary-subtle text-primary": p.active?.() === true,
        "ui-hoverable-base-300": p.active?.() !== true,
      }}
      aria-label={p.label}
      title={p.label}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}

// Panther's showMenu takes string labels only — no swatch, no active tick — so
// any dropdown that has to SHOW a colour is hand-composed, the same way
// panther's own ColorPicker and the slide editor's TextStylePopover are.
// The panel rides the browser's TOP LAYER (the native popover API, same as
// panther's own menus): an inline-absolute panel is clipped by the header and
// out-stacked by the editor sheet's own stacking contexts, no z-index wins.
// `menu` renders the trigger as a plain menu-bar item (the Google Docs menu
// row) instead of a flat pill button with a dropdown chevron (`chevron`
// false drops the chevron, for the colour and size boxes).
export function ToolbarPopover(p: {
  label: JSX.Element;
  title: string;
  menu?: boolean;
  chevron?: boolean;
  tour?: string;
  children: (close: () => void) => JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
  let wrap!: HTMLDivElement;

  function onDocPointerDown(e: PointerEvent) {
    if (!wrap.contains(e.target as Node)) close();
  }
  function close() {
    setOpen(false);
    document.removeEventListener("pointerdown", onDocPointerDown, true);
  }
  function toggle(e: MouseEvent) {
    if (open()) return close();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Clamp so a right-edge popover never runs off screen.
    setAnchor({
      x: Math.max(8, Math.min(r.left, window.innerWidth - 260)),
      y: r.bottom + 4,
    });
    setOpen(true);
    document.addEventListener("pointerdown", onDocPointerDown, true);
  }
  onCleanup(() => document.removeEventListener("pointerdown", onDocPointerDown, true));

  return (
    <div ref={wrap}>
      <Show
        when={p.menu}
        fallback={
          <button
            type="button"
            class="ui-focusable ui-hoverable-base-300 flex h-7 items-center gap-1 rounded px-2 text-sm"
            aria-label={p.title}
            title={p.title}
            data-tour={p.tour}
            onClick={toggle}
          >
            {p.label}
            <Show when={p.chevron !== false}>
              <Icon iconName="chevronDown" class="text-base-content-muted h-3 w-3" />
            </Show>
          </button>
        }
      >
        <button
          type="button"
          class="ui-focusable ui-hoverable-base-100 rounded px-2 py-0.5 text-sm"
          data-tour={p.tour}
          onClick={toggle}
        >
          {p.label}
        </button>
      </Show>
      <Show when={open()}>
        <div
          ref={(el) => {
            // popover="manual": top layer without light-dismiss — the
            // pointerdown listener owns closing, so in-panel clicks (which
            // stay inside `wrap` in the DOM tree) keep it open.
            queueMicrotask(() => el.showPopover?.());
          }}
          popover="manual"
          class="bg-base-100 ui-pad-sm shadow-floating m-0 min-w-40 rounded border"
          style={{
            position: "fixed",
            left: `${anchor().x}px`,
            top: `${anchor().y}px`,
            // The UA popover stylesheet sets overflow:auto, which would CLIP
            // a submenu flyout (the table grid) into a scroll container
            // instead of letting it float beside the panel.
            overflow: "visible",
          }}
        >
          {p.children(close)}
        </div>
      </Show>
    </div>
  );
}

export function PopoverRow(p: {
  active: boolean;
  onClick: () => void;
  /** Greyed and inert, for a row whose action needs a selection first. */
  disabled?: boolean;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class="ui-focusable flex w-full items-center rounded px-2 py-1 text-left text-sm"
      classList={{
        "border-primary bg-primary-subtle font-700": p.active,
        "ui-hoverable-base-100": !p.active && !p.disabled,
        "text-base-content-muted cursor-not-allowed": p.disabled === true,
      }}
      disabled={p.disabled}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}
