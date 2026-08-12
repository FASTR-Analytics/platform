import { t3, type FacilityFamily, type StructureFamilyCounts } from "lib";
import { Button, FrameTop, HeadingBar, createDeleteAction, toNum0 } from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { instanceState, structureSchemaForFamily } from "~/state/instance/t1_store";

type Props = {
  backToInstance: () => void;
};

function FamilyAdminAreaCounts(p: {
  family: FacilityFamily;
  counts: StructureFamilyCounts;
}) {
  const depth = () => structureSchemaForFamily(p.family).adminDepth;
  return (
    <Show when={p.counts.adminArea1s > 0}>
      <div class="ui-spy-sm max-w-72 text-sm">
        <div class="font-700">
          {p.family === "hmis"
            ? t3({ en: "HMIS registry", fr: "Registre SNIS", pt: "Registo SNIS" })
            : t3({
              en: "HFA registry",
              fr: "Registre Enquêtes FOSA",
              pt: "Registo FOSA",
            })}
        </div>
        <Show when={depth() >= 2}>
          <div class="ui-gap flex justify-between">
            <span>{t3(getAdminAreaLabel(2))}:</span>
            <span class="font-mono">{toNum0(p.counts.adminArea2s)}</span>
          </div>
        </Show>
        <Show when={depth() >= 3}>
          <div class="ui-gap flex justify-between">
            <span>{t3(getAdminAreaLabel(3))}:</span>
            <span class="font-mono">{toNum0(p.counts.adminArea3s)}</span>
          </div>
        </Show>
        <Show when={depth() >= 4}>
          <div class="ui-gap flex justify-between">
            <span>{t3(getAdminAreaLabel(4))}:</span>
            <span class="font-mono">{toNum0(p.counts.adminArea4s)}</span>
          </div>
        </Show>
      </div>
    </Show>
  );
}

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
        <HeadingBar
          tonal
          onBack={p.backToInstance}
          heading={t3({ en: "Admin areas", fr: "Unités administratives", pt: "Zonas administrativas" })}
        />
      }
    >
      <div class="ui-pad ui-spy max-w-xl overflow-auto">
        <div class="text-sm">
          {t3({
            en: "Each facility registry (HMIS and HFA) has its own admin area tree. Admin areas are created automatically when that registry's facilities are imported (each facility row carries its admin area path), and removed automatically when no facility in that registry references them.",
            fr: "Chaque registre d'établissements (SNIS et Enquêtes FOSA) possède son propre arbre d'unités administratives. Les unités administratives sont créées automatiquement lors de l'importation des établissements de ce registre (chaque ligne d'établissement porte son chemin d'unité administrative) et supprimées automatiquement lorsqu'aucun établissement de ce registre n'y fait référence.",
            pt: "Cada registo de estabelecimentos (SNIS e FOSA) tem a sua própria árvore de zonas administrativas. As zonas administrativas são criadas automaticamente quando os estabelecimentos desse registo são importados (cada linha de estabelecimento inclui o seu caminho de zona administrativa) e removidas automaticamente quando nenhum estabelecimento desse registo lhes faz referência.",
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
            <div class="ui-spy">
              <FamilyAdminAreaCounts family="hmis" counts={keyedStructure.hmis} />
              <FamilyAdminAreaCounts family="hfa" counts={keyedStructure.hfa} />
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
