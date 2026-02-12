// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Button, createSignal, For, onCleanup, Show } from "../../deps.ts";
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsInput,
} from "../../_core/ask_user_questions_types.ts";

type Props = {
  input: AskUserQuestionsInput;
  onSubmit: (answer: AskUserQuestionsAnswer) => void;
  onCancel: () => void;
};

export function AskUserQuestionsRenderer(p: Props) {
  const [selected, setSelected] = createSignal<string[]>([]);
  const [submitted, setSubmitted] = createSignal(false);

  onCleanup(() => {
    if (!submitted()) {
      p.onCancel();
    }
  });

  const options = () =>
    Array.isArray(p.input?.options) ? p.input.options : [];

  const allAnswered = () => selected().length > 0;

  function handleSelect(label: string) {
    if (submitted()) return;
    if (p.input.allowMultiple) {
      const current = selected();
      if (current.includes(label)) {
        setSelected(current.filter((l) => l !== label));
      } else {
        setSelected([...current, label]);
      }
    } else {
      setSelected([label]);
    }
  }

  function isSelected(label: string): boolean {
    return selected().includes(label);
  }

  function handleSubmit() {
    if (!allAnswered() || submitted()) return;
    setSubmitted(true);
    const answer = p.input.allowMultiple ? selected() : selected()[0];
    p.onSubmit(answer);
  }

  function handleCancel() {
    if (submitted()) return;
    setSubmitted(true);
    p.onCancel();
  }

  return (
    <div class="border-base-300 rounded border p-3">
      <div class="font-700 mb-2 text-sm">{p.input.question}</div>
      <Show when={p.input.allowMultiple}>
        <div class="text-neutral mb-2 text-xs">Select all that apply</div>
      </Show>
      <div class="space-y-1.5">
        <For each={options()}>
          {(option) => (
            <button
              type="button"
              disabled={submitted()}
              onClick={() => handleSelect(option.label)}
              classList={{
                "w-full rounded border px-3 py-2 text-left": true,
                "border-primary bg-primary/10 font-700": isSelected(
                  option.label,
                ),
                "border-base-300 hover:bg-base-200":
                  !isSelected(option.label) && !submitted(),
                "border-base-300 opacity-60":
                  !isSelected(option.label) && submitted(),
                "cursor-pointer": !submitted(),
                "cursor-default": submitted(),
              }}
            >
              <div class="text-sm">{option.label}</div>
              <Show when={option.description}>
                <div class="text-neutral mt-0.5 text-xs">
                  {option.description}
                </div>
              </Show>
            </button>
          )}
        </For>
      </div>
      <Show when={!submitted()}>
        <div class="mt-3 flex items-center gap-3">
          <Button
            intent="primary"
            disabled={!allAnswered()}
            onClick={handleSubmit}
          >
            Submit
          </Button>
          <button
            type="button"
            onClick={handleCancel}
            class="text-neutral hover:text-base-content cursor-pointer text-xs"
          >
            Cancel
          </button>
        </div>
      </Show>
    </div>
  );
}
