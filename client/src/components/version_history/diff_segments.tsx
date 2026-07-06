import { presenceColorForKey, t3, type VersionEditor } from "lib";
import { For } from "solid-js";
import { projectState } from "~/state/project/t1_store";
import type { DiffSegment } from "./version_diff";

// Changes whose author is unknown (session fallback) get a neutral color
// instead of a presence color.
const UNKNOWN_COLOR = "#64748b";

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
 *  editors plus any other emails appearing in the runs — writers AND deleters
 *  (resolved against the live project users, falling back to the email). */
export function buildAuthorNames(
  editors: VersionEditor[],
  runs:
    | { email: string | null; deletedBy?: string | null }[]
    | null
    | undefined,
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const e of editors) {
    names[e.email] = editorDisplayName(e);
  }
  for (const run of runs ?? []) {
    for (const email of [run.email, run.deletedBy]) {
      if (email !== null && email !== undefined && !(email in names)) {
        names[email] = editorDisplayName({ email, name: email });
      }
    }
  }
  return names;
}

export function DiffLegend() {
  return (
    <div class="text-neutral flex items-center gap-4 text-xs">
      <span>
        <span
          class="rounded-sm px-1"
          style={{ "background-color": `${UNKNOWN_COLOR}33` }}
        >
          {t3({ en: "added", fr: "ajouté", pt: "adicionado" })}
        </span>
      </span>
      <span>
        <span
          class="rounded-sm px-1 line-through"
          style={{
            "background-color": `${UNKNOWN_COLOR}33`,
            "text-decoration-color": UNKNOWN_COLOR,
          }}
        >
          {t3({ en: "removed", fr: "supprimé", pt: "removido" })}
        </span>
      </span>
      <span>
        {t3({
          en: "Each change is tinted with its editor's colour — hover to see who made it.",
          fr: "Chaque modification porte la couleur de son auteur — survolez pour voir qui l'a faite.",
          pt: "Cada alteração tem a cor do seu autor — passe o cursor para ver quem a fez.",
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

/** The unified diff text: every change is tinted with its author's presence
 *  color (additions highlighted, removals additionally struck through), and
 *  hovering shows a caret-style name flag — the same little label the collab
 *  editors put above remote carets (y-codemirror's .cm-ySelectionInfo). */
export function DiffSegments(p: { segments: DiffSegment[] }) {
  return (
    <div class="font-mono text-xs leading-5 whitespace-pre-wrap">
      <For each={p.segments}>
        {(seg) => {
          if (seg.kind === "same") return <span>{seg.text}</span>;
          const color = seg.whoEmail
            ? presenceColorForKey(seg.whoEmail)
            : UNKNOWN_COLOR;
          const flag = seg.kind === "added"
            ? addedTitle(seg.who, seg.whoExact)
            : removedTitle(seg.who, seg.whoExact);
          return (
            <span
              class="group relative cursor-help rounded-sm"
              classList={{ "line-through": seg.kind === "removed" }}
              style={{
                // The editors' translucent-selection convention (color + "33").
                "background-color": `${color}33`,
                ...(seg.kind === "removed"
                  ? { "text-decoration-color": color }
                  : {}),
              }}
            >
              {seg.text}
              <span
                class="pointer-events-none absolute left-0 z-10 rounded-sm px-1 font-sans whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  top: "-1.05em",
                  "font-size": "10.5px",
                  "background-color": color,
                }}
              >
                {flag}
              </span>
            </span>
          );
        }}
      </For>
    </div>
  );
}
