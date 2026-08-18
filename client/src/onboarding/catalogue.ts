import { t3 } from "lib";
import type {
  DashboardSummary,
  PresentationObjectSummary,
  ProjectUserPermissions,
  ReportSummary,
  SlideDeckSummary,
  SlideType,
} from "lib";
import { projectState } from "~/state/project/t1_store";
import { instanceState } from "~/state/instance/t1_store";
import { canViewPackageContents } from "~/components/_shared/results_package/status";
import {
  hideUnreadyVisualizations,
  setPendingEditorOpen,
  setPendingSlideOpen,
  updateProjectView,
} from "~/state/t4_ui";
import { getSlideDeckDetailFromCacheOrFetch } from "~/state/project/t2_slide_decks";
import { _SLIDE_CACHE } from "~/state/project/t2_slides";
import { serverActions } from "~/server_actions";

// The slice of project state that tour availability depends on. Satisfied by
// the live `projectState` store (in-project modal) and by a fetched
// `ProjectDetail` (instance-level modal, which evaluates every project the
// user can access to pick one that qualifies).
export type TourProjectFacts = {
  thisUserPermissions: ProjectUserPermissions;
  isLocked: boolean;
  /** The results package this project serves from, null if none is attached
   *  yet — the attached-package tour has nothing to point at without one. */
  attachedRunId: string | null;
  projectModules: { id: string }[];
  metrics: { id: string; status: string }[];
  visualizations: PresentationObjectSummary[];
  slideDecks: SlideDeckSummary[];
  reports: ReportSummary[];
  dashboards: DashboardSummary[];
  /** Result of findProjectWithSlideOfType per slide type. When supplied, the
   *  three slide tours are gated precisely; when absent they fall back to the
   *  optimistic "first deck has slides" proxy (slide types live only in the
   *  slide documents, so this is async data the modals fetch). */
  slideTypesPresent?: Partial<Record<SlideType, boolean>>;
};

export type TourCatalogueEntry = {
  /** Must match the TourDefinition id exactly. */
  id: string;
  area:
    | "decks"
    | "reports"
    | "visualizations"
    | "dashboards"
    | "results_package"
    | "settings";
  label: string;
  description: string;
  /** State-only over the given facts. Do NOT probe the DOM here — the target
   *  tab is usually unmounted (or another project entirely) when evaluated. */
  available: (f: TourProjectFacts) => boolean;
  /** Shown in place of the action when `available()` is false. */
  unavailableReason: (f: TourProjectFacts) => TourReason;
  /** Tab switch, plus editor/slide open requests for the deeper tours. Runs
   *  inside the project shell only. */
  navigate: () => void;
};

const perms = (f: TourProjectFacts) => f.thisUserPermissions;
const hasModules = (f: TourProjectFacts) => f.projectModules.length > 0;
const hasAttachedPackage = (f: TourProjectFacts) => f.attachedRunId !== null;
// The results package tab's two gates (project_results_package.tsx): the
// picker is the editor's, the contents are instance data.
const canAttach = (f: TourProjectFacts) =>
  instanceState.currentUserIsGlobalAdmin ||
  perms(f).can_configure_visualizations;
const canOpenTab = (f: TourProjectFacts) =>
  canAttach(f) || canViewPackageContents();
const hasDecks = (f: TourProjectFacts) => f.slideDecks.length > 0;
const hasReports = (f: TourProjectFacts) => f.reports.length > 0;
const hasDashboards = (f: TourProjectFacts) => f.dashboards.length > 0;
const firstDeckHasSlides = (f: TourProjectFacts) =>
  f.slideDecks[0]?.firstSlideId != null;
const firstReportHasEmbeds = (f: TourProjectFacts) => {
  const preview = f.reports[0]?.preview;
  return preview !== undefined && preview.figureCount + preview.imageCount > 0;
};
const firstDefaultViz = (f: TourProjectFacts) =>
  f.visualizations.find((v) => v.isDefault);
const firstCustomViz = (f: TourProjectFacts) =>
  f.visualizations.find((v) => !v.isDefault);
// Mirrors PresentationObjectPanelDisplay: the "Hide unavailable" filter drops
// visualizations whose metric has not produced results yet.
const vizCardVisible = (f: TourProjectFacts) => {
  if (f.visualizations.length === 0) return false;
  if (!hideUnreadyVisualizations()) return true;
  const ready = new Set(
    f.metrics.filter((m) => m.status === "ready").map((m) => m.id),
  );
  return f.visualizations.some((v) => ready.has(v.metricId));
};

// Why a tour is unavailable. `rank` orders reasons by how close the project
// is to qualifying (higher = closer): the instance modal evaluates every
// accessible project and reports the nearest one, so the user sees the most
// actionable gap rather than whichever project happened to be listed first.
export type TourReason = { rank: number; text: string };

const RANK_PAGE_ACCESS = 0; // cannot even see the page
const RANK_EDIT_PERMISSION = 1; // page visible, action needs a permission the user lacks
const RANK_PACKAGE = 2; // attach a results package
const RANK_PACKAGE_CONTENT = 3; // package attached but provides nothing usable
const RANK_LOCKED = 4;
const RANK_CONTENT = 5; // create a deck / report / viz / dashboard
const RANK_SUBCONTENT = 6; // add slides / a figure / an item
const RANK_SLIDE_TYPE = 7;
const RANK_FILTER = 8; // only a view filter hides it

const reasonNoPageAccess = (): TourReason => ({
  rank: RANK_PAGE_ACCESS,
  text: t3({
    en: "You don't have permission to view this page",
    fr: "Vous n'avez pas la permission de voir cette page",
    pt: "Não tem permissão para ver esta página",
  }),
});
// Modules come from the attached package's manifest, so a project with a
// package but no modules is an unusual (generation-side) state — the common
// case, no package at all, is reasonNeedAttachedPackage and is always checked
// first.
const reasonNeedModule = (): TourReason => ({
  rank: RANK_PACKAGE_CONTENT,
  text: t3({
    en: "The attached results package contains no modules",
    fr: "Le paquet de résultats rattaché ne contient aucun module",
    pt: "O pacote de resultados anexado não contém nenhum módulo",
  }),
});
const reasonNeedDefaultViz = (): TourReason => ({
  rank: RANK_PACKAGE_CONTENT,
  text: t3({
    en: "The attached results package provides no default visualizations",
    fr: "Le paquet de résultats rattaché ne fournit aucune visualisation par défaut",
    pt: "O pacote de resultados anexado não fornece nenhuma visualização predefinida",
  }),
});
const reasonLocked = (): TourReason => ({
  rank: RANK_LOCKED,
  text: t3({
    en: "The project is locked",
    fr: "Le projet est verrouillé",
    pt: "O projeto está bloqueado",
  }),
});
const reasonNeedDeck = (): TourReason => ({
  rank: RANK_CONTENT,
  text: t3({
    en: "Create a slide deck first",
    fr: "Créez d'abord une présentation",
    pt: "Crie primeiro uma apresentação",
  }),
});
const reasonNeedSlides = (): TourReason => ({
  rank: RANK_SUBCONTENT,
  text: t3({
    en: "Add slides to your first slide deck first",
    fr: "Ajoutez d'abord des diapositives à votre première présentation",
    pt: "Adicione primeiro diapositivos à sua primeira apresentação",
  }),
});
const reasonNeedSlideOfType = (type: SlideType): TourReason => {
  switch (type) {
    case "cover":
      return {
        rank: RANK_SLIDE_TYPE,
        text: t3({
          en: "Add a cover slide to a slide deck first",
          fr: "Ajoutez d'abord une diapositive de couverture à une présentation",
          pt: "Adicione primeiro um diapositivo de capa a uma apresentação",
        }),
      };
    case "section":
      return {
        rank: RANK_SLIDE_TYPE,
        text: t3({
          en: "Add a section slide to a slide deck first",
          fr: "Ajoutez d'abord une diapositive de section à une présentation",
          pt: "Adicione primeiro um diapositivo de secção a uma apresentação",
        }),
      };
    default:
      return {
        rank: RANK_SLIDE_TYPE,
        text: t3({
          en: "Add a content slide to a slide deck first",
          fr: "Ajoutez d'abord une diapositive de contenu à une présentation",
          pt: "Adicione primeiro um diapositivo de conteúdo a uma apresentação",
        }),
      };
  }
};
const reasonNeedDeckPermission = (): TourReason => ({
  rank: RANK_EDIT_PERMISSION,
  text: t3({
    en: "You need permission to edit slide decks",
    fr: "Vous avez besoin de la permission de modifier les présentations",
    pt: "Precisa de permissão para editar apresentações",
  }),
});
const reasonNeedReport = (): TourReason => ({
  rank: RANK_CONTENT,
  text: t3({
    en: "Create a report first",
    fr: "Créez d'abord un rapport",
    pt: "Crie primeiro um relatório",
  }),
});
const reasonNeedReportFigure = (): TourReason => ({
  rank: RANK_SUBCONTENT,
  text: t3({
    en: "Add a figure to your first report first",
    fr: "Ajoutez d'abord une figure à votre premier rapport",
    pt: "Adicione primeiro uma figura ao seu primeiro relatório",
  }),
});
const reasonNeedReportPermission = (): TourReason => ({
  rank: RANK_EDIT_PERMISSION,
  text: t3({
    en: "You need permission to edit reports",
    fr: "Vous avez besoin de la permission de modifier les rapports",
    pt: "Precisa de permissão para editar relatórios",
  }),
});
const reasonNeedViz = (): TourReason => ({
  rank: RANK_CONTENT,
  text: t3({
    en: "Create a visualization first",
    fr: "Créez d'abord une visualisation",
    pt: "Crie primeiro uma visualização",
  }),
});
const reasonVizHidden = (): TourReason => ({
  rank: RANK_FILTER,
  text: t3({
    en: 'All visualizations are hidden by the "Hide unavailable" filter',
    fr: "Toutes les visualisations sont masquées par le filtre « Masquer les indisponibles »",
    pt: "Todas as visualizações estão ocultas pelo filtro «Ocultar indisponíveis»",
  }),
});
const reasonNeedDashboard = (): TourReason => ({
  rank: RANK_CONTENT,
  text: t3({
    en: "Create a dashboard first",
    fr: "Créez d'abord un tableau de bord",
    pt: "Crie primeiro um painel",
  }),
});
const reasonNeedDashboardItem = (): TourReason => ({
  rank: RANK_SUBCONTENT,
  text: t3({
    en: "Add an item to your first dashboard first",
    fr: "Ajoutez d'abord un élément à votre premier tableau de bord",
    pt: "Adicione primeiro um elemento ao seu primeiro painel",
  }),
});
const reasonNeedDashboardPermission = (): TourReason => ({
  rank: RANK_EDIT_PERMISSION,
  text: t3({
    en: "You need permission to edit dashboards",
    fr: "Vous avez besoin de la permission de modifier les tableaux de bord",
    pt: "Precisa de permissão para editar painéis",
  }),
});
const reasonGlobalAdminOnly = (): TourReason => ({
  rank: RANK_PAGE_ACCESS,
  text: t3({
    en: "Only global admins can manage data",
    fr: "Seuls les administrateurs globaux peuvent gérer les données",
    pt: "Apenas os administradores globais podem gerir os dados",
  }),
});
const reasonNeedAttachedPackage = (): TourReason => ({
  rank: RANK_PACKAGE,
  text: t3({
    en: "No results package is attached to this project yet",
    fr: "Aucun paquet de résultats n'est encore rattaché à ce projet",
    pt: "Ainda não há nenhum pacote de resultados anexado a este projeto",
  }),
});
const reasonNeedAttachPermission = (): TourReason => ({
  rank: RANK_EDIT_PERMISSION,
  text: t3({
    en: "You need permission to configure visualizations to switch package",
    fr: "Vous avez besoin de la permission de configurer les visualisations pour changer de paquet",
    pt: "Precisa de permissão para configurar visualizações para mudar de pacote",
  }),
});
const reasonSettingsPermission = (): TourReason => ({
  rank: RANK_PAGE_ACCESS,
  text: t3({
    en: "Only users who can configure settings can view this page",
    fr: "Seuls les utilisateurs pouvant configurer les paramètres peuvent voir cette page",
    pt: "Apenas os utilizadores que podem configurar as definições podem ver esta página",
  }),
});

const slideTourAvailable = (f: TourProjectFacts, type: SlideType) =>
  perms(f).can_view_slide_decks &&
  hasDecks(f) &&
  (f.slideTypesPresent
    ? f.slideTypesPresent[type] === true
    : firstDeckHasSlides(f));
const slideTourReason = (f: TourProjectFacts, type: SlideType) =>
  !perms(f).can_view_slide_decks
    ? reasonNoPageAccess()
    : !hasDecks(f)
      ? reasonNeedDeck()
      : f.slideTypesPresent
        ? reasonNeedSlideOfType(type)
        : reasonNeedSlides();

const goToDecks = () => updateProjectView({ tab: "decks" });
const goToReports = () => updateProjectView({ tab: "reports" });
const goToVisualizations = () => updateProjectView({ tab: "visualizations" });
const goToDashboards = () => updateProjectView({ tab: "dashboards" });
const goToResultsPackage = () => updateProjectView({ tab: "results_package" });
const goToSettings = () => updateProjectView({ tab: "settings" });

export const SLIDE_TOUR_TYPES: SlideType[] = ["cover", "section", "content"];

export type SlideSearchCandidate = {
  projectId: string;
  slideDecks: SlideDeckSummary[];
};

// Slide types live only in the slide documents, so anything slide-type-aware
// has to search: candidates in the given order, decks in list order, slides
// in deck order, cache-first (repeat searches are cheap). Used by the
// in-project replay (one candidate: the current project) and the instance
// modal (all accessible projects) alike.
export async function findProjectWithSlideOfType(
  candidates: SlideSearchCandidate[],
  type: SlideType,
): Promise<{ projectId: string; deckId: string } | null> {
  for (const candidate of candidates) {
    for (const deck of candidate.slideDecks) {
      const detail = await getSlideDeckDetailFromCacheOrFetch(
        candidate.projectId,
        deck.id,
      );
      if (!detail.success) continue;
      for (const slideId of detail.data.slideIds) {
        const cached = await _SLIDE_CACHE.get({
          projectId: candidate.projectId,
          slideId,
        });
        let slide = cached.data?.slide;
        if (!slide) {
          const res = await serverActions.getSlide({
            projectId: candidate.projectId,
            slide_id: slideId,
          });
          if (!res.success) continue;
          slide = res.data.slide;
        }
        if (slide.type === type) {
          return { projectId: candidate.projectId, deckId: deck.id };
        }
      }
    }
  }
  return null;
}

const openFirstDeck = () => {
  goToDecks();
  const deck = projectState.slideDecks[0];
  if (deck) setPendingEditorOpen({ kind: "deck", id: deck.id });
};
const openFirstDeckSlide = (type: SlideType) => {
  goToDecks();
  void findProjectWithSlideOfType(
    [{ projectId: projectState.id, slideDecks: projectState.slideDecks }],
    type,
  ).then((found) => {
    if (!found) return;
    setPendingEditorOpen({ kind: "deck", id: found.deckId });
    setPendingSlideOpen(type);
  });
};
const openFirstReport = () => {
  goToReports();
  const report = projectState.reports[0];
  if (report) setPendingEditorOpen({ kind: "report", id: report.id });
};
const openFirstDashboard = () => {
  goToDashboards();
  const dashboard = projectState.dashboards[0];
  if (dashboard) {
    setPendingEditorOpen({ kind: "dashboard", id: dashboard.id });
  }
};

// ── Instance-level tours ─────────────────────────────────────────────────
// These play on the instance page itself (no project involved), so their
// availability reads instanceState only and "navigation" is just an instance
// tab switch, performed by the instance modal.

export type InstanceTab =
  | "projects"
  | "data"
  | "results_packages"
  | "assets"
  | "users";

export type InstanceTourCatalogueEntry = {
  /** Must match the TourDefinition id exactly. */
  id: string;
  tab: InstanceTab;
  label: string;
  description: string;
  available: () => boolean;
  unavailableReason: () => TourReason;
};

export function getInstanceTourCatalogue(): InstanceTourCatalogueEntry[] {
  const perms = () => instanceState.currentUserPermissions;
  const admin = () => instanceState.currentUserIsGlobalAdmin;
  return [
    {
      id: "instance-welcome",
      tab: "projects",
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
    },
    {
      id: "instance-projects-intro",
      tab: "projects",
      label: t3({
        en: "Projects overview",
        fr: "Aperçu des projets",
        pt: "Visão geral dos projetos",
      }),
      description: t3({
        en: "The projects page: what projects are and how to open one.",
        fr: "La page des projets : ce que sont les projets et comment en ouvrir un.",
        pt: "A página dos projetos: o que são os projetos e como abrir um.",
      }),
      available: () => true,
      unavailableReason: reasonNoPageAccess,
    },
    {
      id: "instance-data-intro",
      tab: "data",
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
    },
    {
      id: "instance-results-packages-intro",
      tab: "results_packages",
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
    },
    {
      id: "instance-results-packages-catalogue",
      tab: "results_packages",
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
      available: () => admin() || perms().can_configure_data,
      unavailableReason: reasonNoPageAccess,
    },
    {
      id: "instance-assets-intro",
      tab: "assets",
      label: t3({
        en: "Assets overview",
        fr: "Aperçu des ressources",
        pt: "Visão geral dos recursos",
      }),
      description: t3({
        en: "Shared files available to every project.",
        fr: "Les fichiers partagés disponibles pour tous les projets.",
        pt: "Ficheiros partilhados disponíveis para todos os projetos.",
      }),
      available: () => true,
      unavailableReason: reasonNoPageAccess,
    },
    {
      id: "instance-users-intro",
      tab: "users",
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
    },
  ];
}

// Built per call (not a module-scope const) so the t3 literals resolve in the
// user's current language — the app language is set at runtime, after import.
export function getTourCatalogue(): TourCatalogueEntry[] {
  return [
    // ── Decks ────────────────────────────────────────────────────────────
    {
      id: "decks-intro-viewer",
      area: "decks",
      label: t3({
        en: "Slide decks overview",
        fr: "Aperçu des présentations",
        pt: "Visão geral das apresentações",
      }),
      description: t3({
        en: "The slide decks page: searching, sorting and folders.",
        fr: "La page des présentations : recherche, tri et dossiers.",
        pt: "A página das apresentações: pesquisa, ordenação e pastas.",
      }),
      available: (f) => perms(f).can_view_slide_decks,
      unavailableReason: reasonNoPageAccess,
      navigate: goToDecks,
    },
    {
      id: "decks-open-deck",
      area: "decks",
      label: t3({
        en: "Open a slide deck",
        fr: "Ouvrir une présentation",
        pt: "Abrir uma apresentação",
      }),
      description: t3({
        en: "How to open a slide deck from its card.",
        fr: "Comment ouvrir une présentation depuis sa carte.",
        pt: "Como abrir uma apresentação a partir do seu cartão.",
      }),
      available: (f) =>
        perms(f).can_view_slide_decks && hasModules(f) && hasDecks(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : !hasAttachedPackage(f)
            ? reasonNeedAttachedPackage()
            : !hasModules(f)
              ? reasonNeedModule()
              : reasonNeedDeck(),
      navigate: goToDecks,
    },
    {
      id: "decks-intro-editor",
      area: "decks",
      label: t3({
        en: "Create slide decks",
        fr: "Créer des présentations",
        pt: "Criar apresentações",
      }),
      description: t3({
        en: "Creating slide decks and organizing them into folders.",
        fr: "Créer des présentations et les organiser en dossiers.",
        pt: "Criar apresentações e organizá-las em pastas.",
      }),
      available: (f) =>
        perms(f).can_view_slide_decks && perms(f).can_configure_slide_decks,
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : reasonNeedDeckPermission(),
      navigate: goToDecks,
    },
    {
      id: "decks-manage-decks",
      area: "decks",
      label: t3({
        en: "Manage slide decks",
        fr: "Gérer les présentations",
        pt: "Gerir apresentações",
      }),
      description: t3({
        en: "Moving, duplicating and deleting slide decks.",
        fr: "Déplacer, dupliquer et supprimer des présentations.",
        pt: "Mover, duplicar e eliminar apresentações.",
      }),
      available: (f) =>
        perms(f).can_view_slide_decks &&
        perms(f).can_configure_slide_decks &&
        !f.isLocked &&
        hasModules(f) &&
        hasDecks(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : !perms(f).can_configure_slide_decks
            ? reasonNeedDeckPermission()
            : f.isLocked
              ? reasonLocked()
              : !hasAttachedPackage(f)
                ? reasonNeedAttachedPackage()
                : !hasModules(f)
                  ? reasonNeedModule()
                  : reasonNeedDeck(),
      navigate: goToDecks,
    },
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
      available: (f) => perms(f).can_view_slide_decks && hasDecks(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : reasonNeedDeck(),
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
      available: (f) =>
        perms(f).can_view_slide_decks && hasDecks(f) && firstDeckHasSlides(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : !hasDecks(f)
            ? reasonNeedDeck()
            : reasonNeedSlides(),
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
      available: (f) =>
        perms(f).can_view_slide_decks && hasDecks(f) && firstDeckHasSlides(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : !hasDecks(f)
            ? reasonNeedDeck()
            : reasonNeedSlides(),
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
      available: (f) => perms(f).can_view_slide_decks && hasDecks(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : reasonNeedDeck(),
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
      available: (f) => perms(f).can_view_slide_decks && hasDecks(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : reasonNeedDeck(),
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
      available: (f) => slideTourAvailable(f, "cover"),
      unavailableReason: (f) => slideTourReason(f, "cover"),
      navigate: () => openFirstDeckSlide("cover"),
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
      available: (f) => slideTourAvailable(f, "section"),
      unavailableReason: (f) => slideTourReason(f, "section"),
      navigate: () => openFirstDeckSlide("section"),
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
      available: (f) => slideTourAvailable(f, "content"),
      unavailableReason: (f) => slideTourReason(f, "content"),
      navigate: () => openFirstDeckSlide("content"),
    },
    // ── Reports ──────────────────────────────────────────────────────────
    {
      id: "reports-intro-viewer",
      area: "reports",
      label: t3({
        en: "Reports overview",
        fr: "Aperçu des rapports",
        pt: "Visão geral dos relatórios",
      }),
      description: t3({
        en: "The reports page: searching, sorting and folders.",
        fr: "La page des rapports : recherche, tri et dossiers.",
        pt: "A página dos relatórios: pesquisa, ordenação e pastas.",
      }),
      available: (f) => perms(f).can_view_reports,
      unavailableReason: reasonNoPageAccess,
      navigate: goToReports,
    },
    {
      id: "reports-open-reports",
      area: "reports",
      label: t3({
        en: "Open a report",
        fr: "Ouvrir un rapport",
        pt: "Abrir um relatório",
      }),
      description: t3({
        en: "How to open a report from its card.",
        fr: "Comment ouvrir un rapport depuis sa carte.",
        pt: "Como abrir um relatório a partir do seu cartão.",
      }),
      available: (f) => perms(f).can_view_reports && hasReports(f),
      unavailableReason: (f) =>
        !perms(f).can_view_reports ? reasonNoPageAccess() : reasonNeedReport(),
      navigate: goToReports,
    },
    {
      id: "reports-intro-editor",
      area: "reports",
      label: t3({
        en: "Create reports",
        fr: "Créer des rapports",
        pt: "Criar relatórios",
      }),
      description: t3({
        en: "Creating reports and organizing them into folders.",
        fr: "Créer des rapports et les organiser en dossiers.",
        pt: "Criar relatórios e organizá-los em pastas.",
      }),
      available: (f) =>
        perms(f).can_view_reports && perms(f).can_configure_reports,
      unavailableReason: (f) =>
        !perms(f).can_view_reports
          ? reasonNoPageAccess()
          : reasonNeedReportPermission(),
      navigate: goToReports,
    },
    {
      id: "reports-manage-reports",
      area: "reports",
      label: t3({
        en: "Manage reports",
        fr: "Gérer les rapports",
        pt: "Gerir relatórios",
      }),
      description: t3({
        en: "Moving, duplicating and deleting reports.",
        fr: "Déplacer, dupliquer et supprimer des rapports.",
        pt: "Mover, duplicar e eliminar relatórios.",
      }),
      available: (f) =>
        perms(f).can_view_reports &&
        perms(f).can_configure_reports &&
        !f.isLocked &&
        hasReports(f),
      unavailableReason: (f) =>
        !perms(f).can_view_reports
          ? reasonNoPageAccess()
          : !perms(f).can_configure_reports
            ? reasonNeedReportPermission()
            : f.isLocked
              ? reasonLocked()
              : reasonNeedReport(),
      navigate: goToReports,
    },
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
      available: (f) => perms(f).can_view_reports && hasReports(f),
      unavailableReason: (f) =>
        !perms(f).can_view_reports ? reasonNoPageAccess() : reasonNeedReport(),
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
      // Embedded figures render from the attached run — without a package the
      // report opens but every figure fails to load.
      available: (f) =>
        perms(f).can_view_reports &&
        hasAttachedPackage(f) &&
        hasReports(f) &&
        firstReportHasEmbeds(f),
      unavailableReason: (f) =>
        !perms(f).can_view_reports
          ? reasonNoPageAccess()
          : !hasAttachedPackage(f)
            ? reasonNeedAttachedPackage()
            : !hasReports(f)
              ? reasonNeedReport()
              : reasonNeedReportFigure(),
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
      available: (f) => perms(f).can_view_reports && hasReports(f),
      unavailableReason: (f) =>
        !perms(f).can_view_reports ? reasonNoPageAccess() : reasonNeedReport(),
      navigate: openFirstReport,
    },
    // ── Visualizations ───────────────────────────────────────────────────
    {
      id: "viz-intro",
      area: "visualizations",
      label: t3({
        en: "Visualizations overview",
        fr: "Aperçu des visualisations",
        pt: "Visão geral das visualizações",
      }),
      description: t3({
        en: "The visualizations page: folders, search and sorting.",
        fr: "La page des visualisations : dossiers, recherche et tri.",
        pt: "A página das visualizações: pastas, pesquisa e ordenação.",
      }),
      available: (f) => perms(f).can_view_visualizations && hasModules(f),
      unavailableReason: (f) =>
        !perms(f).can_view_visualizations
          ? reasonNoPageAccess()
          : !hasAttachedPackage(f)
            ? reasonNeedAttachedPackage()
            : reasonNeedModule(),
      navigate: goToVisualizations,
    },
    {
      id: "viz-cards",
      area: "visualizations",
      label: t3({
        en: "Visualization cards",
        fr: "Cartes de visualisation",
        pt: "Cartões de visualização",
      }),
      description: t3({
        en: "What a visualization card shows and how to open one.",
        fr: "Ce que montre une carte de visualisation et comment l'ouvrir.",
        pt: "O que mostra um cartão de visualização e como o abrir.",
      }),
      available: (f) =>
        perms(f).can_view_visualizations && hasModules(f) && vizCardVisible(f),
      unavailableReason: (f) =>
        !perms(f).can_view_visualizations
          ? reasonNoPageAccess()
          : !hasAttachedPackage(f)
            ? reasonNeedAttachedPackage()
            : !hasModules(f)
              ? reasonNeedModule()
              : f.visualizations.length === 0
                ? reasonNeedViz()
                : reasonVizHidden(),
      navigate: goToVisualizations,
    },
    {
      id: "viz-create",
      area: "visualizations",
      label: t3({
        en: "Create a visualization",
        fr: "Créer une visualisation",
        pt: "Criar uma visualização",
      }),
      description: t3({
        en: "Where to create a new visualization.",
        fr: "Où créer une nouvelle visualisation.",
        pt: "Onde criar uma nova visualização.",
      }),
      available: (f) =>
        perms(f).can_view_visualizations && hasModules(f) && !f.isLocked,
      unavailableReason: (f) =>
        !perms(f).can_view_visualizations
          ? reasonNoPageAccess()
          : !hasAttachedPackage(f)
            ? reasonNeedAttachedPackage()
            : !hasModules(f)
              ? reasonNeedModule()
              : reasonLocked(),
      navigate: goToVisualizations,
    },
    {
      id: "viz-editor-create",
      area: "visualizations",
      label: t3({
        en: "Visualization editor (create)",
        fr: "Éditeur de visualisation (création)",
        pt: "Editor de visualizações (criação)",
      }),
      description: t3({
        en: "The editor for a new visualization. Opens a copy of your first default visualization.",
        fr: "L'éditeur pour une nouvelle visualisation. Ouvre une copie de votre première visualisation par défaut.",
        pt: "O editor para uma nova visualização. Abre uma cópia da sua primeira visualização predefinida.",
      }),
      // The editor loads the visualization's data (getPresentationObjectDetail
      // reads through the attached run), so a project without a package
      // cannot host this tour even when it has visualizations.
      available: (f) =>
        perms(f).can_view_visualizations &&
        hasAttachedPackage(f) &&
        firstDefaultViz(f) !== undefined,
      unavailableReason: (f) =>
        !perms(f).can_view_visualizations
          ? reasonNoPageAccess()
          : !hasAttachedPackage(f)
            ? reasonNeedAttachedPackage()
            : reasonNeedDefaultViz(),
      navigate: () => {
        goToVisualizations();
        const po = firstDefaultViz(projectState);
        if (po) setPendingEditorOpen({ kind: "visualization", id: po.id });
      },
    },
    {
      id: "viz-editor-edit",
      area: "visualizations",
      label: t3({
        en: "Visualization editor (edit)",
        fr: "Éditeur de visualisation (modification)",
        pt: "Editor de visualizações (edição)",
      }),
      description: t3({
        en: "Editing an existing visualization. Opens your first custom visualization.",
        fr: "Modifier une visualisation existante. Ouvre votre première visualisation personnalisée.",
        pt: "Editar uma visualização existente. Abre a sua primeira visualização personalizada.",
      }),
      available: (f) =>
        perms(f).can_view_visualizations &&
        hasAttachedPackage(f) &&
        firstCustomViz(f) !== undefined,
      unavailableReason: (f) =>
        !perms(f).can_view_visualizations
          ? reasonNoPageAccess()
          : !hasAttachedPackage(f)
            ? reasonNeedAttachedPackage()
            : reasonNeedViz(),
      navigate: () => {
        goToVisualizations();
        const po = firstCustomViz(projectState);
        if (po) setPendingEditorOpen({ kind: "visualization", id: po.id });
      },
    },
    // ── Dashboards ───────────────────────────────────────────────────────
    {
      id: "dashboards-intro",
      area: "dashboards",
      label: t3({
        en: "Dashboards overview",
        fr: "Aperçu des tableaux de bord",
        pt: "Visão geral dos painéis",
      }),
      description: t3({
        en: "The dashboards page and what dashboards are for.",
        fr: "La page des tableaux de bord et leur utilité.",
        pt: "A página dos painéis e para que servem.",
      }),
      available: (f) => perms(f).can_view_slide_decks,
      unavailableReason: reasonNoPageAccess,
      navigate: goToDashboards,
    },
    {
      id: "dashboards-cards",
      area: "dashboards",
      label: t3({
        en: "Dashboard cards",
        fr: "Cartes de tableau de bord",
        pt: "Cartões de painel",
      }),
      description: t3({
        en: "What a dashboard card shows and how to open one.",
        fr: "Ce que montre une carte de tableau de bord et comment l'ouvrir.",
        pt: "O que mostra um cartão de painel e como o abrir.",
      }),
      available: (f) => perms(f).can_view_slide_decks && hasDashboards(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : reasonNeedDashboard(),
      navigate: goToDashboards,
    },
    {
      id: "dashboards-create",
      area: "dashboards",
      label: t3({
        en: "Create a dashboard",
        fr: "Créer un tableau de bord",
        pt: "Criar um painel",
      }),
      description: t3({
        en: "Where to create a new dashboard.",
        fr: "Où créer un nouveau tableau de bord.",
        pt: "Onde criar um novo painel.",
      }),
      available: (f) =>
        perms(f).can_view_slide_decks &&
        perms(f).can_configure_slide_decks &&
        !f.isLocked,
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : !perms(f).can_configure_slide_decks
            ? reasonNeedDashboardPermission()
            : reasonLocked(),
      navigate: goToDashboards,
    },
    {
      id: "dashboard-editor-intro",
      area: "dashboards",
      label: t3({
        en: "Dashboard editor",
        fr: "Éditeur de tableau de bord",
        pt: "Editor de painéis",
      }),
      description: t3({
        en: "A walkthrough of the dashboard editor. Opens your first dashboard.",
        fr: "Visite de l'éditeur de tableau de bord. Ouvre votre premier tableau de bord.",
        pt: "Visita ao editor de painéis. Abre o seu primeiro painel.",
      }),
      available: (f) => perms(f).can_view_slide_decks && hasDashboards(f),
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : reasonNeedDashboard(),
      navigate: openFirstDashboard,
    },
    {
      id: "dashboard-editor-items",
      area: "dashboards",
      label: t3({
        en: "Dashboard items",
        fr: "Éléments de tableau de bord",
        pt: "Elementos do painel",
      }),
      description: t3({
        en: "Working with dashboard items. Opens your first dashboard.",
        fr: "Travailler avec les éléments d'un tableau de bord. Ouvre votre premier tableau de bord.",
        pt: "Trabalhar com os elementos de um painel. Abre o seu primeiro painel.",
      }),
      // Dashboard items are visualizations rendered from the attached run.
      available: (f) =>
        perms(f).can_view_slide_decks &&
        hasAttachedPackage(f) &&
        hasDashboards(f) &&
        f.dashboards[0].itemCount > 0,
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : !hasAttachedPackage(f)
            ? reasonNeedAttachedPackage()
            : !hasDashboards(f)
              ? reasonNeedDashboard()
              : reasonNeedDashboardItem(),
      navigate: openFirstDashboard,
    },
    // ── Results package ──────────────────────────────────────────────────
    {
      id: "results-package-intro",
      area: "results_package",
      label: t3({
        en: "Results package",
        fr: "Paquet de résultats",
        pt: "Pacote de resultados",
      }),
      description: t3({
        en: "Where this project's numbers come from, and what is inside the package.",
        fr: "D'où viennent les chiffres de ce projet et ce que contient le paquet.",
        pt: "De onde vêm os números deste projeto e o que contém o pacote.",
      }),
      available: (f) => canOpenTab(f),
      unavailableReason: reasonNoPageAccess,
      navigate: goToResultsPackage,
    },
    {
      id: "results-package-explore",
      area: "results_package",
      label: t3({
        en: "Explore the package",
        fr: "Explorer le paquet",
        pt: "Explorar o pacote",
      }),
      description: t3({
        en: "The package in use, and the modules, scripts, logs and files inside it.",
        fr: "Le paquet utilisé, et les modules, scripts, journaux et fichiers qu'il contient.",
        pt: "O pacote em utilização, e os módulos, scripts, registos e ficheiros que contém.",
      }),
      available: (f) => canViewPackageContents() && hasAttachedPackage(f),
      unavailableReason: (f) =>
        !canViewPackageContents()
          ? reasonNoPageAccess()
          : reasonNeedAttachedPackage(),
      navigate: goToResultsPackage,
    },
    {
      id: "results-package-switch",
      area: "results_package",
      label: t3({
        en: "Switch results package",
        fr: "Changer de paquet de résultats",
        pt: "Mudar de pacote de resultados",
      }),
      description: t3({
        en: "Repointing the project at another package, and the compatibility check first.",
        fr: "Rattacher le projet à un autre paquet, et la vérification de compatibilité préalable.",
        pt: "Apontar o projeto para outro pacote, e a verificação de compatibilidade prévia.",
      }),
      available: (f) => canAttach(f) && !f.isLocked,
      unavailableReason: (f) =>
        !canAttach(f) ? reasonNeedAttachPermission() : reasonLocked(),
      navigate: goToResultsPackage,
    },
    // ── Settings ─────────────────────────────────────────────────────────
    {
      id: "settings-intro",
      area: "settings",
      label: t3({
        en: "Project settings",
        fr: "Paramètres du projet",
        pt: "Definições do projeto",
      }),
      description: t3({
        en: "The project settings page.",
        fr: "La page des paramètres du projet.",
        pt: "A página das definições do projeto.",
      }),
      available: (f) => perms(f).can_configure_settings,
      unavailableReason: reasonSettingsPermission,
      navigate: goToSettings,
    },
  ];
}
