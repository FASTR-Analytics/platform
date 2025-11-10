import postgres, { Sql } from "postgres";
import { _PG_HOST, _PG_PASSWORD, _PG_PORT } from "../../exposed_env_vars.ts";

/**
 * Create a dedicated PostgreSQL connection for workers
 * Workers need special handling because:
 * 1. They run in separate contexts with no shared connection cache
 * 2. They often perform long-running bulk operations
 * 3. They need different timeout and pool settings
 */
export function createWorkerConnection(
  databaseId: string,
  options?: {
    maxConnections?: number;
    idleTimeout?: number; // in seconds
    statementTimeout?: number; // in milliseconds
    readonly?: boolean;
  }
): Sql {
  const config: any = {
    database: databaseId,
    user: "postgres",
    hostname: _PG_HOST,
    password: _PG_PASSWORD,
    port: Number(_PG_PORT),

    // Worker-specific settings
    max: options?.maxConnections ?? 3, // Lower pool size for workers
    idle_timeout: options?.idleTimeout ?? 300, // 5 minutes default for long operations
    connect_timeout: 30, // Longer connection timeout

    // Performance settings for bulk operations
    prepare: false, // Disable prepared statements for bulk inserts

    // Transform settings
    transform: {
      undefined: null,
    },

    // Error handling
    onnotice: () => {},
  };

  // Add statement_timeout if provided (PostgreSQL server setting)
  if (options?.statementTimeout) {
    config.connection = {
      statement_timeout: options.statementTimeout,
    };
  }

  return postgres(config);
}

/**
 * Create a connection specifically for bulk import operations
 */
export function createBulkImportConnection(databaseId: string): Sql {
  return createWorkerConnection(databaseId, {
    maxConnections: 5, // Higher for parallel operations
    idleTimeout: 600, // 10 minutes for very long imports
    // No statement timeout for bulk imports
  });
}

/**
 * Create a connection for read-only worker operations
 */
export function createWorkerReadConnection(databaseId: string): Sql {
  return createWorkerConnection(databaseId, {
    maxConnections: 2,
    idleTimeout: 120, // 2 minutes
    readonly: true,
  });
}
