import { type HfaRegistrySaveResult, t3 } from "lib";
import { openAlert, toNum0 } from "panther";
import { For, Show } from "solid-js";
import { getAdminAreaLabelForLevel } from "~/state/instance/_util_disaggregation_label";

// A save that leaves map areas or scopes naming an admin area no facility is
// in says so, since neither is updated with the registry.
export async function alertHfaRegistryOrphans(
  result: HfaRegistrySaveResult,
): Promise<void> {
  const maps = result.orphanedGeojsonAreaIds.filter((o) => o.orphanedCount > 0);
  const scopes = result.orphanedScopeAreas;
  if (maps.length === 0 && scopes.length === 0) {
    return;
  }
  await openAlert({
    title: t3({
      en: "Admin areas no facility is in",
      fr: "Unités administratives sans établissement",
      pt: "Zonas administrativas sem estabelecimento",
    }),
    intent: "danger",
    text: () => (
      <div class="ui-spy-sm">
        <For each={maps}>
          {(o) => (
            <div>
              {t3({
                en: `The ${
                  t3(getAdminAreaLabelForLevel(o.adminAreaLevel))
                } map has ${
                  toNum0(o.orphanedCount)
                } areas no HFA facility is in.`,
                fr: `La carte ${
                  t3(getAdminAreaLabelForLevel(o.adminAreaLevel))
                } a ${
                  toNum0(o.orphanedCount)
                } zones dans lesquelles aucun établissement HFA ne se trouve.`,
                pt: `O mapa ${
                  t3(getAdminAreaLabelForLevel(o.adminAreaLevel))
                } tem ${
                  toNum0(o.orphanedCount)
                } zonas em que nenhum estabelecimento HFA se encontra.`,
              })}
            </div>
          )}
        </For>
        <Show when={scopes.length > 0}>
          <div>
            {t3({
              en: "These scopes name an HFA admin area no facility is in:",
              fr:
                "Ces périmètres nomment une unité administrative HFA sans établissement :",
              pt:
                "Estes âmbitos nomeiam uma zona administrativa HFA sem estabelecimento:",
            })}
          </div>
          <For each={scopes}>
            {(s) => <div>{`${s.scopeLabel} (${s.adminArea2})`}</div>}
          </For>
        </Show>
      </div>
    ),
  });
}
