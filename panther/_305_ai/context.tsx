// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, createContext, type JSX } from "solid-js";
import { ToolRegistry } from "./_core/tool_engine.ts";
import type { AIChatConfig } from "./_core/types.ts";
import { AIChatConfigContext } from "./_hooks/use_ai_chat.ts";
import { ToolRegistryContext } from "./_hooks/use_ai_tools.ts";

type Props = {
  config: AIChatConfig;
  children: JSX.Element;
};

export const AIChatProvider: Component<Props> = (props) => {
  const toolRegistry = new ToolRegistry();

  if (props.config.tools) {
    props.config.tools.forEach((tool) => toolRegistry.register(tool));
  }

  return (
    <AIChatConfigContext.Provider value={props.config}>
      <ToolRegistryContext.Provider value={toolRegistry}>
        {props.children}
      </ToolRegistryContext.Provider>
    </AIChatConfigContext.Provider>
  );
};
