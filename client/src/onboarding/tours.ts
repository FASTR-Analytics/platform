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
      {
        id: "deck-actions",
        target: tourTarget("decks-deck-card"),
        title: t3({
          en: "Manage decks",
          fr: "Gérer les présentations",
          pt: "Gerir apresentações",
        }),
        body: t3({
          en: "Right-click a deck to move it to a folder, duplicate it, or delete it. Use the selection circles to act on several at once.",
          fr: "Faites un clic droit sur une présentation pour la déplacer dans un dossier, la dupliquer ou la supprimer. Utilisez les cercles de sélection pour agir sur plusieurs à la fois.",
          pt: "Clique com o botão direito numa apresentação para a mover para uma pasta, duplicá-la ou eliminá-la. Utilize os círculos de seleção para agir sobre várias ao mesmo tempo.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
        when: () =>
          !projectState.isLocked &&
          projectState.projectModules.length > 0 &&
          projectState.slideDecks.length > 0,
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
        id: "search",
        target: () => document.querySelector('[data-tour="decks-header"] input'),
        title: t3({ en: "Search", fr: "Recherche", pt: "Pesquisa" }),
        body: t3({
          en: "Type at least three letters to filter decks by name.",
          fr: "Saisissez au moins trois lettres pour filtrer les présentations par nom.",
          pt: "Escreva pelo menos três letras para filtrar as apresentações por nome.",
        }),
        placement: "bottom",
      },
      {
        id: "sort",
        target: tourTarget("decks-sort"),
        title: t3({ en: "Sorting", fr: "Tri", pt: "Ordenação" }),
        body: t3({
          en: "Order decks by name or by when they were last updated.",
          fr: "Classez les présentations par nom ou par date de dernière mise à jour.",
          pt: "Ordene as apresentações por nome ou pela data da última atualização.",
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
          en: "Decks are organised into folders — pick one here, or switch to a flat list of everything. The counts show how many decks each folder contains.",
          fr: "Les présentations sont organisées en dossiers — choisissez-en un ici ou passez à une liste simple. Les nombres indiquent combien de présentations chaque dossier contient.",
          pt: "As apresentações estão organizadas em pastas — escolha uma aqui ou mude para uma lista simples. Os números indicam quantas apresentações cada pasta contém.",
        }),
        placement: "right",
        when: () => projectState.projectModules.length > 0,
      },
      {
        id: "grid",
        target: tourTarget("decks-grid"),
        title: t3({
          en: "Your decks",
          fr: "Vos présentations",
          pt: "As suas apresentações",
        }),
        body: t3({
          en: "Every deck in the selected folder appears here with a preview of its first slide.",
          fr: "Toutes les présentations du dossier sélectionné apparaissent ici avec un aperçu de leur première diapositive.",
          pt: "Todas as apresentações da pasta selecionada aparecem aqui com uma pré-visualização do primeiro diapositivo.",
        }),
        placement: "top",
        when: () => projectState.projectModules.length > 0,
      },
      {
        id: "open-deck",
        target: tourTarget("decks-deck-card"),
        title: t3({
          en: "Open a deck",
          fr: "Ouvrir une présentation",
          pt: "Abrir uma apresentação",
        }),
        body: t3({
          en: "Click a deck to open it in the editor. Avatars in the corner show teammates working in it right now.",
          fr: "Cliquez sur une présentation pour l'ouvrir dans l'éditeur. Les avatars dans le coin indiquent les collègues qui y travaillent en ce moment.",
          pt: "Clique numa apresentação para a abrir no editor. Os avatares no canto mostram os colegas que estão a trabalhar nela neste momento.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
        when: () =>
          projectState.projectModules.length > 0 &&
          projectState.slideDecks.length > 0,
      },
    ],
  };
}
