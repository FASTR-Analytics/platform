import { type Accessor, createSignal, onCleanup } from "solid-js";

// One tab owns the chat (ruling 14): a conversation store is built from a
// record no other live tab writes, since the engine takes no cross-tab turn
// lock and adopts no record. The panel requests the Web Lock named for the
// user's thread scope when it mounts and mounts the chat only while it holds
// it; while the request is pending it shows the notice and the Use it here
// button in the chat's place. The button posts `takeover` on a
// BroadcastChannel of the lock's name; the owner stops its turn, awaits the
// record's save (`onHandOver`), releases the lock, shows the notice and
// queues a new request, so the browser grants the taker's pending request
// and this tab becomes the owner again when the taker closes. The browser
// releases a closed or crashed owner's lock by itself, so a tab left waiting
// becomes the owner with no message. Without the Web Locks API (an insecure
// context) the tab is the owner at once.

export type TabOwnership = {
  owner: Accessor<boolean>;
  takeOver: () => void;
};

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function createTabOwner(
  scope: string,
  onHandOver: () => Promise<void>,
): TabOwnership {
  const [owner, setOwner] = createSignal(false);
  const locks = navigator.locks;
  if (locks === undefined) {
    setOwner(true);
    return { owner, takeOver: () => {} };
  }
  const name = `copilot-owner/${scope}`;
  const channel = new BroadcastChannel(name);
  let release: (() => void) | undefined;
  let pending: AbortController | undefined;
  let mounted = true;
  // A second `takeover` during the stop-and-save await must not start a
  // second hand-over: both would queue a request, and a request granted after
  // the panel unmounts holds the lock for every panel of this user until the
  // tab closes.
  let handingOver = false;

  function request(): void {
    const controller = new AbortController();
    pending = controller;
    locks
      .request(name, { signal: controller.signal }, () => {
        // The spec ignores the abort once the lock is granted and runs the
        // callback in a later task, so a grant can land after the cleanup;
        // returning then releases the lock instead of holding it until the
        // tab closes.
        if (!mounted) return;
        pending = undefined;
        setOwner(true);
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch((err: unknown) => {
        if (!isAbort(err)) throw err;
      });
  }

  async function handOver(): Promise<void> {
    if (!owner() || handingOver) return;
    handingOver = true;
    await onHandOver();
    handingOver = false;
    setOwner(false);
    release?.();
    release = undefined;
    if (mounted) request();
  }

  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === "takeover") void handOver();
  };
  request();

  onCleanup(() => {
    mounted = false;
    channel.close();
    pending?.abort();
    if (owner()) {
      void onHandOver().then(() => release?.());
    }
  });

  return { owner, takeOver: () => channel.postMessage("takeover") };
}
