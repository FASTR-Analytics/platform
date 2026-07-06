import { t3, type VersionEditor } from "lib";
import { For, Match, Switch } from "solid-js";
import { projectState } from "~/state/project/t1_store";
import type { DiffSegment } from "./version_diff";

// Shared pieces of the diff views (compare-with-current modal + the
// session-edits view inside the version preview).

/** Display name for a stored editor — prefers the live project-user record
 *  over the name captured at edit time (people get renamed; emails don't). */
export function editorDisplayName(e: VersionEditor): string {
  const known = projectState.projectUsers.find((u) => u.email === e.email);
  const liveName = known
    ? `${known.firstName ?? ""} ${known.lastName ?? ""}`.trim()
    : "";
  return liveName || e.name;
}

export function editorDisplayNames(editors: VersionEditor[]): string {
  return editors.map(editorDisplayName).join(", ");
}

/** email -> display name map for authorship-run lookups: the session's
 *  editors plus any other emails appearing in the runs (resolved against the
 *  live project users, falling back to the email itself). */
export function buildAuthorNames(
  editors: VersionEditor[],
  runs: { email: string | null }[] | null | undefined,
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const e of editors) {
    names[e.email] = editorDisplayName(e);
  }
  for (const run of runs ?? []) {
    if (run.email !== null && !(run.email in names)) {
      names[run.email] = editorDisplayName({ email: run.email, name: run.email });
    }
  }
  return names;
}

export function DiffLegend() {
  return (
    <div class="text-neutral flex items-center gap-4 text-xs">
      <span>
        <span class="bg-success/20 rounded-sm px-1">
          {t3({ en: "added", fr: "ajouté", pt: "adicionado" })}
        </span>
      </span>
      <span>
        <span class="bg-danger/10 text-danger decoration-danger/70 rounded-sm px-1 line-through">
          {t3({ en: "removed", fr: "supprimé", pt: "removido" })}
        </span>
      </span>
      <span>
        {t3({
          en: "Hover a change to see who made it.",
          fr: "Survolez une modification pour voir qui l'a faite.",
          pt: "Passe o cursor sobre uma alteração para ver quem a fez.",
        })}
      </span>
    </div>
  );
}

// Attribution phrasing: an exact author reads "Added by Alice"; a session
// fallback with several editors reads "Added by one of: Alice, Bob" — the
// ledger couldn't pin the individual, so don't pretend otherwise.
function byLabel(who: string, exact: boolean | undefined): string {
  return !exact && who.includes(",")
    ? `${t3({ en: "one of:", fr: "l'une de ces personnes :", pt: "uma destas pessoas:" })} ${who}`
    : who;
}

function addedTitle(who?: string, exact?: boolean): string {
  return who
    ? `${t3({ en: "Added by", fr: "Ajouté par", pt: "Adicionado por" })} ${byLabel(who, exact)}`
    : t3({ en: "Added", fr: "Ajouté", pt: "Adicionado" });
}

function removedTitle(who?: string, exact?: boolean): string {
  return who
    ? `${t3({ en: "Removed by", fr: "Supprimé par", pt: "Removido por" })} ${byLabel(who, exact)}`
    : t3({ en: "Removed", fr: "Supprimé", pt: "Removido" });
}

/** The unified diff text: additions highlighted, removals struck through,
 *  hover names the author. */
export function DiffSegments(p: { segments: DiffSegment[] }) {
  return (
    <div class="font-mono text-xs leading-5 whitespace-pre-wrap">
      <For each={p.segments}>
        {(seg) => (
          <Switch>
            <Match when={seg.kind === "same"}>
              <span>{seg.text}</span>
            </Match>
            <Match when={seg.kind === "added"}>
              <span
                class="bg-success/20 cursor-help rounded-sm"
                title={addedTitle(seg.who, seg.whoExact)}
              >
                {seg.text}
              </span>
            </Match>
            <Match when={seg.kind === "removed"}>
              <span
                class="bg-danger/10 text-danger decoration-danger/70 cursor-help rounded-sm line-through"
                title={removedTitle(seg.who, seg.whoExact)}
              >
                {seg.text}
              </span>
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
}
