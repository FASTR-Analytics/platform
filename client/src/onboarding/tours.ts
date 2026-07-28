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
    ],
  };
}

// Deferred until the project actually has decks (entry-level `when` in
// index.ts) — held back without being marked seen, so it runs on the first
// decks visit where a deck exists, or merges into the intro run when decks
// are already there.
export function buildDecksOpenDeckTour(): TourDefinition {
  return {
    id: "decks-open-deck",
    labels: tourLabels(),
    steps: [
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
      },
    ],
  };
}

// Deferred like the open-deck tour, additionally editor-gated.
export function buildDecksManageTour(): TourDefinition {
  return {
    id: "decks-manage-decks",
    labels: tourLabels(),
    steps: [
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
      },
    ],
  };
}

export function buildReportsViewerTour(): TourDefinition {
  return {
    id: "reports-intro-viewer",
    labels: tourLabels(),
    steps: [
      {
        id: "intro",
        target: tourTarget("reports-header"),
        title: t3({ en: "Reports", fr: "Rapports", pt: "Relatórios" }),
        body: t3({
          en: "Reports are long-form documents that combine your project's visualizations with written analysis, ready to export as PDF or Word.",
          fr: "Les rapports sont des documents détaillés qui associent les visualisations de votre projet à une analyse rédigée, prêts à être exportés en PDF ou Word.",
          pt: "Os relatórios são documentos detalhados que combinam as visualizações do seu projeto com análise escrita, prontos para exportar em PDF ou Word.",
        }),
        placement: "bottom",
      },
      {
        id: "search",
        target: tourTarget("reports-header") + " input",
        title: t3({ en: "Search", fr: "Recherche", pt: "Pesquisa" }),
        body: t3({
          en: "Type at least three letters to filter reports by name.",
          fr: "Saisissez au moins trois lettres pour filtrer les rapports par nom.",
          pt: "Escreva pelo menos três letras para filtrar os relatórios por nome.",
        }),
        placement: "bottom",
      },
      {
        id: "sort",
        target: tourTarget("reports-sort"),
        title: t3({ en: "Sorting", fr: "Tri", pt: "Ordenação" }),
        body: t3({
          en: "Order reports by name or by when they were last updated.",
          fr: "Classez les rapports par nom ou par date de dernière mise à jour.",
          pt: "Ordene os relatórios por nome ou pela data da última atualização.",
        }),
        placement: "bottom",
      },
      {
        id: "folders",
        target: tourTarget("reports-folders"),
        title: t3({
          en: "Browse by folder",
          fr: "Parcourir par dossier",
          pt: "Navegar por pasta",
        }),
        body: t3({
          en: "Reports are organised into folders — pick one here, or switch to a flat list of everything. The counts show how many reports each folder contains.",
          fr: "Les rapports sont organisés en dossiers — choisissez-en un ici ou passez à une liste simple. Les nombres indiquent combien de rapports chaque dossier contient.",
          pt: "Os relatórios estão organizados em pastas — escolha uma aqui ou mude para uma lista simples. Os números indicam quantos relatórios cada pasta contém.",
        }),
        placement: "right",
      },
      {
        id: "grid",
        target: tourTarget("reports-grid"),
        title: t3({
          en: "Your reports",
          fr: "Vos rapports",
          pt: "Os seus relatórios",
        }),
        body: t3({
          en: "Every report in the selected folder appears here with a preview of its first page.",
          fr: "Tous les rapports du dossier sélectionné apparaissent ici avec un aperçu de leur première page.",
          pt: "Todos os relatórios da pasta selecionada aparecem aqui com uma pré-visualização da primeira página.",
        }),
        placement: "top",
      },
    ],
  };
}

// Permission-gated second layer: merges after the viewer part for editors, or
// runs on its own on the first visit after a viewer is granted the permission.
export function buildReportsEditorTour(): TourDefinition {
  return {
    id: "reports-intro-editor",
    labels: tourLabels(),
    steps: [
      {
        id: "folders",
        target: tourTarget("reports-folders"),
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
      },
      {
        id: "create",
        target: tourTarget("reports-create"),
        title: t3({
          en: "Create a report",
          fr: "Créer un rapport",
          pt: "Criar um relatório",
        }),
        body: t3({
          en: "Start a new report here, then build it up from your project's visualizations and text.",
          fr: "Commencez un nouveau rapport ici, puis composez-le à partir des visualisations et des textes de votre projet.",
          pt: "Comece um novo relatório aqui e componha-o a partir das visualizações e dos textos do seu projeto.",
        }),
        placement: "bottom",
        when: () => !projectState.isLocked,
      },
    ],
  };
}

// Deferred like the deck-card tours — needs a report card on screen.
export function buildReportsManageTour(): TourDefinition {
  return {
    id: "reports-manage-reports",
    labels: tourLabels(),
    steps: [
      {
        id: "report-actions",
        target: tourTarget("reports-report-card"),
        title: t3({
          en: "Manage reports",
          fr: "Gérer les rapports",
          pt: "Gerir relatórios",
        }),
        body: t3({
          en: "Right-click a report to move it to a folder, duplicate it, or delete it. Use the selection circles to act on several at once.",
          fr: "Faites un clic droit sur un rapport pour le déplacer dans un dossier, le dupliquer ou le supprimer. Utilisez les cercles de sélection pour agir sur plusieurs à la fois.",
          pt: "Clique com o botão direito num relatório para o mover para uma pasta, duplicá-lo ou eliminá-lo. Utilize os círculos de seleção para agir sobre vários ao mesmo tempo.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

export function buildReportsOpenReportTour(): TourDefinition {
  return {
    id: "reports-open-reports",
    labels: tourLabels(),
    steps: [
      {
        id: "open-report",
        target: tourTarget("reports-report-card"),
        title: t3({
          en: "Open a report",
          fr: "Ouvrir un rapport",
          pt: "Abrir um relatório",
        }),
        body: t3({
          en: "Click a report to open it in the editor. Avatars in the corner show teammates working in it right now.",
          fr: "Cliquez sur un rapport pour l'ouvrir dans l'éditeur. Les avatars dans le coin indiquent les collègues qui y travaillent en ce moment.",
          pt: "Clique num relatório para o abrir no editor. Os avatares no canto mostram os colegas que estão a trabalhar nele neste momento.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// ---------------------------------------------------------------- Modules

export function buildModulesIntroTour(): TourDefinition {
  return {
    id: "modules-intro",
    labels: tourLabels(),
    steps: [
      {
        id: "intro",
        target: tourTarget("modules-header"),
        title: t3({ en: "Modules", fr: "Modules", pt: "Módulos" }),
        body: t3({
          en: "Modules are the analysis pipelines that turn this project's data into results — the metrics, visualizations, and reports everything else is built from.",
          fr: "Les modules sont les chaînes d'analyse qui transforment les données de ce projet en résultats — les métriques, visualisations et rapports sur lesquels tout le reste repose.",
          pt: "Os módulos são as cadeias de análise que transformam os dados deste projeto em resultados — as métricas, visualizações e relatórios em que tudo o resto assenta.",
        }),
        placement: "bottom",
      },
      {
        id: "list",
        target: tourTarget("modules-list"),
        title: t3({
          en: "Available modules",
          fr: "Modules disponibles",
          pt: "Módulos disponíveis",
        }),
        body: t3({
          en: "Every module this project can use is listed here — the ones already enabled show their status, and the rest are ready to be added.",
          fr: "Tous les modules utilisables par ce projet sont listés ici — ceux déjà activés affichent leur état, les autres sont prêts à être ajoutés.",
          pt: "Todos os módulos que este projeto pode utilizar estão listados aqui — os que já estão ativados mostram o seu estado e os restantes estão prontos a ser adicionados.",
        }),
        placement: "top",
      },
      {
        id: "check-updates",
        target: tourTarget("modules-check-updates"),
        title: t3({
          en: "Check for updates",
          fr: "Vérifier les mises à jour",
          pt: "Verificar atualizações",
        }),
        body: t3({
          en: "Modules are versioned and improve over time. Check here to see whether newer versions are available for this project.",
          fr: "Les modules sont versionnés et évoluent avec le temps. Vérifiez ici si de nouvelles versions sont disponibles pour ce projet.",
          pt: "Os módulos têm versões e vão melhorando ao longo do tempo. Verifique aqui se existem versões mais recentes para este projeto.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// Deferred until an installed module card is on screen; permission-gated so a
// user promoted to configure modules later still gets it.
export function buildModulesManageTour(): TourDefinition {
  return {
    id: "modules-manage",
    labels: tourLabels(),
    steps: [
      {
        id: "installed-card",
        target: tourTarget("modules-installed-card"),
        title: t3({
          en: "An enabled module",
          fr: "Un module activé",
          pt: "Um módulo ativado",
        }),
        body: t3({
          en: "Each enabled module shows its run status and version. Settings opens its parameters, and the menu on the right holds run, logs, and removal actions.",
          fr: "Chaque module activé affiche son état d'exécution et sa version. Paramètres ouvre ses réglages, et le menu à droite contient l'exécution, les journaux et la suppression.",
          pt: "Cada módulo ativado mostra o seu estado de execução e a sua versão. Definições abre os seus parâmetros e o menu à direita contém executar, registos e remoção.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
      },
      {
        id: "update-all",
        target: tourTarget("modules-update-all"),
        title: t3({
          en: "Keep modules current",
          fr: "Gardez les modules à jour",
          pt: "Mantenha os módulos atualizados",
        }),
        body: t3({
          en: "Update every enabled module to its latest version in one go. Updated modules re-run, refreshing the results that depend on them.",
          fr: "Mettez à jour tous les modules activés vers leur dernière version en une seule fois. Les modules mis à jour se relancent et actualisent les résultats qui en dépendent.",
          pt: "Atualize todos os módulos ativados para a versão mais recente de uma só vez. Os módulos atualizados voltam a ser executados, atualizando os resultados que deles dependem.",
        }),
        placement: "bottom",
        when: () => !projectState.isLocked,
      },
    ],
  };
}

// Deferred until an available (not-yet-enabled) module card is on screen.
export function buildModulesEnableTour(): TourDefinition {
  return {
    id: "modules-enable",
    labels: tourLabels(),
    steps: [
      {
        id: "enable",
        target: tourTarget("modules-uninstalled-card"),
        title: t3({
          en: "Add a module",
          fr: "Ajouter un module",
          pt: "Adicionar um módulo",
        }),
        body: t3({
          en: "Enable a module to add its analysis to this project. Some modules need others enabled first, and each one runs as soon as its data is ready.",
          fr: "Activez un module pour ajouter son analyse à ce projet. Certains modules nécessitent d'autres modules au préalable, et chacun s'exécute dès que ses données sont prêtes.",
          pt: "Ative um módulo para adicionar a sua análise a este projeto. Alguns módulos exigem que outros estejam ativados primeiro, e cada um é executado assim que os seus dados estiverem prontos.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}
