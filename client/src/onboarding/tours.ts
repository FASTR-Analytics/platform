import { tourTarget } from "@njwse/roadtrip";
import type { TourDefinition, TourLabels, TourStep } from "@njwse/roadtrip";
import { t3 } from "lib";
import { projectState } from "~/state/project/t1_store";
import { instanceState } from "~/state/instance/t1_store";

// Built as factories (not module-level constants) so t3() resolves after the
// app language has been set.

// Button labels shared by every tour — passed once per manager (roadtrip
// merges them under any tour-specific labels) rather than per definition.
export function tourLabels(): TourLabels {
  return {
    next: t3({ en: "Next", fr: "Suivant", pt: "Seguinte" }),
    back: t3({ en: "Back", fr: "Retour", pt: "Voltar" }),
    skip: t3({
      en: "Skip tour",
      fr: "Passer la visite",
      pt: "Ignorar a visita",
    }),
    done: t3({ en: "Done", fr: "Terminé", pt: "Concluído" }),
  };
}

export function buildDecksEditorTour(): TourDefinition {
  return {
    id: "decks-intro-editor",
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
        target: () =>
          document.querySelector('[data-tour="decks-header"] input'),
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

// ------------------------------------------------------------- Deck editor

export function buildDeckEditorIntroTour(): TourDefinition {
  return {
    id: "deck-editor-intro",
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

// Deferred until a slide card is on screen: the grid, its view controls and
// the card itself only exist once the deck has slides, so an empty deck's
// first visit skips this and gets it after the first slide is added.
export function buildDeckEditorSlidesTour(): TourDefinition {
  return {
    id: "deck-editor-slides",
    steps: [
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
      },
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

// Deferred until the Present button is on screen — it only renders once the
// deck has slides.
export function buildDeckEditorPresentTour(): TourDefinition {
  return {
    id: "deck-editor-present",
    steps: [
      {
        id: "present",
        target: "#deck-present-button",
        title: t3({
          en: "Present the deck",
          fr: "Présenter la présentation",
          pt: "Apresentar",
        }),
        body: t3({
          en: "Play the deck full screen from the first slide — ideal for a live meeting or a last read-through.",
          fr: "Lancez la présentation en plein écran depuis la première diapositive — idéal pour une réunion en direct ou une dernière relecture.",
          pt: "Apresente em ecrã inteiro a partir do primeiro diapositivo — ideal para uma reunião ao vivo ou uma última revisão.",
        }),
        placement: "bottom",
      },
      {
        id: "present-controls",
        target: "#deck-present-button",
        title: t3({
          en: "Moving through the slides",
          fr: "Naviguer entre les diapositives",
          pt: "Percorrer os diapositivos",
        }),
        body: t3({
          en: "Once presenting: arrow keys, space or Page Up/Down move between slides, Home and End jump to the first or last, and Escape closes the presenter.",
          fr: "Pendant la présentation : les flèches, la barre d'espace ou Page haut/bas changent de diapositive, Début et Fin vont à la première ou à la dernière, et Échap ferme le présentateur.",
          pt: "Durante a apresentação: as teclas de seta, a barra de espaços ou Page Up/Down mudam de diapositivo, Home e End saltam para o primeiro ou o último, e Esc fecha o apresentador.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// Walks the user into the version-history overlay via the overflow menu, then
// back out again — the final advanceOn matters, because the overlay covers the
// toolbar that the settings part needs next.
export function buildDeckEditorHistoryTour(): TourDefinition {
  return {
    id: "deck-editor-history",
    steps: [
      {
        id: "open-menu",
        target: "#deck-more-button",
        title: t3({
          en: "Version history",
          fr: "Historique des versions",
          pt: "Histórico de versões",
        }),
        body: t3({
          en: "Every deck keeps a history of earlier versions. Open this menu to find it.",
          fr: "Chaque présentation conserve un historique des versions précédentes. Ouvrez ce menu pour le trouver.",
          pt: "Cada apresentação mantém um histórico de versões anteriores. Abra este menu para o encontrar.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
      {
        id: "pick-version-history",
        // The overflow menu is portal-rendered, so its rows can only be
        // reached positionally: Download, Share, Version history.
        target: () =>
          document.querySelectorAll(".ui-popover-menu button")[2] ?? null,
        title: t3({
          en: "Open version history",
          fr: "Ouvrir l'historique des versions",
          pt: "Abrir o histórico de versões",
        }),
        body: t3({
          en: "Click Version history to carry on.",
          fr: "Cliquez sur Historique des versions pour continuer.",
          pt: "Clique em Histórico de versões para continuar.",
        }),
        placement: "right",
        advanceOn: "click",
        waitForTargetTimeoutMs: 4000,
        onTargetTimeout: "skip",
      },
      {
        id: "version-list",
        target: tourTarget("version-history-list"),
        title: t3({
          en: "Every earlier version",
          fr: "Toutes les versions précédentes",
          pt: "Todas as versões anteriores",
        }),
        body: t3({
          en: "Versions are saved automatically as people edit, grouped by day with the time and who made them. Click one to preview it.",
          fr: "Les versions sont enregistrées automatiquement au fil des modifications, regroupées par jour avec l'heure et l'auteur. Cliquez sur l'une d'elles pour la prévisualiser.",
          pt: "As versões são guardadas automaticamente à medida que as pessoas editam, agrupadas por dia com a hora e o autor. Clique numa para a pré-visualizar.",
        }),
        placement: "right",
      },
      {
        id: "close-history",
        target: "#version-history-back-button",
        title: t3({
          en: "Compare and restore",
          fr: "Comparer et restaurer",
          pt: "Comparar e restaurar",
        }),
        body: t3({
          en: "Selecting a version shows what changed against the one before it, and lets you restore it if you need to go back. Click here to return to your slides.",
          fr: "Sélectionner une version montre ce qui a changé par rapport à la précédente et permet de la restaurer si besoin. Cliquez ici pour revenir à vos diapositives.",
          pt: "Selecionar uma versão mostra o que mudou em relação à anterior e permite restaurá-la se precisar de voltar atrás. Clique aqui para regressar aos seus diapositivos.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
    ],
  };
}

// Ordered last so it merges after the intro/slides parts: the deck tour ends
// by having the user actually open Settings, then explains what's in there.
export function buildDeckEditorSettingsTour(): TourDefinition {
  return {
    id: "deck-editor-settings",
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
        advanceOn: "click",
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
        title: t3({
          en: "Save or cancel",
          fr: "Enregistrer ou annuler",
          pt: "Guardar ou cancelar",
        }),
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
    title: t3({
      en: "Slide type",
      fr: "Type de diapositive",
      pt: "Tipo de diapositivo",
    }),
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
    title: t3({
      en: "Live preview",
      fr: "Aperçu en direct",
      pt: "Pré-visualização em direto",
    }),
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
        title: t3({
          en: "Now the content",
          fr: "Passons au contenu",
          pt: "Agora o conteúdo",
        }),
        body: t3({
          en: "Click the Content tab to carry on.",
          fr: "Cliquez sur l'onglet Contenu pour continuer.",
          pt: "Clique no separador Conteúdo para continuar.",
        }),
        placement: "bottom",
        advanceOn: "click",
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

// ----------------------------------------------------------- Report editor

export function buildReportEditorIntroTour(): TourDefinition {
  return {
    id: "report-editor-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("report-toolbar"),
        title: t3({
          en: "Inside a report",
          fr: "Dans un rapport",
          pt: "Dentro de um relatório",
        }),
        body: t3({
          en: "A report is a written document: you type the words, and drop in visualizations from your project wherever they belong.",
          fr: "Un rapport est un document rédigé : vous écrivez le texte et insérez les visualisations de votre projet là où elles doivent apparaître.",
          pt: "Um relatório é um documento escrito: escreve o texto e insere as visualizações do seu projeto onde elas fazem sentido.",
        }),
        placement: "bottom",
      },
      {
        id: "mode",
        target: tourTarget("report-mode"),
        title: t3({
          en: "Edit, split or view",
          fr: "Édition, divisé ou aperçu",
          pt: "Editar, dividido ou ver",
        }),
        body: t3({
          en: "Split shows your text beside the finished page. Edit gives the text all the room, and View shows only the result.",
          fr: "Divisé affiche votre texte à côté de la page finale. Édition donne toute la place au texte, et Aperçu n'affiche que le résultat.",
          pt: "Dividido mostra o seu texto ao lado da página final. Editar dá todo o espaço ao texto e Ver mostra apenas o resultado.",
        }),
        placement: "bottom",
      },
      {
        id: "code-pane",
        target: tourTarget("report-code-pane"),
        title: t3({
          en: "Write here",
          fr: "Écrivez ici",
          pt: "Escreva aqui",
        }),
        body: t3({
          en: "This is the report's text, written in Markdown — # for a heading, ** ** for bold, - for a list. Visualizations appear as blocks you can click.",
          fr: "Voici le texte du rapport, écrit en Markdown — # pour un titre, ** ** pour du gras, - pour une liste. Les visualisations apparaissent sous forme de blocs cliquables.",
          pt: "Este é o texto do relatório, escrito em Markdown — # para um título, ** ** para negrito, - para uma lista. As visualizações aparecem como blocos que pode clicar.",
        }),
        placement: "right",
      },
      {
        id: "preview",
        target: tourTarget("report-preview-pane"),
        title: t3({
          en: "The finished page",
          fr: "La page finale",
          pt: "A página final",
        }),
        body: t3({
          en: "Exactly what the exported document will look like, updating as you type. Scrolling one side follows the other.",
          fr: "Exactement l'apparence du document exporté, mis à jour pendant que vous écrivez. Le défilement d'un côté suit l'autre.",
          pt: "Exatamente como ficará o documento exportado, atualizando enquanto escreve. Ao deslocar um lado, o outro acompanha.",
        }),
        placement: "left",
        when: () =>
          document.querySelector('[data-tour="report-preview-pane"]') !== null,
      },
      {
        id: "embed-panel",
        target: tourTarget("report-embed-panel"),
        title: t3({
          en: "Visualizations and images",
          fr: "Visualisations et images",
          pt: "Visualizações e imagens",
        }),
        body: t3({
          en: "Insert a visualization or an image from this panel. Click one already in the report and this panel switches to editing it — caption, swapping it for another, or removing it.",
          fr: "Insérez une visualisation ou une image depuis ce panneau. Cliquez sur un élément déjà dans le rapport et ce panneau passe à sa modification — légende, remplacement ou suppression.",
          pt: "Insira uma visualização ou uma imagem a partir deste painel. Clique num elemento já presente no relatório e este painel passa a editá-lo — legenda, substituição ou remoção.",
        }),
        placement: "right",
        when: () =>
          document.querySelector('[data-tour="report-embed-panel"]') !== null,
      },
      {
        id: "save-status",
        target: tourTarget("report-save-status"),
        title: t3({
          en: "Saved as you write",
          fr: "Enregistré au fil de l'écriture",
          pt: "Guardado enquanto escreve",
        }),
        body: t3({
          en: "There's no save button — this shows when your changes have been stored, and teammates editing the same report see them immediately.",
          fr: "Il n'y a pas de bouton d'enregistrement — ceci indique quand vos modifications ont été enregistrées, et les collègues qui modifient le même rapport les voient immédiatement.",
          pt: "Não há botão de guardar — isto mostra quando as suas alterações foram guardadas, e os colegas que editam o mesmo relatório vêem-nas imediatamente.",
        }),
        placement: "bottom",
      },
      {
        id: "download",
        target: "#report-download-button",
        title: t3({ en: "Export it", fr: "Exportez-le", pt: "Exporte-o" }),
        body: t3({
          en: "Download the report as a Word document or PDF, with the visualizations rendered in place.",
          fr: "Téléchargez le rapport en document Word ou PDF, avec les visualisations rendues à leur place.",
          pt: "Descarregue o relatório como documento Word ou PDF, com as visualizações apresentadas no devido lugar.",
        }),
        placement: "bottom",
      },
      {
        id: "ai",
        target: "#report-ai-button",
        title: t3({
          en: "Write with the AI",
          fr: "Écrire avec l'IA",
          pt: "Escrever com a IA",
        }),
        body: t3({
          en: "Open the assistant to draft or rework sections. Select some text first and it works on just that part.",
          fr: "Ouvrez l'assistant pour rédiger ou retravailler des sections. Sélectionnez d'abord du texte et il ne travaillera que sur cette partie.",
          pt: "Abra o assistente para redigir ou reformular secções. Selecione primeiro algum texto e ele trabalha apenas nessa parte.",
        }),
        placement: "bottom",
        when: () => document.querySelector("#report-ai-button") !== null,
      },
      {
        id: "back",
        target: "#report-back-button",
        title: t3({
          en: "Back to your reports",
          fr: "Retour à vos rapports",
          pt: "Voltar aos seus relatórios",
        }),
        body: t3({
          en: "Everything is already saved, so you can leave whenever you like.",
          fr: "Tout est déjà enregistré, vous pouvez donc partir quand vous voulez.",
          pt: "Tudo já está guardado, pode sair quando quiser.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// Deferred until the report actually contains a visualization or image.
export function buildReportEditorFiguresTour(): TourDefinition {
  return {
    id: "report-editor-figures",
    steps: [
      {
        id: "embed",
        target: "[data-embed-id]",
        title: t3({
          en: "A visualization in the text",
          fr: "Une visualisation dans le texte",
          pt: "Uma visualização no texto",
        }),
        body: t3({
          en: "Each visualization sits in the text as a block. Click it to select it, then use the left panel to edit its caption, swap it, or take it out — it always shows the project's latest data.",
          fr: "Chaque visualisation se place dans le texte comme un bloc. Cliquez dessus pour la sélectionner, puis utilisez le panneau de gauche pour modifier sa légende, la remplacer ou la retirer — elle affiche toujours les données les plus récentes du projet.",
          pt: "Cada visualização fica no texto como um bloco. Clique nela para a selecionar e utilize o painel da esquerda para editar a legenda, substituí-la ou removê-la — mostra sempre os dados mais recentes do projeto.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// Same shape as the deck history tour, but the report has a direct History
// button instead of an overflow menu. Ends by closing itself.
export function buildReportEditorHistoryTour(): TourDefinition {
  return {
    id: "report-editor-history",
    steps: [
      {
        id: "open-history",
        target: "#report-history-button",
        title: t3({
          en: "Version history",
          fr: "Historique des versions",
          pt: "Histórico de versões",
        }),
        body: t3({
          en: "Reports keep a history of earlier versions. Click here to open it — the tour continues inside.",
          fr: "Les rapports conservent un historique des versions précédentes. Cliquez ici pour l'ouvrir — la visite continue à l'intérieur.",
          pt: "Os relatórios mantêm um histórico de versões anteriores. Clique aqui para o abrir — a visita continua lá dentro.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
      {
        id: "version-list",
        target: tourTarget("version-history-list"),
        title: t3({
          en: "Every earlier version",
          fr: "Toutes les versions précédentes",
          pt: "Todas as versões anteriores",
        }),
        body: t3({
          en: "Versions are saved automatically as people edit, grouped by day with the time and who made them. Click one to see what changed.",
          fr: "Les versions sont enregistrées automatiquement au fil des modifications, regroupées par jour avec l'heure et l'auteur. Cliquez sur l'une d'elles pour voir ce qui a changé.",
          pt: "As versões são guardadas automaticamente à medida que as pessoas editam, agrupadas por dia com a hora e o autor. Clique numa para ver o que mudou.",
        }),
        placement: "right",
      },
      {
        id: "close-history",
        target: "#version-history-back-button",
        title: t3({
          en: "Compare and restore",
          fr: "Comparer et restaurer",
          pt: "Comparar e restaurar",
        }),
        body: t3({
          en: "A selected version shows its differences from the one before, and can be restored if you need to go back. Click here to return to the report.",
          fr: "Une version sélectionnée montre ses différences avec la précédente et peut être restaurée si besoin. Cliquez ici pour revenir au rapport.",
          pt: "Uma versão selecionada mostra as diferenças em relação à anterior e pode ser restaurada se precisar de voltar atrás. Clique aqui para regressar ao relatório.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
    ],
  };
}

// -------------------------------------------------------------- Visualizations

export function buildVizIntroTour(): TourDefinition {
  return {
    id: "viz-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("viz-header"),
        title: t3({
          en: "Visualizations",
          fr: "Visualisations",
          pt: "Visualizações",
        }),
        body: t3({
          en: "Visualizations are the charts, tables and maps built from your project's results. Everything in your decks and reports draws on what you make here.",
          fr: "Les visualisations sont les graphiques, tableaux et cartes créés à partir des résultats de votre projet. Tout ce qui figure dans vos présentations et rapports s'appuie sur ce que vous créez ici.",
          pt: "As visualizações são os gráficos, tabelas e mapas criados a partir dos resultados do seu projeto. Tudo o que está nas suas apresentações e relatórios baseia-se no que criar aqui.",
        }),
        placement: "bottom",
      },
      {
        id: "sort",
        target: tourTarget("viz-sort"),
        title: t3({
          en: "Search and sort",
          fr: "Rechercher et trier",
          pt: "Pesquisar e ordenar",
        }),
        body: t3({
          en: "Sort by name or by when they were last updated, and use the search box to filter by name.",
          fr: "Triez par nom ou par date de dernière mise à jour, et utilisez la recherche pour filtrer par nom.",
          pt: "Ordene por nome ou pela data da última atualização e utilize a pesquisa para filtrar por nome.",
        }),
        placement: "bottom",
      },
      {
        id: "folders",
        target: tourTarget("viz-folders"),
        title: t3({
          en: "Group them your way",
          fr: "Regroupez-les à votre façon",
          pt: "Agrupe-as como quiser",
        }),
        body: t3({
          en: "Group visualizations by folder, by the module that produced them, by metric, or as one flat list. 'Hide unavailable' filters out any whose data isn't ready.",
          fr: "Regroupez les visualisations par dossier, par module d'origine, par métrique, ou en une liste simple. « Masquer les indisponibles » filtre celles dont les données ne sont pas prêtes.",
          pt: "Agrupe as visualizações por pasta, pelo módulo que as produziu, por métrica, ou numa lista simples. «Ocultar indisponíveis» filtra aquelas cujos dados não estão prontos.",
        }),
        placement: "right",
      },
      {
        id: "grid",
        target: tourTarget("viz-grid"),
        title: t3({
          en: "Your visualizations",
          fr: "Vos visualisations",
          pt: "As suas visualizações",
        }),
        body: t3({
          en: "Each one shows a live preview. Badges mark those that are replicated across areas, filtered, AI-interpreted, or supplied as defaults by a module.",
          fr: "Chacune affiche un aperçu en direct. Des badges signalent celles qui sont répliquées par zone, filtrées, interprétées par l'IA, ou fournies par défaut par un module.",
          pt: "Cada uma mostra uma pré-visualização em direto. As etiquetas indicam as que são replicadas por área, filtradas, interpretadas pela IA, ou fornecidas por predefinição por um módulo.",
        }),
        placement: "top",
      },
    ],
  };
}

// Deferred until a visualization card is on screen.
export function buildVizCardsTour(): TourDefinition {
  return {
    id: "viz-cards",
    steps: [
      {
        id: "card",
        target: tourTarget("viz-card"),
        title: t3({
          en: "Working with a visualization",
          fr: "Travailler sur une visualisation",
          pt: "Trabalhar com uma visualização",
        }),
        body: t3({
          en: "Click one to open its editor and change what it shows. Right-click for duplicate, move to folder, create slides from it, or delete.",
          fr: "Cliquez sur l'une d'elles pour ouvrir son éditeur et modifier son contenu. Faites un clic droit pour dupliquer, déplacer vers un dossier, créer des diapositives ou supprimer.",
          pt: "Clique numa para abrir o editor e alterar o que mostra. Clique com o botão direito para duplicar, mover para uma pasta, criar diapositivos ou eliminar.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// Deferred until creating is actually possible (unlocked project with modules).
export function buildVizCreateTour(): TourDefinition {
  return {
    id: "viz-create",
    steps: [
      {
        id: "create",
        target: tourTarget("viz-create"),
        title: t3({
          en: "Create a visualization",
          fr: "Créer une visualisation",
          pt: "Criar uma visualização",
        }),
        body: t3({
          en: "Start from a metric produced by one of your modules, then choose the chart type, periods and disaggregation in the editor.",
          fr: "Partez d'une métrique produite par l'un de vos modules, puis choisissez le type de graphique, les périodes et la désagrégation dans l'éditeur.",
          pt: "Comece a partir de uma métrica produzida por um dos seus módulos e escolha o tipo de gráfico, os períodos e a desagregação no editor.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// ---------------------------------------------------- Results package tab

export function buildResultsPackageIntroTour(): TourDefinition {
  return {
    id: "results-package-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("results-package-header"),
        title: t3({
          en: "Results package",
          fr: "Paquet de résultats",
          pt: "Pacote de resultados",
        }),
        body: t3({
          en: "Every number in this project — every visualization, report and slide deck — is read from one results package. It is generated once for the whole instance, then attached to the projects that should use it.",
          fr: "Chaque chiffre de ce projet — chaque visualisation, rapport et présentation — provient d'un seul paquet de résultats. Il est généré une fois pour toute l'instance, puis rattaché aux projets qui doivent l'utiliser.",
          pt: "Todos os números deste projeto — cada visualização, relatório e apresentação — vêm de um único pacote de resultados. É gerado uma vez para toda a instância e depois anexado aos projetos que o devem usar.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// Split from the intro rather than gated step-by-step: on a project with no
// package attached yet these two targets do not exist, and a tour that runs
// and skips its steps is still marked seen — the user would never get them
// once a package IS attached.
export function buildResultsPackageExploreTour(): TourDefinition {
  return {
    id: "results-package-explore",
    steps: [
      {
        id: "attached",
        target: tourTarget("results-package-attached"),
        title: t3({
          en: "The package in use",
          fr: "Le paquet utilisé",
          pt: "O pacote em utilização",
        }),
        body: t3({
          en: "This is the package this project serves from. The line beneath its name says when it was generated and by whom — useful when you need to know how current your figures are.",
          fr: "Voici le paquet dont ce projet se sert. La ligne sous son nom indique quand il a été généré et par qui — utile pour savoir à quel point vos chiffres sont récents.",
          pt: "Este é o pacote de que este projeto se serve. A linha por baixo do nome indica quando foi gerado e por quem — útil para saber se os seus números estão atualizados.",
        }),
        placement: "bottom",
      },
      {
        id: "contents",
        target: tourTarget("results-package-contents"),
        title: t3({
          en: "What's inside",
          fr: "Ce qu'il contient",
          pt: "O que contém",
        }),
        body: t3({
          en: "The modules that ran to build this package: the parameters each was configured with, the files it wrote (downloadable), and — where you have permission — its Script and Logs.",
          fr: "Les modules exécutés pour construire ce paquet : les paramètres de chacun, les fichiers écrits (téléchargeables) et — selon vos permissions — son Script et ses Journaux.",
          pt: "Os módulos executados para construir este pacote: os parâmetros de cada um, os ficheiros que escreveu (transferíveis) e — conforme as suas permissões — o seu Script e Registos.",
        }),
        placement: "top",
      },
    ],
  };
}

export function buildResultsPackageSwitchTour(): TourDefinition {
  return {
    id: "results-package-switch",
    steps: [
      {
        id: "picker",
        target: tourTarget("results-package-picker"),
        title: t3({
          en: "Switching package",
          fr: "Changer de paquet",
          pt: "Mudar de pacote",
        }),
        body: t3({
          en: "Pick any ready package on this instance here. Switching changes the data behind everything in the project at once, so it is not a per-figure choice.",
          fr: "Choisissez ici n'importe quel paquet prêt de cette instance. Changer modifie d'un coup les données derrière tout le projet : ce n'est pas un choix figure par figure.",
          pt: "Escolha aqui qualquer pacote pronto desta instância. Mudar altera de uma só vez os dados por trás de tudo no projeto: não é uma escolha figura a figura.",
        }),
        placement: "top",
      },
      {
        id: "compatibility",
        target: tourTarget("results-package-picker"),
        title: t3({
          en: "Check before you switch",
          fr: "Vérifiez avant de changer",
          pt: "Verifique antes de mudar",
        }),
        body: t3({
          en: '"Use this package" does not switch straight away — it first shows you what would stop resolving under the new package, so you can back out before anything changes.',
          fr: "« Utiliser ce paquet » ne change rien immédiatement : vous voyez d'abord ce qui cesserait de se résoudre avec le nouveau paquet, et vous pouvez renoncer avant toute modification.",
          pt: "«Usar este pacote» não muda de imediato: mostra primeiro o que deixaria de se resolver com o novo pacote, para poder desistir antes de qualquer alteração.",
        }),
        placement: "top",
      },
    ],
  };
}

// ----------------------------------------------------------- Settings tab

export function buildSettingsIntroTour(): TourDefinition {
  return {
    id: "settings-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("settings-header"),
        title: t3({
          en: "Project settings",
          fr: "Paramètres du projet",
          pt: "Definições do projeto",
        }),
        body: t3({
          en: "Everything about the project as a whole lives here. There's no save button — each section saves as you change it.",
          fr: "Tout ce qui concerne le projet dans son ensemble se trouve ici. Il n'y a pas de bouton d'enregistrement — chaque section s'enregistre au moment où vous la modifiez.",
          pt: "Tudo o que diz respeito ao projeto no seu conjunto está aqui. Não há botão de guardar — cada secção é guardada quando a altera.",
        }),
        placement: "bottom",
      },
      {
        id: "name",
        target: tourTarget("settings-name"),
        title: t3({
          en: "Project name",
          fr: "Nom du projet",
          pt: "Nome do projeto",
        }),
        body: t3({
          en: "Rename the project — this is the name everyone sees in the project list.",
          fr: "Renommez le projet — c'est le nom que tout le monde voit dans la liste des projets.",
          pt: "Mude o nome do projeto — é o nome que todos vêem na lista de projetos.",
        }),
        placement: "bottom",
      },
      {
        id: "users",
        target: tourTarget("settings-users"),
        title: t3({
          en: "Who can do what",
          fr: "Qui peut faire quoi",
          pt: "Quem pode fazer o quê",
        }),
        body: t3({
          en: "Everyone with access is listed here. Click a person to set their role, or select several to change permissions in bulk — viewers read, editors build, admins configure.",
          fr: "Toutes les personnes ayant accès sont listées ici. Cliquez sur une personne pour définir son rôle, ou sélectionnez-en plusieurs pour modifier les permissions en lot — les lecteurs consultent, les éditeurs créent, les administrateurs configurent.",
          pt: "Todas as pessoas com acesso estão listadas aqui. Clique numa pessoa para definir a sua função, ou selecione várias para alterar permissões em bloco — os observadores leem, os editores criam, os administradores configuram.",
        }),
        placement: "top",
      },
      {
        id: "ai-context",
        target: tourTarget("settings-ai"),
        title: t3({
          en: "Context for the AI",
          fr: "Contexte pour l'IA",
          pt: "Contexto para a IA",
        }),
        body: t3({
          en: "Background about the country, programme or period the project covers. The AI uses it when interpreting charts, so a sentence or two here improves every interpretation.",
          fr: "Des informations générales sur le pays, le programme ou la période couverts par le projet. L'IA s'en sert pour interpréter les graphiques : une ou deux phrases ici améliorent chaque interprétation.",
          pt: "Informação de contexto sobre o país, o programa ou o período que o projeto abrange. A IA utiliza-a ao interpretar gráficos, por isso uma ou duas frases aqui melhoram todas as interpretações.",
        }),
        placement: "top",
      },
      {
        id: "backups",
        target: tourTarget("settings-backups"),
        title: t3({
          en: "Backups",
          fr: "Sauvegardes",
          pt: "Cópias de segurança",
        }),
        body: t3({
          en: "Snapshots of the whole project, grouped by day. Create one before a big change, download it to keep a copy, or restore to roll the project back.",
          fr: "Des instantanés de tout le projet, regroupés par jour. Créez-en un avant un changement important, téléchargez-le pour en garder une copie, ou restaurez pour revenir en arrière.",
          pt: "Instantâneos de todo o projeto, agrupados por dia. Crie um antes de uma alteração importante, descarregue-o para guardar uma cópia, ou restaure para reverter o projeto.",
        }),
        placement: "top",
      },
      {
        id: "actions",
        target: tourTarget("settings-actions"),
        title: t3({
          en: "Copying and deleting",
          fr: "Copier et supprimer",
          pt: "Copiar e eliminar",
        }),
        body: t3({
          en: "Copy project duplicates everything into a new project — handy for starting a new round from last year's setup. Delete removes the project and its data for good.",
          fr: "Copier le projet duplique tout dans un nouveau projet — pratique pour démarrer un nouveau cycle à partir de la configuration de l'année précédente. Supprimer efface définitivement le projet et ses données.",
          pt: "Copiar projeto duplica tudo para um novo projeto — útil para começar uma nova ronda a partir da configuração do ano anterior. Eliminar remove o projeto e os seus dados definitivamente.",
        }),
        placement: "top",
      },
    ],
  };
}

// ------------------------------------------------------------ Dashboards tab

export function buildDashboardsIntroTour(): TourDefinition {
  return {
    id: "dashboards-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("dashboards-header"),
        title: t3({ en: "Dashboards", fr: "Tableaux de bord", pt: "Painéis" }),
        body: t3({
          en: "Dashboards are web pages that show a set of your visualizations at a live link — useful for sharing current numbers with people who don't work in the platform.",
          fr: "Les tableaux de bord sont des pages web qui présentent une sélection de vos visualisations via un lien permanent — pratique pour partager des chiffres à jour avec des personnes qui n'utilisent pas la plateforme.",
          pt: "Os painéis são páginas web que mostram um conjunto das suas visualizações num link permanente — útil para partilhar números atualizados com pessoas que não trabalham na plataforma.",
        }),
        placement: "bottom",
      },
      {
        id: "sort",
        target: tourTarget("dashboards-sort"),
        title: t3({
          en: "Search and sort",
          fr: "Rechercher et trier",
          pt: "Pesquisar e ordenar",
        }),
        body: t3({
          en: "Sort by name or by when they were last updated, and search by name once you have a few.",
          fr: "Triez par nom ou par date de dernière mise à jour, et recherchez par nom lorsque vous en avez plusieurs.",
          pt: "Ordene por nome ou pela data da última atualização e pesquise por nome quando tiver vários.",
        }),
        placement: "bottom",
      },
      {
        id: "grid",
        target: tourTarget("dashboards-grid"),
        title: t3({
          en: "Your dashboards",
          fr: "Vos tableaux de bord",
          pt: "Os seus painéis",
        }),
        body: t3({
          en: "Each card shows its web address, how many items it holds, and whether it's public or needs a login.",
          fr: "Chaque carte indique son adresse web, le nombre d'éléments qu'elle contient, et si elle est publique ou nécessite une connexion.",
          pt: "Cada cartão mostra o seu endereço web, quantos elementos contém, e se é público ou exige autenticação.",
        }),
        placement: "top",
      },
    ],
  };
}

// Deferred until a dashboard card is on screen.
export function buildDashboardsCardsTour(): TourDefinition {
  return {
    id: "dashboards-cards",
    steps: [
      {
        id: "card",
        target: tourTarget("dashboards-card"),
        title: t3({
          en: "Open a dashboard",
          fr: "Ouvrir un tableau de bord",
          pt: "Abrir um painel",
        }),
        body: t3({
          en: "Click one to choose which visualizations it shows and whether the link is public. Public dashboards can be opened by anyone with the address, so check that setting before sharing. Right-click to delete.",
          fr: "Cliquez sur l'un d'eux pour choisir les visualisations affichées et si le lien est public. Un tableau de bord public est accessible à quiconque possède l'adresse : vérifiez ce réglage avant de partager. Faites un clic droit pour supprimer.",
          pt: "Clique num deles para escolher as visualizações que mostra e se o link é público. Um painel público pode ser aberto por qualquer pessoa com o endereço, por isso verifique essa definição antes de partilhar. Clique com o botão direito para eliminar.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// Deferred until creating is possible (deck-configure permission, unlocked).
export function buildDashboardsCreateTour(): TourDefinition {
  return {
    id: "dashboards-create",
    steps: [
      {
        id: "create",
        target: "#dashboards-create-button",
        title: t3({
          en: "Create a dashboard",
          fr: "Créer un tableau de bord",
          pt: "Criar um painel",
        }),
        body: t3({
          en: "Give it a name and a web address, then add visualizations to it. It always shows the project's latest data, so the link stays current without you republishing.",
          fr: "Donnez-lui un nom et une adresse web, puis ajoutez-y des visualisations. Il affiche toujours les données les plus récentes du projet : le lien reste à jour sans republication.",
          pt: "Dê-lhe um nome e um endereço web e adicione-lhe visualizações. Mostra sempre os dados mais recentes do projeto, pelo que o link se mantém atualizado sem republicar.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// --------------------------------------------------------- Dashboard editor

// Mirrors canConfigure() inside dashboard_editor.tsx. Step-level `when` runs
// once when the tour starts, and the dashboard editor's content is still
// loading then — so these gates must read state, never the DOM.
const canConfigureDashboards = () =>
  projectState.thisUserPermissions.can_configure_slide_decks &&
  !projectState.isLocked;

export function buildDashboardEditorIntroTour(): TourDefinition {
  return {
    id: "dashboard-editor-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("dashboard-grid"),
        title: t3({
          en: "Inside a dashboard",
          fr: "Dans un tableau de bord",
          pt: "Dentro de um painel",
        }),
        body: t3({
          en: "The items here are what visitors see on the dashboard's page, in this order. Drag one to move it — there's no save button, every change is live immediately.",
          fr: "Les éléments présents ici sont ce que voient les visiteurs sur la page du tableau de bord, dans cet ordre. Faites-en glisser un pour le déplacer — il n'y a pas de bouton d'enregistrement, chaque modification est immédiate.",
          pt: "Os elementos aqui são o que os visitantes vêem na página do painel, nesta ordem. Arraste um para o mover — não há botão de guardar, cada alteração é imediata.",
        }),
        placement: "top",
        waitForTargetTimeoutMs: 15000,
      },
      {
        id: "add-item",
        target: "#dashboard-add-item-button",
        title: t3({
          en: "Add a visualization",
          fr: "Ajouter une visualisation",
          pt: "Adicionar uma visualização",
        }),
        body: t3({
          en: "Pick any visualization from the project. If it's replicated across areas you can add just the one you chose, or the whole set as a group.",
          fr: "Choisissez n'importe quelle visualisation du projet. Si elle est répliquée par zone, vous pouvez ajouter uniquement celle choisie ou tout l'ensemble en tant que groupe.",
          pt: "Escolha qualquer visualização do projeto. Se estiver replicada por área, pode adicionar apenas a escolhida ou todo o conjunto como um grupo.",
        }),
        placement: "bottom",
        when: canConfigureDashboards,
      },
      {
        id: "preview",
        target: "#dashboard-preview-button",
        title: t3({
          en: "See the real page",
          fr: "Voir la page réelle",
          pt: "Ver a página real",
        }),
        body: t3({
          en: "Preview opens the dashboard exactly as a visitor sees it, and Copy link beside it gives you the address to send them.",
          fr: "Aperçu ouvre le tableau de bord tel que le voit un visiteur, et Copier le lien à côté vous donne l'adresse à envoyer.",
          pt: "Pré-visualização abre o painel exatamente como um visitante o vê, e Copiar ligação ao lado dá-lhe o endereço para enviar.",
        }),
        placement: "bottom",
      },
      {
        id: "settings",
        target: "#dashboard-settings-button",
        title: t3({
          en: "Name, address and access",
          fr: "Nom, adresse et accès",
          pt: "Nome, endereço e acesso",
        }),
        body: t3({
          en: "Settings holds the title, the web address, the page layout, logos, and — importantly — whether visitors need to log in. Click it now to look inside.",
          fr: "Paramètres contient le titre, l'adresse web, la mise en page, les logos et — surtout — si les visiteurs doivent se connecter. Cliquez maintenant pour y jeter un œil.",
          pt: "Definições contém o título, o endereço web, o layout da página, os logótipos e — sobretudo — se os visitantes precisam de iniciar sessão. Clique agora para ver.",
        }),
        placement: "bottom",
        advanceOn: "click",
        when: canConfigureDashboards,
      },
      {
        id: "settings-general",
        target: tourTarget("dashboard-settings-general"),
        title: t3({
          en: "Public or private",
          fr: "Public ou privé",
          pt: "Público ou privado",
        }),
        body: t3({
          en: "The URL slug is the end of the dashboard's web address. Leave 'Require authentication' off and anyone with the link can view it — tick it and they'll need a platform login.",
          fr: "Le slug d'URL constitue la fin de l'adresse web du tableau de bord. Laissez « Authentification requise » décochée et quiconque possède le lien pourra le consulter ; cochez-la et une connexion sera nécessaire.",
          pt: "O slug do URL é o final do endereço web do painel. Deixe «Exigir autenticação» desativada e qualquer pessoa com o link poderá vê-lo; ative-a e será necessária uma conta na plataforma.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 6000,
        onTargetTimeout: "skip",
        when: canConfigureDashboards,
      },
    ],
  };
}

// Deferred until the dashboard actually has an item on screen.
export function buildDashboardEditorItemsTour(): TourDefinition {
  return {
    id: "dashboard-editor-items",
    steps: [
      {
        id: "item-card",
        target: tourTarget("dashboard-item-card"),
        title: t3({
          en: "One item on the page",
          fr: "Un élément de la page",
          pt: "Um elemento da página",
        }),
        body: t3({
          en: "Click an item to select it. Right-click to remove it from the dashboard — the visualization itself stays in the project.",
          fr: "Cliquez sur un élément pour le sélectionner. Faites un clic droit pour le retirer du tableau de bord — la visualisation elle-même reste dans le projet.",
          pt: "Clique num elemento para o selecionar. Clique com o botão direito para o remover do painel — a visualização em si permanece no projeto.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 2000,
      },
      {
        id: "panel",
        target: tourTarget("dashboard-panel"),
        title: t3({
          en: "The selected item",
          fr: "L'élément sélectionné",
          pt: "O elemento selecionado",
        }),
        body: t3({
          en: "With an item selected, this panel renames it, edits the visualization behind it, swaps it for another, or builds a new one. For a replicated group it also sets which area shows by default.",
          fr: "Lorsqu'un élément est sélectionné, ce panneau permet de le renommer, de modifier la visualisation associée, de la remplacer ou d'en créer une nouvelle. Pour un groupe répliqué, il définit aussi la zone affichée par défaut.",
          pt: "Com um elemento selecionado, este painel permite mudar-lhe o nome, editar a visualização subjacente, substituí-la ou criar uma nova. Para um grupo replicado, define também a área mostrada por predefinição.",
        }),
        placement: "right",
      },
    ],
  };
}

// ------------------------------------------------------ Visualization editor

function vizPanelStep(): TourStep {
  return {
    id: "panel",
    target: "#VIZ_PANEL_ROOT",
    title: t3({
      en: "Three sets of controls",
      fr: "Trois ensembles de réglages",
      pt: "Três conjuntos de controlos",
    }),
    body: t3({
      en: "Data decides what the numbers are, Presentation how they look, and Text the captions around them.",
      fr: "Données définit les chiffres, Présentation leur apparence, et Texte les légendes qui les accompagnent.",
      pt: "Dados define quais são os números, Apresentação o seu aspeto, e Texto as legendas que os acompanham.",
    }),
    placement: "right",
  };
}

function vizPreviewStep(): TourStep {
  return {
    id: "preview",
    target: tourTarget("viz-preview"),
    title: t3({
      en: "Live preview",
      fr: "Aperçu en direct",
      pt: "Pré-visualização em direto",
    }),
    body: t3({
      en: "The figure redraws with every change, using the project's real data — this is exactly how it will look in decks, reports and dashboards.",
      fr: "La figure se redessine à chaque modification, avec les données réelles du projet — c'est exactement son apparence dans les présentations, rapports et tableaux de bord.",
      pt: "A figura é redesenhada a cada alteração, com os dados reais do projeto — é exatamente assim que aparecerá em apresentações, relatórios e painéis.",
    }),
    placement: "left",
  };
}

export function buildVizEditorCreateTour(): TourDefinition {
  return {
    id: "viz-editor-create",
    steps: [
      {
        id: "intro",
        target: tourTarget("viz-editor-toolbar"),
        title: t3({
          en: "Building a new visualization",
          fr: "Création d'une nouvelle visualisation",
          pt: "A criar uma nova visualização",
        }),
        body: t3({
          en: "You've picked a metric — now decide how to show it. Nothing is saved until you choose to save, so experiment freely.",
          fr: "Vous avez choisi une métrique — décidez maintenant comment l'afficher. Rien n'est enregistré avant que vous ne le décidiez : expérimentez librement.",
          pt: "Escolheu uma métrica — agora decida como a mostrar. Nada é guardado até que o decida, por isso experimente à vontade.",
        }),
        placement: "bottom",
      },
      vizPanelStep(),
      {
        id: "data",
        target: tourTarget("viz-panel-data"),
        title: t3({
          en: "Start with the chart type",
          fr: "Commencez par le type de graphique",
          pt: "Comece pelo tipo de gráfico",
        }),
        body: t3({
          en: "The metric is fixed, but Presentation type switches between a chart, a time series, a table and a map. Below it you can narrow the data down and choose how it's broken out.",
          fr: "La métrique est fixe, mais Type de présentation permet de basculer entre graphique, série temporelle, tableau et carte. En dessous, vous pouvez restreindre les données et choisir leur ventilation.",
          pt: "A métrica é fixa, mas Tipo de apresentação alterna entre gráfico, série temporal, tabela e mapa. Abaixo, pode restringir os dados e escolher como são desagregados.",
        }),
        placement: "right",
      },
      vizPreviewStep(),
      {
        id: "save",
        target: "#viz-save-new-button",
        title: t3({
          en: "Save it to the project",
          fr: "Enregistrez-la dans le projet",
          pt: "Guarde-a no projeto",
        }),
        body: t3({
          en: "Give it a name and it joins the Visualizations tab, ready to drop into decks, reports and dashboards.",
          fr: "Donnez-lui un nom et elle rejoint l'onglet Visualisations, prête à être insérée dans les présentations, rapports et tableaux de bord.",
          pt: "Dê-lhe um nome e passa a constar no separador Visualizações, pronta a inserir em apresentações, relatórios e painéis.",
        }),
        placement: "bottom",
        when: () => document.querySelector("#viz-save-new-button") !== null,
      },
    ],
  };
}

export function buildVizEditorEditTour(): TourDefinition {
  return {
    id: "viz-editor-edit",
    steps: [
      {
        id: "intro",
        target: tourTarget("viz-editor-toolbar"),
        title: t3({
          en: "Editing a visualization",
          fr: "Modification d'une visualisation",
          pt: "A editar uma visualização",
        }),
        body: t3({
          en: "Changes here follow this visualization everywhere it's used — every deck, report and dashboard that includes it.",
          fr: "Les modifications apportées ici suivent cette visualisation partout où elle est utilisée — chaque présentation, rapport et tableau de bord qui l'inclut.",
          pt: "As alterações aqui acompanham esta visualização em todos os locais onde é usada — em cada apresentação, relatório e painel que a inclui.",
        }),
        placement: "bottom",
      },
      vizPanelStep(),
      {
        id: "data",
        target: tourTarget("viz-panel-data"),
        title: t3({ en: "Data", fr: "Données", pt: "Dados" }),
        body: t3({
          en: "Presentation type picks the chart form. 'Filter (subset)' narrows what's included — particular values, a time period, or specific groups — and 'Display (disaggregate)' chooses how the remaining data is broken out into series.",
          fr: "Type de présentation choisit la forme du graphique. « Filtre (sous-ensemble) » restreint ce qui est inclus — certaines valeurs, une période, des groupes précis — et « Affichage (désagrégation) » choisit la ventilation des données restantes en séries.",
          pt: "Tipo de apresentação escolhe a forma do gráfico. «Filtro (subconjunto)» restringe o que é incluído — determinados valores, um período, grupos específicos — e «Apresentação (desagregar)» escolhe como os restantes dados são divididos em séries.",
        }),
        placement: "right",
      },
      {
        id: "open-style",
        target: tourTarget("viz-tab-style"),
        title: t3({
          en: "Now how it looks",
          fr: "Passons à l'apparence",
          pt: "Agora o aspeto",
        }),
        body: t3({
          en: "Click Presentation to carry on.",
          fr: "Cliquez sur Présentation pour continuer.",
          pt: "Clique em Apresentação para continuar.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
      {
        id: "style",
        target: tourTarget("viz-panel-style"),
        title: t3({
          en: "Presentation",
          fr: "Présentation",
          pt: "Apresentação",
        }),
        body: t3({
          en: "Colours, axis limits, labels, decimal places, sorting and legends live here, along with conditional formatting to colour values by how they compare to a target.",
          fr: "Couleurs, limites d'axes, étiquettes, décimales, tri et légendes se trouvent ici, ainsi que la mise en forme conditionnelle pour colorer les valeurs selon leur écart à une cible.",
          pt: "Cores, limites dos eixos, etiquetas, casas decimais, ordenação e legendas estão aqui, bem como a formatação condicional para colorir valores conforme se comparam com uma meta.",
        }),
        placement: "right",
      },
      {
        id: "open-text",
        target: tourTarget("viz-tab-text"),
        title: t3({
          en: "And the words",
          fr: "Et les textes",
          pt: "E os textos",
        }),
        body: t3({
          en: "Click Text to carry on.",
          fr: "Cliquez sur Texte pour continuer.",
          pt: "Clique em Texto para continuar.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
      {
        id: "text",
        target: tourTarget("viz-panel-text"),
        title: t3({ en: "Captions", fr: "Légendes", pt: "Legendas" }),
        body: t3({
          en: "The caption, sub-caption and footnote travel with the figure wherever it appears. Tokens let you insert the current date range or replicant name automatically.",
          fr: "La légende, la sous-légende et la note de bas de page accompagnent la figure partout où elle apparaît. Des jetons permettent d'insérer automatiquement la période ou le nom du réplicant.",
          pt: "A legenda, a sublegenda e a nota de rodapé acompanham a figura onde quer que apareça. Existem marcadores para inserir automaticamente o período atual ou o nome do replicante.",
        }),
        placement: "right",
      },
      vizPreviewStep(),
      {
        id: "save",
        target: tourTarget("viz-editor-toolbar"),
        title: t3({
          en: "Saving, and everything else",
          fr: "Enregistrement, et le reste",
          pt: "Guardar, e tudo o resto",
        }),
        body: t3({
          en: "When someone else is editing with you, changes save as you make them. Otherwise Save, Save and close, and Save as new (which keeps the original) appear on the left as soon as you change something. On the right sit download, duplicate, rename and delete.",
          fr: "Lorsque quelqu'un modifie en même temps que vous, les changements sont enregistrés au fur et à mesure. Sinon, Sauvegarder, Sauvegarder et quitter, et Sauver comme nouvelle (qui conserve l'original) apparaissent à gauche dès que vous modifiez quelque chose. À droite se trouvent télécharger, dupliquer, renommer et supprimer.",
          pt: "Quando alguém está a editar consigo, as alterações são guardadas à medida que as faz. Caso contrário, Guardar, Guardar e fechar, e Guardar como nova (que mantém o original) aparecem à esquerda assim que altera algo. À direita estão descarregar, duplicar, mudar o nome e eliminar.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// -------------------------------------------- Instance-level tabs

// First-visit tours for the instance-level tabs (Projects / Data / Assets /
// Users / Settings). Unlike the project tours above, their availability reads
// instanceState only and their manager lives in the instance shell.

// The nav renders twice (compact icons below xl, labelled buttons above); a
// selector that matches both resolves to the visible one (roadtrip ≥ 0.10),
// so a plain tourTarget() is enough.

// The instance shell itself: navigation, language, release notes and where to
// find help. Fires on the projects page (the landing tab), merging seamlessly
// ahead of the projects tour on a brand-new user's first visit.
export function buildInstanceWelcomeTour(): TourDefinition {
  return {
    id: "instance-welcome",
    steps: [
      {
        id: "nav",
        target: tourTarget("instance-nav"),
        title: t3({
          en: "Welcome to FASTR",
          fr: "Bienvenue dans FASTR",
          pt: "Bem-vindo ao FASTR",
        }),
        body: t3({
          en: "This is your instance home. Use these tabs to move between projects, instance-wide data and shared assets — plus users and settings if you have those permissions.",
          fr: "Voici l'accueil de votre instance. Utilisez ces onglets pour passer des projets aux données de l'instance et aux ressources partagées — ainsi qu'aux utilisateurs et aux paramètres si vous en avez les permissions.",
          pt: "Esta é a página inicial da sua instância. Use estes separadores para alternar entre projetos, dados da instância e recursos partilhados — além de utilizadores e definições, se tiver essas permissões.",
        }),
        placement: "bottom",
      },
      {
        id: "language",
        target: tourTarget("instance-topbar-language"),
        title: t3({ en: "Language", fr: "Langue", pt: "Idioma" }),
        body: t3({
          en: "FASTR is available in English, French and Portuguese. Switching reloads the page in your chosen language.",
          fr: "FASTR est disponible en anglais, français et portugais. Le changement recharge la page dans la langue choisie.",
          pt: "O FASTR está disponível em inglês, francês e português. Mudar recarrega a página no idioma escolhido.",
        }),
        placement: "bottom",
      },
      {
        id: "whats-new",
        target: tourTarget("instance-topbar-whats-new"),
        title: t3({ en: "What's new", fr: "Nouveautés", pt: "Novidades" }),
        body: t3({
          en: "Release notes live under the bell — a dot means there's an announcement you haven't read yet.",
          fr: "Les notes de version se trouvent sous la cloche — un point signale une annonce que vous n'avez pas encore lue.",
          pt: "As notas de versão estão sob o sino — um ponto indica um anúncio que ainda não leu.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
      {
        id: "help",
        target: tourTarget("instance-topbar-help"),
        title: t3({ en: "Help", fr: "Aide", pt: "Ajuda" }),
        body: t3({
          en: "Guided tours, feedback and the FASTR documentation all live here — replay any tour, send questions or ideas straight to the team, or open the docs.",
          fr: "Les visites guidées, les commentaires et la documentation FASTR se trouvent ici — rejouez une visite, envoyez vos questions ou idées directement à l'équipe, ou ouvrez la documentation.",
          pt: "As visitas guiadas, os comentários e a documentação do FASTR estão aqui — repita uma visita, envie perguntas ou ideias diretamente à equipa, ou abra a documentação.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
      {
        id: "profile",
        target: tourTarget("instance-topbar-profile"),
        title: t3({
          en: "Your profile",
          fr: "Votre profil",
          pt: "O seu perfil",
        }),
        body: t3({
          en: "Update your details or sign out from here.",
          fr: "Mettez à jour vos informations ou déconnectez-vous ici.",
          pt: "Atualize os seus dados ou termine a sessão aqui.",
        }),
        placement: "bottom",
      },
    ],
  };
}

export function buildInstanceProjectsTour(): TourDefinition {
  const isAdmin = () => instanceState.currentUserIsGlobalAdmin;
  return {
    id: "instance-projects-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("instance-projects-header"),
        title: t3({ en: "Projects", fr: "Projets", pt: "Projetos" }),
        body: t3({
          en: "Everything in FASTR happens inside a project: each one gets its own data exports, modules, visualizations and documents.",
          fr: "Tout dans FASTR se passe dans un projet : chacun dispose de ses propres exportations de données, modules, visualisations et documents.",
          pt: "Tudo no FASTR acontece dentro de um projeto: cada um tem as suas próprias exportações de dados, módulos, visualizações e documentos.",
        }),
        placement: "bottom",
      },
      {
        id: "grid",
        target: tourTarget("instance-projects-grid"),
        title: t3({
          en: "One card per project",
          fr: "Une carte par projet",
          pt: "Um cartão por projeto",
        }),
        body: t3({
          en: "Click a card to open that project. A lock icon means the project is read-only, and the caption shows when it was last worked on.",
          fr: "Cliquez sur une carte pour ouvrir le projet. Une icône de cadenas signifie que le projet est en lecture seule, et la légende indique la dernière activité.",
          pt: "Clique num cartão para abrir esse projeto. Um ícone de cadeado significa que o projeto é só de leitura, e a legenda mostra quando foi a última atividade.",
        }),
        placement: "top",
      },
      {
        id: "sort",
        target: tourTarget("instance-projects-sort"),
        title: t3({
          en: "Sorting projects",
          fr: "Trier les projets",
          pt: "Ordenar projetos",
        }),
        body: t3({
          en: "Order the list by name or by most recent activity.",
          fr: "Classez la liste par nom ou par activité la plus récente.",
          pt: "Ordene a lista por nome ou pela atividade mais recente.",
        }),
        placement: "bottom",
      },
      {
        id: "compare",
        target: tourTarget("instance-projects-compare"),
        when: isAdmin,
        title: t3({
          en: "Compare projects",
          fr: "Comparer les projets",
          pt: "Comparar projetos",
        }),
        body: t3({
          en: "See every project's setup side by side — datasets, modules and activity — useful for spotting projects that are out of date.",
          fr: "Visualisez la configuration de tous les projets côte à côte — jeux de données, modules et activité — pratique pour repérer les projets obsolètes.",
          pt: "Veja a configuração de todos os projetos lado a lado — conjuntos de dados, módulos e atividade — útil para identificar projetos desatualizados.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
      {
        id: "pending-deletions",
        target: tourTarget("instance-projects-pending"),
        when: () =>
          instanceState.currentUserIsGlobalAdmin &&
          instanceState.projects.some(
            (proj) => proj.status === "pending_deletion",
          ),
        title: t3({
          en: "Pending deletions",
          fr: "Suppressions en attente",
          pt: "Eliminações pendentes",
        }),
        body: t3({
          en: "Deleting a project schedules it here first, so anything removed by mistake can still be restored before it's gone for good.",
          fr: "La suppression d'un projet le place d'abord ici, afin que tout ce qui a été supprimé par erreur puisse encore être restauré avant de disparaître définitivement.",
          pt: "Eliminar um projeto coloca-o primeiro aqui, para que algo removido por engano ainda possa ser restaurado antes de desaparecer definitivamente.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
      {
        id: "create",
        target: tourTarget("instance-projects-create"),
        when: () =>
          instanceState.currentUserIsGlobalAdmin ||
          instanceState.currentUserPermissions.can_create_projects,
        title: t3({
          en: "Create a project",
          fr: "Créer un projet",
          pt: "Criar um projeto",
        }),
        body: t3({
          en: "A new project only needs a name — you choose which datasets to export into it and which modules to enable afterwards.",
          fr: "Un nouveau projet ne nécessite qu'un nom — vous choisissez ensuite les jeux de données à y exporter et les modules à activer.",
          pt: "Um novo projeto só precisa de um nome — depois escolhe os conjuntos de dados a exportar e os módulos a ativar.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
    ],
  };
}

export function buildInstanceDataTour(): TourDefinition {
  return {
    id: "instance-data-intro",
    steps: [
      {
        id: "hmis",
        target: tourTarget("instance-data-hmis"),
        title: t3({ en: "HMIS", fr: "SNIS", pt: "HMIS" }),
        body: t3({
          en: "The facility list, monthly routine service data, and the indicator dictionary that defines what's being counted. Click a card to inspect what has been uploaded or to import a new dataset.",
          fr: "La liste des établissements, les données de routine mensuelles et le dictionnaire d'indicateurs qui définit ce qui est mesuré. Cliquez sur une carte pour consulter ce qui a été importé ou pour importer un nouveau jeu de données.",
          pt: "A lista de estabelecimentos, os dados de rotina mensais e o dicionário de indicadores que define o que é medido. Clique num cartão para consultar o que foi carregado ou para importar um novo conjunto de dados.",
        }),
        placement: "top",
      },
      {
        id: "hfa",
        target: tourTarget("instance-data-hfa"),
        title: t3({
          en: "Health facility assessments",
          fr: "Enquêtes auprès des établissements",
          pt: "Avaliações de unidades de saúde",
        }),
        body: t3({
          en: "Survey rounds with their own facilities, indicators, time points and weights — each uploaded once and exported to the projects that use them.",
          fr: "Les vagues d'enquêtes avec leurs propres établissements, indicateurs, périodes et pondérations — chacune importée une fois puis exportée vers les projets qui les utilisent.",
          pt: "Rondas de inquérito com os seus próprios estabelecimentos, indicadores, períodos e ponderações — cada uma carregada uma vez e exportada para os projetos que as utilizam.",
        }),
        placement: "top",
      },
      {
        id: "iceh",
        target: tourTarget("instance-data-iceh"),
        title: t3({
          en: "Equity data (ICEH)",
          fr: "Données d'équité (ICEH)",
          pt: "Dados de equidade (ICEH)",
        }),
        body: t3({
          en: "Household-survey equity data. Like the other datasources: uploaded once here, then exported into the projects that analyse it.",
          fr: "Les données d'équité issues d'enquêtes auprès des ménages. Comme les autres sources : importées une fois ici, puis exportées vers les projets qui les analysent.",
          pt: "Dados de equidade provenientes de inquéritos aos agregados familiares. Como as outras fontes: carregados uma vez aqui e depois exportados para os projetos que os analisam.",
        }),
        placement: "top",
      },
    ],
  };
}

export function buildInstanceResultsPackagesTour(): TourDefinition {
  return {
    id: "instance-results-packages-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("instance-results-packages-header"),
        title: t3({
          en: "Results packages",
          fr: "Paquets de résultats",
          pt: "Pacotes de resultados",
        }),
        body: t3({
          en: "Running the modules is an instance-level act, not a project one: you generate a package once here from the data and modules you choose, then attach it to the projects that should use it.",
          fr: "Exécuter les modules relève de l'instance, pas d'un projet : vous générez ici un paquet une seule fois à partir des données et des modules choisis, puis vous le rattachez aux projets qui doivent l'utiliser.",
          pt: "Executar os módulos é um ato da instância, não de um projeto: gera aqui um pacote uma única vez a partir dos dados e módulos que escolher e depois anexa-o aos projetos que o devem usar.",
        }),
        placement: "bottom",
      },
      {
        id: "generate",
        target: tourTarget("instance-results-packages-generate"),
        title: t3({
          en: "Generating a package",
          fr: "Générer un paquet",
          pt: "Gerar um pacote",
        }),
        body: t3({
          en: "This opens the wizard that configures a generation: which data, which modules, and which projects receive the result. Your configuration is kept, so you can leave it and resume where you stopped.",
          fr: "Ceci ouvre l'assistant de configuration d'une génération : quelles données, quels modules et quels projets reçoivent le résultat. Votre configuration est conservée : vous pouvez la quitter et la reprendre où vous en étiez.",
          pt: "Isto abre o assistente que configura uma geração: que dados, que módulos e que projetos recebem o resultado. A sua configuração é guardada, pelo que pode sair e retomar onde parou.",
        }),
        placement: "bottom",
      },
      {
        id: "defaults",
        target: tourTarget("instance-results-packages-defaults"),
        title: t3({
          en: "Module defaults",
          fr: "Paramètres par défaut des modules",
          pt: "Predefinições dos módulos",
        }),
        body: t3({
          en: "The settings each module starts from whenever you generate. Set them once here rather than re-entering the same values in the wizard every time.",
          fr: "Les paramètres dont chaque module part à chaque génération. Réglez-les une fois ici plutôt que de ressaisir les mêmes valeurs dans l'assistant à chaque fois.",
          pt: "As definições de que cada módulo parte sempre que gera. Defina-as uma vez aqui em vez de repetir os mesmos valores no assistente de cada vez.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// Split from the intro for the same reason as the project pair: a freshly
// created instance holds no packages, so neither target exists — and a tour
// that runs against nothing still writes its seen-flag.
export function buildInstanceResultsPackagesCatalogueTour(): TourDefinition {
  return {
    id: "instance-results-packages-catalogue",
    steps: [
      {
        id: "card",
        target: tourTarget("instance-results-packages-card"),
        title: t3({
          en: "The package catalogue",
          fr: "Le catalogue des paquets",
          pt: "O catálogo de pacotes",
        }),
        body: t3({
          en: "Every package this instance holds, with its status, when it was generated, and how much disk it occupies. A package that is still generating shows its modules progressing live.",
          fr: "Tous les paquets de cette instance, avec leur état, leur date de génération et l'espace disque occupé. Un paquet en cours de génération affiche la progression de ses modules en direct.",
          pt: "Todos os pacotes desta instância, com o seu estado, quando foram gerados e quanto disco ocupam. Um pacote ainda em geração mostra os seus módulos a progredir em direto.",
        }),
        placement: "top",
      },
      {
        id: "usage",
        target: tourTarget("instance-results-packages-usage"),
        title: t3({
          en: "Which projects use it",
          fr: "Quels projets l'utilisent",
          pt: "Que projetos o usam",
        }),
        body: t3({
          en: "A package in use cannot be deleted, and the button says so rather than disappearing. Deleting is one act — catalogue entry, files and cached results — and cannot be undone.",
          fr: "Un paquet utilisé ne peut pas être supprimé, et le bouton l'indique au lieu de disparaître. La suppression est un seul acte — entrée du catalogue, fichiers et résultats en cache — et elle est irréversible.",
          pt: "Um pacote em uso não pode ser eliminado, e o botão di-lo em vez de desaparecer. Eliminar é um único ato — entrada do catálogo, ficheiros e resultados em cache — e não pode ser anulado.",
        }),
        placement: "top",
      },
    ],
  };
}

export function buildInstanceAssetsTour(): TourDefinition {
  return {
    id: "instance-assets-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("instance-assets-header"),
        title: t3({ en: "Assets", fr: "Ressources", pt: "Recursos" }),
        body: t3({
          en: "Shared files for the whole instance — logos, images, CSVs and documents that any project can use.",
          fr: "Des fichiers partagés pour toute l'instance — logos, images, CSV et documents utilisables par tous les projets.",
          pt: "Ficheiros partilhados para toda a instância — logótipos, imagens, CSV e documentos que qualquer projeto pode utilizar.",
        }),
        placement: "bottom",
      },
      {
        id: "upload",
        target: "#select-file-button",
        title: t3({
          en: "Upload files",
          fr: "Téléverser des fichiers",
          pt: "Carregar ficheiros",
        }),
        body: t3({
          en: "Upload once, use anywhere: an uploaded logo can appear on dashboards, and an uploaded image can be dropped into any slide or report.",
          fr: "Téléversez une fois, utilisez partout : un logo téléversé peut apparaître sur les tableaux de bord, et une image peut être insérée dans n'importe quelle diapositive ou rapport.",
          pt: "Carregue uma vez, utilize em qualquer lugar: um logótipo carregado pode aparecer nos painéis, e uma imagem pode ser inserida em qualquer diapositivo ou relatório.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
      {
        id: "tabs",
        target: tourTarget("instance-assets-tabs"),
        title: t3({
          en: "Grouped by type",
          fr: "Regroupées par type",
          pt: "Agrupados por tipo",
        }),
        body: t3({
          en: "Files are organized into tabs by type — images, CSVs, documents and so on — with a count on each.",
          fr: "Les fichiers sont organisés en onglets par type — images, CSV, documents, etc. — avec un compteur sur chacun.",
          pt: "Os ficheiros são organizados em separadores por tipo — imagens, CSV, documentos, etc. — com um contador em cada um.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
      {
        id: "list",
        target: tourTarget("instance-assets-list"),
        title: t3({
          en: "Managing files",
          fr: "Gérer les fichiers",
          pt: "Gerir ficheiros",
        }),
        body: t3({
          en: "Download any file from the table. You can delete your own uploads; admins can manage everyone's.",
          fr: "Téléchargez n'importe quel fichier depuis le tableau. Vous pouvez supprimer vos propres téléversements ; les administrateurs peuvent gérer ceux de tout le monde.",
          pt: "Descarregue qualquer ficheiro a partir da tabela. Pode eliminar os seus próprios carregamentos; os administradores podem gerir os de todos.",
        }),
        placement: "top",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
    ],
  };
}

export function buildInstanceUsersTour(): TourDefinition {
  return {
    id: "instance-users-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("instance-users-header"),
        title: t3({ en: "Users", fr: "Utilisateurs", pt: "Utilizadores" }),
        body: t3({
          en: "Everyone with access to this instance, with their global role and permissions.",
          fr: "Toutes les personnes ayant accès à cette instance, avec leur rôle global et leurs permissions.",
          pt: "Todas as pessoas com acesso a esta instância, com o seu papel global e permissões.",
        }),
        placement: "bottom",
      },
      {
        id: "table",
        target: tourTarget("instance-users-table"),
        title: t3({
          en: "One row per user",
          fr: "Une ligne par utilisateur",
          pt: "Uma linha por utilizador",
        }),
        body: t3({
          en: "The table shows each user's instance-level permissions and recent activity. Click a row to view their details and edit what they can do.",
          fr: "Le tableau montre les permissions au niveau de l'instance et l'activité récente de chaque utilisateur. Cliquez sur une ligne pour voir ses détails et modifier ce qu'il peut faire.",
          pt: "A tabela mostra as permissões ao nível da instância e a atividade recente de cada utilizador. Clique numa linha para ver os detalhes e editar o que pode fazer.",
        }),
        placement: "top",
      },
      {
        id: "add",
        target: tourTarget("instance-users-add"),
        title: t3({
          en: "Add users",
          fr: "Ajouter des utilisateurs",
          pt: "Adicionar utilizadores",
        }),
        body: t3({
          en: "Invite users by email address — they get access as soon as they sign in.",
          fr: "Invitez des utilisateurs par adresse e-mail — ils obtiennent l'accès dès leur connexion.",
          pt: "Convide utilizadores por endereço de e-mail — obtêm acesso assim que iniciarem sessão.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
      {
        id: "bulk",
        target: tourTarget("instance-users-bulk"),
        title: t3({
          en: "Bulk operations",
          fr: "Opérations groupées",
          pt: "Operações em lote",
        }),
        body: t3({
          en: "Import many users at once from a CSV, or download the current user list with their permissions.",
          fr: "Importez plusieurs utilisateurs à la fois depuis un CSV, ou téléchargez la liste actuelle des utilisateurs avec leurs permissions.",
          pt: "Importe vários utilizadores de uma vez a partir de um CSV, ou descarregue a lista atual de utilizadores com as suas permissões.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
        onTargetTimeout: "skip",
      },
    ],
  };
}
