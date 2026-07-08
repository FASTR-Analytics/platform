import type { TranslatableString } from "./types.ts";

export const TC = {
  cancel: { en: "Cancel", fr: "Annuler", pt: "Cancelar" },
  save: { en: "Save", fr: "Sauvegarder", pt: "Guardar" },
  download: { en: "Download", fr: "Télécharger", pt: "Transferir" },
  delete: { en: "Delete", fr: "Supprimer", pt: "Eliminar" },
  edit: { en: "Edit", fr: "Modifier", pt: "Editar" },
  done: { en: "Done", fr: "Terminé", pt: "Concluído" },
  update: { en: "Update", fr: "Mettre à jour", pt: "Atualizar" },
  settings: { en: "Settings", fr: "Paramètres", pt: "Definições" },
  email: { en: "Email", fr: "E-mail", pt: "E-mail" },
  national: { en: "National", fr: "National", pt: "Nacional" },
  columns: { en: "Columns", fr: "Colonnes", pt: "Colunas" },
  rows: { en: "Rows", fr: "Lignes", pt: "Linhas" },
  loading: { en: "Loading...", fr: "Chargement...", pt: "A carregar..." },
  loadingFiles: {
    en: "Loading files...",
    fr: "Chargement des fichiers...",
    pt: "A carregar ficheiros...",
  },
  loadingAssets: {
    en: "Loading asset files...",
    fr: "Chargement des fichiers ressources...",
    pt: "A carregar ficheiros de recursos...",
  },
  fetchingData: {
    en: "Fetching data...",
    fr: "Récupération des données...",
    pt: "A obter dados...",
  },
  general: { en: "General", fr: "Général", pt: "Geral" },
  label: { en: "Label", fr: "Libellé", pt: "Etiqueta" },
  folder: { en: "Folder", fr: "Dossier", pt: "Pasta" },
  goBackToProject: {
    en: "Go back to project",
    fr: "Retour au projet",
    pt: "Voltar ao projeto",
  },
  mustEnterName: {
    en: "You must enter a name",
    fr: "Vous devez saisir un nom",
    pt: "Tem de introduzir um nome",
  },
  disaggregation_disabled_filtered_to_one: {
    en: "Disabled (filtered to single value)",
    fr: "Désactivé (filtré à une seule valeur)",
    pt: "Desativado (filtrado para um único valor)",
  },
  disaggregation_disabled_single_value: {
    en: "Disabled (single value in data)",
    fr: "Désactivé (valeur unique dans les données)",
    pt: "Desativado (valor único nos dados)",
  },
  disaggregation_disabled_single_period: {
    en: "Disabled (single period)",
    fr: "Désactivé (période unique)",
    pt: "Desativado (período único)",
  },
  disaggregation_disabled_single_year: {
    en: "Disabled (single year)",
    fr: "Désactivé (année unique)",
    pt: "Desativado (ano único)",
  },
} as const satisfies Record<string, TranslatableString>;
