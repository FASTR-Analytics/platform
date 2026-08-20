import { tourTarget } from "@njwse/roadtrip";
import type { TourDefinition, TourLabels, TourStep } from "@njwse/roadtrip";
import { t3 } from "lib";

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
          en: "Everything you build lives here. A product is a slide deck or a report; click any card to open it in its editor.",
          fr: "Tout ce que vous créez se trouve ici. Un produit est une présentation ou un rapport ; cliquez sur une carte pour l'ouvrir dans son éditeur.",
          pt: "Tudo o que cria está aqui. Um produto é uma apresentação ou um relatório; clique num cartão para o abrir no seu editor.",
        }),
        placement: "bottom",
      },
      {
        id: "search",
        target: () =>
          document.querySelector('[data-tour="products-header"] input'),
        title: t3({ en: "Search", fr: "Recherche", pt: "Pesquisa" }),
        body: t3({
          en: "Type at least three letters to filter products by name.",
          fr: "Saisissez au moins trois lettres pour filtrer les produits par nom.",
          pt: "Escreva pelo menos três letras para filtrar os produtos por nome.",
        }),
        placement: "bottom",
      },
      {
        id: "type-filter",
        target: tourTarget("products-type-filter"),
        title: t3({
          en: "Decks or reports",
          fr: "Présentations ou rapports",
          pt: "Apresentações ou relatórios",
        }),
        body: t3({
          en: "Decks and reports share one list. Use these chips to show just one kind.",
          fr: "Les présentations et les rapports partagent une seule liste. Utilisez ces filtres pour n'en afficher qu'un type.",
          pt: "As apresentações e os relatórios partilham uma única lista. Utilize estes filtros para mostrar apenas um tipo.",
        }),
        placement: "bottom",
      },
      {
        id: "sort",
        target: tourTarget("products-sort"),
        title: t3({ en: "Sorting", fr: "Tri", pt: "Ordenação" }),
        body: t3({
          en: "Order products by name or by when they were last updated.",
          fr: "Classez les produits par nom ou par date de dernière mise à jour.",
          pt: "Ordene os produtos por nome ou pela data da última atualização.",
        }),
        placement: "bottom",
      },
      {
        id: "folders",
        target: tourTarget("products-items"),
        title: t3({
          en: "Browse by folder",
          fr: "Parcourir par dossier",
          pt: "Navegar por pasta",
        }),
        body: t3({
          en: "Folders and products share one view. Click a folder to go inside it, and use the breadcrumb in the header to come back out. Folders can hold other folders.",
          fr: "Les dossiers et les produits partagent une même vue. Cliquez sur un dossier pour y entrer, et utilisez le fil d'Ariane dans l'en-tête pour en ressortir. Les dossiers peuvent contenir d'autres dossiers.",
          pt: "As pastas e os produtos partilham uma única vista. Clique numa pasta para entrar nela, e use o caminho no cabeçalho para voltar a sair. As pastas podem conter outras pastas.",
        }),
        placement: "top",
      },
      {
        id: "view-mode",
        target: tourTarget("products-view-mode"),
        title: t3({
          en: "Grid or list",
          fr: "Grille ou liste",
          pt: "Grelha ou lista",
        }),
        body: t3({
          en: "Switch between the card grid and a compact list. Both show the same folders and products.",
          fr: "Basculez entre la grille de cartes et une liste compacte. Les deux montrent les mêmes dossiers et produits.",
          pt: "Alterne entre a grelha de cartões e uma lista compacta. Ambas mostram as mesmas pastas e produtos.",
        }),
        placement: "bottom",
      },
      {
        id: "grid",
        target: tourTarget("products-items"),
        title: t3({
          en: "Your products",
          fr: "Vos produits",
          pt: "Os seus produtos",
        }),
        body: t3({
          en: "Every product in the current location appears here, with the results package it reads from and the area it covers.",
          fr: "Tous les produits de l'emplacement actuel apparaissent ici, avec le paquet de résultats dont ils se servent et la zone qu'ils couvrent.",
          pt: "Todos os produtos da localização atual aparecem aqui, com o pacote de resultados de que se servem e a área que abrangem.",
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
        id: "new-deck",
        target: tourTarget("products-new-deck"),
        title: t3({
          en: "Create a slide deck",
          fr: "Créer une présentation",
          pt: "Criar uma apresentação",
        }),
        body: t3({
          en: "There is no dialog — the deck is created and its editor opens straight away. It starts from the instance's current results package, covering the whole country; both can be changed later in its settings.",
          fr: "Aucune boîte de dialogue — la présentation est créée et son éditeur s'ouvre immédiatement. Elle part du paquet de résultats actuel de l'instance et couvre tout le pays ; les deux peuvent être modifiés ensuite dans ses paramètres.",
          pt: "Não há caixa de diálogo — a apresentação é criada e o seu editor abre de imediato. Parte do pacote de resultados atual da instância e abrange todo o país; ambos podem ser alterados depois nas suas definições.",
        }),
        placement: "bottom",
      },
      {
        id: "new-report",
        target: tourTarget("products-new-report"),
        title: t3({
          en: "Create a report",
          fr: "Créer un rapport",
          pt: "Criar um relatório",
        }),
        body: t3({
          en: "The same for a report — a written document that carries figures inside the text.",
          fr: "Idem pour un rapport — un document rédigé qui contient des figures au fil du texte.",
          pt: "O mesmo para um relatório — um documento escrito que contém figuras ao longo do texto.",
        }),
        placement: "bottom",
      },
      {
        id: "new-folder",
        target: tourTarget("products-new-folder"),
        title: t3({
          en: "Organise with folders",
          fr: "Organisez avec des dossiers",
          pt: "Organize com pastas",
        }),
        body: t3({
          en: "New folder adds one in the current location. Every folder tile or row has a menu — right-click it — to rename it, move it with Move into, or delete it. Deleting a folder never deletes what is inside: everything moves up one level.",
          fr: "Nouveau dossier en ajoute un à l'emplacement actuel. Chaque carte ou ligne de dossier a un menu — clic droit — pour le renommer, le déplacer avec Déplacer dans, ou le supprimer. Supprimer un dossier ne supprime jamais son contenu : tout remonte d'un niveau.",
          pt: "Nova pasta acrescenta uma na localização atual. Cada cartão ou linha de pasta tem um menu — clique com o botão direito — para mudar o nome, movê-la com Mover para dentro de, ou eliminá-la. Eliminar uma pasta nunca elimina o seu conteúdo: tudo sobe um nível.",
        }),
        placement: "bottom",
      },
    ],
  };
}

// Deferred until the instance actually holds a product (entry-level `when` in
// index.ts) — held back without being marked seen, so it runs on the first
// Products visit where a card exists, or merges into the intro run when
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
          en: "Click a card to open it. The icon says whether it is a deck or a report, and the caption names the results package it reads from — so you can always tell which numbers you are looking at.",
          fr: "Cliquez sur une carte pour l'ouvrir. L'icône indique s'il s'agit d'une présentation ou d'un rapport, et la légende nomme le paquet de résultats dont elle se sert — vous savez ainsi toujours quels chiffres vous consultez.",
          pt: "Clique num cartão para o abrir. O ícone indica se é uma apresentação ou um relatório, e a legenda nomeia o pacote de resultados de que se serve — assim sabe sempre que números está a ver.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
      },
      {
        id: "product-actions",
        target: tourTarget("products-item"),
        title: t3({
          en: "Manage products",
          fr: "Gérer les produits",
          pt: "Gerir produtos",
        }),
        body: t3({
          en: "Right-click a product for its settings — name, folder, results package and area — or to duplicate or delete it. Use the selection circles to move or delete several at once.",
          fr: "Faites un clic droit sur un produit pour ses paramètres — nom, dossier, paquet de résultats et zone — ou pour le dupliquer ou le supprimer. Utilisez les cercles de sélection pour en déplacer ou en supprimer plusieurs à la fois.",
          pt: "Clique com o botão direito num produto para as suas definições — nome, pasta, pacote de resultados e área — ou para o duplicar ou eliminar. Utilize os círculos de seleção para mover ou eliminar vários ao mesmo tempo.",
        }),
        placement: "bottom",
        waitForTargetTimeoutMs: 2000,
      },
    ],
  };
}

// ------------------------------------------------------------ Explore tab

export function buildExploreIntroTour(): TourDefinition {
  return {
    id: "explore-intro",
    steps: [
      {
        id: "intro",
        target: tourTarget("explore-header"),
        title: t3({ en: "Explore", fr: "Explorer", pt: "Explorar" }),
        body: t3({
          en: "Explore is the place to look at the numbers without building anything. Nothing here is saved — when a chart is worth keeping, add it to a deck or a report.",
          fr: "Explorer est l'endroit où consulter les chiffres sans rien créer. Rien n'y est enregistré — lorsqu'un graphique mérite d'être conservé, ajoutez-le à une présentation ou à un rapport.",
          pt: "Explorar é o sítio para ver os números sem construir nada. Nada aqui é guardado — quando um gráfico merece ser mantido, adicione-o a uma apresentação ou a um relatório.",
        }),
        placement: "bottom",
      },
      {
        id: "package",
        target: tourTarget("explore-package"),
        title: t3({
          en: "Which results package",
          fr: "Quel paquet de résultats",
          pt: "Que pacote de resultados",
        }),
        body: t3({
          en: "Every number comes from one results package. This starts on the package the instance currently points at; switch it to compare an earlier generation.",
          fr: "Chaque chiffre provient d'un paquet de résultats. Ceci démarre sur le paquet actuel de l'instance ; changez-le pour comparer une génération antérieure.",
          pt: "Todos os números vêm de um pacote de resultados. Isto começa no pacote atual da instância; mude-o para comparar uma geração anterior.",
        }),
        placement: "bottom",
      },
      {
        id: "scope",
        target: tourTarget("explore-scope"),
        title: t3({ en: "Scope", fr: "Portée", pt: "Âmbito" }),
        body: t3({
          en: "Look at the whole country, or narrow everything below to a single area. Your choice here lasts for the session and is never written to a product.",
          fr: "Consultez tout le pays, ou restreignez tout ce qui suit à une seule zone. Votre choix ici vaut pour la session et n'est jamais enregistré dans un produit.",
          pt: "Veja todo o país, ou restrinja tudo o que se segue a uma única área. A sua escolha aqui dura a sessão e nunca é escrita num produto.",
        }),
        placement: "right",
      },
      {
        id: "modules",
        target: tourTarget("explore-modules"),
        title: t3({ en: "Modules", fr: "Modules", pt: "Módulos" }),
        body: t3({
          en: "The analyses that ran to build the package. Pick one to narrow the list to its metrics.",
          fr: "Les analyses exécutées pour construire le paquet. Choisissez-en une pour restreindre la liste à ses métriques.",
          pt: "As análises executadas para construir o pacote. Escolha uma para restringir a lista às suas métricas.",
        }),
        placement: "right",
      },
      {
        id: "metrics",
        target: tourTarget("explore-metrics"),
        title: t3({
          en: "Metrics and their charts",
          fr: "Métriques et leurs graphiques",
          pt: "Métricas e os seus gráficos",
        }),
        body: t3({
          en: "One card per metric. Open one to see the ready-made charts the package provides — then Configure to adjust a chart, or Add to deck / report to keep it.",
          fr: "Une carte par métrique. Ouvrez-en une pour voir les graphiques prêts à l'emploi fournis par le paquet — puis Configurer pour ajuster un graphique, ou Ajouter à une présentation / un rapport pour le conserver.",
          pt: "Um cartão por métrica. Abra um para ver os gráficos prontos que o pacote fornece — depois Configurar para ajustar um gráfico, ou Adicionar a apresentação / relatório para o manter.",
        }),
        placement: "top",
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
          en: "Click a block in the preview to edit it here: switch it between text, a figure or an image, and use Layout to split the slide into more blocks.",
          fr: "Cliquez sur un bloc dans l'aperçu pour le modifier ici : basculez-le entre texte, figure ou image, et utilisez Mise en page pour diviser la diapositive en plusieurs blocs.",
          pt: "Clique num bloco na pré-visualização para o editar aqui: alterne entre texto, figura ou imagem, e utilize Layout para dividir o diapositivo em mais blocos.",
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
          en: "A report is a written document: you type the words, and drop in figures wherever they belong.",
          fr: "Un rapport est un document rédigé : vous écrivez le texte et insérez des figures là où elles doivent apparaître.",
          pt: "Um relatório é um documento escrito: escreve o texto e insere figuras onde elas fazem sentido.",
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
          en: "This is the report's text, written in Markdown — # for a heading, ** ** for bold, - for a list. Figures appear as blocks you can click.",
          fr: "Voici le texte du rapport, écrit en Markdown — # pour un titre, ** ** pour du gras, - pour une liste. Les figures apparaissent sous forme de blocs cliquables.",
          pt: "Este é o texto do relatório, escrito em Markdown — # para um título, ** ** para negrito, - para uma lista. As figuras aparecem como blocos que pode clicar.",
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
          en: "Figures and images",
          fr: "Figures et images",
          pt: "Figuras e imagens",
        }),
        body: t3({
          en: "Insert a figure or an image from this panel. Click one already in the report and this panel switches to editing it — caption, swapping it for another, or removing it.",
          fr: "Insérez une figure ou une image depuis ce panneau. Cliquez sur un élément déjà dans le rapport et ce panneau passe à sa modification — légende, remplacement ou suppression.",
          pt: "Insira uma figura ou uma imagem a partir deste painel. Clique num elemento já presente no relatório e este painel passa a editá-lo — legenda, substituição ou remoção.",
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
          en: "Download the report as a Word document or PDF, with the figures rendered in place.",
          fr: "Téléchargez le rapport en document Word ou PDF, avec les figures rendues à leur place.",
          pt: "Descarregue o relatório como documento Word ou PDF, com as figuras apresentadas no devido lugar.",
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
          en: "Back to your products",
          fr: "Retour à vos produits",
          pt: "Voltar aos seus produtos",
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
          en: "A figure in the text",
          fr: "Une figure dans le texte",
          pt: "Uma figura no texto",
        }),
        body: t3({
          en: "Each figure sits in the text as a block. Click it to select it, then use the left panel to edit its caption, swap it, or take it out — it reads from the results package this report is set to.",
          fr: "Chaque figure se place dans le texte comme un bloc. Cliquez dessus pour la sélectionner, puis utilisez le panneau de gauche pour modifier sa légende, la remplacer ou la retirer — elle se sert du paquet de résultats auquel ce rapport est rattaché.",
          pt: "Cada figura fica no texto como um bloco. Clique nela para a selecionar e utilize o painel da esquerda para editar a legenda, substituí-la ou removê-la — serve-se do pacote de resultados a que este relatório está associado.",
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


// -------------------------------------------- Instance-level tabs

// First-visit tours for the instance tabs that are not the two product
// surfaces above (Data / Results / Assets / Users), plus the shell itself.

// The nav renders twice (compact icons below xl, labelled buttons above); a
// selector that matches both resolves to the visible one (roadtrip ≥ 0.10),
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
          en: "This is your instance home. Products holds the slide decks and reports you build, Explore is for looking at the numbers, and the remaining tabs cover instance-wide data, results packages, shared assets and users — whichever your permissions allow.",
          fr: "Voici l'accueil de votre instance. Produits regroupe les présentations et les rapports que vous créez, Explorer sert à consulter les chiffres, et les autres onglets couvrent les données de l'instance, les paquets de résultats, les ressources partagées et les utilisateurs — selon vos permissions.",
          pt: "Esta é a página inicial da sua instância. Produtos reúne as apresentações e os relatórios que cria, Explorar serve para ver os números, e os restantes separadores abrangem os dados da instância, os pacotes de resultados, os recursos partilhados e os utilizadores — consoante as suas permissões.",
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
          en: "Survey rounds with their own facilities, indicators, time points and weights — each uploaded once and fed into the results packages that analyse it.",
          fr: "Les vagues d'enquêtes avec leurs propres établissements, indicateurs, périodes et pondérations — chacune importée une fois puis versée dans les paquets de résultats qui les analysent.",
          pt: "Rondas de inquérito com os seus próprios estabelecimentos, indicadores, períodos e ponderações — cada uma carregada uma vez e integrada nos pacotes de resultados que as analisam.",
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
          en: "Household-survey equity data. Like the other datasources: uploaded once here, then read by the results packages that analyse it.",
          fr: "Les données d'équité issues d'enquêtes auprès des ménages. Comme les autres sources : importées une fois ici, puis lues par les paquets de résultats qui les analysent.",
          pt: "Dados de equidade provenientes de inquéritos aos agregados familiares. Como as outras fontes: carregados uma vez aqui e depois lidos pelos pacotes de resultados que os analisam.",
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
          en: "Running the modules happens once for the whole instance: you generate a package here from the data and modules you choose, and every product then reads its numbers from one of these packages.",
          fr: "L'exécution des modules a lieu une fois pour toute l'instance : vous générez ici un paquet à partir des données et des modules choisis, et chaque produit tire ensuite ses chiffres de l'un de ces paquets.",
          pt: "A execução dos módulos acontece uma vez para toda a instância: gera aqui um pacote a partir dos dados e módulos que escolher, e cada produto passa a ler os seus números de um destes pacotes.",
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
          en: "This opens the wizard that configures a generation: which data and which modules to run. Your configuration is kept, so you can leave it and resume where you stopped.",
          fr: "Ceci ouvre l'assistant de configuration d'une génération : quelles données et quels modules exécuter. Votre configuration est conservée : vous pouvez la quitter et la reprendre où vous en étiez.",
          pt: "Isto abre o assistente que configura uma geração: que dados e que módulos executar. A sua configuração é guardada, pelo que pode sair e retomar onde parou.",
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

// Split from the intro for the same reason as the products pair: a freshly
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
          en: "Which products use it",
          fr: "Quels produits l'utilisent",
          pt: "Que produtos o usam",
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
          en: "Shared files for the whole instance — logos, images, CSVs and documents that any product can use.",
          fr: "Des fichiers partagés pour toute l'instance — logos, images, CSV et documents utilisables par tous les produits.",
          pt: "Ficheiros partilhados para toda a instância — logótipos, imagens, CSV e documentos que qualquer produto pode utilizar.",
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
          en: "Upload once, use anywhere: an uploaded logo can appear on a deck's slides, and an uploaded image can be dropped into any slide or report.",
          fr: "Téléversez une fois, utilisez partout : un logo téléversé peut apparaître sur les diapositives d'une présentation, et une image peut être insérée dans n'importe quelle diapositive ou rapport.",
          pt: "Carregue uma vez, utilize em qualquer lugar: um logótipo carregado pode aparecer nos diapositivos de uma apresentação, e uma imagem pode ser inserida em qualquer diapositivo ou relatório.",
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
