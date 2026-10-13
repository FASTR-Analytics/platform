import { createUniqueId, For, type JSX, Show } from "solid-js";

// A labelled single-line text input. 200px wide unless `fullWidth`.
export function Input(p: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}): JSX.Element {
  const id = createUniqueId();
  return (
    <div class="rf-field" classList={{ "rf-field--full": p.fullWidth }}>
      <Show when={p.label}>
        <div>
          <label class="rf-label" for={id}>{p.label}</label>
        </div>
      </Show>
      <input
        id={id}
        class="rf-input"
        type="text"
        value={p.value}
        placeholder={p.placeholder}
        disabled={p.disabled}
        autofocus={p.autoFocus}
        onInput={(e) => p.onChange(e.currentTarget.value)}
      />
    </div>
  );
}

// A labelled group of mutually exclusive options, stacked.
export function RadioGroup<T extends string>(p: {
  label?: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}): JSX.Element {
  const name = createUniqueId();
  return (
    <div>
      <Show when={p.label}>
        <div>
          <span class="rf-label">{p.label}</span>
        </div>
      </Show>
      <div>
        <For each={p.options}>
          {(option) => (
            <label class="rf-radio">
              <span class="rf-radio__box">
                <input
                  class="rf-radio__input"
                  type="radio"
                  name={name}
                  checked={p.value === option.value}
                  onChange={() => p.onChange(option.value)}
                />
                <span class="rf-radio__dot" />
              </span>
              <span class="rf-radio__text">{option.label}</span>
            </label>
          )}
        </For>
      </div>
    </div>
  );
}

// The message of a failed action; renders nothing otherwise.
export function FormError(p: { error: string | undefined }): JSX.Element {
  return (
    <Show when={p.error}>
      <div class="rf-error">{p.error}</div>
    </Show>
  );
}

export function Card(p: { children: JSX.Element }): JSX.Element {
  return (
    <div class="rf-card">
      <div class="rf-card__body">{p.children}</div>
    </div>
  );
}
