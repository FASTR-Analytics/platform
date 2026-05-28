import {
  DASHBOARD_SLUG_MAX_LENGTH,
  DASHBOARD_SLUG_MIN_LENGTH,
  DashboardLayout,
  isValidDashboardSlug,
  t3,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  Input,
  Select,
  openConfirm,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  dashboardId: string;
  initialTitle: string;
  initialSlug: string;
  initialIsPublic: boolean;
  initialLayout: DashboardLayout;
};

type ReturnType = { saved: true };

export function DashboardSettingsModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const [title, setTitle] = createSignal(p.initialTitle);
  const [slug, setSlug] = createSignal(p.initialSlug);
  const [isPublic, setIsPublic] = createSignal(p.initialIsPublic);
  const [layoutType, setLayoutType] = createSignal<"sidebar" | "grid">(
    p.initialLayout.type,
  );

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      if (!title().trim()) {
        return {
          success: false as const,
          err: t3({
            en: "Title is required",
            fr: "Le titre est requis",
          }),
        };
      }
      if (!isValidDashboardSlug(slug())) {
        return {
          success: false as const,
          err: t3({
            en: `Slug must be ${DASHBOARD_SLUG_MIN_LENGTH}-${DASHBOARD_SLUG_MAX_LENGTH} lowercase letters/numbers/hyphens`,
            fr: `Le slug doit comporter ${DASHBOARD_SLUG_MIN_LENGTH} à ${DASHBOARD_SLUG_MAX_LENGTH} caractères (lettres minuscules, chiffres ou traits d'union)`,
          }),
        };
      }
      // Warn before locking down a previously public dashboard
      if (p.initialIsPublic && !isPublic()) {
        const confirmed = await openConfirm({
          text: t3({
            en: "Require authentication for this dashboard? The public URL will stop working.",
            fr: "Exiger l'authentification pour ce tableau de bord ? L'URL publique cessera de fonctionner.",
          }),
          intent: "warning",
        });
        if (!confirmed) {
          return {
            success: false as const,
            err: t3({ en: "Cancelled", fr: "Annulé" }),
          };
        }
      }
      const layout: DashboardLayout = { type: layoutType() };
      return await serverActions.updateDashboard({
        projectId: p.projectId,
        dashboard_id: p.dashboardId,
        title: title().trim(),
        slug: slug(),
        isPublic: isPublic(),
        layout,
      });
    },
    () => p.close({ saved: true }),
  );

  return (
    <AlertFormHolder
      formId="dashboard-settings"
      header={t3({ en: "Dashboard settings", fr: "Paramètres du tableau de bord" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Title", fr: "Titre" })}
          value={title()}
          onChange={setTitle}
          fullWidth
        />
        <Input
          label={t3({ en: "URL slug", fr: "Slug URL" })}
          value={slug()}
          onChange={setSlug}
          fullWidth
        />
        <Checkbox
          checked={!isPublic()}
          onChange={(v) => setIsPublic(!v)}
          label={t3({
            en: "Require authentication",
            fr: "Exiger l'authentification",
          })}
        />
        <Select
          label={t3({ en: "Layout", fr: "Disposition" })}
          options={[
            {
              value: "sidebar",
              label: t3({ en: "Sidebar", fr: "Barre latérale" }),
            },
            {
              value: "grid",
              label: t3({ en: "Grid", fr: "Grille" }),
            },
          ]}
          value={layoutType()}
          onChange={(v) => setLayoutType(v as "sidebar" | "grid")}
          fullWidth
        />
      </div>
    </AlertFormHolder>
  );
}
