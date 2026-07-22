import { tourTarget } from "@njwse/roadtrip";
import type { TourDefinition, TourLabels } from "@njwse/roadtrip";
import { t3 } from "lib";
import { projectState } from "~/state/project/t1_store";

// Built as factories (not module-level constants) so t3() resolves after the
// app language has been set.

function tourLabels(): TourLabels {
  return {
    next: t3({ en: "Next", fr: "Suivant", pt: "Seguinte" }),
    back: t3({ en: "Back", fr: "Retour", pt: "Voltar" }),
    skip: t3({ en: "Skip tour", fr: "Passer la visite", pt: "Ignorar a visita" }),
    done: t3({ en: "Done", fr: "Terminé", pt: "Concluído" }),
  };
}

export function buildDecksEditorTour(): TourDefinition {
  return {
    id: "decks-intro-editor",
    labels: tourLabels(),
    steps: [
      {
        id: "folders",
        target: tourTarget("decks-folders"),
        title: t3({
          en: "Organise with folders",
          fr: "Organisez avec des dossiers",
          pt: "Organize com pastas",
        }),
        body: t3({
          en: "Right-click a folder to rename it, change its colour, or delete it — and use New folder to add more.",
          fr: "Faites un clic droit sur un dossier pour le renommer, changer sa couleur ou le supprimer — et utilisez Nouveau dossier pour en ajouter.",
          pt: "Clique com o botão direito numa pasta para mudar o nome, alterar a cor ou eliminá-la — e utilize Nova pasta para adicionar mais.",
        }),
        placement: "right",
        when: () => projectState.projectModules.length > 0,
      },
      {
        id: "create",
        target: tourTarget("decks-create"),
        title: t3({
          en: "Create a slide deck",
          fr: "Créer une présentation",
          pt: "Criar uma apresentação",
        }),
        body: t3({
          en: "Start a new deck here. The project needs at least one module enabled first.",
          fr: "Commencez une nouvelle présentation ici. Le projet doit d'abord avoir au moins un module activé.",
          pt: "Comece uma nova apresentação aqui. Primeiro, o projeto tem de ter pelo menos um módulo ativado.",
        }),
        placement: "bottom",
        when: () =>
          !projectState.isLocked &&
          projectState.projectModules.length > 0 &&
          projectState.thisUserPermissions.can_configure_slide_decks,
      },
    ],
  };
}

export function buildDecksViewerTour(): TourDefinition {
  return {
    id: "decks-intro-viewer",
    labels: tourLabels(),
    steps: [
      {
        id: "intro",
        target: tourTarget("decks-header"),
        title: t3({
          en: "Slide decks",
          fr: "Présentations",
          pt: "Apresentações",
        }),
        body: t3({
          en: "This is where your project's presentation decks live — presentations built from your project's visualizations. Click any deck to open it.",
          fr: "C'est ici que se trouvent les présentations de votre projet, créées à partir de ses visualisations. Cliquez sur une présentation pour l'ouvrir.",
          pt: "É aqui que estão as apresentações do seu projeto, criadas a partir das suas visualizações. Clique numa apresentação para a abrir.",
        }),
        placement: "bottom",
      },
      {
        id: "folders",
        target: tourTarget("decks-folders"),
        title: t3({
          en: "Browse by folder",
          fr: "Parcourir par dossier",
          pt: "Navegar por pasta",
        }),
        body: t3({
          en: "Decks are organised into folders — pick one here, or switch to a flat list of everything.",
          fr: "Les présentations sont organisées en dossiers — choisissez-en un ici ou passez à une liste simple.",
          pt: "As apresentações estão organizadas em pastas — escolha uma aqui ou mude para uma lista simples.",
        }),
        placement: "right",
        when: () => projectState.projectModules.length > 0,
      },
    ],
  };
}
