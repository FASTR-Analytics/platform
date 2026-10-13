import { tourTarget } from "@njwse/roadtrip";
import type { TourDefinition, TourLabels, TourStep } from "@njwse/roadtrip";
import { t3 } from "lib";
import { copilotViewController } from "~/components/products/copilot/mod.ts";
import { instanceState } from "~/state/instance/t1_store";

// Built as factories (not module-level constants) so t3() resolves after the
// app language has been set.
//
// Wording rules for every step, so the tours read the way the screen does:
// - Name a control by the label it carries on screen, in each language (the
//   tab is "Results", the column is "Scope", the menu is "Widgets").
// - Say what a thing is for in plain words the first time it is named: a
//   results package is the set of results the numbers come from, a scope is
//   the part of that data a product may show.
// - No internal vocabulary: no "instance-level", "data family", "catalogue",
//   "embed", "wizard", "cached", and no markup syntax unless the user has to
//   type it.

// Button labels shared by every tour: passed once per manager (roadtrip
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

// A step-level `when`: the step is part of the run only if its target is on
// screen when the tour starts. For controls that some users, some formats or
// some states never render. The tour's page is mounted by then, so the probe
// is safe here (it is NOT safe in the catalogue's `available`).
const onScreen = (selector: string) => () =>
  document.querySelector(selector) !== null;

// A target that mounts a moment after the step is reached, or may not be
// there at all: wait briefly, then move on instead of ending the whole run
// (roadtrip's default is to abort, which in a merged run drops every tour
// behind it).
const SKIP_IF_MISSING = {
  waitForTargetTimeoutMs: 2000,
  onTargetTimeout: "skip",
} as const;

// The same, for a target that waits on a fetch.
const SKIP_IF_MISSING_AFTER_LOAD = {
  waitForTargetTimeoutMs: 8000,
  onTargetTimeout: "skip",
} as const;

const isGlobalAdmin = () => instanceState.currentUserIsGlobalAdmin;

// ------------------------------------------------- Package and scope chip

// The chip in both editor headers. One step, worded per product type.
function packageScopeStep(kind: "deck" | "report"): TourStep {
  return {
    id: "package-scope",
    target: tourTarget(
      kind === "deck" ? "deck-package-scope" : "report-package-scope",
    ),
    title: t3({
      en: "Where the numbers come from",
      fr: "D'où viennent les chiffres",
      pt: "De onde vêm os números",
    }),
    body: kind === "deck"
      ? t3({
        en:
          "This shows the results package and the scope this deck uses. Every visualization in the deck takes its numbers from that package, and the scope sets which part of the data it may show. If you can edit the deck, click here to change either one. Visualizations made before the change are then out of date, and an Update all visualizations button appears so you can refresh them together.",
        fr:
          "Ceci indique le paquet de résultats et la portée utilisés par cette présentation. Chaque visualisation de la présentation tire ses chiffres de ce paquet, et la portée détermine quelle partie des données elle peut afficher. Si vous pouvez modifier la présentation, cliquez ici pour changer l'un ou l'autre. Les visualisations créées avant le changement ne sont alors plus à jour, et un bouton Mettre à jour toutes les visualisations apparaît pour les actualiser ensemble.",
        pt:
          "Isto mostra o pacote de resultados e o âmbito que esta apresentação usa. Cada visualização da apresentação vai buscar os seus números a esse pacote, e o âmbito define que parte dos dados pode mostrar. Se puder editar a apresentação, clique aqui para alterar um ou outro. As visualizações criadas antes da alteração ficam então desatualizadas, e aparece um botão Atualizar todas as visualizações para as atualizar em conjunto.",
      })
      : t3({
        en:
          "This shows the results package and the scope this report uses. Every visualization in the report takes its numbers from that package, and the scope sets which part of the data it may show. If you can edit the report, click here to change either one. Visualizations made before the change are then out of date, and an Update all visualizations button appears so you can refresh them together.",
        fr:
          "Ceci indique le paquet de résultats et la portée utilisés par ce rapport. Chaque visualisation du rapport tire ses chiffres de ce paquet, et la portée détermine quelle partie des données elle peut afficher. Si vous pouvez modifier le rapport, cliquez ici pour changer l'un ou l'autre. Les visualisations créées avant le changement ne sont alors plus à jour, et un bouton Mettre à jour toutes les visualisations apparaît pour les actualiser ensemble.",
        pt:
          "Isto mostra o pacote de resultados e o âmbito que este relatório usa. Cada visualização do relatório vai buscar os seus números a esse pacote, e o âmbito define que parte dos dados pode mostrar. Se puder editar o relatório, clique aqui para alterar um ou outro. As visualizações criadas antes da alteração ficam então desatualizadas, e aparece um botão Atualizar todas as visualizações para as atualizar em conjunto.",
      }),
    placement: "bottom",
    ...SKIP_IF_MISSING,
  };
}

// -------------------------------------------------------------- Deck editor

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
          en:
            "The bar across the top holds the deck's menus and buttons. Your slides are listed down the left, and the slide you click opens in the middle, ready to edit.",
          fr:
            "La barre du haut regroupe les menus et les boutons de la présentation. Vos diapositives sont listées à gauche, et celle sur laquelle vous cliquez s'ouvre au centre, prête à être modifiée.",
          pt:
            "A barra superior reúne os menus e os botões da apresentação. Os seus diapositivos estão listados à esquerda, e aquele em que clicar abre-se ao centro, pronto a editar.",
        }),
        placement: "bottom",
      },
      {
        id: "add-slide",
        target: tourTarget("deck-add-slide"),
        title: t3({
          en: "Add a slide",
          fr: "Ajouter une diapositive",
          pt: "Adicionar um diapositivo",
        }),
        body: t3({
          en:
            "The + button adds a slide. Choose a Cover slide to open the deck, a Section slide to introduce a new part, or a Content slide for visualizations, images and text.",
          fr:
            "Le bouton + ajoute une diapositive. Choisissez une diapositive de couverture pour ouvrir la présentation, une diapositive de section pour introduire une nouvelle partie, ou une diapositive de contenu pour les visualisations, les images et le texte.",
          pt:
            "O botão + adiciona um diapositivo. Escolha um diapositivo de capa para abrir a apresentação, um diapositivo de secção para introduzir uma nova parte, ou um diapositivo de conteúdo para visualizações, imagens e texto.",
        }),
        placement: "bottom",
      },
      {
        id: "file",
        target: tourTarget("deck-file-menu"),
        title: t3({
          en: "Download and share",
          fr: "Télécharger et partager",
          pt: "Transferir e partilhar",
        }),
        body: t3({
          en:
            "File is for the deck as a whole: download it as PowerPoint or PDF, share it, change its name or folder, and copy the slides you have selected into another deck.",
          fr:
            "Fichier concerne la présentation dans son ensemble : la télécharger en PowerPoint ou en PDF, la partager, changer son nom ou son dossier, et copier les diapositives sélectionnées vers une autre présentation.",
          pt:
            "Ficheiro diz respeito à apresentação no seu todo: transferi-la em PowerPoint ou PDF, partilhá-la, mudar o nome ou a pasta, e copiar os diapositivos selecionados para outra apresentação.",
        }),
        placement: "bottom",
      },
      packageScopeStep("deck"),
      {
        id: "ai",
        target: tourTarget("deck-ai-button"),
        title: t3({
          en: "The AI assistant",
          fr: "L'assistant IA",
          pt: "O assistente de IA",
        }),
        body: t3({
          en:
            "Open the AI assistant and ask it, in your own words, to create slides or to change the one you have open.",
          fr:
            "Ouvrez l'assistant IA et demandez-lui, avec vos propres mots, de créer des diapositives ou de modifier celle qui est ouverte.",
          pt:
            "Abra o assistente de IA e peça-lhe, pelas suas próprias palavras, que crie diapositivos ou altere o que tem aberto.",
        }),
        placement: "bottom",
        // The button is there only while the assistant's panel is closed.
        when: onScreen(tourTarget("deck-ai-button")),
      },
    ],
  };
}

// Deferred until a slide card is on screen: the list and the card only exist
// once the deck has slides, so an empty deck's first visit skips this and
// gets it after the first slide is added.
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
          en:
            "The slides appear here in the order they will be presented. Drag a slide up or down to move it. Everything you change is saved automatically, and colleagues working on the same deck see it straight away.",
          fr:
            "Les diapositives apparaissent ici dans l'ordre où elles seront présentées. Faites glisser une diapositive vers le haut ou le bas pour la déplacer. Tout ce que vous modifiez est enregistré automatiquement, et les collègues qui travaillent sur la même présentation le voient immédiatement.",
          pt:
            "Os diapositivos aparecem aqui pela ordem em que serão apresentados. Arraste um diapositivo para cima ou para baixo para o mover. Tudo o que alterar é guardado automaticamente, e os colegas que trabalham na mesma apresentação veem-no de imediato.",
        }),
        placement: "right",
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
          en:
            "Click a slide to open it. Click the circle in its corner to select several slides at once. Right-click a slide to duplicate or delete it.",
          fr:
            "Cliquez sur une diapositive pour l'ouvrir. Cliquez sur le cercle dans son coin pour sélectionner plusieurs diapositives à la fois. Faites un clic droit sur une diapositive pour la dupliquer ou la supprimer.",
          pt:
            "Clique num diapositivo para o abrir. Clique no círculo no canto para selecionar vários diapositivos de uma vez. Clique com o botão direito num diapositivo para o duplicar ou eliminar.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// Deferred until the Present button is on screen: it only renders once the
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
          en:
            "Present shows the deck full screen, starting from the first slide. Use it in a meeting, or for a last check before you share it.",
          fr:
            "Présenter affiche la présentation en plein écran, à partir de la première diapositive. Utilisez-le en réunion, ou pour une dernière vérification avant de la partager.",
          pt:
            "Apresentar mostra a apresentação em ecrã inteiro, a partir do primeiro diapositivo. Utilize-o numa reunião, ou para uma última verificação antes de a partilhar.",
        }),
        placement: "bottom",
      },
      {
        id: "present-controls",
        target: "#deck-present-button",
        title: t3({
          en: "Moving between slides",
          fr: "Passer d'une diapositive à l'autre",
          pt: "Passar de um diapositivo para outro",
        }),
        body: t3({
          en:
            "While presenting, use the arrow keys, the space bar or Page Up and Page Down to change slide. Home and End go to the first and the last slide. Press Escape to stop presenting.",
          fr:
            "Pendant la présentation, utilisez les flèches, la barre d'espace ou Page précédente et Page suivante pour changer de diapositive. Début et Fin mènent à la première et à la dernière diapositive. Appuyez sur Échap pour arrêter.",
          pt:
            "Durante a apresentação, utilize as teclas de seta, a barra de espaços ou Page Up e Page Down para mudar de diapositivo. Home e End levam ao primeiro e ao último diapositivo. Prima Esc para terminar.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// Walks the user into the version-history overlay from the header's History
// button, then back out again: the final advanceOn matters, because the
// overlay covers the toolbar that the settings part needs next.
export function buildDeckEditorHistoryTour(): TourDefinition {
  return {
    id: "deck-editor-history",
    steps: [
      {
        id: "open-history",
        target: "#deck-history-button",
        title: t3({
          en: "Version history",
          fr: "Historique des versions",
          pt: "Histórico de versões",
        }),
        body: t3({
          en:
            "Every deck keeps its earlier versions. Click History to open them.",
          fr:
            "Chaque présentation conserve ses versions précédentes. Cliquez sur Historique pour les ouvrir.",
          pt:
            "Cada apresentação guarda as suas versões anteriores. Clique em Histórico para as abrir.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
      {
        id: "version-list",
        target: tourTarget("version-history-list"),
        title: t3({
          en: "Earlier versions",
          fr: "Versions précédentes",
          pt: "Versões anteriores",
        }),
        body: t3({
          en:
            "Versions are saved automatically as people work. They are grouped by day, with the time and the person who made the changes. Click one to see it.",
          fr:
            "Les versions sont enregistrées automatiquement au fil du travail. Elles sont regroupées par jour, avec l'heure et la personne qui a fait les modifications. Cliquez sur l'une d'elles pour la voir.",
          pt:
            "As versões são guardadas automaticamente à medida que as pessoas trabalham. Estão agrupadas por dia, com a hora e a pessoa que fez as alterações. Clique numa para a ver.",
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
          en:
            "When you select a version you see what changed since the one before it, and you can restore it if you need to go back. Click here to return to your slides.",
          fr:
            "Lorsque vous sélectionnez une version, vous voyez ce qui a changé depuis la précédente, et vous pouvez la restaurer si vous devez revenir en arrière. Cliquez ici pour revenir à vos diapositives.",
          pt:
            "Ao selecionar uma versão, vê o que mudou desde a anterior, e pode restaurá-la se precisar de voltar atrás. Clique aqui para regressar aos seus diapositivos.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
    ],
  };
}

// Ordered last so it merges after the intro/slides parts: the deck tour ends
// on the Deck menu, where everything deck-wide now lives.
export function buildDeckEditorSettingsTour(): TourDefinition {
  return {
    id: "deck-editor-settings",
    steps: [
      {
        id: "deck-menu",
        target: tourTarget("deck-menu"),
        title: t3({
          en: "Settings for the whole deck",
          fr: "Paramètres de toute la présentation",
          pt: "Definições de toda a apresentação",
        }),
        body: t3({
          en:
            "The Deck menu holds what applies to every slide: the theme, the logos that slides can show, and the footer and page numbers. Each change applies straight away. All deck settings… opens the full list.",
          fr:
            "Le menu Présentation contient ce qui s'applique à toutes les diapositives : le thème, les logos que les diapositives peuvent afficher, ainsi que le pied de page et les numéros de page. Chaque modification s'applique immédiatement. Tous les paramètres… ouvre la liste complète.",
          pt:
            "O menu Apresentação contém o que se aplica a todos os diapositivos: o tema, os logótipos que os diapositivos podem mostrar, e o rodapé e os números de página. Cada alteração aplica-se de imediato. Todas as definições… abre a lista completa.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// --------------------------------------------------------- Slide editor

// The slide tours run on the deck editor's page (index.ts): the open slide
// sits beside the deck's rail, so the slide's tools and the deck's are on
// screen together.

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

function slideTypeStep(): TourStep {
  return {
    id: "type",
    target: tourTarget("slide-type-select"),
    title: t3({
      en: "The Slide menu",
      fr: "Le menu Diapositive",
      pt: "O menu Diapositivo",
    }),
    body: t3({
      en:
        "Slide changes this slide between Cover, Section and Content at any time, and sets whether its logos are shown.",
      fr:
        "Diapositive fait passer cette diapositive de Couverture à Section ou Contenu à tout moment, et indique si ses logos sont affichés.",
      pt:
        "Diapositivo muda este diapositivo entre Capa, Secção e Conteúdo em qualquer momento, e define se os seus logótipos são mostrados.",
    }),
    placement: "bottom",
  };
}

function slideInsertStep(body: string): TourStep {
  return {
    id: "insert",
    target: tourTarget("slide-text-fields"),
    title: t3({
      en: "The Insert menu",
      fr: "Le menu Insérer",
      pt: "O menu Inserir",
    }),
    body,
    placement: "bottom",
  };
}

function slideFormatStep(id: string): TourStep {
  return {
    id,
    target: tourTarget("slide-format-toolbar"),
    title: t3({
      en: "Formatting text",
      fr: "Mettre le texte en forme",
      pt: "Formatar o texto",
    }),
    body: t3({
      en:
        "While you type on the slide, use this bar to change the text style and size, make text bold or italic, and add lists. Undo and redo are at the start of the bar.",
      fr:
        "Pendant que vous écrivez sur la diapositive, utilisez cette barre pour changer le style et la taille du texte, le mettre en gras ou en italique, et ajouter des listes. Annuler et rétablir se trouvent au début de la barre.",
      pt:
        "Enquanto escreve no diapositivo, utilize esta barra para mudar o estilo e o tamanho do texto, pô-lo a negrito ou itálico, e adicionar listas. Anular e refazer estão no início da barra.",
    }),
    placement: "bottom",
  };
}

function slideCanvasStep(): TourStep {
  return {
    id: "canvas",
    target: tourTarget("slide-canvas"),
    title: t3({
      en: "The slide",
      fr: "La diapositive",
      pt: "O diapositivo",
    }),
    body: t3({
      en:
        "This is how the slide will look when you present or download it. Double-click any text to type straight onto the slide.",
      fr:
        "Voici l'apparence de la diapositive lorsque vous la présentez ou la téléchargez. Double-cliquez sur un texte pour écrire directement sur la diapositive.",
      pt:
        "É assim que o diapositivo ficará quando o apresentar ou transferir. Faça duplo clique num texto para escrever diretamente no diapositivo.",
    }),
    placement: "left",
  };
}

// The open slide's save indicator, drawn in the deck header once the slide
// has connected.
function slideSaveStep(): TourStep {
  return {
    id: "save-status",
    target: tourTarget("slide-save-status"),
    title: t3({
      en: "Saved as you work",
      fr: "Enregistré au fil du travail",
      pt: "Guardado enquanto trabalha",
    }),
    body: t3({
      en:
        "There is no save button. This shows when your changes have been saved, and colleagues editing the same deck see them straight away.",
      fr:
        "Il n'y a pas de bouton d'enregistrement. Ceci indique quand vos modifications ont été enregistrées, et les collègues qui modifient la même présentation les voient immédiatement.",
      pt:
        "Não há botão de guardar. Isto mostra quando as suas alterações foram guardadas, e os colegas que editam a mesma apresentação veem-nas de imediato.",
    }),
    placement: "bottom",
    ...SKIP_IF_MISSING,
  };
}

export function buildSlideCoverTour(): TourDefinition {
  return {
    id: "slide-cover-intro",
    steps: [
      slideEditorIntroStep(
        t3({
          en:
            "This is a Cover slide, the title slide that opens the deck. This row of tools is for the slide you have open.",
          fr:
            "Ceci est une diapositive de couverture, la diapositive de titre qui ouvre la présentation. Cette rangée d'outils concerne la diapositive ouverte.",
          pt:
            "Este é um diapositivo de capa, o diapositivo de título que abre a apresentação. Esta fila de ferramentas diz respeito ao diapositivo que tem aberto.",
        }),
      ),
      slideTypeStep(),
      slideInsertStep(
        t3({
          en:
            "A cover starts with a title. Insert adds a subtitle, a presenter or a date.",
          fr:
            "Une couverture commence par un titre. Insérer ajoute un sous-titre, un présentateur ou une date.",
          pt:
            "Uma capa começa com um título. Inserir adiciona um subtítulo, um apresentador ou uma data.",
        }),
      ),
      slideFormatStep("cover-fields"),
      slideCanvasStep(),
      slideSaveStep(),
    ],
  };
}

export function buildSlideSectionTour(): TourDefinition {
  return {
    id: "slide-section-intro",
    steps: [
      slideEditorIntroStep(
        t3({
          en:
            "This is a Section slide. It introduces the next part of the deck. This row of tools is for the slide you have open.",
          fr:
            "Ceci est une diapositive de section. Elle introduit la partie suivante de la présentation. Cette rangée d'outils concerne la diapositive ouverte.",
          pt:
            "Este é um diapositivo de secção. Introduz a parte seguinte da apresentação. Esta fila de ferramentas diz respeito ao diapositivo que tem aberto.",
        }),
      ),
      slideTypeStep(),
      slideInsertStep(
        t3({
          en:
            "A section slide has a title. Insert adds a subtitle if you want one.",
          fr:
            "Une diapositive de section a un titre. Insérer ajoute un sous-titre si vous en voulez un.",
          pt:
            "Um diapositivo de secção tem um título. Inserir adiciona um subtítulo, se quiser.",
        }),
      ),
      slideFormatStep("section-fields"),
      slideCanvasStep(),
      slideSaveStep(),
    ],
  };
}

export function buildSlideContentTour(): TourDefinition {
  return {
    id: "slide-content-intro",
    steps: [
      slideEditorIntroStep(
        t3({
          en:
            "This is a Content slide. It holds your visualizations, tables, images and text. This row of tools is for the slide you have open.",
          fr:
            "Ceci est une diapositive de contenu. Elle contient vos visualisations, tableaux, images et textes. Cette rangée d'outils concerne la diapositive ouverte.",
          pt:
            "Este é um diapositivo de conteúdo. Contém as suas visualizações, tabelas, imagens e texto. Esta fila de ferramentas diz respeito ao diapositivo que tem aberto.",
        }),
      ),
      slideTypeStep(),
      slideInsertStep(
        t3({
          en:
            "Insert adds the text around the slide's content: a header, a sub header, a date or a footer.",
          fr:
            "Insérer ajoute le texte qui entoure le contenu de la diapositive : un en-tête, un sous-en-tête, une date ou un pied de page.",
          pt:
            "Inserir adiciona o texto à volta do conteúdo do diapositivo: um cabeçalho, um subcabeçalho, uma data ou um rodapé.",
        }),
      ),
      {
        id: "split",
        target: tourTarget("slide-split-menu"),
        title: t3({
          en: "Split panel",
          fr: "Panneau divisé",
          pt: "Painel dividido",
        }),
        body: t3({
          en:
            "Split panel adds a decorative panel down the left or right side of the slide. You choose its size and fill it with a plain colour, a pattern or an image.",
          fr:
            "Panneau divisé ajoute un panneau décoratif sur le côté gauche ou droit de la diapositive. Vous choisissez sa taille et le remplissez d'une couleur unie, d'un motif ou d'une image.",
          pt:
            "Painel dividido adiciona um painel decorativo no lado esquerdo ou direito do diapositivo. Escolhe o tamanho e preenche-o com uma cor lisa, um padrão ou uma imagem.",
        }),
        placement: "bottom",
      },
      slideCanvasStep(),
      {
        id: "blocks",
        target: tourTarget("slide-canvas"),
        title: t3({
          en: "Blocks",
          fr: "Les blocs",
          pt: "Blocos",
        }),
        body: t3({
          en:
            "The middle of a content slide is made of blocks. Click a block to select it, then use the bar above to make it text, a visualization or an image. Layout splits a block into rows or columns, adds more blocks, moves them or deletes them.",
          fr:
            "Le centre d'une diapositive de contenu est composé de blocs. Cliquez sur un bloc pour le sélectionner, puis utilisez la barre ci-dessus pour en faire un texte, une visualisation ou une image. Mise en page divise un bloc en lignes ou en colonnes, ajoute des blocs, les déplace ou les supprime.",
          pt:
            "O centro de um diapositivo de conteúdo é composto por blocos. Clique num bloco para o selecionar e depois utilize a barra acima para o tornar texto, uma visualização ou uma imagem. Disposição divide um bloco em linhas ou colunas, adiciona mais blocos, move-os ou elimina-os.",
        }),
        placement: "left",
      },
      slideFormatStep("toolbar"),
      slideSaveStep(),
    ],
  };
}

// ---------------------------------------------------- Visualization editor

// The editor a visualization opens in, from a slide or from a report. It
// covers the product editor behind it without changing the copilot's view,
// so its page reads a count of open editors (t4_ui, index.ts).
export function buildVizEditorTour(): TourDefinition {
  return {
    id: "viz-editor-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("viz-editor-header"),
        title: t3({
          en: "Editing a visualization",
          fr: "Modifier une visualisation",
          pt: "Editar uma visualização",
        }),
        body: t3({
          en:
            "Here you decide what this visualization shows and how it looks. The three tabs on the left hold the choices, and the visualization itself is on the right.",
          fr:
            "Ici, vous décidez ce que cette visualisation montre et quelle est son apparence. Les trois onglets à gauche contiennent les choix, et la visualisation elle-même se trouve à droite.",
          pt:
            "Aqui decide o que esta visualização mostra e qual o seu aspeto. Os três separadores à esquerda contêm as opções, e a própria visualização está à direita.",
        }),
        placement: "bottom",
      },
      {
        id: "data",
        target: tourTarget("viz-tab-data"),
        title: t3({ en: "Data", fr: "Données", pt: "Dados" }),
        body: t3({
          en:
            "Data sets what is shown. Presentation type chooses the kind of visualization, such as a table, a chart or a map. Filter (subset) narrows the data, for example to certain areas or a time period. Display (disaggregate) chooses how the numbers are broken down.",
          fr:
            "Données définit ce qui est affiché. Type de présentation choisit le genre de visualisation, par exemple un tableau, un graphique ou une carte. Filtre (sous-ensemble) restreint les données, par exemple à certaines zones ou à une période. Affichage (désagréger) choisit comment les chiffres sont ventilés.",
          pt:
            "Dados define o que é mostrado. Tipo de apresentação escolhe o género de visualização, por exemplo uma tabela, um gráfico ou um mapa. Filtro (subconjunto) restringe os dados, por exemplo a certas áreas ou a um período. Apresentação (desagregar) escolhe como os números são repartidos.",
        }),
        placement: "right",
        ...SKIP_IF_MISSING_AFTER_LOAD,
      },
      {
        id: "style",
        target: tourTarget("viz-tab-style"),
        title: t3({
          en: "Presentation",
          fr: "Présentation",
          pt: "Apresentação",
        }),
        body: t3({
          en:
            "Presentation sets how the visualization looks: colours, axes, labels, decimal places and the order of the values.",
          fr:
            "Présentation définit l'apparence de la visualisation : couleurs, axes, étiquettes, décimales et ordre des valeurs.",
          pt:
            "Apresentação define o aspeto da visualização: cores, eixos, rótulos, casas decimais e a ordem dos valores.",
        }),
        placement: "right",
        ...SKIP_IF_MISSING,
      },
      {
        id: "text",
        target: tourTarget("viz-tab-text"),
        title: t3({ en: "Text", fr: "Texte", pt: "Texto" }),
        body: t3({
          en:
            "Text holds the words shown with the visualization: its caption, sub-caption and footnote.",
          fr:
            "Texte contient les mots affichés avec la visualisation : son titre, son sous-titre et sa note de bas de page.",
          pt:
            "Texto contém as palavras mostradas com a visualização: a legenda, a sublegenda e a nota de rodapé.",
        }),
        placement: "right",
        ...SKIP_IF_MISSING,
      },
      {
        id: "preview",
        target: tourTarget("viz-editor-preview"),
        title: t3({
          en: "The visualization",
          fr: "La visualisation",
          pt: "A visualização",
        }),
        body: t3({
          en:
            "This is the visualization as it will appear in your slide or report. It updates each time you change something on the left.",
          fr:
            "Voici la visualisation telle qu'elle apparaîtra dans votre diapositive ou votre rapport. Elle se met à jour à chaque modification faite à gauche.",
          pt:
            "Esta é a visualização tal como aparecerá no seu diapositivo ou relatório. É atualizada sempre que altera algo à esquerda.",
        }),
        placement: "left",
        ...SKIP_IF_MISSING,
      },
      {
        id: "finish",
        target: tourTarget("viz-editor-header"),
        title: t3({
          en: "When you have finished",
          fr: "Quand vous avez terminé",
          pt: "Quando terminar",
        }),
        body: t3({
          en:
            "Use the arrow at the top left to go back to your slide or report. If Apply and Cancel are shown instead, click Apply to keep your changes. Download saves the visualization as a file of its own.",
          fr:
            "Utilisez la flèche en haut à gauche pour revenir à votre diapositive ou à votre rapport. Si Appliquer et Annuler s'affichent à la place, cliquez sur Appliquer pour conserver vos modifications. Télécharger enregistre la visualisation dans un fichier à part.",
          pt:
            "Utilize a seta no canto superior esquerdo para voltar ao seu diapositivo ou relatório. Se, em vez dela, aparecerem Aplicar e Cancelar, clique em Aplicar para manter as alterações. Transferir guarda a visualização num ficheiro próprio.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// ----------------------------------------------------------- Report editor

// A report is edited on the page itself, with a menu row and a formatting
// bar. A reader has neither, so the steps below are gated on what is on
// screen.
const REPORT_MENU_ROW = tourTarget("report-menu-row");

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
          en:
            "A report is a written document. You write the text, and add visualizations, images and ready-made layouts where they belong.",
          fr:
            "Un rapport est un document rédigé. Vous écrivez le texte, et ajoutez des visualisations, des images et des mises en page prêtes à l'emploi là où elles doivent apparaître.",
          pt:
            "Um relatório é um documento escrito. Escreve o texto, e adiciona visualizações, imagens e esquemas prontos a usar onde fazem sentido.",
        }),
        placement: "bottom",
      },
      {
        id: "menus",
        target: REPORT_MENU_ROW,
        title: t3({
          en: "The menus",
          fr: "Les menus",
          pt: "Os menus",
        }),
        body: t3({
          en:
            "File downloads the report, emails it, renames it or makes a copy. Widgets adds ready-made layouts such as a callout, a statistic, columns, a cover page or a table of contents. Figures adds a visualization or an image. Page sets the theme, the background, the orientation and numbered sections.",
          fr:
            "Fichier télécharge le rapport, l'envoie par email, le renomme ou en crée une copie. Widgets ajoute des mises en page prêtes à l'emploi, comme un encadré, une statistique, des colonnes, une page de couverture ou une table des matières. Figures ajoute une visualisation ou une image. Page définit le thème, le fond, l'orientation et les sections numérotées.",
          pt:
            "Ficheiro transfere o relatório, envia-o por email, muda-lhe o nome ou cria uma cópia. Widgets adiciona esquemas prontos a usar, como um destaque, uma estatística, colunas, uma página de capa ou um índice. Figuras adiciona uma visualização ou uma imagem. Página define o tema, o fundo, a orientação e as secções numeradas.",
        }),
        placement: "bottom",
        // A report someone can edit; a reader has no menus.
        when: onScreen(REPORT_MENU_ROW),
      },
      {
        id: "formatting",
        target: tourTarget("report-format-toolbar"),
        title: t3({
          en: "Formatting",
          fr: "Mise en forme",
          pt: "Formatação",
        }),
        body: t3({
          en:
            "Select some text and use this bar as you would in a word processor: text style, bold, italic, colour, lists and tables. When you click a widget or a visualization, the bar shows the options for that item instead.",
          fr:
            "Sélectionnez du texte et utilisez cette barre comme dans un traitement de texte : style de texte, gras, italique, couleur, listes et tableaux. Lorsque vous cliquez sur un widget ou une visualisation, la barre affiche à la place les options de cet élément.",
          pt:
            "Selecione algum texto e utilize esta barra como num processador de texto: estilo de texto, negrito, itálico, cor, listas e tabelas. Quando clica num widget ou numa visualização, a barra passa a mostrar as opções desse elemento.",
        }),
        placement: "bottom",
        when: onScreen(REPORT_MENU_ROW),
      },
      {
        id: "code-pane",
        target: tourTarget("report-code-pane"),
        // Two pages share this anchor: the page being edited, and a report
        // the user can only read.
        title: () =>
          onScreen(REPORT_MENU_ROW)()
            ? t3({ en: "Write here", fr: "Écrivez ici", pt: "Escreva aqui" })
            : t3({ en: "The report", fr: "Le rapport", pt: "O relatório" }),
        body: () =>
          onScreen(REPORT_MENU_ROW)()
            ? t3({
              en:
                "This is the page, shown as it will look when it is downloaded. Click anywhere on it and type.",
              fr:
                "Voici la page, telle qu'elle apparaîtra une fois téléchargée. Cliquez n'importe où et écrivez.",
              pt:
                "Esta é a página, tal como ficará quando for transferida. Clique em qualquer ponto e escreva.",
            })
            : t3({
              en: "This is the report. You can read it here.",
              fr: "Voici le rapport. Vous pouvez le lire ici.",
              pt: "Este é o relatório. Pode lê-lo aqui.",
            }),
        placement: "right",
        ...SKIP_IF_MISSING,
      },
      {
        id: "outline",
        target: tourTarget("report-outline"),
        title: t3({
          en: "Report tabs",
          fr: "Onglets du rapport",
          pt: "Separadores do relatório",
        }),
        body: t3({
          en:
            "Every heading in the report is listed here. Click one to go straight to it. The arrow at the top hides the list.",
          fr:
            "Tous les titres du rapport sont listés ici. Cliquez sur l'un d'eux pour y aller directement. La flèche en haut masque la liste.",
          pt:
            "Todos os títulos do relatório estão listados aqui. Clique num para ir diretamente até ele. A seta no topo oculta a lista.",
        }),
        placement: "right",
        // Only while the list is open.
        when: onScreen(tourTarget("report-outline")),
      },
      packageScopeStep("report"),
      {
        id: "save-status",
        target: tourTarget("report-save-status"),
        title: t3({
          en: "Saved as you write",
          fr: "Enregistré au fil de l'écriture",
          pt: "Guardado enquanto escreve",
        }),
        body: t3({
          en:
            "There is no save button. This shows when your changes have been saved, and colleagues editing the same report see them straight away.",
          fr:
            "Il n'y a pas de bouton d'enregistrement. Ceci indique quand vos modifications ont été enregistrées, et les collègues qui modifient le même rapport les voient immédiatement.",
          pt:
            "Não há botão de guardar. Isto mostra quando as suas alterações foram guardadas, e os colegas que editam o mesmo relatório veem-nas de imediato.",
        }),
        placement: "bottom",
      },
      {
        id: "download",
        target: "#report-download-button",
        title: t3({
          en: "Download it",
          fr: "Téléchargez-le",
          pt: "Transfira-o",
        }),
        body: t3({
          en:
            "Download the report as a PDF or a Word document, with the visualizations in place.",
          fr:
            "Téléchargez le rapport en PDF ou en document Word, avec les visualisations à leur place.",
          pt:
            "Transfira o relatório como PDF ou documento Word, com as visualizações no devido lugar.",
        }),
        placement: "bottom",
        // A FASTR report being edited has Download in its File menu instead.
        when: onScreen("#report-download-button"),
      },
      {
        id: "ai",
        target: "#report-ai-button",
        title: t3({
          en: "Write with the AI assistant",
          fr: "Écrire avec l'assistant IA",
          pt: "Escrever com o assistente de IA",
        }),
        body: t3({
          en:
            "Open the AI assistant to draft or rework parts of the report. Select some text first and it works on just that part.",
          fr:
            "Ouvrez l'assistant IA pour rédiger ou retravailler des parties du rapport. Sélectionnez d'abord du texte et il ne travaillera que sur cette partie.",
          pt:
            "Abra o assistente de IA para redigir ou reformular partes do relatório. Selecione primeiro algum texto e ele trabalha apenas nessa parte.",
        }),
        placement: "bottom",
        when: onScreen("#report-ai-button"),
      },
      {
        id: "back",
        target: "#report-back-button",
        title: t3({
          en: "Back to your products",
          fr: "Retour à vos produits",
          pt: "Voltar aos seus produtos",
        }),
        body: t3({
          en:
            "Everything is already saved, so you can leave whenever you like.",
          fr:
            "Tout est déjà enregistré, vous pouvez donc partir quand vous voulez.",
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
          en: "A visualization in the report",
          fr: "Une visualisation dans le rapport",
          pt: "Uma visualização no relatório",
        }),
        body: t3({
          en:
            "Click a visualization to select it. The bar at the top then shows what you can do with it: edit it, replace it, change its size or delete it. Its numbers come from the results package and scope shown at the top of the report.",
          fr:
            "Cliquez sur une visualisation pour la sélectionner. La barre du haut indique alors ce que vous pouvez en faire : la modifier, la remplacer, changer sa taille ou la supprimer. Ses chiffres viennent du paquet de résultats et de la portée indiqués en haut du rapport.",
          pt:
            "Clique numa visualização para a selecionar. A barra no topo mostra então o que pode fazer com ela: editá-la, substituí-la, alterar o tamanho ou eliminá-la. Os seus números vêm do pacote de resultados e do âmbito indicados no topo do relatório.",
        }),
        placement: "right",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// Same shape as the deck history tour. Ends by closing itself.
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
          en:
            "Every report keeps its earlier versions. Click History to open them.",
          fr:
            "Chaque rapport conserve ses versions précédentes. Cliquez sur Historique pour les ouvrir.",
          pt:
            "Cada relatório guarda as suas versões anteriores. Clique em Histórico para as abrir.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
      {
        id: "version-list",
        target: tourTarget("version-history-list"),
        title: t3({
          en: "Earlier versions",
          fr: "Versions précédentes",
          pt: "Versões anteriores",
        }),
        body: t3({
          en:
            "Versions are saved automatically as people work. They are grouped by day, with the time and the person who made the changes. Click one to see what changed.",
          fr:
            "Les versions sont enregistrées automatiquement au fil du travail. Elles sont regroupées par jour, avec l'heure et la personne qui a fait les modifications. Cliquez sur l'une d'elles pour voir ce qui a changé.",
          pt:
            "As versões são guardadas automaticamente à medida que as pessoas trabalham. Estão agrupadas por dia, com a hora e a pessoa que fez as alterações. Clique numa para ver o que mudou.",
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
          en:
            "A selected version shows what changed since the one before it, and you can restore it if you need to go back. Click here to return to the report.",
          fr:
            "Une version sélectionnée montre ce qui a changé depuis la précédente, et vous pouvez la restaurer si vous devez revenir en arrière. Cliquez ici pour revenir au rapport.",
          pt:
            "Uma versão selecionada mostra o que mudou desde a anterior, e pode restaurá-la se precisar de voltar atrás. Clique aqui para regressar ao relatório.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
    ],
  };
}

// ---------------------------------------------------------- Products page

export function buildProductsIntroTour(): TourDefinition {
  return {
    id: "products-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("products-header"),
        title: t3({ en: "Products", fr: "Produits", pt: "Produtos" }),
        body: t3({
          en:
            "Everything you build is listed here. A product is a slide deck or a report. Click one to open it.",
          fr:
            "Tout ce que vous créez est listé ici. Un produit est une présentation ou un rapport. Cliquez sur l'un d'eux pour l'ouvrir.",
          pt:
            "Tudo o que cria está listado aqui. Um produto é uma apresentação ou um relatório. Clique num para o abrir.",
        }),
        placement: "bottom",
      },
      {
        id: "search",
        target: () =>
          document.querySelector('[data-tour="products-header"] input'),
        title: t3({ en: "Search", fr: "Recherche", pt: "Pesquisa" }),
        body: t3({
          en: "Type at least three letters to find a product by its name.",
          fr:
            "Saisissez au moins trois lettres pour trouver un produit par son nom.",
          pt:
            "Escreva pelo menos três letras para encontrar um produto pelo nome.",
        }),
        placement: "bottom",
      },
      {
        id: "folders",
        target: tourTarget("products-items"),
        title: t3({
          en: "Folders",
          fr: "Dossiers",
          pt: "Pastas",
        }),
        body: t3({
          en:
            "Products can be kept in folders, and a folder can hold other folders. Click a folder to show or hide what is inside it. Products that are not in a folder are listed under General. The button beside the search box opens or closes every folder at once.",
          fr:
            "Les produits peuvent être rangés dans des dossiers, et un dossier peut contenir d'autres dossiers. Cliquez sur un dossier pour afficher ou masquer son contenu. Les produits qui ne sont dans aucun dossier sont listés sous Général. Le bouton à côté du champ de recherche ouvre ou ferme tous les dossiers en une fois.",
          pt:
            "Os produtos podem ser guardados em pastas, e uma pasta pode conter outras pastas. Clique numa pasta para mostrar ou ocultar o que está lá dentro. Os produtos que não estão em nenhuma pasta aparecem em Geral. O botão ao lado da caixa de pesquisa abre ou fecha todas as pastas de uma vez.",
        }),
        placement: "top",
      },
      {
        id: "list",
        target: tourTarget("products-items"),
        title: t3({
          en: "What the columns show",
          fr: "Ce que montrent les colonnes",
          pt: "O que as colunas mostram",
        }),
        body: t3({
          en:
            "Package is the results package a product takes its numbers from. Scope is the part of that data the product may show, for example one region. Click Name or Last updated to change the order.",
          fr:
            "Paquet est le paquet de résultats dont un produit tire ses chiffres. Portée est la partie de ces données que le produit peut afficher, par exemple une région. Cliquez sur Nom ou Modifié le pour changer l'ordre.",
          pt:
            "Pacote é o pacote de resultados de onde um produto vai buscar os seus números. Âmbito é a parte desses dados que o produto pode mostrar, por exemplo uma região. Clique em Nome ou Atualizado para mudar a ordem.",
        }),
        placement: "top",
      },
    ],
  };
}

// Permission-gated second layer: merges after the intro part for editors, or
// runs on its own on the first visit after a viewer becomes an editor.
export function buildProductsCreateTour(): TourDefinition {
  return {
    id: "products-create",
    steps: [
      {
        id: "new",
        target: tourTarget("products-new"),
        title: t3({
          en: "Create a deck, a report or a folder",
          fr: "Créer une présentation, un rapport ou un dossier",
          pt: "Criar uma apresentação, um relatório ou uma pasta",
        }),
        body: t3({
          en:
            "New creates a slide deck, a report or a folder. For a deck or a report you first choose two things: the results package its numbers will come from, and the scope, which is the part of that data it may show. You can change both later. The new deck or report then opens straight away.",
          fr:
            "Nouveau crée une présentation, un rapport ou un dossier. Pour une présentation ou un rapport, vous choisissez d'abord deux choses : le paquet de résultats d'où viendront ses chiffres, et la portée, c'est-à-dire la partie de ces données qu'il peut afficher. Vous pouvez modifier les deux plus tard. La nouvelle présentation ou le nouveau rapport s'ouvre ensuite immédiatement.",
          pt:
            "Novo cria uma apresentação, um relatório ou uma pasta. Para uma apresentação ou um relatório, escolhe primeiro duas coisas: o pacote de resultados de onde virão os seus números, e o âmbito, que é a parte desses dados que pode mostrar. Pode alterar ambos mais tarde. A nova apresentação ou o novo relatório abre de imediato.",
        }),
        placement: "bottom",
      },
      {
        id: "organise",
        target: tourTarget("products-items"),
        title: t3({
          en: "Keeping things in order",
          fr: "Garder les choses en ordre",
          pt: "Manter tudo organizado",
        }),
        body: t3({
          en:
            "A new deck or report is listed under General. Right-click it, or a folder, to move it. Deleting a folder never deletes what is inside it: its contents move up one level.",
          fr:
            "Une nouvelle présentation ou un nouveau rapport est listé sous Général. Faites un clic droit dessus, ou sur un dossier, pour le déplacer. Supprimer un dossier ne supprime jamais son contenu : celui-ci remonte d'un niveau.",
          pt:
            "Uma nova apresentação ou um novo relatório aparece em Geral. Clique com o botão direito nele, ou numa pasta, para o mover. Eliminar uma pasta nunca elimina o que está lá dentro: o conteúdo sobe um nível.",
        }),
        placement: "top",
      },
    ],
  };
}

// Deferred until the instance actually holds a product (entry-level `when` in
// index.ts): held back without being marked seen, so it runs on the first
// Products visit where a product row is on screen, or merges into the intro run when
// products are already there.
export function buildProductsCardsTour(): TourDefinition {
  return {
    id: "products-cards",
    steps: [
      {
        id: "open-product",
        target: tourTarget("products-item"),
        title: t3({
          en: "Open a product",
          fr: "Ouvrir un produit",
          pt: "Abrir um produto",
        }),
        body: t3({
          en:
            "Click a product to open it. The Type column says whether it is a deck or a report.",
          fr:
            "Cliquez sur un produit pour l'ouvrir. La colonne Type indique s'il s'agit d'une présentation ou d'un rapport.",
          pt:
            "Clique num produto para o abrir. A coluna Tipo indica se é uma apresentação ou um relatório.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
      },
      {
        id: "product-actions",
        target: tourTarget("products-item"),
        title: t3({
          en: "Move, copy or delete",
          fr: "Déplacer, copier ou supprimer",
          pt: "Mover, copiar ou eliminar",
        }),
        body: t3({
          en:
            "Right-click a product, or use the button at the end of its row, to move it to a folder, change its name (Settings), change its results package and scope, duplicate it or delete it.",
          fr:
            "Faites un clic droit sur un produit, ou utilisez le bouton au bout de sa ligne, pour le déplacer dans un dossier, changer son nom (Paramètres), changer son paquet de résultats et sa portée, le dupliquer ou le supprimer.",
          pt:
            "Clique com o botão direito num produto, ou utilize o botão no fim da sua linha, para o mover para uma pasta, mudar o nome (Definições), alterar o pacote de resultados e o âmbito, duplicá-lo ou eliminá-lo.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// ----------------------------------------------------------------- Explore

// Deferred until a results package is ready (entry-level `when` in index.ts):
// without one the page is a single line of text. The package and scope boxes
// are on screen at once; everything under them waits for the package's
// contents to load, so those steps wait and then move on.
export function buildExploreTour(): TourDefinition {
  return {
    id: "explore-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("explore-controls"),
        title: t3({ en: "Explore", fr: "Explorer", pt: "Explorar" }),
        body: t3({
          en:
            "Explore lets you look through the results directly, without building a slide deck or a report. The first box chooses the results package to read. The second is the scope: leave it on All data to see everything, or choose a scope to see only the part of the data it covers.",
          fr:
            "Explorer vous permet de parcourir directement les résultats, sans créer de présentation ni de rapport. La première liste choisit le paquet de résultats à lire. La seconde est la portée : laissez-la sur « All data » pour tout voir, ou choisissez une portée pour ne voir que la partie des données qu'elle couvre.",
          pt:
            "Explorar permite-lhe percorrer diretamente os resultados, sem criar uma apresentação nem um relatório. A primeira caixa escolhe o pacote de resultados a ler. A segunda é o âmbito: deixe-a em «All data» para ver tudo, ou escolha um âmbito para ver apenas a parte dos dados que ele abrange.",
        }),
        placement: "bottom",
      },
      {
        id: "families",
        target: tourTarget("explore-families"),
        title: t3({
          en: "One tab for each kind of data",
          fr: "Un onglet par type de données",
          pt: "Um separador para cada tipo de dados",
        }),
        body: t3({
          en:
            "Each tab is one kind of data in this package: routine facility data (HMIS), health facility assessments (HFA) or equity data (ICEH). You see a tab only for the data the package includes.",
          fr:
            "Chaque onglet correspond à un type de données de ce paquet : les données de routine des établissements (HMIS), les enquêtes auprès des établissements (FOSA) ou les données d'équité (ICEH). Un onglet n'apparaît que pour les données que le paquet contient.",
          pt:
            "Cada separador é um tipo de dados deste pacote: dados de rotina dos estabelecimentos (HMIS), avaliações de unidades de saúde (HFA) ou dados de equidade (ICEH). Só aparece um separador para os dados que o pacote inclui.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING_AFTER_LOAD,
      },
      {
        id: "selectors",
        target: tourTarget("explore-selectors"),
        title: t3({
          en: "Choose what to look at",
          fr: "Choisir quoi regarder",
          pt: "Escolher o que ver",
        }),
        body: t3({
          en:
            "Results are grouped by module, and each module is one analysis. Choose a module here. Where a module can be shown in more than one way, for example as a table or as a chart over time, a second box lets you switch.",
          fr:
            "Les résultats sont regroupés par module, et chaque module correspond à une analyse. Choisissez un module ici. Lorsqu'un module peut être affiché de plusieurs façons, par exemple en tableau ou en graphique dans le temps, une seconde liste permet de changer.",
          pt:
            "Os resultados estão agrupados por módulo, e cada módulo é uma análise. Escolha um módulo aqui. Quando um módulo pode ser mostrado de mais de uma forma, por exemplo como tabela ou como gráfico ao longo do tempo, uma segunda caixa permite mudar.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING_AFTER_LOAD,
      },
      {
        id: "filters",
        target: tourTarget("explore-filters"),
        title: t3({
          en: "Narrow it down",
          fr: "Affiner",
          pt: "Restringir",
        }),
        body: t3({
          en:
            "Choose the indicators and the period you want to see. Depending on what you are looking at, you can also choose the area level, such as national or district, and whether to show months, quarters or years.",
          fr:
            "Choisissez les indicateurs et la période à afficher. Selon ce que vous consultez, vous pouvez aussi choisir le niveau géographique, par exemple national ou district, et l'affichage par mois, trimestre ou année.",
          pt:
            "Escolha os indicadores e o período que quer ver. Consoante o que estiver a ver, pode também escolher o nível geográfico, por exemplo nacional ou distrito, e mostrar meses, trimestres ou anos.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING,
      },
      {
        id: "download",
        target: tourTarget("explore-download"),
        title: t3({
          en: "Find a column, or download",
          fr: "Chercher une colonne, ou télécharger",
          pt: "Procurar uma coluna, ou transferir",
        }),
        body: t3({
          en:
            "In a table, type here to find a column, and use Download to save the table you see as a CSV file. Nothing you choose in Explore changes any deck or report.",
          fr:
            "Dans un tableau, écrivez ici pour chercher une colonne, et utilisez Télécharger pour enregistrer le tableau affiché dans un fichier CSV. Rien de ce que vous choisissez dans Explorer ne modifie une présentation ou un rapport.",
          pt:
            "Numa tabela, escreva aqui para procurar uma coluna, e utilize Transferir para guardar a tabela que vê num ficheiro CSV. Nada do que escolher em Explorar altera qualquer apresentação ou relatório.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING,
      },
    ],
  };
}

// -------------------------------------------- Instance-level tabs

// First-visit tours for the instance tabs (Products / Explore / Results /
// Data / Assets / Users). Their availability reads instanceState only.

// The nav renders twice (compact icons below xl, labelled buttons above); a
// selector that matches both resolves to the visible one (roadtrip >= 0.10),
// so a plain tourTarget() is enough.

// The instance shell itself: navigation, language, release notes and where to
// find help. Fires on the Products page (the landing tab), merging seamlessly
// ahead of the products tours on a brand-new user's first visit.

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
          en:
            "These tabs are the main areas of the platform. Products is where you build slide decks and reports, and Explore is for looking through the results directly. Results, Data, Assets and Users are for generating results, uploading data, sharing files and managing who has access. You see only the tabs your account can use.",
          fr:
            "Ces onglets sont les principales zones de la plateforme. Produits est l'endroit où vous créez des présentations et des rapports, et Explorer sert à parcourir directement les résultats. Résultats, Données, Ressources et Utilisateurs servent à générer les résultats, importer les données, partager des fichiers et gérer les accès. Vous ne voyez que les onglets que votre compte peut utiliser.",
          pt:
            "Estes separadores são as principais áreas da plataforma. Produtos é onde cria apresentações e relatórios, e Explorar serve para percorrer diretamente os resultados. Resultados, Dados, Recursos e Utilizadores servem para gerar resultados, carregar dados, partilhar ficheiros e gerir quem tem acesso. Só vê os separadores que a sua conta pode usar.",
        }),
        placement: "right",
      },
      {
        id: "help",
        target: tourTarget("instance-topbar-help"),
        title: t3({ en: "Help", fr: "Aide", pt: "Ajuda" }),
        body: t3({
          en:
            "Help is where you replay any of these guided tours, ask for help, send feedback or open the documentation.",
          fr:
            "Aide vous permet de rejouer ces visites guidées, de demander de l'aide, d'envoyer un commentaire ou d'ouvrir la documentation.",
          pt:
            "Em Ajuda pode repetir qualquer uma destas visitas guiadas, pedir ajuda, enviar comentários ou abrir a documentação.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING,
      },
      {
        id: "language",
        target: tourTarget("instance-topbar-language"),
        title: t3({ en: "Language", fr: "Langue", pt: "Idioma" }),
        body: t3({
          en:
            "FASTR is available in English, French and Portuguese. Changing the language reloads the page.",
          fr:
            "FASTR est disponible en anglais, en français et en portugais. Changer de langue recharge la page.",
          pt:
            "O FASTR está disponível em inglês, francês e português. Mudar de idioma recarrega a página.",
        }),
        placement: "bottom",
      },
      {
        id: "whats-new",
        target: tourTarget("instance-topbar-whats-new"),
        title: t3({ en: "What's new", fr: "Nouveautés", pt: "Novidades" }),
        body: t3({
          en:
            "The bell lists what has changed in FASTR. A dot on it means there is an announcement you have not read yet.",
          fr:
            "La cloche liste ce qui a changé dans FASTR. Un point signale une annonce que vous n'avez pas encore lue.",
          pt:
            "O sino lista o que mudou no FASTR. Um ponto indica um anúncio que ainda não leu.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING,
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

export function buildInstanceDataTour(): TourDefinition {
  return {
    id: "instance-data-intro",
    steps: [
      {
        id: "hmis",
        target: tourTarget("instance-data-hmis"),
        title: t3({
          en: "HMIS: routine facility data",
          fr: "SNIS : données de routine des établissements",
          pt: "HMIS: dados de rotina dos estabelecimentos",
        }),
        body: t3({
          en:
            "The data health facilities report every month, with the list of facilities and the indicators being counted. Click a row to see what has been uploaded or to import more. The dot on the right of each row shows whether that part is ready.",
          fr:
            "Les données que les établissements de santé déclarent chaque mois, avec la liste des établissements et les indicateurs mesurés. Cliquez sur une ligne pour voir ce qui a été importé ou pour en importer davantage. Le point à droite de chaque ligne indique si cette partie est prête.",
          pt:
            "Os dados que os estabelecimentos de saúde comunicam todos os meses, com a lista de estabelecimentos e os indicadores medidos. Clique numa linha para ver o que foi carregado ou para importar mais. O ponto à direita de cada linha indica se essa parte está pronta.",
        }),
        placement: "top",
      },
      {
        id: "hfa",
        target: tourTarget("instance-data-hfa"),
        title: t3({
          en: "HFA: health facility assessments",
          fr: "Enquêtes FOSA : enquêtes auprès des établissements",
          pt: "HFA: avaliações de unidades de saúde",
        }),
        body: t3({
          en:
            "Data from surveys of health facilities: the facilities surveyed, each survey round (a time point), the sampling weights, the indicators and the survey answers themselves.",
          fr:
            "Les données des enquêtes auprès des établissements de santé : les établissements enquêtés, chaque vague d'enquête (un point temporel), les pondérations d'échantillonnage, les indicateurs et les réponses elles-mêmes.",
          pt:
            "Dados de inquéritos a unidades de saúde: as unidades inquiridas, cada ronda de inquérito (um ponto temporal), os pesos de amostragem, os indicadores e as próprias respostas.",
        }),
        placement: "top",
      },
      {
        id: "iceh",
        target: tourTarget("instance-data-iceh"),
        title: t3({
          en: "ICEH: equity data",
          fr: "ICEH : données d'équité",
          pt: "ICEH: dados de equidade",
        }),
        body: t3({
          en:
            "Equity data from household surveys. Like the data above, it is uploaded here once and is then available to every results package.",
          fr:
            "Les données d'équité issues d'enquêtes auprès des ménages. Comme les données ci-dessus, elles sont importées ici une seule fois et sont ensuite disponibles pour chaque paquet de résultats.",
          pt:
            "Dados de equidade provenientes de inquéritos aos agregados familiares. Tal como os dados acima, são carregados aqui uma única vez e ficam depois disponíveis para todos os pacotes de resultados.",
        }),
        placement: "top",
      },
      {
        id: "settings",
        target: tourTarget("instance-data-settings"),
        title: t3({
          en: "Settings shared by all the data",
          fr: "Paramètres communs à toutes les données",
          pt: "Definições comuns a todos os dados",
        }),
        body: t3({
          en:
            "The names used for each level of area (for example Region and District), and background information about your country that the AI assistant uses.",
          fr:
            "Les noms utilisés pour chaque niveau géographique (par exemple Région et District), et les informations de contexte sur votre pays qu'utilise l'assistant IA.",
          pt:
            "Os nomes usados para cada nível geográfico (por exemplo Região e Distrito), e as informações de contexto sobre o seu país que o assistente de IA utiliza.",
        }),
        placement: "top",
        // Rendered only for those who may change settings.
        when: () =>
          isGlobalAdmin() ||
          instanceState.currentUserPermissions.can_configure_settings,
        ...SKIP_IF_MISSING,
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
          en:
            "A results package is one complete set of results, made by running the analysis modules on the data that has been uploaded. Every slide deck and report takes its numbers from one package, so its numbers stay the same until someone moves it to a newer package.",
          fr:
            "Un paquet de résultats est un ensemble complet de résultats, obtenu en exécutant les modules d'analyse sur les données importées. Chaque présentation et chaque rapport tire ses chiffres d'un seul paquet : ses chiffres restent donc les mêmes jusqu'à ce que quelqu'un le rattache à un paquet plus récent.",
          pt:
            "Um pacote de resultados é um conjunto completo de resultados, obtido ao executar os módulos de análise sobre os dados carregados. Cada apresentação e cada relatório vai buscar os seus números a um único pacote, pelo que os números se mantêm até alguém o passar para um pacote mais recente.",
        }),
        placement: "bottom",
      },
      {
        id: "generate",
        target: tourTarget("instance-results-packages-generate"),
        title: t3({
          en: "Generate a package",
          fr: "Générer un paquet",
          pt: "Gerar um pacote",
        }),
        body: t3({
          en:
            "This takes you through three steps: choose the data, choose the modules to run, then name the package and start it. Generation runs in the background. The new package opens so you can follow its progress, and it is added to the list below.",
          fr:
            "Ceci vous guide en trois étapes : choisir les données, choisir les modules à exécuter, puis nommer le paquet et le lancer. La génération se fait en arrière-plan. Le nouveau paquet s'ouvre pour que vous puissiez suivre sa progression, et il est ajouté à la liste ci-dessous.",
          pt:
            "Isto conduz-o por três passos: escolher os dados, escolher os módulos a executar, e depois dar um nome ao pacote e iniciá-lo. A geração decorre em segundo plano. O novo pacote abre-se para que possa acompanhar o progresso, e é adicionado à lista abaixo.",
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
          en:
            "The settings each module runs with, and which data and modules are already ticked when you start a new package. Module settings are changed only here, and they apply to every package generated afterwards.",
          fr:
            "Les paramètres avec lesquels chaque module s'exécute, et les données et modules déjà cochés lorsque vous lancez un nouveau paquet. Les paramètres des modules se modifient uniquement ici, et s'appliquent à tous les paquets générés par la suite.",
          pt:
            "As definições com que cada módulo é executado, e os dados e módulos que já vêm assinalados quando inicia um novo pacote. As definições dos módulos alteram-se apenas aqui, e aplicam-se a todos os pacotes gerados depois.",
        }),
        placement: "bottom",
      },
      {
        id: "scopes",
        target: tourTarget("instance-results-packages-scopes"),
        title: t3({ en: "Scopes", fr: "Portées", pt: "Âmbitos" }),
        body: t3({
          en:
            "A scope sets which part of a package a slide deck or report may show: for example one region, certain years, or certain modules and indicators. Create and change scopes here. The scope called All data is always there and limits nothing. On the Users page, a user can also be limited to certain scopes.",
          fr:
            "Une portée détermine quelle partie d'un paquet une présentation ou un rapport peut afficher : par exemple une région, certaines années, ou certains modules et indicateurs. Créez et modifiez les portées ici. La portée appelée « All data » est toujours présente et ne limite rien. Sur la page Utilisateurs, un utilisateur peut aussi être limité à certaines portées.",
          pt:
            "Um âmbito define que parte de um pacote uma apresentação ou um relatório pode mostrar: por exemplo uma região, certos anos, ou certos módulos e indicadores. Crie e altere âmbitos aqui. O âmbito chamado «All data» existe sempre e não limita nada. Na página Utilizadores, um utilizador também pode ser limitado a certos âmbitos.",
        }),
        placement: "bottom",
        // The button is for administrators only.
        when: isGlobalAdmin,
        ...SKIP_IF_MISSING,
      },
    ],
  };
}

// Split from the intro for the same reason as the products cards tour: a freshly
// created instance holds no packages, so the first target does not exist, and
// a tour that runs against nothing still writes its seen-flag. The tour walks
// from the list into a package: the first step completes when the user clicks
// a row, which opens that package's page, and the second waits
// for the status bar's usage row there. The page covers the shell, so the list
// could not be shown after a page had been opened first.
export function buildInstanceResultsPackagesCatalogueTour(): TourDefinition {
  return {
    id: "instance-results-packages-catalogue",
    steps: [
      {
        id: "catalogue",
        target: tourTarget("instance-results-packages-table"),
        title: t3({
          en: "Your results packages",
          fr: "Vos paquets de résultats",
          pt: "Os seus pacotes de resultados",
        }),
        body: t3({
          en:
            "Every package is listed here, newest first, with who created it, its status and how many products use it. Pinned marks the package that new decks and reports start with. Click a package to open it and continue.",
          fr:
            "Tous les paquets sont listés ici, du plus récent au plus ancien, avec leur créateur, leur statut et le nombre de produits qui les utilisent. Épinglé désigne le paquet avec lequel démarrent les nouvelles présentations et les nouveaux rapports. Cliquez sur un paquet pour l'ouvrir et continuer.",
          pt:
            "Todos os pacotes estão listados aqui, do mais recente ao mais antigo, com quem os criou, o seu estado e quantos produtos os usam. Fixado assinala o pacote com que começam as novas apresentações e os novos relatórios. Clique num pacote para o abrir e continuar.",
        }),
        placement: "bottom",
        advanceOn: "click",
      },
      {
        id: "usage",
        target: tourTarget("instance-results-packages-usage"),
        title: t3({
          en: "Inside a package",
          fr: "Dans un paquet",
          pt: "Dentro de um pacote",
        }),
        body: t3({
          en:
            "The top of the page shows how each module ran and which decks and reports use this package. The tabs below hold the results, one tab for each kind of data.",
          fr:
            "Le haut de la page montre comment chaque module s'est exécuté et quelles présentations et quels rapports utilisent ce paquet. Les onglets en dessous contiennent les résultats, un onglet par type de données.",
          pt:
            "O topo da página mostra como cada módulo foi executado e que apresentações e relatórios usam este pacote. Os separadores abaixo contêm os resultados, um separador para cada tipo de dados.",
        }),
        placement: "bottom",
      },
      {
        id: "actions",
        target: tourTarget("instance-results-packages-actions"),
        title: t3({
          en: "Pin or delete",
          fr: "Épingler ou supprimer",
          pt: "Fixar ou eliminar",
        }),
        body: t3({
          en:
            "Pin makes this the package that new decks and reports start with. Decks and reports you already have keep their own package. A package can be deleted only when no deck or report uses it and it is not pinned, and deleting cannot be undone.",
          fr:
            "Épingler fait de ce paquet celui avec lequel démarrent les nouvelles présentations et les nouveaux rapports. Les présentations et les rapports existants gardent leur propre paquet. Un paquet ne peut être supprimé que si aucune présentation ni aucun rapport ne l'utilise et s'il n'est pas épinglé, et la suppression est irréversible.",
          pt:
            "Fixar faz deste o pacote com que começam as novas apresentações e os novos relatórios. As apresentações e os relatórios que já tem mantêm o seu próprio pacote. Um pacote só pode ser eliminado quando nenhuma apresentação ou relatório o usa e não está fixado, e a eliminação não pode ser anulada.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING,
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
        target: tourTarget("instance-assets-list"),
        title: t3({ en: "Assets", fr: "Ressources", pt: "Recursos" }),
        body: t3({
          en:
            "Assets are files shared with everyone here: logos, images, CSV files and documents that can be used in any slide deck or report.",
          fr:
            "Les ressources sont des fichiers partagés avec tout le monde ici : logos, images, fichiers CSV et documents utilisables dans n'importe quelle présentation ou n'importe quel rapport.",
          pt:
            "Os recursos são ficheiros partilhados com todos aqui: logótipos, imagens, ficheiros CSV e documentos que podem ser usados em qualquer apresentação ou relatório.",
        }),
        placement: "top",
        ...SKIP_IF_MISSING,
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
          en:
            "Upload a file once and use it anywhere. A logo you upload can be shown on a deck's slides, and an image can be added to any slide or report.",
          fr:
            "Téléversez un fichier une fois et utilisez-le partout. Un logo téléversé peut être affiché sur les diapositives d'une présentation, et une image peut être ajoutée à n'importe quelle diapositive ou n'importe quel rapport.",
          pt:
            "Carregue um ficheiro uma vez e utilize-o em qualquer lugar. Um logótipo carregado pode ser mostrado nos diapositivos de uma apresentação, e uma imagem pode ser adicionada a qualquer diapositivo ou relatório.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING,
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
          en:
            "Use the Type column to show only images, CSV files and so on. Any file can be downloaded from its row. You can delete the files you uploaded, and administrators can delete anyone's.",
          fr:
            "Utilisez la colonne Type pour n'afficher que les images, les fichiers CSV, etc. Tout fichier peut être téléchargé depuis sa ligne. Vous pouvez supprimer les fichiers que vous avez téléversés, et les administrateurs peuvent supprimer ceux de tout le monde.",
          pt:
            "Utilize a coluna Tipo para mostrar apenas imagens, ficheiros CSV, etc. Qualquer ficheiro pode ser transferido a partir da sua linha. Pode eliminar os ficheiros que carregou, e os administradores podem eliminar os de qualquer pessoa.",
        }),
        placement: "top",
        ...SKIP_IF_MISSING,
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
        target: tourTarget("instance-users-table"),
        title: t3({ en: "Users", fr: "Utilisateurs", pt: "Utilizadores" }),
        body: t3({
          en:
            "Everyone who can sign in here, with when they were last active and their status: an administrator, or the permissions they have been given.",
          fr:
            "Toutes les personnes qui peuvent se connecter ici, avec leur dernière activité et leur statut : administrateur, ou les permissions qui leur ont été accordées.",
          pt:
            "Todas as pessoas que podem iniciar sessão aqui, com a última atividade e o estado: administrador, ou as permissões que lhes foram atribuídas.",
        }),
        placement: "top",
      },
      {
        id: "table",
        target: tourTarget("instance-users-table"),
        title: t3({
          en: "What a user can do",
          fr: "Ce qu'un utilisateur peut faire",
          pt: "O que um utilizador pode fazer",
        }),
        body: t3({
          en:
            "Click a user to see what they can do. If you manage users, you can make them an administrator, give them individual permissions, or limit them to certain scopes so that they see only the products that use those scopes. Tick several users to change them together.",
          fr:
            "Cliquez sur un utilisateur pour voir ce qu'il peut faire. Si vous gérez les utilisateurs, vous pouvez le rendre administrateur, lui accorder des permissions individuelles, ou le limiter à certaines portées pour qu'il ne voie que les produits qui utilisent ces portées. Cochez plusieurs utilisateurs pour les modifier ensemble.",
          pt:
            "Clique num utilizador para ver o que ele pode fazer. Se gere os utilizadores, pode torná-lo administrador, dar-lhe permissões individuais, ou limitá-lo a certos âmbitos para que veja apenas os produtos que usam esses âmbitos. Assinale vários utilizadores para os alterar em conjunto.",
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
          en:
            "Add people by their email address. They get access as soon as they sign in.",
          fr:
            "Ajoutez des personnes par leur adresse e-mail. Elles obtiennent l'accès dès leur connexion.",
          pt:
            "Adicione pessoas pelo endereço de e-mail. Obtêm acesso assim que iniciarem sessão.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING,
      },
      {
        id: "bulk",
        target: tourTarget("instance-users-bulk"),
        title: t3({
          en: "Many users at once",
          fr: "Plusieurs utilisateurs à la fois",
          pt: "Vários utilizadores de uma vez",
        }),
        body: t3({
          en:
            "Batch import adds many users at once from a CSV file. Download saves the current list of users as a CSV file.",
          fr:
            "Importation groupée ajoute plusieurs utilisateurs à la fois à partir d'un fichier CSV. Télécharger enregistre la liste actuelle des utilisateurs dans un fichier CSV.",
          pt:
            "Importação em lote adiciona vários utilizadores de uma vez a partir de um ficheiro CSV. Transferir guarda a lista atual de utilizadores num ficheiro CSV.",
        }),
        placement: "bottom",
        ...SKIP_IF_MISSING,
      },
    ],
  };
}
