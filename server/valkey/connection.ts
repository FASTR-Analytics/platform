import { createClient, type RedisClientType } from "redis";

let _client: RedisClientType | null = null;
let _available = false;

export async function connectValkey(): Promise<void> {
  const url = Deno.env.get("VALKEY_URL");
  if (!url) {
    console.log("VALKEY_URL not set — caching disabled");
    return;
  }
  try {
    _client = createClient({ url }) as RedisClientType;

    _client.on("error", (err: Error) => {
      console.warn(`[Valkey] Connection error: ${err.message}`);
      _available = false;
    });

    _client.on("ready", () => {
      _available = true;
      console.log("[Valkey] Ready");
    });

    await _client.connect();
    _available = true;
    console.log(`[Valkey] Connected to ${url}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Valkey] Could not connect (${msg}). Cache disabled.`);
    _client = null;
    _available = false;
  }
}

export async function disconnectValkey(): Promise<void> {
  if (_client) {
    try {
      await _client.disconnect();
      console.log("[Valkey] Disconnected");
    } catch {
      // Connection may already be dead — ignore
    }
  }
}

export function getValkeyClient(): RedisClientType | null {
  return _available ? _client : null;
}
