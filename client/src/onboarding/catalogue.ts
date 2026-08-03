import { getPossibleModules, t3 } from "lib";
import type {
  DashboardSummary,
  PresentationObjectSummary,
  ProjectUserPermissions,
  ReportSummary,
  SlideDeckSummary,
  SlideType,
} from "lib";
import { projectState } from "~/state/project/t1_store";
import {
  getInstanceCountryIso3,
  instanceState,
} from "~/state/instance/t1_store";
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
    | "modules"
    | "data"
    | "settings";
  label: string;
  description: string;
  /** State-only over the given facts. Do NOT probe the DOM here — the target
   *  tab is usually unmounted (or another project entirely) when evaluated. */
  available: (f: TourProjectFacts) => boolean;
  /** Shown in place of the action when `available()` is false. */
  unavailableReason: (f: TourProjectFacts) => string;
  /** Tab switch, plus editor/slide open requests for the deeper tours. Runs
   *  inside the project shell only. */
  navigate: () => void;
};

const perms = (f: TourProjectFacts) => f.thisUserPermissions;
const hasModules = (f: TourProjectFacts) => f.projectModules.length > 0;
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
const canSeeModulesTab = (f: TourProjectFacts) =>
  perms(f).can_configure_modules ||
  perms(f).can_run_modules ||
  perms(f).can_view_script_code;
const canConfigureModules = (f: TourProjectFacts) =>
  instanceState.currentUserIsGlobalAdmin || perms(f).can_configure_modules;
const hasUninstalledModule = (f: TourProjectFacts) =>
  getPossibleModules(getInstanceCountryIso3()).some(
    (def) => !f.projectModules.some((m) => m.id === def.id),
  );

const reasonNoPageAccess = () =>
  t3({
    en: "You don't have permission to view this page",
    fr: "Vous n'avez pas la permission de voir cette page",
    pt: "Não tem permissão para ver esta página",
  });
const reasonNeedModule = () =>
  t3({
    en: "Enable a module first",
    fr: "Activez d'abord un module",
    pt: "Ative primeiro um módulo",
  });
const reasonLocked = () =>
  t3({
    en: "The project is locked",
    fr: "Le projet est verrouillé",
    pt: "O projeto está bloqueado",
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
const reasonNeedDeckPermission = () =>
  t3({
    en: "You need permission to edit slide decks",
    fr: "Vous avez besoin de la permission de modifier les présentations",
    pt: "Precisa de permissão para editar apresentações",
  });
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
const reasonNeedReportPermission = () =>
  t3({
    en: "You need permission to edit reports",
    fr: "Vous avez besoin de la permission de modifier les rapports",
    pt: "Precisa de permissão para editar relatórios",
  });
const reasonNeedModulePermission = () =>
  t3({
    en: "You need permission to configure modules",
    fr: "Vous avez besoin de la permission de configurer les modules",
    pt: "Precisa de permissão para configurar módulos",
  });
const reasonAllModulesEnabled = () =>
  t3({
    en: "All available modules are already enabled",
    fr: "Tous les modules disponibles sont déjà activés",
    pt: "Todos os módulos disponíveis já estão ativados",
  });
const reasonNeedViz = () =>
  t3({
    en: "Create a visualization first",
    fr: "Créez d'abord une visualisation",
    pt: "Crie primeiro uma visualização",
  });
const reasonVizHidden = () =>
  t3({
    en: 'All visualizations are hidden by the "Hide unavailable" filter',
    fr: "Toutes les visualisations sont masquées par le filtre « Masquer les indisponibles »",
    pt: "Todas as visualizações estão ocultas pelo filtro «Ocultar indisponíveis»",
  });
const reasonNeedDashboard = () =>
  t3({
    en: "Create a dashboard first",
    fr: "Créez d'abord un tableau de bord",
    pt: "Crie primeiro um painel",
  });
const reasonNeedDashboardItem = () =>
  t3({
    en: "Add an item to your first dashboard first",
    fr: "Ajoutez d'abord un élément à votre premier tableau de bord",
    pt: "Adicione primeiro um elemento ao seu primeiro painel",
  });
const reasonNeedDashboardPermission = () =>
  t3({
    en: "You need permission to edit dashboards",
    fr: "Vous avez besoin de la permission de modifier les tableaux de bord",
    pt: "Precisa de permissão para editar painéis",
  });
const reasonGlobalAdminOnly = () =>
  t3({
    en: "Only global admins can manage data",
    fr: "Seuls les administrateurs globaux peuvent gérer les données",
    pt: "Apenas os administradores globais podem gerir os dados",
  });
const reasonSettingsPermission = () =>
  t3({
    en: "Only users who can configure settings can view this page",
    fr: "Seuls les utilisateurs pouvant configurer les paramètres peuvent voir cette page",
    pt: "Apenas os utilizadores que podem configurar as definições podem ver esta página",
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
const goToModules = () => updateProjectView({ tab: "modules" });
const goToData = () => updateProjectView({ tab: "data" });
const goToSettings = () => updateProjectView({ tab: "settings" });

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
      available: (f) =>
        perms(f).can_view_reports && hasReports(f) && firstReportHasEmbeds(f),
      unavailableReason: (f) =>
        !perms(f).can_view_reports
          ? reasonNoPageAccess()
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
          : !hasModules(f) || f.visualizations.length === 0
            ? reasonNeedModule()
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
      available: (f) =>
        perms(f).can_view_visualizations && firstDefaultViz(f) !== undefined,
      unavailableReason: (f) =>
        !perms(f).can_view_visualizations
          ? reasonNoPageAccess()
          : reasonNeedModule(),
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
        perms(f).can_view_visualizations && firstCustomViz(f) !== undefined,
      unavailableReason: (f) =>
        !perms(f).can_view_visualizations
          ? reasonNoPageAccess()
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
      available: (f) =>
        perms(f).can_view_slide_decks &&
        hasDashboards(f) &&
        f.dashboards[0].itemCount > 0,
      unavailableReason: (f) =>
        !perms(f).can_view_slide_decks
          ? reasonNoPageAccess()
          : !hasDashboards(f)
            ? reasonNeedDashboard()
            : reasonNeedDashboardItem(),
      navigate: openFirstDashboard,
    },
    // ── Modules ──────────────────────────────────────────────────────────
    {
      id: "modules-intro",
      area: "modules",
      label: t3({
        en: "Modules overview",
        fr: "Aperçu des modules",
        pt: "Visão geral dos módulos",
      }),
      description: t3({
        en: "The modules page and what modules do.",
        fr: "La page des modules et leur rôle.",
        pt: "A página dos módulos e o que fazem.",
      }),
      available: canSeeModulesTab,
      unavailableReason: reasonNoPageAccess,
      navigate: goToModules,
    },
    {
      id: "modules-manage",
      area: "modules",
      label: t3({
        en: "Manage modules",
        fr: "Gérer les modules",
        pt: "Gerir módulos",
      }),
      description: t3({
        en: "Running, configuring and updating an enabled module.",
        fr: "Exécuter, configurer et mettre à jour un module activé.",
        pt: "Executar, configurar e atualizar um módulo ativado.",
      }),
      available: (f) =>
        canSeeModulesTab(f) && canConfigureModules(f) && hasModules(f),
      unavailableReason: (f) =>
        !canSeeModulesTab(f)
          ? reasonNoPageAccess()
          : !canConfigureModules(f)
            ? reasonNeedModulePermission()
            : reasonNeedModule(),
      navigate: goToModules,
    },
    {
      id: "modules-enable",
      area: "modules",
      label: t3({
        en: "Enable a module",
        fr: "Activer un module",
        pt: "Ativar um módulo",
      }),
      description: t3({
        en: "How to enable an available module.",
        fr: "Comment activer un module disponible.",
        pt: "Como ativar um módulo disponível.",
      }),
      available: (f) =>
        canSeeModulesTab(f) &&
        canConfigureModules(f) &&
        hasUninstalledModule(f),
      unavailableReason: (f) =>
        !canSeeModulesTab(f)
          ? reasonNoPageAccess()
          : !canConfigureModules(f)
            ? reasonNeedModulePermission()
            : reasonAllModulesEnabled(),
      navigate: goToModules,
    },
    // ── Data ─────────────────────────────────────────────────────────────
    {
      id: "data-intro",
      area: "data",
      label: t3({
        en: "Data overview",
        fr: "Aperçu des données",
        pt: "Visão geral dos dados",
      }),
      description: t3({
        en: "The data page: datasets available to this project.",
        fr: "La page des données : les jeux de données disponibles pour ce projet.",
        pt: "A página dos dados: os conjuntos de dados disponíveis para este projeto.",
      }),
      available: (f) => perms(f).can_view_data,
      unavailableReason: reasonNoPageAccess,
      navigate: goToData,
    },
    {
      id: "data-admin",
      area: "data",
      label: t3({
        en: "Manage data",
        fr: "Gérer les données",
        pt: "Gerir dados",
      }),
      description: t3({
        en: "Dataset actions for administrators.",
        fr: "Les actions sur les jeux de données pour les administrateurs.",
        pt: "As ações sobre conjuntos de dados para administradores.",
      }),
      available: (f) =>
        perms(f).can_view_data &&
        instanceState.currentUserIsGlobalAdmin &&
        !f.isLocked,
      unavailableReason: (f) =>
        !perms(f).can_view_data
          ? reasonNoPageAccess()
          : !instanceState.currentUserIsGlobalAdmin
            ? reasonGlobalAdminOnly()
            : reasonLocked(),
      navigate: goToData,
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
