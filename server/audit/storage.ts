import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import type { DirectAuditLog } from "./types.ts";

interface QueuedLog extends DirectAuditLog {
  timestamp: Date;
}

class AuditQueue {
  private queue: QueuedLog[] = [];
  private flushTimer: number | null = null;
  private readonly maxBatchSize = 100;
  private readonly flushIntervalMs = 1000;
  private isProcessing = false;

  add(log: DirectAuditLog): void {
    this.queue.push({
      ...log,
      timestamp: new Date(),
    });

    if (this.queue.length >= this.maxBatchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.flushIntervalMs) as any;
    }
  }

  private async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0 || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const batch = this.queue.splice(0, this.maxBatchSize);

    try {
      await this.writeBatch(batch);
    } catch (error) {
      console.error("Failed to write audit logs:", error);
      console.error("Failed batch:", batch);
    } finally {
      this.isProcessing = false;
      
      if (this.queue.length > 0) {
        this.flush();
      }
    }
  }

  private async writeBatch(logs: QueuedLog[]): Promise<void> {
    const db = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
    
    try {
      // Use postgres library's built-in array handling
      const rows = logs.map(log => ({
        timestamp: log.timestamp,
        user_email: log.user_email,
        project_id: log.project_id,
        action: log.action,
        resource_type: log.resource_type,
        resource_id: log.resource_id,
        method: log.method,
        path: log.path,
        details: log.details ? JSON.stringify(log.details) : null,
        success: log.success,
        error_message: log.error_message,
        session_id: log.session_id,
      }));

      await db`
        INSERT INTO audit_logs ${db(rows)}
      `;
    } catch (error) {
      if (error instanceof Error && error.message?.includes("audit_logs")) {
        console.error("Audit logs table does not exist. Please run the migration from src/db/instance/_main_database.sql");
      }
      throw error;
    }
  }

  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

const auditQueue = new AuditQueue();
const priorityQueue = new AuditQueue();

export async function logAuditEvent(log: DirectAuditLog): Promise<void> {
  const isPriority = log.action === "USER_LOGIN" || 
                     log.action === "USER_LOGOUT" ||
                     log.action.includes("DELETE");
  
  if (isPriority) {
    priorityQueue.add(log);
  } else {
    auditQueue.add(log);
  }
}

export async function flushAuditLogs(): Promise<void> {
  await Promise.all([
    auditQueue.forceFlush(),
    priorityQueue.forceFlush(),
  ]);
}

if (typeof globalThis.addEventListener !== "undefined") {
  globalThis.addEventListener("unload", () => {
    flushAuditLogs().catch(console.error);
  });
}