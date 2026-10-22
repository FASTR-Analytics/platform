import { productLevelAtLeast, t3 } from "lib";
import type { IconName } from "panther";
import type { ProductSummary, SlideType } from "lib";
import { instanceState } from "~/state/instance/t1_store";
import { productSummaryLevel } from "~/state/instance/product_access";
import {
  setPendingEditorOpen,
  setPendingSlideOpen,
  setPendingVisualizationOpen,
  setShowAi,
} from "~/state/t4_ui";
import { getSlideDeckDetailFromCacheOrFetch } from "~/state/products/t2_slide_deck_detail";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";

// The instance's tabs, as the tour manager and the catalogue modal name them.
// The shell (components/instance/instance.tsx) imports this union rather than
// redeclaring it.
export type InstanceTab =
  | "products"
  | "explore"
  | "data"
  | "results_packages"
  | "scopes"
  | "assets"
  | "users";

// Sidebar categories, in tab order with the editors after the page they open
// from. Each is one `area` value below. "instance" is every other tab plus
// the shell; on screen it is headed "The platform".
export type TourArea =
  | "products"
  | "decks"
  | "reports"
  | "visualizations"
  | "instance";

export type TourCatalogueEntry = {
  /** Must match the TourDefinition id exactly. */
  id: string;
  area: TourArea;
  label: string;
  description: string;
  /** State-only over T1 and the copilot view controller. Do NOT probe the
   *  DOM here: the tour's page is usually unmounted when this is evaluated. */
  available: () => boolean;
  /** Shown in place of the Play button when `available()` is false; absent
   *  on an entry that is always available. */
  unavailableReason?: () => string;
  /** Tab switch, plus the editor/slide open requests for the deeper tours.
   *  The tab setter comes from the shell, which owns the tab signal. Resolves
   *  with the product the tour's page lives in (none for a tab page), or null
   *  when there is nothing to open, in which case no replay is armed. */
  navigate: (
    openTab: (tab: InstanceTab) => void,
  ) => Promise<TourReplayTarget | null>;
};

export type TourReplayTarget = { productId?: string };

const perms = () => instanceState.currentUserPermissions;
const admin = () => instanceState.currentUserIsGlobalAdmin;
const decks = () =>
  instanceState.products.filter((p) => p.type === "slide_deck");
// The deck settings and slide tours walk the Deck menu and the slide toolbar,
// which render only for a user who can edit the deck.
const editableDecks = () =>
  decks().filter((d) => productLevelAtLeast(productSummaryLevel(d), "edit"));
const reports = () => instanceState.products.filter((p) => p.type === "report");
const hasPackage = () => instanceState.readyPackages.length > 0;
const hasProducts = () => instanceState.products.length > 0;
const firstDeckHasSlides = () => {
  const first = decks()[0];
  return first?.type === "slide_deck" && first.firstSlideId !== null;
};
const firstReportHasEmbeds = () => {
  const first = reports()[0];
  return first?.type === "report" && first.hasEmbeds;
};

const reasonNoPageAccess = () =>
  t3({
    en: "You don't have permission to view this page",
    fr: "Vous n'avez pas la permission de voir cette page",
    pt: "Não tem permissão para ver esta página",
  });
const reasonNeedApproval = () =>
  t3({
    en: "You need to be approved before you can create products",
    fr: "Vous devez être approuvé avant de pouvoir créer des produits",
    pt: "Tem de ser aprovado antes de poder criar produtos",
  });
const reasonNeedPackage = () =>
  t3({
    en: "No results package has been generated yet",
    fr: "Aucun paquet de résultats n'a encore été généré",
    pt: "Ainda não foi gerado nenhum pacote de resultados",
  });
const reasonNeedProduct = () =>
  t3({
    en: "Create a slide deck or a report first",
    fr: "Créez d'abord une présentation ou un rapport",
    pt: "Crie primeiro uma apresentação ou um relatório",
  });
const reasonNeedDeck = () =>
  t3({
    en: "Create a slide deck first",
    fr: "Créez d'abord une présentation",
    pt: "Crie primeiro uma apresentação",
  });
const reasonNeedSlides = () =>
  t3({
    en: "Add slides to your first slide deck first",
    fr: "Ajoutez d'abord des diapositives à votre première présentation",
    pt: "Adicione primeiro diapositivos à sua primeira apresentação",
  });
const reasonNeedSlideOfType = (type: SlideType) => {
  switch (type) {
    case "cover":
      return t3({
        en: "Add a cover slide to a slide deck first",
        fr: "Ajoutez d'abord une diapositive de couverture à une présentation",
        pt: "Adicione primeiro um diapositivo de capa a uma apresentação",
      });
    case "section":
      return t3({
        en: "Add a section slide to a slide deck first",
        fr: "Ajoutez d'abord une diapositive de section à une présentation",
        pt: "Adicione primeiro um diapositivo de secção a uma apresentação",
      });
    default:
      return t3({
        en: "Add a content slide to a slide deck first",
        fr: "Ajoutez d'abord une diapositive de contenu à une présentation",
        pt: "Adicione primeiro um diapositivo de conteúdo a uma apresentação",
      });
  }
};
const reasonNeedReport = () =>
  t3({
    en: "Create a report first",
    fr: "Créez d'abord un rapport",
    pt: "Crie primeiro um relatório",
  });
const reasonNeedReportFigure = () =>
  t3({
    en: "Add a visualization to your first report first",
    fr: "Ajoutez d'abord une visualisation à votre premier rapport",
    pt: "Adicione primeiro uma visualização ao seu primeiro relatório",
  });

export const SLIDE_TOUR_TYPES: SlideType[] = ["cover", "section", "content"];

// Slide types live only in the slide documents, so anything slide-type-aware
// has to search: decks in list order, slides in deck order, cache-first
// (repeat searches are cheap, and the catalogue modal runs three of them).
export async function findDeckWithSlideOfType(
  type: SlideType,
): Promise<string | null> {
  for (const deck of editableDecks()) {
    const detail = await getSlideDeckDetailFromCacheOrFetch(deck.id);
    if (!detail.success) continue;
    for (const slideId of detail.data.slideIds) {
      const res = await getSlideFromCacheOrFetch(deck.id, slideId);
      if (!res.success) continue;
      if (res.data.slide.type === type) return deck.id;
    }
  }
  return null;
}

// The deeper tours run inside a product editor, which the Products page opens
// from `pendingEditorOpen` once T1 has hydrated. The catalogue modal arms
// `pendingTourReplay` once navigate() resolves, and setupTours() starts the
// tour when the editor's page becomes active.
const openTabOnly = (
  tab: InstanceTab,
): TourCatalogueEntry["navigate"] =>
(openTab) => {
  openTab(tab);
  return Promise.resolve({});
};
const openProduct = (
  openTab: (tab: InstanceTab) => void,
  product: ProductSummary | undefined,
): Promise<TourReplayTarget | null> => {
  openTab("products");
  if (!product) return Promise.resolve(null);
  setPendingEditorOpen({ productId: product.id });
  return Promise.resolve({ productId: product.id });
};
const openFirstDeck = (openTab: (tab: InstanceTab) => void) =>
  openProduct(openTab, decks()[0]);
const openFirstReport = (openTab: (tab: InstanceTab) => void) =>
  openProduct(openTab, reports()[0]);
// The visualization editor tour: the report editor opens its first
// visualization once it has loaded (`pendingVisualizationOpen`).
const openFirstReportVisualization = (
  openTab: (tab: InstanceTab) => void,
): Promise<TourReplayTarget | null> => {
  if (reports()[0] !== undefined) setPendingVisualizationOpen(true);
  return openFirstReport(openTab);
};
const openFirstDeckSlide = async (
  openTab: (tab: InstanceTab) => void,
  type: SlideType,
): Promise<TourReplayTarget | null> => {
  openTab("products");
  const deckId = await findDeckWithSlideOfType(type);
  if (deckId === null) return null;
  setPendingEditorOpen({ productId: deckId });
  setPendingSlideOpen(type);
  return { productId: deckId };
};

const slideTourAvailable = (
  type: SlideType,
  slideTypesPresent: Partial<Record<SlideType, boolean>>,
) => editableDecks().length > 0 && slideTypesPresent[type] === true;

export function getTourAreas(): {
  area: TourArea;
  heading: string;
  iconName: IconName;
}[] {
  return [
    {
      area: "products",
      heading: t3({ en: "Products", fr: "Produits", pt: "Produtos" }),
      iconName: "presentation",
    },
    {
      area: "decks",
      heading: t3({
        en: "Slide decks",
        fr: "Présentations",
        pt: "Apresentações",
      }),
      iconName: "slideshow",
    },
    {
      area: "reports",
      heading: t3({ en: "Reports", fr: "Rapports", pt: "Relatórios" }),
      iconName: "report",
    },
    {
      area: "visualizations",
      heading: t3({
        en: "Visualizations",
        fr: "Visualisations",
        pt: "Visualizações",
      }),
      iconName: "chart",
    },
    {
      area: "instance",
      heading: t3({
        en: "The platform",
        fr: "La plateforme",
        pt: "A plataforma",
      }),
      iconName: "layoutGrid",
    },
  ];
}

// Built per call (not a module-scope const) so the t3 literals resolve in the
// user's current language: the app language is set at runtime, after import.
// `slideTypesPresent` is the async search the modal runs before it renders the
// three slide rows; the rest is state-only over T1.
export function getTourCatalogue(
  slideTypesPresent: Partial<Record<SlideType, boolean>>,
): TourCatalogueEntry[] {
  return [
    // ── Products ─────────────────────────────────────────────────────────
    {
      id: "products-intro",
      area: "products",
      label: t3({
        en: "Products overview",
        fr: "Aperçu des produits",
        pt: "Visão geral dos produtos",
      }),
      description: t3({
        en: "The Products page: searching, folders, and what the columns show.",
        fr:
          "La page Produits : recherche, dossiers et ce que montrent les colonnes.",
        pt: "A página Produtos: pesquisa, pastas e o que as colunas mostram.",
      }),
      available: () => true,
      navigate: openTabOnly("products"),
    },
    {
      id: "products-create",
      area: "products",
      label: t3({
        en: "Create decks, reports and folders",
        fr: "Créer présentations, rapports et dossiers",
        pt: "Criar apresentações, relatórios e pastas",
      }),
      description: t3({
        en:
          "Starting a new deck or report with its results package and scope, and keeping products in folders.",
        fr:
          "Démarrer une présentation ou un rapport avec son paquet de résultats et sa portée, et ranger les produits dans des dossiers.",
        pt:
          "Começar uma apresentação ou um relatório com o seu pacote de resultados e âmbito, e guardar os produtos em pastas.",
      }),
      available: () => instanceState.currentUserApproved,
      unavailableReason: reasonNeedApproval,
      navigate: openTabOnly("products"),
    },
    {
      id: "products-cards",
      area: "products",
      label: t3({
        en: "Open and manage products",
        fr: "Ouvrir et gérer les produits",
        pt: "Abrir e gerir produtos",
      }),
      description: t3({
        en:
          "Opening a product, and moving, renaming, duplicating or deleting it.",
        fr:
          "Ouvrir un produit, et le déplacer, le renommer, le dupliquer ou le supprimer.",
        pt:
          "Abrir um produto, e movê-lo, mudar-lhe o nome, duplicá-lo ou eliminá-lo.",
      }),
      available: () => hasProducts(),
      unavailableReason: reasonNeedProduct,
      navigate: openTabOnly("products"),
    },
    // ── Slide decks ──────────────────────────────────────────────────────
    {
      id: "deck-editor-intro",
      area: "decks",
      label: t3({
        en: "Inside a slide deck",
        fr: "Dans une présentation",
        pt: "Dentro de uma apresentação",
      }),
      description: t3({
        en:
          "The menus and buttons of a slide deck, and where its numbers come from. Opens your first slide deck.",
        fr:
          "Les menus et les boutons d'une présentation, et d'où viennent ses chiffres. Ouvre votre première présentation.",
        pt:
          "Os menus e os botões de uma apresentação, e de onde vêm os seus números. Abre a sua primeira apresentação.",
      }),
      available: () => decks().length > 0,
      unavailableReason: reasonNeedDeck,
      navigate: openFirstDeck,
    },
    {
      id: "deck-editor-slides",
      area: "decks",
      label: t3({
        en: "Working with slides",
        fr: "Travailler avec les diapositives",
        pt: "Trabalhar com diapositivos",
      }),
      description: t3({
        en:
          "The list of slides: opening, reordering, selecting, duplicating and deleting. Opens your first slide deck.",
        fr:
          "La liste des diapositives : ouvrir, réordonner, sélectionner, dupliquer et supprimer. Ouvre votre première présentation.",
        pt:
          "A lista de diapositivos: abrir, reordenar, selecionar, duplicar e eliminar. Abre a sua primeira apresentação.",
      }),
      available: () => decks().length > 0 && firstDeckHasSlides(),
      unavailableReason: () =>
        decks().length === 0 ? reasonNeedDeck() : reasonNeedSlides(),
      navigate: openFirstDeck,
    },
    {
      id: "deck-editor-present",
      area: "decks",
      label: t3({
        en: "Present a slide deck",
        fr: "Présenter une présentation",
        pt: "Apresentar uma apresentação",
      }),
      description: t3({
        en:
          "Showing the deck full screen and moving between slides. Opens your first slide deck.",
        fr:
          "Afficher la présentation en plein écran et passer d'une diapositive à l'autre. Ouvre votre première présentation.",
        pt:
          "Mostrar a apresentação em ecrã inteiro e passar de um diapositivo para outro. Abre a sua primeira apresentação.",
      }),
      available: () => decks().length > 0 && firstDeckHasSlides(),
      unavailableReason: () =>
        decks().length === 0 ? reasonNeedDeck() : reasonNeedSlides(),
      navigate: openFirstDeck,
    },
    {
      id: "deck-editor-history",
      area: "decks",
      label: t3({
        en: "Deck version history",
        fr: "Historique des versions de présentation",
        pt: "Histórico de versões da apresentação",
      }),
      description: t3({
        en:
          "Browsing and restoring earlier versions. Opens your first slide deck.",
        fr:
          "Parcourir et restaurer des versions antérieures. Ouvre votre première présentation.",
        pt:
          "Consultar e restaurar versões anteriores. Abre a sua primeira apresentação.",
      }),
      available: () => decks().length > 0,
      unavailableReason: reasonNeedDeck,
      navigate: openFirstDeck,
    },
    {
      id: "deck-editor-settings",
      area: "decks",
      label: t3({
        en: "Deck settings",
        fr: "Paramètres de la présentation",
        pt: "Definições da apresentação",
      }),
      description: t3({
        en:
          "The Deck menu: theme, logos, footer and page numbers. Opens the first slide deck you can edit.",
        fr:
          "Le menu Présentation : thème, logos, pied de page et numéros de page. Ouvre la première présentation que vous pouvez modifier.",
        pt:
          "O menu Apresentação: tema, logótipos, rodapé e números de página. Abre a primeira apresentação que pode editar.",
      }),
      available: () => editableDecks().length > 0,
      unavailableReason: reasonNeedDeck,
      navigate: (openTab) => openProduct(openTab, editableDecks()[0]),
    },
    {
      id: "slide-cover-intro",
      area: "decks",
      label: t3({
        en: "Cover slides",
        fr: "Diapositives de couverture",
        pt: "Diapositivos de capa",
      }),
      description: t3({
        en:
          "Editing a cover slide. Opens the first cover slide found in your slide decks.",
        fr:
          "Modifier une diapositive de couverture. Ouvre la première diapositive de couverture trouvée dans vos présentations.",
        pt:
          "Editar um diapositivo de capa. Abre o primeiro diapositivo de capa encontrado nas suas apresentações.",
      }),
      available: () => slideTourAvailable("cover", slideTypesPresent),
      unavailableReason: () =>
        editableDecks().length === 0
          ? reasonNeedDeck()
          : reasonNeedSlideOfType("cover"),
      navigate: (openTab) => openFirstDeckSlide(openTab, "cover"),
    },
    {
      id: "slide-section-intro",
      area: "decks",
      label: t3({
        en: "Section slides",
        fr: "Diapositives de section",
        pt: "Diapositivos de secção",
      }),
      description: t3({
        en:
          "Editing a section slide. Opens the first section slide found in your slide decks.",
        fr:
          "Modifier une diapositive de section. Ouvre la première diapositive de section trouvée dans vos présentations.",
        pt:
          "Editar um diapositivo de secção. Abre o primeiro diapositivo de secção encontrado nas suas apresentações.",
      }),
      available: () => slideTourAvailable("section", slideTypesPresent),
      unavailableReason: () =>
        editableDecks().length === 0
          ? reasonNeedDeck()
          : reasonNeedSlideOfType("section"),
      navigate: (openTab) => openFirstDeckSlide(openTab, "section"),
    },
    {
      id: "slide-content-intro",
      area: "decks",
      label: t3({
        en: "Content slides",
        fr: "Diapositives de contenu",
        pt: "Diapositivos de conteúdo",
      }),
      description: t3({
        en:
          "Editing a content slide. Opens the first content slide found in your slide decks.",
        fr:
          "Modifier une diapositive de contenu. Ouvre la première diapositive de contenu trouvée dans vos présentations.",
        pt:
          "Editar um diapositivo de conteúdo. Abre o primeiro diapositivo de conteúdo encontrado nas suas apresentações.",
      }),
      available: () => slideTourAvailable("content", slideTypesPresent),
      unavailableReason: () =>
        editableDecks().length === 0
          ? reasonNeedDeck()
          : reasonNeedSlideOfType("content"),
      navigate: (openTab) => openFirstDeckSlide(openTab, "content"),
    },
    // ── Reports ──────────────────────────────────────────────────────────
    {
      id: "report-editor-intro",
      area: "reports",
      label: t3({
        en: "Inside a report",
        fr: "Dans un rapport",
        pt: "Dentro de um relatório",
      }),
      description: t3({
        en:
          "Writing a report: the menus, formatting, the list of headings, and where its numbers come from. Opens your first report.",
        fr:
          "Rédiger un rapport : les menus, la mise en forme, la liste des titres, et d'où viennent ses chiffres. Ouvre votre premier rapport.",
        pt:
          "Escrever um relatório: os menus, a formatação, a lista de títulos, e de onde vêm os seus números. Abre o seu primeiro relatório.",
      }),
      available: () => reports().length > 0,
      unavailableReason: reasonNeedReport,
      navigate: openFirstReport,
    },
    {
      id: "report-editor-figures",
      area: "reports",
      label: t3({
        en: "Visualizations in reports",
        fr: "Visualisations dans les rapports",
        pt: "Visualizações nos relatórios",
      }),
      description: t3({
        en:
          "Selecting a visualization in a report to edit, replace, resize or delete it. Opens your first report.",
        fr:
          "Sélectionner une visualisation dans un rapport pour la modifier, la remplacer, la redimensionner ou la supprimer. Ouvre votre premier rapport.",
        pt:
          "Selecionar uma visualização num relatório para a editar, substituir, redimensionar ou eliminar. Abre o seu primeiro relatório.",
      }),
      available: () => reports().length > 0 && firstReportHasEmbeds(),
      unavailableReason: () =>
        reports().length === 0 ? reasonNeedReport() : reasonNeedReportFigure(),
      navigate: openFirstReport,
    },
    {
      id: "report-editor-history",
      area: "reports",
      label: t3({
        en: "Report version history",
        fr: "Historique des versions de rapport",
        pt: "Histórico de versões do relatório",
      }),
      description: t3({
        en: "Browsing and restoring earlier versions. Opens your first report.",
        fr:
          "Parcourir et restaurer des versions antérieures. Ouvre votre premier rapport.",
        pt:
          "Consultar e restaurar versões anteriores. Abre o seu primeiro relatório.",
      }),
      available: () => reports().length > 0,
      unavailableReason: reasonNeedReport,
      navigate: openFirstReport,
    },
    // ── Visualizations ───────────────────────────────────────────────────
    {
      id: "viz-editor-intro",
      area: "visualizations",
      label: t3({
        en: "Editing a visualization",
        fr: "Modifier une visualisation",
        pt: "Editar uma visualização",
      }),
      description: t3({
        en:
          "Choosing what a visualization shows, how it looks and its text. Opens the first visualization in your first report.",
        fr:
          "Choisir ce qu'une visualisation montre, son apparence et son texte. Ouvre la première visualisation de votre premier rapport.",
        pt:
          "Escolher o que uma visualização mostra, o seu aspeto e o seu texto. Abre a primeira visualização do seu primeiro relatório.",
      }),
      available: () => reports().length > 0 && firstReportHasEmbeds(),
      unavailableReason: () =>
        reports().length === 0 ? reasonNeedReport() : reasonNeedReportFigure(),
      navigate: openFirstReportVisualization,
    },
    // ── The platform ─────────────────────────────────────────────────────
    {
      id: "instance-welcome",
      area: "instance",
      label: t3({
        en: "Welcome to FASTR",
        fr: "Bienvenue dans FASTR",
        pt: "Bem-vindo ao FASTR",
      }),
      description: t3({
        en:
          "Finding your way around: the tabs, the language, what's new and where to get help.",
        fr:
          "Se repérer : les onglets, la langue, les nouveautés et où trouver de l'aide.",
        pt:
          "Orientar-se: os separadores, o idioma, as novidades e onde obter ajuda.",
      }),
      available: () => true,
      navigate: openTabOnly("products"),
    },
    {
      id: "ai-intro",
      area: "instance",
      label: t3({
        en: "The AI assistant",
        fr: "L'assistant IA",
        pt: "O assistente de IA",
      }),
      description: t3({
        en:
          "Opening the AI assistant, asking it questions, what it can do for you and where its prompt library is.",
        fr:
          "Ouvrir l'assistant IA, lui poser des questions, ce qu'il peut faire pour vous et où trouver sa bibliothèque de prompts.",
        pt:
          "Abrir o assistente de IA, fazer-lhe perguntas, o que pode fazer por si e onde está a biblioteca de prompts.",
      }),
      available: () => instanceState.currentUserApproved,
      // The panel closes first, so the run starts on the AI button.
      navigate: (openTab) => {
        setShowAi(false);
        openTab("products");
        return Promise.resolve({});
      },
    },
    {
      id: "explore-intro",
      area: "instance",
      label: t3({ en: "Explore", fr: "Explorer", pt: "Explorar" }),
      description: t3({
        en:
          "Looking through the results directly: choosing a package, a scope and what to see.",
        fr:
          "Parcourir directement les résultats : choisir un paquet, une portée et ce qu'il faut afficher.",
        pt:
          "Percorrer diretamente os resultados: escolher um pacote, um âmbito e o que ver.",
      }),
      // Mirrors the instance shell's own gate for this tab, plus what the
      // page needs before it shows anything.
      available: () => instanceState.currentUserScopeAccess.all && hasPackage(),
      unavailableReason: () =>
        instanceState.currentUserScopeAccess.all
          ? reasonNeedPackage()
          : reasonNoPageAccess(),
      navigate: openTabOnly("explore"),
    },
    {
      id: "instance-results-packages-intro",
      area: "instance",
      label: t3({
        en: "Results packages",
        fr: "Paquets de résultats",
        pt: "Pacotes de resultados",
      }),
      description: t3({
        en: "What a results package is, generating one, and module defaults.",
        fr:
          "Ce qu'est un paquet de résultats, en générer un, et les paramètres par défaut des modules.",
        pt:
          "O que é um pacote de resultados, gerar um, e as predefinições dos módulos.",
      }),
      // Mirrors the instance shell's own gate for this tab.
      available: () => admin() || perms().can_configure_data,
      unavailableReason: reasonNoPageAccess,
      navigate: openTabOnly("results_packages"),
    },
    {
      id: "instance-results-packages-catalogue",
      area: "instance",
      label: t3({
        en: "Inside a results package",
        fr: "Dans un paquet de résultats",
        pt: "Dentro de um pacote de resultados",
      }),
      description: t3({
        en:
          "Opening a package from the list, what its page shows, and pinning or deleting it.",
        fr:
          "Ouvrir un paquet depuis la liste, ce que montre sa page, et l'épingler ou le supprimer.",
        pt:
          "Abrir um pacote a partir da lista, o que a sua página mostra, e fixá-lo ou eliminá-lo.",
      }),
      available: () => (admin() || perms().can_configure_data) && hasPackage(),
      unavailableReason: () =>
        admin() || perms().can_configure_data
          ? reasonNeedPackage()
          : reasonNoPageAccess(),
      navigate: openTabOnly("results_packages"),
    },
    {
      id: "instance-data-intro",
      area: "instance",
      label: t3({
        en: "Data",
        fr: "Données",
        pt: "Dados",
      }),
      description: t3({
        en:
          "Where data is uploaded: routine facility data, facility assessments and equity data.",
        fr:
          "Où les données sont importées : données de routine, enquêtes auprès des établissements et données d'équité.",
        pt:
          "Onde os dados são carregados: dados de rotina, avaliações de unidades de saúde e dados de equidade.",
      }),
      available: () =>
        admin() || perms().can_view_data || perms().can_configure_data,
      unavailableReason: reasonNoPageAccess,
      navigate: openTabOnly("data"),
    },
    {
      id: "instance-assets-intro",
      area: "instance",
      label: t3({
        en: "Assets",
        fr: "Ressources",
        pt: "Recursos",
      }),
      description: t3({
        en:
          "Shared logos, images and files that any slide deck or report can use.",
        fr:
          "Logos, images et fichiers partagés, utilisables dans n'importe quelle présentation ou n'importe quel rapport.",
        pt:
          "Logótipos, imagens e ficheiros partilhados que qualquer apresentação ou relatório pode usar.",
      }),
      available: () => true,
      unavailableReason: reasonNoPageAccess,
      navigate: openTabOnly("assets"),
    },
    {
      id: "instance-users-intro",
      area: "instance",
      label: t3({
        en: "Users",
        fr: "Utilisateurs",
        pt: "Utilizadores",
      }),
      description: t3({
        en: "Managing who has access and what they can do.",
        fr: "Gérer qui a accès et ce que chacun peut faire.",
        pt: "Gerir quem tem acesso e o que cada pessoa pode fazer.",
      }),
      available: () =>
        admin() || perms().can_configure_users || perms().can_view_users,
      unavailableReason: reasonNoPageAccess,
      navigate: openTabOnly("users"),
    },
  ];
}
