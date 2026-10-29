import { type AdminAreaDuplicateGroup, t3 } from "lib";
import { plural } from "panther";
import { For, Show } from "solid-js";

// Shown above every table that maps boundaries to admin areas.
export function AdminAreaDuplicatesWarning(p: {
  groups: AdminAreaDuplicateGroup[];
}) {
  return (
    <Show when={p.groups.length > 0}>
      <div class="bg-warning-subtle border-warning text-warning-subtle-content ui-spy-sm rounded border p-3 text-sm">
        <div class="ui-text-heading text-warning-subtle-content">
          {plural(p.groups.length, {
            one: t3({
              en: "1 admin area name is used by more than one area",
              fr: "1 nom d'unité administrative est porté par plusieurs unités",
              pt: "1 nome de zona administrativa é usado por mais de uma zona",
            }),
            other: t3({
              en:
                `${p.groups.length} admin area names are used by more than one area`,
              fr:
                `${p.groups.length} noms d'unités administratives sont portés par plusieurs unités`,
              pt:
                `${p.groups.length} nomes de zonas administrativas são usados por mais de uma zona`,
            }),
          })}
        </div>
        <div>
          {t3({
            en:
              "Areas that share a name can have only one boundary and one value between them until they are renamed in the facility file and imported again.",
            fr:
              "Des unités qui partagent un nom ne peuvent avoir qu'une seule limite et une seule valeur à elles toutes, jusqu'à ce qu'elles soient renommées dans le fichier des établissements et importées à nouveau.",
            pt:
              "Zonas que partilham um nome só podem ter um limite e um valor entre todas, até serem renomeadas no ficheiro de estabelecimentos e importadas novamente.",
          })}
        </div>
        <div class="max-h-40 overflow-auto">
          <For each={p.groups}>
            {(group) => (
              <div>
                <span class="font-700">{group.name}</span>
                {": "}
                {group.parentPaths.map((path) => path.join(" > ")).join(" · ")}
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
