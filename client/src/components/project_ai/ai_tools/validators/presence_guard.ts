import { otherPeers } from "~/state/project/collab";

// Refuse an AI edit to a slide another collaborator currently has OPEN in the
// editor (PresenceEntry.slideId is set on editor open, cleared on close), to
// avoid overwriting their live in-progress work. otherPeers() excludes this
// user and is project-wide, so it works from the AI chat context. Best-effort:
// if collab/presence isn't connected, otherPeers() is empty and edits proceed
// (we can't know who is editing). The thrown message is surfaced to the AI,
// which relays it to the user — matching every other tool refusal.
export function assertSlidesNotBusy(slideIds: string[]): void {
  const busy = new Map<string, Set<string>>(); // slideId -> collaborator names
  for (const peer of otherPeers()) {
    if (peer.slideId && slideIds.includes(peer.slideId)) {
      let names = busy.get(peer.slideId);
      if (!names) {
        names = new Set<string>();
        busy.set(peer.slideId, names);
      }
      names.add(peer.name);
    }
  }
  if (busy.size === 0) {
    return;
  }

  const who = [...new Set([...busy.values()].flatMap((s) => [...s]))];
  const plural = busy.size > 1;
  throw new Error(
    `I can't edit ${plural ? "those slides" : "that slide"} right now — ` +
      `${who.join(", ")} ${who.length > 1 ? "are" : "is"} currently editing ` +
      `${plural ? "them" : "it"}. To avoid overwriting someone else's live ` +
      `work, I won't change slides that other people have open. Ask them to ` +
      `close ${plural ? "them" : "it"}, or pick a different slide.`,
  );
}
