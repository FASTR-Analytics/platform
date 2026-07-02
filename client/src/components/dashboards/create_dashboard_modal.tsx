import {
  DASHBOARD_SLUG_MAX_LENGTH,
  DASHBOARD_SLUG_MIN_LENGTH,
  isValidDashboardSlug,
  t3,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, DASHBOARD_SLUG_MAX_LENGTH);
}

export function CreateDashboardModal(
  p: AlertComponentProps<{ projectId: string }, { newDashboardId: string }>,
) {
  const [title, setTitle] = createSignal<string>("");
  const [slug, setSlug] = createSignal<string>("");
  const [slugManuallyEdited, setSlugManuallyEdited] = createSignal(false);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugManuallyEdited()) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugManuallyEdited(true);
  }

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      if (!title().trim()) {
        return {
          success: false,
          err: t3({
            en: "You must enter a title",
            fr: "Vous devez saisir un titre",
            pt: "Tem de introduzir um título",
          }),
        };
      }
      if (!isValidDashboardSlug(slug())) {
        return {
          success: false,
          err: t3({
            en: `Slug must be ${DASHBOARD_SLUG_MIN_LENGTH}-${DASHBOARD_SLUG_MAX_LENGTH} lowercase letters/numbers/hyphens`,
            fr: `Le slug doit comporter ${DASHBOARD_SLUG_MIN_LENGTH} à ${DASHBOARD_SLUG_MAX_LENGTH} caractères (lettres minuscules, chiffres ou traits d'union)`,
            pt: `O slug deve ter ${DASHBOARD_SLUG_MIN_LENGTH} a ${DASHBOARD_SLUG_MAX_LENGTH} caracteres (letras minúsculas, números ou hífenes)`,
          }),
        };
      }
      const res = await serverActions.createDashboard({
        projectId: p.projectId,
        title: title().trim(),
        slug: slug(),
      });
      if (!res.success) return res;
      return { success: true, data: { dashboardId: res.data.dashboardId } };
    },
    (data) => p.close({ newDashboardId: data.dashboardId }),
  );

  return (
    <AlertFormHolder
      formId="create-dashboard"
      header={t3({ en: "Create dashboard", fr: "Créer un tableau de bord", pt: "Criar painel" })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Title", fr: "Titre", pt: "Título" })}
          value={title()}
          onChange={handleTitleChange}
          fullWidth
          autoFocus
        />
        <Input
          label={t3({ en: "URL slug", fr: "Slug URL", pt: "Slug do URL" })}
          value={slug()}
          onChange={handleSlugChange}
          fullWidth
          placeholder="nigeria-immunization-2024"
        />
      </div>
    </AlertFormHolder>
  );
}
