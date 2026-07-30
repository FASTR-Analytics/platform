import { tourTarget } from "@njwse/roadtrip";
import type { TourDefinition, TourLabels, TourStep } from "@njwse/roadtrip";
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

// ------------------------------------------------------- Slide deck editor

const elementExists = (selector: string) =>
  document.querySelector(selector) !== null;

export function buildDeckEditorIntroTour(): TourDefinition {
  return {
    id: "deck-editor-intro",
    labels: tourLabels(),
    steps: [
      {
        id: "intro",
        target: tourTarget("deck-toolbar"),
        title: t3({
          en: "Inside a slide deck",
          fr: "Dans une présentation",
          pt: "Dentro de uma apresentação",
        }),
        body: t3({
          en: "This is the deck itself. The bar along the top holds everything you can do to the deck as a whole; the slides sit below it.",
          fr: "Voici la présentation elle-même. La barre du haut regroupe tout ce que vous pouvez faire sur l'ensemble de la présentation ; les diapositives sont en dessous.",
          pt: "Esta é a própria apresentação. A barra superior reúne tudo o que pode fazer à apresentação como um todo; os diapositivos ficam abaixo.",
        }),
        placement: "bottom",
      },
      {
        id: "grid",
        target: tourTarget("deck-grid"),
        title: t3({
          en: "Your slides",
          fr: "Vos diapositives",
          pt: "Os seus diapositivos",
        }),
        body: t3({
          en: "Slides appear in presentation order, numbered as they'll be shown. Drag a slide to move it, and everything you change is saved automatically for the whole team.",
          fr: "Les diapositives apparaissent dans l'ordre de présentation, numérotées telles qu'elles seront affichées. Faites glisser une diapositive pour la déplacer ; tout ce que vous modifiez est enregistré automatiquement pour toute l'équipe.",
          pt: "Os diapositivos aparecem na ordem de apresentação, numerados tal como serão mostrados. Arraste um diapositivo para o mover; tudo o que alterar é guardado automaticamente para toda a equipa.",
        }),
        placement: "top",
        when: () => elementExists('[data-tour="deck-grid"]'),
      },
      {
        id: "slide-size",
        target: tourTarget("deck-slide-size"),
        title: t3({
          en: "Thumbnail size",
          fr: "Taille des vignettes",
          pt: "Tamanho das miniaturas",
        }),
        body: t3({
          en: "Zoom the thumbnails to see more slides at once, or use the button beside it to fill the width with one slide.",
          fr: "Ajustez la taille des vignettes pour voir plus de diapositives à la fois, ou utilisez le bouton à côté pour occuper toute la largeur avec une seule diapositive.",
          pt: "Ajuste o tamanho das miniaturas para ver mais diapositivos ao mesmo tempo, ou utilize o botão ao lado para ocupar toda a largura com um diapositivo.",
        }),
        placement: "bottom",
        when: () => elementExists('[data-tour="deck-slide-size"]'),
      },
      {
        id: "present",
        target: "#deck-present-button",
        title: t3({ en: "Present", fr: "Présenter", pt: "Apresentar" }),
        body: t3({
          en: "Play the deck full screen, one slide at a time — useful for reviewing it before a meeting.",
          fr: "Lancez la présentation en plein écran, diapositive par diapositive — pratique pour la relire avant une réunion.",
          pt: "Apresente em ecrã inteiro, um diapositivo de cada vez — útil para revê-la antes de uma reunião.",
        }),
        placement: "bottom",
        when: () => elementExists("#deck-present-button"),
      },
      {
        id: "add-slide",
        target: "#deck-add-slide-button",
        title: t3({
          en: "Add a slide",
          fr: "Ajouter une diapositive",
          pt: "Adicionar um diapositivo",
        }),
        body: t3({
          en: "Choose the kind of slide you need: a Cover to open the deck, a Section to break it into parts, or a Content slide for charts and text.",
          fr: "Choisissez le type de diapositive : une Couverture pour ouvrir la présentation, une Section pour la découper, ou une diapositive de Contenu pour les graphiques et le texte.",
          pt: "Escolha o tipo de diapositivo: uma Capa para abrir a apresentação, uma Secção para a dividir, ou um diapositivo de Conteúdo para gráficos e texto.",
        }),
        placement: "bottom",
      },
      {
        id: "more",
        target: "#deck-more-button",
        title: t3({
          en: "Export, share and history",
          fr: "Exporter, partager et historique",
          pt: "Exportar, partilhar e histórico",
        }),
        body: t3({
          en: "This menu holds Download (PowerPoint or PDF), Share, and Version history — where you can look back at earlier versions and see who changed what.",
          fr: "Ce menu contient Télécharger (PowerPoint ou PDF), Partager et Historique des versions — où vous pouvez consulter les versions précédentes et voir qui a modifié quoi.",
          pt: "Este menu contém Descarregar (PowerPoint ou PDF), Partilhar e Histórico de versões — onde pode consultar versões anteriores e ver quem alterou o quê.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// Deferred until a slide card is on screen (an empty deck has none).
export function buildDeckEditorSlidesTour(): TourDefinition {
  return {
    id: "deck-editor-slides",
    labels: tourLabels(),
    steps: [
      {
        id: "slide-card",
        target: tourTarget("deck-slide-card"),
        title: t3({
          en: "Working with a slide",
          fr: "Travailler sur une diapositive",
          pt: "Trabalhar com um diapositivo",
        }),
        body: t3({
          en: "Click a slide to edit it. Use the circle in its corner to select several at once, and right-click for duplicate, move and delete.",
          fr: "Cliquez sur une diapositive pour la modifier. Utilisez le cercle dans son coin pour en sélectionner plusieurs à la fois, et faites un clic droit pour dupliquer, déplacer ou supprimer.",
          pt: "Clique num diapositivo para o editar. Utilize o círculo no canto para selecionar vários ao mesmo tempo e clique com o botão direito para duplicar, mover e eliminar.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// Ordered last so it merges after the intro/slides parts: the deck tour ends
// by having the user actually open Settings, then explains what's in there.
export function buildDeckEditorSettingsTour(): TourDefinition {
  return {
    id: "deck-editor-settings",
    labels: tourLabels(),
    steps: [
      {
        id: "open-settings",
        target: "#deck-settings-button",
        title: t3({
          en: "Deck settings",
          fr: "Paramètres de la présentation",
          pt: "Definições da apresentação",
        }),
        body: t3({
          en: "Settings control how the whole deck looks. Click it now to open them — the tour continues inside.",
          fr: "Les paramètres contrôlent l'apparence de toute la présentation. Cliquez maintenant pour les ouvrir — la visite continue à l'intérieur.",
          pt: "As definições controlam o aspeto de toda a apresentação. Clique agora para as abrir — a visita continua lá dentro.",
        }),
        placement: "bottom",
        advanceOn: {},
      },
      {
        id: "settings-body",
        target: tourTarget("deck-settings-body"),
        title: t3({
          en: "One look for every slide",
          fr: "Une apparence pour toutes les diapositives",
          pt: "Um aspeto para todos os diapositivos",
        }),
        body: t3({
          en: "Colour theme, font, layout and cover treatment apply to the whole deck, and the Logos section decides which logos slides can show.",
          fr: "Le thème de couleurs, la police, la mise en page et le traitement de la couverture s'appliquent à toute la présentation, et la section Logos détermine les logos que les diapositives peuvent afficher.",
          pt: "O tema de cores, o tipo de letra, o layout e o tratamento da capa aplicam-se a toda a apresentação, e a secção Logótipos define quais os logótipos que os diapositivos podem mostrar.",
        }),
        placement: "right",
      },
      {
        id: "settings-save",
        target: "#deck-settings-save-button",
        title: t3({ en: "Save or cancel", fr: "Enregistrer ou annuler", pt: "Guardar ou cancelar" }),
        body: t3({
          en: "Save applies your changes to every slide at once. Cancel closes without changing anything — either one returns you to the slides.",
          fr: "Enregistrer applique vos modifications à toutes les diapositives d'un coup. Annuler ferme sans rien changer — dans les deux cas vous revenez aux diapositives.",
          pt: "Guardar aplica as suas alterações a todos os diapositivos de uma vez. Cancelar fecha sem alterar nada — em ambos os casos regressa aos diapositivos.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// --------------------------------------------------------- Slide editor

function slideEditorIntroStep(body: string): TourStep {
  return {
    id: "intro",
    target: tourTarget("slide-editor-header"),
    title: t3({
      en: "Editing a slide",
      fr: "Modification d'une diapositive",
      pt: "A editar um diapositivo",
    }),
    body,
    placement: "bottom",
  };
}

function slideEditorBackStep(): TourStep {
  return {
    id: "back",
    target: "#slide-back-button",
    title: t3({
      en: "Back to the deck",
      fr: "Retour à la présentation",
      pt: "Voltar à apresentação",
    }),
    body: t3({
      en: "There's no save button — your edits are saved as you type and shared with anyone else in the deck. This arrow takes you back to the slides.",
      fr: "Il n'y a pas de bouton d'enregistrement — vos modifications sont enregistrées au fur et à mesure et partagées avec les autres personnes dans la présentation. Cette flèche vous ramène aux diapositives.",
      pt: "Não há botão de guardar — as suas edições são guardadas à medida que escreve e partilhadas com quem mais estiver na apresentação. Esta seta leva-o de volta aos diapositivos.",
    }),
    placement: "bottom",
  };
}

function slideTypeStep(): TourStep {
  return {
    id: "type",
    target: tourTarget("slide-type-select"),
    title: t3({ en: "Slide type", fr: "Type de diapositive", pt: "Tipo de diapositivo" }),
    body: t3({
      en: "Switch this slide between Cover, Section and Content at any time — the editing options on the left change to match.",
      fr: "Basculez cette diapositive entre Couverture, Section et Contenu à tout moment — les options d'édition à gauche s'adaptent.",
      pt: "Alterne este diapositivo entre Capa, Secção e Conteúdo em qualquer momento — as opções de edição à esquerda ajustam-se.",
    }),
    placement: "bottom",
  };
}

function slideCanvasStep(): TourStep {
  return {
    id: "canvas",
    target: tourTarget("slide-canvas"),
    title: t3({ en: "Live preview", fr: "Aperçu en direct", pt: "Pré-visualização em direto" }),
    body: t3({
      en: "This is exactly how the slide will look when presented or exported. It re-renders as you edit.",
      fr: "Voici exactement l'apparence de la diapositive lors de la présentation ou de l'export. Elle se met à jour pendant que vous modifiez.",
      pt: "É exatamente assim que o diapositivo ficará ao ser apresentado ou exportado. Atualiza-se enquanto edita.",
    }),
    placement: "left",
  };
}

export function buildSlideCoverTour(): TourDefinition {
  return {
    id: "slide-cover-intro",
    labels: tourLabels(),
    steps: [
      slideEditorIntroStep(
        t3({
          en: "This is a Cover slide — the title slide that opens the deck.",
          fr: "Ceci est une diapositive de Couverture — la diapositive de titre qui ouvre la présentation.",
          pt: "Este é um diapositivo de Capa — o diapositivo de título que abre a apresentação.",
        }),
      ),
      slideTypeStep(),
      {
        id: "cover-fields",
        target: tourTarget("slide-cover-fields"),
        title: t3({
          en: "Cover text and logos",
          fr: "Texte et logos de couverture",
          pt: "Texto e logótipos da capa",
        }),
        body: t3({
          en: "Set the title, subtitle, presenter and date here, and choose which logos the cover shows. The button under each field adjusts its size and weight.",
          fr: "Définissez ici le titre, le sous-titre, le présentateur et la date, et choisissez les logos affichés sur la couverture. Le bouton sous chaque champ ajuste sa taille et son épaisseur.",
          pt: "Defina aqui o título, o subtítulo, o apresentador e a data, e escolha os logótipos que a capa mostra. O botão sob cada campo ajusta o tamanho e a espessura.",
        }),
        placement: "right",
      },
      slideCanvasStep(),
      slideEditorBackStep(),
    ],
  };
}

export function buildSlideSectionTour(): TourDefinition {
  return {
    id: "slide-section-intro",
    labels: tourLabels(),
    steps: [
      slideEditorIntroStep(
        t3({
          en: "This is a Section slide — a divider that introduces the next part of the deck.",
          fr: "Ceci est une diapositive de Section — un séparateur qui introduit la partie suivante de la présentation.",
          pt: "Este é um diapositivo de Secção — um separador que introduz a parte seguinte da apresentação.",
        }),
      ),
      slideTypeStep(),
      {
        id: "section-fields",
        target: tourTarget("slide-section-fields"),
        title: t3({
          en: "Section title",
          fr: "Titre de section",
          pt: "Título da secção",
        }),
        body: t3({
          en: "A section slide is deliberately simple: just a title and an optional subtitle. The button beneath each one adjusts size, bold and italic.",
          fr: "Une diapositive de section est volontairement simple : un titre et un sous-titre facultatif. Le bouton sous chacun ajuste la taille, le gras et l'italique.",
          pt: "Um diapositivo de secção é deliberadamente simples: apenas um título e um subtítulo opcional. O botão sob cada um ajusta o tamanho, o negrito e o itálico.",
        }),
        placement: "right",
      },
      slideCanvasStep(),
      slideEditorBackStep(),
    ],
  };
}

export function buildSlideContentTour(): TourDefinition {
  return {
    id: "slide-content-intro",
    labels: tourLabels(),
    steps: [
      slideEditorIntroStep(
        t3({
          en: "This is a Content slide — the workhorse that carries your charts, tables, images and text.",
          fr: "Ceci est une diapositive de Contenu — celle qui porte vos graphiques, tableaux, images et textes.",
          pt: "Este é um diapositivo de Conteúdo — o que transporta os seus gráficos, tabelas, imagens e texto.",
        }),
      ),
      slideTypeStep(),
      slideCanvasStep(),
      {
        id: "tabs",
        target: tourTarget("slide-content-tabs"),
        title: t3({
          en: "Two sets of options",
          fr: "Deux ensembles d'options",
          pt: "Dois conjuntos de opções",
        }),
        body: t3({
          en: "Header / Footer covers the frame around the slide; Content covers whatever sits in the middle.",
          fr: "En-tête / Pied de page concerne le cadre autour de la diapositive ; Contenu concerne ce qui se trouve au milieu.",
          pt: "Cabeçalho / Rodapé trata da moldura em torno do diapositivo; Conteúdo trata do que está no meio.",
        }),
        placement: "right",
      },
      {
        id: "header-footer",
        target: tourTarget("slide-panel"),
        title: t3({
          en: "Header and footer",
          fr: "En-tête et pied de page",
          pt: "Cabeçalho e rodapé",
        }),
        body: t3({
          en: "Set the header, sub-header, date, footer and logos for this slide. Further down, Add split panel divides the slide so you can put text beside a chart.",
          fr: "Définissez l'en-tête, le sous-titre, la date, le pied de page et les logos de cette diapositive. Plus bas, Ajouter un panneau divisé partage la diapositive pour placer du texte à côté d'un graphique.",
          pt: "Defina o cabeçalho, o subcabeçalho, a data, o rodapé e os logótipos deste diapositivo. Mais abaixo, Adicionar painel dividido divide o diapositivo para colocar texto ao lado de um gráfico.",
        }),
        placement: "right",
      },
      {
        id: "open-content-tab",
        target: tourTarget("slide-content-tab-block"),
        title: t3({ en: "Now the content", fr: "Passons au contenu", pt: "Agora o conteúdo" }),
        body: t3({
          en: "Click the Content tab to carry on.",
          fr: "Cliquez sur l'onglet Contenu pour continuer.",
          pt: "Clique no separador Conteúdo para continuar.",
        }),
        placement: "bottom",
        advanceOn: {},
      },
      {
        id: "blocks",
        target: tourTarget("slide-panel"),
        title: t3({
          en: "Blocks on the slide",
          fr: "Les blocs de la diapositive",
          pt: "Blocos no diapositivo",
        }),
        body: t3({
          en: "Click a block in the preview to edit it here: switch it between text, a visualization or an image, and use Layout to split the slide into more blocks.",
          fr: "Cliquez sur un bloc dans l'aperçu pour le modifier ici : basculez-le entre texte, visualisation ou image, et utilisez Mise en page pour diviser la diapositive en plusieurs blocs.",
          pt: "Clique num bloco na pré-visualização para o editar aqui: alterne entre texto, visualização ou imagem, e utilize Layout para dividir o diapositivo em mais blocos.",
        }),
        placement: "right",
      },
      slideEditorBackStep(),
    ],
  };
}
