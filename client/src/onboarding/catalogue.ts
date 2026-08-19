import { t3 } from "lib";
import type { IconName } from "panther";
import type { ProductSummary, SlideType } from "lib";
import { canEditProducts, instanceState } from "~/state/instance/t1_store";
import { setPendingEditorOpen, setPendingSlideOpen } from "~/state/t4_ui";
import { getSlideDeckDetailFromCacheOrFetch } from "~/state/products/t2_slide_deck_detail";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";

// The instance's tabs, as the tour manager and the catalogue modal name them.
// Mirrors the shell's own tab union (components/instance/index.tsx).
export type InstanceTab =
  | "products"
  | "explore"
  | "data"
  | "results_packages"
  | "assets"
  | "users";

// Sidebar categories, in tab order with the editors after the page they open
// from. Each is one `area` value below.
export type TourArea =
  | "products"
  | "explore"
  | "decks"
  | "reports"
  | "instance";

export type TourCatalogueEntry = {
  /** Must match the TourDefinition id exactly. */
  id: string;
  area: TourArea;
  label: string;
  description: string;
  /** State-only over T1. Do NOT probe the DOM here — the tour's page is
   *  usually unmounted when this is evaluated. */
  available: () => boolean;
  /** Shown in place of the Play button when `available()` is false. */
  unavailableReason: () => string;
  /** Tab switch, plus the editor/slide open requests for the deeper tours.
   *  The tab setter comes from the shell, which owns the tab signal. */
  navigate: (openTab: (tab: InstanceTab) => void) => void;
};

const perms = () => instanceState.currentUserPermissions;
const admin = () => instanceState.currentUserIsGlobalAdmin;
const decks = () =>
  instanceState.products.filter((p) => p.type === "slide_deck");
const reports = () => instanceState.products.filter((p) => p.type === "report");
const hasPackage = () => instanceState.readyPackages.length > 0;
const hasProducts = () => instanceState.products.length > 0;
const firstDeckHasSlides = () => {
  const first = decks()[0];
  return first !== undefined && first.firstSlideId !== null;
};
const firstReportHasEmbeds = () => {
  const first = reports()[0];
  if (first === undefined || first.type !== "report") return false;
  return first.preview.figureCount + first.preview.imageCount > 0;
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
    en: "Add a figure to your first report first",
    fr: "Ajoutez d'abord une figure à votre premier rapport",
    pt: "Adicione primeiro uma figura ao seu primeiro relatório",
  });

export const SLIDE_TOUR_TYPES: SlideType[] = ["cover", "section", "content"];

// Slide types live only in the slide documents, so anything slide-type-aware
// has to search: decks in list order, slides in deck order, cache-first
// (repeat searches are cheap, and the catalogue modal runs three of them).
export async function findDeckWithSlideOfType(
  type: SlideType,
): Promise<string | null> {
  for (const deck of decks()) {
    const detail = await getSlideDeckDetailFromCacheOrFetch(deck.id);
    if (!detail.success) continue;
    for (const slideId of detail.data.slideIds) {
      const res = await getSlideFromCacheOrFetch(slideId);
      if (!res.success) continue;
      if (res.data.slide.type === type) return deck.id;
    }
  }
  return null;
}

// The deeper tours run inside a product editor, which the Products page opens
// from `pendingEditorOpen` once T1 has hydrated. The catalogue modal sets
// `pendingTourReplay` alongside, and setupTours() starts the tour when the
// editor's page becomes active.
const openProduct = (
  openTab: (tab: InstanceTab) => void,
  product: ProductSummary | undefined,
) => {
  openTab("products");
  if (product) setPendingEditorOpen({ productId: product.id });
};
const openFirstDeck = (openTab: (tab: InstanceTab) => void) =>
  openProduct(openTab, decks()[0]);
const openFirstReport = (openTab: (tab: InstanceTab) => void) =>
  openProduct(openTab, reports()[0]);
const openFirstDeckSlide = (
  openTab: (tab: InstanceTab) => void,
  type: SlideType,
) => {
  openTab("products");
  void findDeckWithSlideOfType(type).then((deckId) => {
    if (deckId === null) return;
    setPendingEditorOpen({ productId: deckId });
    setPendingSlideOpen(type);
  });
};

const slideTourAvailable = (
  type: SlideType,
  slideTypesPresent: Partial<Record<SlideType, boolean>>,
) => decks().length > 0 && slideTypesPresent[type] === true;

export function getTourAreas(): {
  area: TourArea;
  heading: string;
  iconName: IconName;
}[] {
  return [
    {
      area: "products",
      heading: t3({ en: "Products", fr: "Produits", pt: "Produtos" }),
      iconName: "folder",
    },
    {
      area: "explore",
      heading: t3({ en: "Explore", fr: "Explorer", pt: "Explorar" }),
      iconName: "chart",
    },
    {
      area: "decks",
      heading: t3({
        en: "Slide decks",
        fr: "Présentations",
        pt: "Apresentações",
      }),
      iconName: "presentation",
    },
    {
      area: "reports",
      heading: t3({ en: "Reports", fr: "Rapports", pt: "Relatórios" }),
      iconName: "report",
    },
    {
      area: "instance",
      heading: t3({ en: "Instance", fr: "Instance", pt: "Instância" }),
      iconName: "layoutGrid",
    },
  ];
}

// Built per call (not a module-scope const) so the t3 literals resolve in the
// user's current language — the app language is set at runtime, after import.
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
        en: "The Products page: searching, filtering by type, sorting and folders.",
        fr: "La page Produits : recherche, filtre par type, tri et dossiers.",
        pt: "A página Produtos: pesquisa, filtro por tipo, ordenação e pastas.",
      }),
      available: () => true,
      unavailableReason: reasonNoPageAccess,
      navigate: (openTab) => openTab("products"),
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
        en: "Starting a new product, and organising products into folders.",
        fr: "Démarrer un nouveau produit et organiser les produits en dossiers.",
        pt: "Começar um novo produto e organizar os produtos em pastas.",
      }),
      available: () => canEditProducts(),
      unavailableReason: reasonNeedApproval,
      navigate: (openTab) => openTab("products"),
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
        en: "What a product card shows, and the actions behind a right-click.",
        fr: "Ce que montre une carte de produit et les actions accessibles par clic droit.",
        pt: "O que mostra um cartão de produto e as ações acessíveis com o botão direito.",
      }),
      available: hasProducts,
      unavailableReason: reasonNeedProduct,
      navigate: (openTab) => openTab("products"),
    },
    // ── Explore ──────────────────────────────────────────────────────────
    {
      id: "explore-intro",
      area: "explore",
      label: t3({
        en: "Explore the results",
        fr: "Explorer les résultats",
        pt: "Explorar os resultados",
      }),
      description: t3({
        en: "Browsing a package's metrics and charts without saving anything.",
        fr: "Parcourir les métriques et les graphiques d'un paquet sans rien enregistrer.",
        pt: "Percorrer as métricas e os gráficos de um pacote sem guardar nada.",
      }),
      available: hasPackage,
      unavailableReason: reasonNeedPackage,
      navigate: (openTab) => openTab("explore"),
    },
    // ── Slide decks ──────────────────────────────────────────────────────
    {
      id: "deck-editor-intro",
      area: "decks",
      label: t3({
        en: "Slide deck editor",
        fr: "Éditeur de présentation",
        pt: "Editor de apresentações",
      }),
      description: t3({
        en: "A walkthrough of the deck editor. Opens your first slide deck.",
        fr: "Visite de l'éditeur de présentation. Ouvre votre première présentation.",
        pt: "Visita ao editor de apresentações. Abre a sua primeira apresentação.",
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
        en: "Slide cards inside a deck. Opens your first slide deck.",
        fr: "Les cartes de diapositives dans une présentation. Ouvre votre première présentation.",
        pt: "Os cartões de diapositivos numa apresentação. Abre a sua primeira apresentação.",
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
        en: "Starting a presentation. Opens your first slide deck.",
        fr: "Lancer une présentation. Ouvre votre première présentation.",
        pt: "Iniciar uma apresentação. Abre a sua primeira apresentação.",
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
        en: "Browsing and restoring earlier versions. Opens your first slide deck.",
        fr: "Parcourir et restaurer des versions antérieures. Ouvre votre première présentation.",
        pt: "Consultar e restaurar versões anteriores. Abre a sua primeira apresentação.",
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
        en: "The deck settings overlay. Opens your first slide deck.",
        fr: "Le panneau des paramètres de la présentation. Ouvre votre première présentation.",
        pt: "O painel de definições da apresentação. Abre a sua primeira apresentação.",
      }),
      available: () => decks().length > 0,
      unavailableReason: reasonNeedDeck,
      navigate: openFirstDeck,
    },
    {
      id: "slide-cover-intro",
      area: "decks",
      label: t3({
        en: "Cover slide editor",
        fr: "Éditeur de diapositive de couverture",
        pt: "Editor de diapositivo de capa",
      }),
      description: t3({
        en: "Editing a cover slide. Opens the first cover slide found in your slide decks.",
        fr: "Modifier une diapositive de couverture. Ouvre la première diapositive de couverture trouvée dans vos présentations.",
        pt: "Editar um diapositivo de capa. Abre o primeiro diapositivo de capa encontrado nas suas apresentações.",
      }),
      available: () => slideTourAvailable("cover", slideTypesPresent),
      unavailableReason: () =>
        decks().length === 0 ? reasonNeedDeck() : reasonNeedSlideOfType("cover"),
      navigate: (openTab) => openFirstDeckSlide(openTab, "cover"),
    },
    {
      id: "slide-section-intro",
      area: "decks",
      label: t3({
        en: "Section slide editor",
        fr: "Éditeur de diapositive de section",
        pt: "Editor de diapositivo de secção",
      }),
      description: t3({
        en: "Editing a section slide. Opens the first section slide found in your slide decks.",
        fr: "Modifier une diapositive de section. Ouvre la première diapositive de section trouvée dans vos présentations.",
        pt: "Editar um diapositivo de secção. Abre o primeiro diapositivo de secção encontrado nas suas apresentações.",
      }),
      available: () => slideTourAvailable("section", slideTypesPresent),
      unavailableReason: () =>
        decks().length === 0
          ? reasonNeedDeck()
          : reasonNeedSlideOfType("section"),
      navigate: (openTab) => openFirstDeckSlide(openTab, "section"),
    },
    {
      id: "slide-content-intro",
      area: "decks",
      label: t3({
        en: "Content slide editor",
        fr: "Éditeur de diapositive de contenu",
        pt: "Editor de diapositivo de conteúdo",
      }),
      description: t3({
        en: "Editing a content slide. Opens the first content slide found in your slide decks.",
        fr: "Modifier une diapositive de contenu. Ouvre la première diapositive de contenu trouvée dans vos présentations.",
        pt: "Editar um diapositivo de conteúdo. Abre o primeiro diapositivo de conteúdo encontrado nas suas apresentações.",
      }),
      available: () => slideTourAvailable("content", slideTypesPresent),
      unavailableReason: () =>
        decks().length === 0
          ? reasonNeedDeck()
          : reasonNeedSlideOfType("content"),
      navigate: (openTab) => openFirstDeckSlide(openTab, "content"),
    },
    // ── Reports ──────────────────────────────────────────────────────────
    {
      id: "report-editor-intro",
      area: "reports",
      label: t3({
        en: "Report editor",
        fr: "Éditeur de rapport",
        pt: "Editor de relatórios",
      }),
      description: t3({
        en: "A walkthrough of the report editor. Opens your first report.",
        fr: "Visite de l'éditeur de rapport. Ouvre votre premier rapport.",
        pt: "Visita ao editor de relatórios. Abre o seu primeiro relatório.",
      }),
      available: () => reports().length > 0,
      unavailableReason: reasonNeedReport,
      navigate: openFirstReport,
    },
    {
      id: "report-editor-figures",
      area: "reports",
      label: t3({
        en: "Figures in reports",
        fr: "Figures dans les rapports",
        pt: "Figuras nos relatórios",
      }),
      description: t3({
        en: "Working with embedded figures. Opens your first report.",
        fr: "Travailler avec des figures intégrées. Ouvre votre premier rapport.",
        pt: "Trabalhar com figuras incorporadas. Abre o seu primeiro relatório.",
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
        fr: "Parcourir et restaurer des versions antérieures. Ouvre votre premier rapport.",
        pt: "Consultar e restaurar versões anteriores. Abre o seu primeiro relatório.",
      }),
      available: () => reports().length > 0,
      unavailableReason: reasonNeedReport,
      navigate: openFirstReport,
    },
    // ── Instance ─────────────────────────────────────────────────────────
    {
      id: "instance-welcome",
      area: "instance",
      label: t3({
        en: "Welcome to FASTR",
        fr: "Bienvenue dans FASTR",
        pt: "Bem-vindo ao FASTR",
      }),
      description: t3({
        en: "The instance itself: navigation, language, release notes and where to find help.",
        fr: "L'instance elle-même : navigation, langue, nouveautés et où trouver de l'aide.",
        pt: "A própria instância: navegação, idioma, novidades e onde encontrar ajuda.",
      }),
      available: () => true,
      unavailableReason: reasonNoPageAccess,
      navigate: (openTab) => openTab("products"),
    },
    {
      id: "instance-data-intro",
      area: "instance",
      label: t3({
        en: "Instance data overview",
        fr: "Aperçu des données de l'instance",
        pt: "Visão geral dos dados da instância",
      }),
      description: t3({
        en: "Where data is uploaded once for the whole instance.",
        fr: "Où les données sont importées une seule fois pour toute l'instance.",
        pt: "Onde os dados são carregados uma única vez para toda a instância.",
      }),
      available: () =>
        admin() || perms().can_view_data || perms().can_configure_data,
      unavailableReason: reasonNoPageAccess,
      navigate: (openTab) => openTab("data"),
    },
    {
      id: "instance-results-packages-intro",
      area: "instance",
      label: t3({
        en: "Results packages overview",
        fr: "Aperçu des paquets de résultats",
        pt: "Visão geral dos pacotes de resultados",
      }),
      description: t3({
        en: "Generating a package for the instance, and the catalogue of the ones it holds.",
        fr: "Générer un paquet pour l'instance et le catalogue de ceux qu'elle détient.",
        pt: "Gerar um pacote para a instância e o catálogo dos que ela detém.",
      }),
      // Mirrors the instance shell's own gate for this tab.
      available: () => admin() || perms().can_configure_data,
      unavailableReason: reasonNoPageAccess,
      navigate: (openTab) => openTab("results_packages"),
    },
    {
      id: "instance-results-packages-catalogue",
      area: "instance",
      label: t3({
        en: "The package catalogue",
        fr: "Le catalogue des paquets",
        pt: "O catálogo de pacotes",
      }),
      description: t3({
        en: "Reading a package's status and disk use, and when one can be deleted.",
        fr: "Lire l'état et l'espace disque d'un paquet, et quand il peut être supprimé.",
        pt: "Ler o estado e o uso de disco de um pacote, e quando pode ser eliminado.",
      }),
      available: () =>
        (admin() || perms().can_configure_data) && hasPackage(),
      unavailableReason: () =>
        admin() || perms().can_configure_data
          ? reasonNeedPackage()
          : reasonNoPageAccess(),
      navigate: (openTab) => openTab("results_packages"),
    },
    {
      id: "instance-assets-intro",
      area: "instance",
      label: t3({
        en: "Assets overview",
        fr: "Aperçu des ressources",
        pt: "Visão geral dos recursos",
      }),
      description: t3({
        en: "Shared files available to every product.",
        fr: "Les fichiers partagés disponibles pour tous les produits.",
        pt: "Ficheiros partilhados disponíveis para todos os produtos.",
      }),
      available: () => true,
      unavailableReason: reasonNoPageAccess,
      navigate: (openTab) => openTab("assets"),
    },
    {
      id: "instance-users-intro",
      area: "instance",
      label: t3({
        en: "Users overview",
        fr: "Aperçu des utilisateurs",
        pt: "Visão geral dos utilizadores",
      }),
      description: t3({
        en: "Managing who has access and what they can do.",
        fr: "Gérer qui a accès et ce que chacun peut faire.",
        pt: "Gerir quem tem acesso e o que cada pessoa pode fazer.",
      }),
      available: () =>
        admin() || perms().can_configure_users || perms().can_view_users,
      unavailableReason: reasonNoPageAccess,
      navigate: (openTab) => openTab("users"),
    },
  ];
}
