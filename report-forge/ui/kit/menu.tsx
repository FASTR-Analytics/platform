import { createSignal, For, type JSX, Show } from "solid-js";
import { render } from "solid-js/web";
import { Icon } from "./icon.tsx";

// A context menu at a point (or under a box) on the page. One at a time:
// showing a menu closes the one before it. It closes on a choice, on Escape,
// and on a press anywhere outside it (heard in the capture phase, so an
// element that stops its own mousedown from bubbling cannot keep it open).

export type MenuItem =
  | {
    type?: undefined;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    intent?: "danger";
    subMenu?: MenuItem[];
  }
  | { type: "divider" };

export type MenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

let closeCurrent: (() => void) | undefined;

export function hideMenu(): void {
  closeCurrent?.();
}

export function showMenu(
  opts: { anchor: MenuAnchor; items: MenuItem[] },
): void {
  hideMenu();
  const pop = document.createElement("div");
  pop.className = "rf-root rf-menu-pop";
  pop.setAttribute("popover", "manual");
  document.body.append(pop);

  const dispose = render(
    () => <MenuPanel items={opts.items} onDone={() => close()} />,
    pop,
  );

  const onPress = (e: Event) => {
    if (e.target instanceof Node && pop.contains(e.target)) return;
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  function close() {
    if (closeCurrent !== close) return;
    closeCurrent = undefined;
    document.removeEventListener("mousedown", onPress, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", close);
    dispose();
    pop.remove();
  }
  closeCurrent = close;
  document.addEventListener("mousedown", onPress, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", close);

  pop.showPopover();
  place(pop, opts.anchor);
}

// Below the anchor's left edge, flipped above or pulled left when it would
// leave the viewport.
function place(el: HTMLElement, anchor: MenuAnchor): void {
  const { width, height } = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  let left = anchor.x;
  let top = anchor.y + anchor.height;
  if (left + width > vw - 4) {
    left = Math.max(4, anchor.x + anchor.width - width);
  }
  if (top + height > vh - 4) top = Math.max(4, anchor.y - height);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function MenuPanel(
  p: { items: MenuItem[]; onDone: () => void },
): JSX.Element {
  // The row whose submenu is open, with where that row sits.
  const [open, setOpen] = createSignal<
    { index: number; rect: DOMRect } | undefined
  >();
  return (
    <div class="rf-menu">
      <For each={p.items}>
        {(item, i) =>
          item.type === "divider" ? <div class="rf-menu__divider" /> : (
            <button
              type="button"
              class="rf-menu__item"
              classList={{ "rf-menu__item--danger": item.intent === "danger" }}
              data-open={open()?.index === i()}
              disabled={item.disabled}
              onMouseEnter={(e) =>
                setOpen(
                  item.subMenu
                    ? {
                      index: i(),
                      rect: e.currentTarget.getBoundingClientRect(),
                    }
                    : undefined,
                )}
              onClick={(e) => {
                if (item.subMenu) {
                  setOpen({
                    index: i(),
                    rect: e.currentTarget.getBoundingClientRect(),
                  });
                  return;
                }
                p.onDone();
                item.onClick?.();
              }}
            >
              <span class="rf-menu__label">{item.label}</span>
              <Show when={item.subMenu}>
                <span class="rf-menu__chevron">
                  <Icon name="chevronRight" />
                </span>
              </Show>
            </button>
          )}
      </For>
      <Show when={open()}>
        {(o) => {
          const item = p.items[o().index];
          const sub = item.type === "divider" ? [] : item.subMenu ?? [];
          return (
            <div
              style={{ position: "fixed" }}
              ref={(el) =>
                queueMicrotask(() => {
                  const r = o().rect;
                  const w = el.getBoundingClientRect().width;
                  const vw = document.documentElement.clientWidth;
                  const left = r.right + 4 + w > vw - 4
                    ? r.left - 4 - w
                    : r.right + 4;
                  el.style.left = `${Math.round(left)}px`;
                  el.style.top = `${Math.round(r.top)}px`;
                })}
            >
              <MenuPanel items={sub} onDone={p.onDone} />
            </div>
          );
        }}
      </Show>
    </div>
  );
}
