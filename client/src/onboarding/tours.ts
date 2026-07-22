import { tourTarget } from "@njwse/roadtrip";
import type { TourDefinition, TourLabels } from "@njwse/roadtrip";
import { t3 } from "lib";

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

export function buildDecksTour(): TourDefinition {
  return {
    id: "decks-intro",
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
          en: "Build presentation decks from your project's visualizations and collaborate with your team in real time.",
          fr: "Créez des présentations à partir des visualisations de votre projet et collaborez en temps réel avec votre équipe.",
          pt: "Crie apresentações a partir das visualizações do seu projeto e colabore com a sua equipa em tempo real.",
        }),
        placement: "bottom",
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
        waitForTargetTimeoutMs: 1500,
        onTargetTimeout: "skip",
      },
      {
        id: "folders",
        target: tourTarget("decks-folders"),
        title: t3({
          en: "Organise with folders",
          fr: "Organisez avec des dossiers",
          pt: "Organize com pastas",
        }),
        body: t3({
          en: "Group decks into folders, or switch to a flat list. Right-click a folder to rename it, change its colour, or delete it.",
          fr: "Regroupez les présentations dans des dossiers ou passez à une liste simple. Faites un clic droit sur un dossier pour le renommer, changer sa couleur ou le supprimer.",
          pt: "Agrupe as apresentações em pastas ou mude para uma lista simples. Clique com o botão direito numa pasta para mudar o nome, alterar a cor ou eliminá-la.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 1500,
        onTargetTimeout: "skip",
      },
    ],
  };
}
