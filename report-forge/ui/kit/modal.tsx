import {
  type Component,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { t3 } from "../../engine/i18n.ts";
import { Button, type ButtonIntent } from "./button.tsx";
import type { IconName } from "./icon.tsx";

// ── Opening a modal ──────────────────────────────────────────────────────────
// A modal is a component that takes its own props plus `close`, and resolves
// the promise openModal returned with whatever it closes with (undefined for
// a cancel). Modals stack: one opened from inside another sits on top of it
// and the one below comes back when it closes.

export type ModalProps<P, R> = P & { close: (result: R | undefined) => void };

type OpenModal = {
  id: number;
  // deno-lint-ignore no-explicit-any
  element: Component<any>;
  props: object;
  close: (result: unknown) => void;
};

const [stack, setStack] = createSignal<OpenModal[]>([]);
let nextId = 1;

export function openModal<P extends object, R>(spec: {
  element: Component<ModalProps<P, R>>;
  props: P;
}): Promise<R | undefined> {
  return new Promise((resolve) => {
    const id = nextId++;
    const close = (result: unknown) => {
      setStack((s) => s.filter((m) => m.id !== id));
      resolve(result as R | undefined);
    };
    setStack((s) => [...s, {
      id,
      element: spec.element,
      props: spec.props,
      close,
    }]);
  });
}

// Whether any modal is open: the editor suspends what must not run under one.
export function isModalOpen(): boolean {
  return stack().length > 0;
}

// Where open modals render. The mounted editor includes one; several on a
// page are harmless, since only the first to mount draws the stack.
const [hosts, setHosts] = createSignal<number[]>([]);
let nextHost = 1;

export function ModalHost(): JSX.Element {
  const me = nextHost++;
  onMount(() => setHosts((h) => [...h, me]));
  onCleanup(() => setHosts((h) => h.filter((x) => x !== me)));
  return (
    <Show when={hosts()[0] === me && stack().length > 0}>
      <Portal mount={document.body}>
        <div class="rf-root">
          <For each={stack()}>
            {(modal) => (
              <>
                <div class="rf-scrim" />
                <div
                  class="rf-dialog"
                  role="dialog"
                  aria-modal="true"
                  tabindex="-1"
                  ref={(el) => queueMicrotask(() => el.focus())}
                >
                  <div class="rf-dialog__center">
                    <div class="rf-dialog__panel">
                      <Dynamic
                        component={modal.element}
                        {...modal.props}
                        close={modal.close}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </For>
        </div>
      </Portal>
    </Show>
  );
}

// ── The modal's own frame ────────────────────────────────────────────────────

export type ModalAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  intent?: ButtonIntent;
  outline?: boolean;
  iconName?: IconName;
};

export type ModalWidth = "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";

// Title, a scrolling body, and a footer: Cancel (when the modal can be
// cancelled) then the actions, on the right; `footer` on the left.
export function Modal(p: {
  title: string;
  subtitle?: string;
  width?: ModalWidth;
  // "none": the body runs edge to edge (a diff, a preview).
  pad?: "none";
  // Absent, the modal has no Cancel and Escape does nothing: the user must
  // take one of the actions.
  onCancel?: () => void;
  cancelLabel?: string;
  footer?: JSX.Element;
  actions?: ModalAction[];
  children: JSX.Element;
}): JSX.Element {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !p.onCancel) return;
    e.stopPropagation();
    p.onCancel();
  };
  return (
    <div
      class={`rf-modal rf-modal--${p.width ?? "md"}`}
      onKeyDown={onKey}
    >
      <div class="rf-modal__head">
        <h2 class="rf-modal__title">{p.title}</h2>
        <Show when={p.subtitle}>
          <div class="rf-modal__subtitle">{p.subtitle}</div>
        </Show>
      </div>
      <div
        class="rf-modal__body"
        classList={{ "rf-modal__body--flush": p.pad === "none" }}
      >
        {p.children}
      </div>
      <div class="rf-modal__foot">
        <div class="rf-modal__foot-left">{p.footer}</div>
        <div class="rf-modal__foot-right">
          <Show when={p.onCancel}>
            <Button intent="neutral" outline onClick={() => p.onCancel?.()}>
              {p.cancelLabel ??
                t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
            </Button>
          </Show>
          <For each={p.actions ?? []}>
            {(action) => (
              <Button
                intent={action.intent}
                outline={action.outline}
                iconName={action.iconName}
                disabled={action.disabled}
                loading={action.loading}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

// ── A plain message ──────────────────────────────────────────────────────────

function MessageModal(
  p: ModalProps<{ text: string; intent?: "danger" }, true>,
): JSX.Element {
  return (
    <Modal
      title={p.intent === "danger"
        ? t3({ en: "Error", fr: "Erreur", pt: "Erro" })
        : t3({ en: "Note", fr: "Remarque", pt: "Nota" })}
      width="sm"
      actions={[{
        label: t3({ en: "OK", fr: "OK", pt: "OK" }),
        onClick: () => p.close(true),
        intent: p.intent,
      }]}
    >
      <div style={{ "white-space": "pre-wrap" }}>{p.text}</div>
    </Modal>
  );
}

export function openMessage(
  message: { text: string; intent?: "danger" },
): Promise<void> {
  return openModal({ element: MessageModal, props: message }).then(() => {});
}
