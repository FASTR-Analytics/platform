// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Button,
  createSignal,
  For,
  onMount,
  Show,
  StableWeightText,
  t3,
  TextArea,
} from "../../deps.ts";
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsInput,
} from "../../_core/ask_user_questions_types.ts";
import { submitsOnKey } from "../message_input.tsx";

type Props = {
  input: AskUserQuestionsInput;
  onSubmit: (answer: AskUserQuestionsAnswer) => void;
  onCancel: () => void;
};

export function AskUserQuestionsRenderer(p: Props) {
  const [selected, setSelected] = createSignal<string[]>([]);
  const [ownOpen, setOwnOpen] = createSignal(false);
  const [ownText, setOwnText] = createSignal("");
  const [submitted, setSubmitted] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  // Deliberately NO onCleanup cancel (decision log #6): unmount is inert —
  // a pane hidden in a tab/<Show> leaves the question pending and
  // recoverable on remount. Only explicit paths cancel: the Cancel button
  // here, and Stop (through the turn's signal in the tool's context).

  const options = () => Array.isArray(p.input?.options) ? p.input.options : [];

  const answer = () => answerOf(selected(), ownOpen() ? ownText() : undefined);

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
      setOwnOpen(false);
    }
  }

  function handleToggleOwn() {
    if (submitted()) return;
    if (!p.input.allowMultiple) {
      setSelected([]);
    }
    const open = p.input.allowMultiple ? !ownOpen() : true;
    setOwnOpen(open);
    // The transcript never follows a card's own growth, and the text box
    // opens under the card's last row.
    if (open) {
      containerRef?.scrollIntoView({ block: "end" });
    }
  }

  function isSelected(label: string): boolean {
    return selected().includes(label);
  }

  function handleSubmit() {
    const current = answer();
    if (current === undefined || submitted()) return;
    setSubmitted(true);
    p.onSubmit(current);
  }

  function handleCancel() {
    if (submitted()) return;
    setSubmitted(true);
    p.onCancel();
  }

  const rowClasses = (on: boolean) => ({
    "w-full rounded border px-3 py-2 text-left": true,
    "border-primary bg-primary-subtle": on,
    "ui-hoverable-base-100": !on && !submitted(),
    "opacity-60": !on && submitted(),
    "cursor-pointer": !submitted(),
    "cursor-default": submitted(),
  });

  const rowTextClass = (on: boolean) => on ? "text-sm font-700" : "text-sm";

  onMount(() => {
    containerRef?.scrollIntoView({ block: "end" });
  });

  return (
    <div ref={containerRef} class="rounded border p-3">
      <div class="font-700 mb-2 text-sm">{p.input.question}</div>
      <Show when={p.input.allowMultiple}>
        <div class="text-base-content-muted mb-2 text-xs">
          {t3({
            en: "Select all that apply",
            fr: "Sélectionnez toutes les réponses applicables",
            pt: "Selecione todas as opções aplicáveis",
            th: "เลือกได้มากกว่าหนึ่งข้อ",
          })}
        </div>
      </Show>
      <div class="space-y-1.5">
        <For each={options()}>
          {(option) => (
            <button
              type="button"
              disabled={submitted()}
              onClick={() => handleSelect(option.label)}
              aria-pressed={isSelected(option.label)}
              classList={rowClasses(isSelected(option.label))}
            >
              <StableWeightText
                class={rowTextClass(isSelected(option.label))}
                text={option.label}
              />
              <Show when={option.description}>
                <div class="text-base-content-muted mt-0.5 text-xs">
                  {option.description}
                </div>
              </Show>
            </button>
          )}
        </For>
        <button
          type="button"
          disabled={submitted()}
          onClick={handleToggleOwn}
          aria-expanded={ownOpen()}
          classList={rowClasses(ownOpen())}
        >
          <StableWeightText
            class={rowTextClass(ownOpen())}
            text={t3({
              en: "Other (write your own answer)",
              fr: "Autre (écrivez votre propre réponse)",
              pt: "Outra (escreva a sua própria resposta)",
              th: "อื่น ๆ (เขียนคำตอบของคุณเอง)",
            })}
          />
        </button>
        <Show when={ownOpen()}>
          <TextArea
            value={ownText()}
            onChange={setOwnText}
            onKeyDown={(e) => {
              if (submitsOnKey(e)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={t3({
              en: "Type your answer...",
              fr: "Saisissez votre réponse...",
              pt: "Escreva a sua resposta...",
              th: "พิมพ์คำตอบของคุณ...",
            })}
            rows={2}
            size="sm"
            fullWidth
            autoFocus
            disabled={submitted()}
          />
        </Show>
      </div>
      <Show when={!submitted()}>
        <div class="mt-3 flex items-center gap-3">
          <Button
            intent="primary"
            disabled={answer() === undefined}
            onClick={handleSubmit}
          >
            {t3({ en: "Submit", fr: "Envoyer", pt: "Enviar", th: "ส่ง" })}
          </Button>
          <button
            type="button"
            onClick={handleCancel}
            class="text-base-content-muted hover:text-base-content cursor-pointer text-xs"
          >
            {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar", th: "ยกเลิก" })}
          </button>
        </div>
      </Show>
    </div>
  );
}

function answerOf(
  selected: string[],
  ownText: string | undefined,
): AskUserQuestionsAnswer | undefined {
  if (ownText === undefined) {
    return selected.length > 0 ? { selected } : undefined;
  }
  const ownAnswer = ownText.trim();
  return ownAnswer === "" ? undefined : { selected, ownAnswer };
}
