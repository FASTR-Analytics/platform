// Web search alone: web fetch would carry anything the conversation holds
// (a tool result, an error quoting its input) to any host the model names.
export const DEFAULT_BUILTIN_TOOLS = { webSearch: true };
