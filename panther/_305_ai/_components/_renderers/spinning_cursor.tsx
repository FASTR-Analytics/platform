// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, createSignal, onCleanup, onMount } from "solid-js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL = 80;

type Props = {
  class?: string;
};

export const SpinningCursor: Component<Props> = (props) => {
  const [frame, setFrame] = createSignal(0);

  onMount(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL);

    onCleanup(() => clearInterval(interval));
  });

  return (
    <span class={`not-italic ml-0.5 inline-block ${props.class ?? ""}`}>
      {SPINNER_FRAMES[frame()]}
    </span>
  );
};
