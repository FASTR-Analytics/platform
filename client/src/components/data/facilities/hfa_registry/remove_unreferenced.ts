import { t3 } from "lib";
import { createDeleteAction, openAlert, plural, toNum0 } from "panther";
import { serverActions } from "~/server_actions";
import { alertHfaRegistryOrphans } from "./orphans_alert.tsx";

// Counted when asked, so the confirmation names the facilities that would
// go now, not when the page loaded.
export async function removeUnreferencedHfaFacilities(): Promise<void> {
  const res = await serverActions.countUnreferencedHfaFacilities({});
  if (!res.success) {
    await openAlert({ text: res.err, intent: "danger" });
    return;
  }
  const count = res.data.count;
  if (count === 0) {
    await openAlert({
      text: t3({
        en:
          "Every HFA facility has data or weights. There is nothing to remove.",
        fr:
          "Chaque établissement HFA a des données ou des pondérations. Il n'y a rien à supprimer.",
        pt:
          "Todos os estabelecimentos HFA têm dados ou ponderações. Não há nada a remover.",
      }),
    });
    return;
  }
  const action = createDeleteAction(
    t3({
      en: `Remove ${
        plural(count, {
          one: "the HFA facility that has",
          other: `the ${toNum0(count)} HFA facilities that have`,
        })
      } no data and no weights? Admin areas left with no facility are removed too.`,
      fr: `Supprimer ${
        plural(count, {
          one: "l'établissement HFA qui n'a",
          other: `les ${toNum0(count)} établissements HFA qui n'ont`,
        })
      } ni données ni pondérations ? Les unités administratives laissées sans établissement sont aussi supprimées.`,
      pt: `Remover ${
        plural(count, {
          one: "o estabelecimento HFA que não tem",
          other: `os ${toNum0(count)} estabelecimentos HFA que não têm`,
        })
      } dados nem ponderações? As zonas administrativas que ficam sem estabelecimento também são removidas.`,
    }),
    () => serverActions.removeUnreferencedHfaFacilities({}),
    alertHfaRegistryOrphans,
  );
  await action.click();
}
