// The transport seam between the generated server actions and their
// environment. The browser transport (registered by LoggedInWrapper at module
// scope) authenticates with the Clerk cookie; a headless host (MCP server)
// registers a transport that carries a personal access token and an absolute
// base URL. Server-action code never touches Clerk or the window directly.

export type ServerActionTransport = {
  baseUrl: string;
  refreshSession: () => Promise<void>;
  getHeaders: () => Record<string, string>;
  credentials: RequestCredentials;
  onPersistentAuthFailure: (info: { url: string; body: unknown }) => void;
  // Connection-health hooks. The SPA wires these to its connection monitor
  // (offline banner); a headless host omits them.
  onNetworkFailure?: () => void;
  onNetworkSuccess?: () => void;
  // In-process dispatch seam (PLAN_112 D4): when set, server actions issue
  // requests through this instead of global fetch. The /mcp endpoint points
  // it at patApp.request(), so every action still runs the full PAT
  // middleware chain (verify, allowlist, permissions, logging) without a
  // network hop. Absent = global fetch, zero behavior change.
  fetchImpl?: (
    input: string | URL | Request,
    init: RequestInit,
  ) => Promise<Response>;
};

let _transport: ServerActionTransport | null = null;

export function setServerActionTransport(
  transport: ServerActionTransport,
): void {
  _transport = transport;
}

export function getServerActionTransport(): ServerActionTransport {
  if (_transport === null) {
    throw new Error(
      "Server-action transport not configured. The app shell (LoggedInWrapper) registers the browser transport at boot; a headless host must call setServerActionTransport() before any server action.",
    );
  }
  return _transport;
}
