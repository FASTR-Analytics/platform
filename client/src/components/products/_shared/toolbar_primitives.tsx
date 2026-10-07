// The Google Docs style toolbar parts shared by the report and slide editors:
// a menu-bar row of popover menus above one row of flat tool buttons. See
// report/toolbar.tsx and slide_deck/slide_editor/slide_toolbar.tsx.

import { createSignal, type JSX, onCleanup, Show, splitProps } from "solid-js";
import { Icon } from "panther";

// The rows under a product's HeadingBar: the menu row, then the toolbar row
// (or the host a toolbar portals into). The closing pad and rule are the
// container's, so the header ends the same way whether or not a toolbar is
// mounted, and no row has to know that it is the last one.
export function HeaderRows(p: { children: JSX.Element }) {
  return (
    <div class="border-b pb-1.5" data-cursor-zone="header">
      {p.children}
    </div>
  );
}

// The menu row (File, Insert, Page...) under the heading bar, the same in
// both headers: a flat row the header fills with its own menus, and the
// open document's toolbar portals its menus into (the ref is the portal host).
export function MenuRow(p: {
  ref: (el: HTMLDivElement) => void;
  children?: JSX.Element;
}) {
  return (
    <div
      ref={p.ref}
      // The left pad is the row's less a menu button's own, so the first
      // label ("File") starts on the header's padding edge, under the back
      // button.
      class="flex flex-wrap items-center gap-1 pt-1.5 pr-[var(--ui-pad-x)] pl-[calc(var(--ui-pad-x)-var(--ui-pad-sm-x))]"
      data-cursor-zone="header"
    >
      {p.children}
    </div>
  );
}

// The formatting row itself, the root of both editors' toolbars so the two
// cannot drift: a flat wrapping row whose top pad is its gap from the menu
// row above.
export function ToolbarRow(
  p:
    & { children: JSX.Element }
    & Omit<
      JSX.HTMLAttributes<HTMLDivElement>,
      "class" | "classList"
    >,
) {
  const [local, rest] = splitProps(p, ["children"]);
  return (
    <div
      class="flex flex-wrap items-center gap-0.5 px-3 pt-1"
      data-cursor-zone="header"
      {...rest}
    >
      {local.children}
    </div>
  );
}

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

// A flat pill button, as in Google Docs: a hover tint only, and the pinned
// selected look (primary border + primary-subtle wash) while its state is
// active. The wash alone is near-white in light mode, so the border is what
// shows Bold is on. Letterforms stand in for the glyphs panther's IconName
// lacks (bold, italic, lists).
export function ToolButton(p: {
  active?: () => boolean;
  onClick: () => void;
  label: string;
  /** Greyed and inert, but still holding its place in the pill. */
  disabled?: boolean;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class="ui-focusable flex h-7 min-w-7 items-center justify-center rounded border px-1.5 text-sm"
      classList={{
        "border-primary bg-primary-subtle text-primary": p.active?.() === true,
        "border-transparent": p.active?.() !== true,
        "ui-hoverable-base-300": p.active?.() !== true && p.disabled !== true,
        "text-base-content-muted opacity-50": p.disabled === true,
      }}
      aria-label={p.label}
      title={p.label}
      disabled={p.disabled}
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
  /** Greyed and inert (the pill button only), holding its place in the row. */
  disabled?: boolean;
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
  onCleanup(() =>
    document.removeEventListener("pointerdown", onDocPointerDown, true)
  );

  return (
    <div ref={wrap}>
      <Show
        when={p.menu}
        fallback={
          <button
            type="button"
            class="ui-focusable flex h-7 items-center gap-1 rounded px-2 text-sm"
            classList={{
              "ui-hoverable-base-300": p.disabled !== true,
              "text-base-content-muted opacity-50": p.disabled === true,
            }}
            aria-label={p.title}
            title={p.title}
            data-tour={p.tour}
            disabled={p.disabled}
            onClick={toggle}
          >
            {p.label}
            <Show when={p.chevron !== false}>
              <Icon
                iconName="chevronDown"
                class="text-base-content-muted h-3 w-3"
              />
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
