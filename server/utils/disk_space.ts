import { join } from "@std/path";
import { Sql } from "postgres";
import {
  _SANDBOX_DIR_PATH,
  _STATUS_API_KEY,
  _VOLUME_NAME,
} from "../exposed_env_vars.ts";

interface DiskStats {
  availBytes: number;
  totalBytes: number;
}

async function getDiskStats(): Promise<DiskStats | null> {
  try {
    const cmd = new Deno.Command("df", {
      args: ["--block-size=1", "--output=avail,size", _SANDBOX_DIR_PATH],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout } = await cmd.output();
    if (code !== 0) return null;
    const lines = new TextDecoder().decode(stdout).trim().split("\n");
    const parts = lines[1]?.trim().split(/\s+/);
    if (!parts || parts.length < 2) return null;
    const availBytes = parseInt(parts[0], 10);
    const totalBytes = parseInt(parts[1], 10);
    if (isNaN(availBytes) || isNaN(totalBytes) || totalBytes === 0) return null;
    console.log(`[disk_space] avail=${toGB(availBytes)}GB total=${toGB(totalBytes)}GB used=${toGB(totalBytes - availBytes)}GB (${Math.round((1 - availBytes / totalBytes) * 100)}%)`);
    return { availBytes, totalBytes };
  } catch {
    console.warn("[disk_space] getDiskStats failed");
    return null;
  }
}

async function getProjectSandboxBytes(projectId: string): Promise<number> {
  try {
    const projectDir = join(_SANDBOX_DIR_PATH, projectId);
    const cmd = new Deno.Command("du", {
      args: ["--block-size=1", "-s", projectDir],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout } = await cmd.output();
    if (code !== 0) return 0;
    const val = parseInt(
      new TextDecoder().decode(stdout).trim().split(/\s+/)[0] ?? "0",
      10,
    );
    return isNaN(val) ? 0 : val;
  } catch {
    return 0;
  }
}

function toGB(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

function maybeRequestVolumeResize(stats: DiskStats): boolean {
  const usedBytes = stats.totalBytes - stats.availBytes;
  if (usedBytes / stats.totalBytes < 0.90) return false;
  const targetSizeGB = Math.ceil(usedBytes / 0.80 / 1024 ** 3);
  const url = "https://status-api.fastr-analytics.org/api/volumes/resize";
  const key = _STATUS_API_KEY;
  const volume = _VOLUME_NAME;
  if (!url || !key || !volume) return false;
  fetch(url, {
    method: "POST",
    headers: {
      "X-Internal-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ volume, targetSizeGB }),
  }).catch(() => {});
  return true;
}

const MIN_FREE_BYTES_FOR_NEW_PROJECT = 500 * 1024 * 1024; // 500 MB
const MIN_FREE_BYTES_FOR_MODULE_RUN = 200 * 1024 * 1024; // 200 MB

const DATASET_TABLE_NAMES: Record<string, string> = {
  hmis: "dataset_hmis",
  hfa: "dataset_hfa",
};

export async function checkSpaceForNewProject(): Promise<{
  ok: boolean;
  availableGB?: number;
  resizeTriggered?: boolean;
}> {
  const stats = await getDiskStats();
  if (stats === null) return { ok: true };
  const resizeTriggered = maybeRequestVolumeResize(stats);
  if (stats.availBytes < MIN_FREE_BYTES_FOR_NEW_PROJECT) {
    return { ok: false, availableGB: toGB(stats.availBytes), resizeTriggered };
  }
  return { ok: true };
}

export async function checkSpaceForModuleRun(): Promise<{
  ok: boolean;
  availableGB?: number;
  resizeTriggered?: boolean;
}> {
  const stats = await getDiskStats();
  if (stats === null) return { ok: true };
  const resizeTriggered = maybeRequestVolumeResize(stats);
  if (stats.availBytes < MIN_FREE_BYTES_FOR_MODULE_RUN) {
    return { ok: false, availableGB: toGB(stats.availBytes), resizeTriggered };
  }
  return { ok: true };
}

export async function checkSpaceForDataset(
  mainDb: Sql,
  datasetType: string,
): Promise<{ ok: boolean; requiredGB?: number; availableGB?: number; resizeTriggered?: boolean }> {
  const stats = await getDiskStats();
  if (stats === null) return { ok: true };
  const resizeTriggered = maybeRequestVolumeResize(stats);

  const tableName = DATASET_TABLE_NAMES[datasetType];
  if (!tableName) return { ok: true };

  let tableBytes = 0;
  try {
    const rows = await mainDb<[{ size: bigint }]>`
      SELECT pg_total_relation_size(${tableName}) AS size
    `;
    tableBytes = Number(rows[0]?.size ?? 0);
  } catch {
    return { ok: true };
  }

  const required = Math.ceil(tableBytes * 1.5); // CSV export ~1.5× Postgres binary size
  if (required > 0 && required >= stats.availBytes) {
    return {
      ok: false,
      requiredGB: toGB(required),
      availableGB: toGB(stats.availBytes),
      resizeTriggered,
    };
  }
  return { ok: true };
}

export async function checkSpaceForCopyProject(
  mainDb: Sql,
  projectId: string,
): Promise<{ ok: boolean; requiredGB?: number; availableGB?: number; resizeTriggered?: boolean }> {
  const stats = await getDiskStats();
  if (stats === null) return { ok: true };
  const resizeTriggered = maybeRequestVolumeResize(stats);

  let dbBytes = 0;
  try {
    const rows = await mainDb<[{ size: bigint }]>`
      SELECT pg_database_size(${projectId}) AS size
    `;
    dbBytes = Number(rows[0]?.size ?? 0);
  } catch {
    // fail open
  }

  const sandboxBytes = await getProjectSandboxBytes(projectId);
  const required = dbBytes + sandboxBytes;

  if (required > 0 && required >= stats.availBytes) {
    return {
      ok: false,
      requiredGB: toGB(required),
      availableGB: toGB(stats.availBytes),
      resizeTriggered,
    };
  }
  return { ok: true };
}
