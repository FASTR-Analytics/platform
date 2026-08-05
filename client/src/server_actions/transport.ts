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
