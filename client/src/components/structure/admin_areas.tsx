import { t3 } from "lib";
import { Button, FrameTop, createDeleteAction, toNum0 } from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  backToInstance: () => void;
};

export function AdminAreas(p: Props) {
  async function attemptDeleteAll() {
    const deleteAction = createDeleteAction(
      t3({
        en: "Are you sure you want to clear ALL admin areas and ALL facilities (HMIS and HFA)?",
        fr: "Êtes-vous sûr de vouloir supprimer TOUTES les unités administratives et TOUS les établissements (SNIS et Enquêtes FOSA) ?",
        pt: "Tem a certeza de que pretende limpar TODAS as zonas administrativas e TODOS os estabelecimentos (SNIS e FOSA)?",
      }),
      () => serverActions.deleteAllStructureData({}),
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={p.backToInstance} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "Admin areas", fr: "Unités administratives", pt: "Zonas administrativas" })}
          </div>
        </div>
      }
    >
      <div class="ui-pad ui-spy max-w-xl overflow-auto">
        <div class="text-sm">
          {t3({
            en: "Admin areas are the shared geography for both facility registries. They are created automatically when facilities are imported (each facility row carries its admin area path), and removed automatically when no facility in either registry references them.",
            fr: "Les unités administratives constituent la géographie commune aux deux registres d'établissements. Elles sont créées automatiquement lors de l'importation des établissements (chaque ligne d'établissement porte son chemin d'unité administrative) et supprimées automatiquement lorsqu'aucun établissement des deux registres n'y fait référence.",
            pt: "As zonas administrativas constituem a geografia comum aos dois registos de estabelecimentos. São criadas automaticamente quando os estabelecimentos são importados (cada linha de estabelecimento inclui o seu caminho de zona administrativa) e removidas automaticamente quando nenhum estabelecimento dos dois registos lhes faz referência.",
          })}
        </div>
        <Show
          when={instanceState.structure}
          fallback={
            <div class="text-danger text-sm">
              {t3({
                en: "No admin areas yet. Import HMIS or HFA facilities to create them.",
                fr: "Aucune unité administrative pour le moment. Importez des établissements SNIS ou Enquêtes FOSA pour les créer.",
                pt: "Ainda não há zonas administrativas. Importe estabelecimentos SNIS ou FOSA para as criar.",
              })}
            </div>
          }
          keyed
        >
          {(keyedStructure) => (
            <div class="ui-spy-sm max-w-72 text-sm">
              <div class="ui-gap flex justify-between">
                <span>{t3(getAdminAreaLabel(2))}:</span>
                <span class="font-mono">{toNum0(keyedStructure.adminArea2s)}</span>
              </div>
              <Show when={instanceState.maxAdminArea >= 3}>
                <div class="ui-gap flex justify-between">
                  <span>{t3(getAdminAreaLabel(3))}:</span>
                  <span class="font-mono">{toNum0(keyedStructure.adminArea3s)}</span>
                </div>
              </Show>
              <Show when={instanceState.maxAdminArea >= 4}>
                <div class="ui-gap flex justify-between">
                  <span>{t3(getAdminAreaLabel(4))}:</span>
                  <span class="font-mono">{toNum0(keyedStructure.adminArea4s)}</span>
                </div>
              </Show>
            </div>
          )}
        </Show>
        <Show when={instanceState.currentUserIsGlobalAdmin && instanceState.structure}>
          <Button
            onClick={attemptDeleteAll}
            intent="danger"
            outline
            iconName="trash"
          >
            {t3({
              en: "Clear all admin areas and facilities",
              fr: "Supprimer toutes les unités administratives et tous les établissements",
              pt: "Limpar todas as zonas administrativas e todos os estabelecimentos",
            })}
          </Button>
        </Show>
      </div>
    </FrameTop>
  );
}
