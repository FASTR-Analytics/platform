import { t3, type IcehImportRunStatus } from "lib";

export function icehRunStatusLabel(status: IcehImportRunStatus): string {
  if (status === "running") {
    return t3({ en: "Running", fr: "En cours", pt: "Em curso" });
  }
  if (status === "needs_review") {
    return t3({ en: "Needs review", fr: "À vérifier", pt: "A rever" });
  }
  if (status === "complete") {
    return t3({ en: "Complete", fr: "Terminée", pt: "Concluída" });
  }
  if (status === "cancelled") {
    return t3({ en: "Cancelled", fr: "Annulée", pt: "Cancelada" });
  }
  return t3({ en: "Error", fr: "Erreur", pt: "Erro" });
}
