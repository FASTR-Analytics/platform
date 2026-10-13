import { type JSX, Show } from "solid-js";
import { Icon, type IconName } from "./icon.tsx";

export type ButtonIntent = "primary" | "neutral" | "success" | "danger";

export type ButtonProps = {
  children?: JSX.Element;
  onClick?: (e: MouseEvent) => void;
  id?: string;
  // The look: filled (default), outlined on its surface, or a ghost.
  outline?: boolean;
  ghost?: boolean;
  intent?: ButtonIntent;
  size?: "sm";
  // The surface an outline button sits on, when it is not the page's.
  onSurface2?: boolean;
  iconName?: IconName;
  iconPosition?: "left" | "right";
  disabled?: boolean;
  // A spinner over the label, which keeps its width.
  loading?: boolean;
  ariaLabel?: string;
  title?: string;
  type?: "button" | "submit";
};

export function Button(p: ButtonProps): JSX.Element {
  const icon = () => (
    <Show when={p.iconName}>
      {(name) => (
        <span class="rf-btn__icon">
          <Icon name={name()} />
        </span>
      )}
    </Show>
  );
  return (
    <button
      type={p.type ?? "button"}
      id={p.id}
      class="rf-btn"
      classList={{
        "rf-btn--sm": p.size === "sm",
        "rf-btn--outline": p.outline === true && p.ghost !== true,
        "rf-btn--ghost": p.ghost === true,
        "rf-btn--on-surface-2": p.onSurface2 === true,
        "rf-btn--neutral": p.intent === "neutral",
        "rf-btn--success": p.intent === "success",
        "rf-btn--danger": p.intent === "danger",
        "rf-btn--loading": p.loading === true,
        "rf-btn--icon-only": p.iconName !== undefined && !p.children,
      }}
      disabled={p.disabled === true || p.loading === true}
      aria-label={p.ariaLabel}
      title={p.title}
      onClick={(e) => p.onClick?.(e)}
    >
      <Show when={p.iconPosition !== "right"}>{icon()}</Show>
      <Show when={p.children}>
        <span class="rf-btn__label">{p.children}</span>
      </Show>
      <Show when={p.iconPosition === "right"}>{icon()}</Show>
      <Show when={p.loading}>
        <span class="rf-btn__spinner" />
      </Show>
    </button>
  );
}
