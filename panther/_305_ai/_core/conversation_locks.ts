// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Every conversation-list write is a read-modify-write of one IndexedDB
// key, and two in flight at once (a turn's finally updating lastMessageAt
// while a new conversation is added) lose the loser's write, which orphans
// a record on reload. The Web Locks API serializes them across tabs; where
// it is absent (an insecure browser context) the writes chain on a module
// promise, which serializes them within the tab.
const LIST_LOCK_NAME = "panther-ai-conv-list";

let chain: Promise<void> = Promise.resolve();

function lockManager(): LockManager | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.locks;
}

// Awaited rather than returned: TypeScript 5.9's lib types `request` as
// generic over the callback's return, so an async callback would type as a
// nested promise (the runtime flattens it), while TypeScript 6.0's lib, which
// Deno runs, types it as `Promise<Awaited<T>>`; `await` unwraps both.
export async function withListLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = lockManager();
  if (locks) return await locks.request(LIST_LOCK_NAME, fn);
  const run = chain.then(fn);
  chain = run.then(
    () => {},
    () => {},
  );
  return await run;
}
