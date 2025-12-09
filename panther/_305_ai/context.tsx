// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component, JSX } from "solid-js";
import type { AIChatConfig } from "./_core/types.ts";
import { AIChatConfigContext } from "./_components/_create_ai_chat.ts";

type Props = {
  config: AIChatConfig;
  children: JSX.Element;
};

export const AIChatProvider: Component<Props> = (props) => {
  return (
    <AIChatConfigContext.Provider value={props.config}>
      {props.children}
    </AIChatConfigContext.Provider>
  );
};
