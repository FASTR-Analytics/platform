// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
} from "solid-js";
import { resolveSequence, transitionTotalMs } from "./deps.ts";
import type { SequenceInputs } from "./deps.ts";
import { FigureHolder } from "./figure_holder.tsx";

type Props = {
  sequenceInputs: SequenceInputs;
  // Controlled when given; otherwise the holder keeps its own.
  index?: number;
  onIndexChange?: (i: number) => void;
  onElementClick?: (key: string) => void;
};

export function SequenceHolder(p: Props) {
  const resolved = createMemo(() => resolveSequence(p.sequenceInputs));
  const [own, setOwn] = createSignal(p.index ?? 0);
  const index = () => Math.min(p.index ?? own(), resolved().entries.length - 1);
  const step = createMemo<{ to: number; from: number | undefined }>(
    (prev) => ({ to: index(), from: prev?.to }),
  );
  // A step back plays the transition into the entry being left, so it
  // retraces the step forward.
  const transition = () => {
    const s = step();
    return s.from === undefined
      ? undefined
      : resolved().entries[Math.max(s.to, s.from)]?.transition;
  };
  const go = (i: number) => {
    const next = Math.max(0, Math.min(resolved().entries.length - 1, i));
    if (next !== index()) {
      setOwn(next);
      p.onIndexChange?.(next);
    }
  };

  // An entry is held for its holdMs once the transition into it ends; a step
  // by key or click restarts the clock.
  createEffect(() => {
    const s = step();
    const entries = resolved().entries;
    const tr = transition();
    if (s.to >= entries.length - 1) {
      return;
    }
    const timer = setTimeout(
      () => go(s.to + 1),
      (tr === undefined ? 0 : transitionTotalMs(tr)) + entries[s.to].holdMs,
    );
    onCleanup(() => clearTimeout(timer));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) {
      return;
    }
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      go(index() + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index() - 1);
    }
  };

  return (
    // The box keeps the frame's proportions, so every entry fills one canvas
    // height.
    <div
      class="ui-focusable w-full cursor-pointer"
      style={{
        "aspect-ratio":
          `${p.sequenceInputs.frame.w} / ${p.sequenceInputs.frame.h}`,
      }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => go(index() + 1)}
    >
      <Show when={resolved().entries[index()]}>
        {(entry) => (
          <FigureHolder
            figureInputs={entry().figure}
            height="flex"
            sizing="zoom"
            frameWidthDu={p.sequenceInputs.frame.w}
            scheme="light"
            transition={transition()}
            onElementClick={p.onElementClick}
          />
        )}
      </Show>
    </div>
  );
}
