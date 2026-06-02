import {
  DASHBOARD_SLUG_MAX_LENGTH,
  DASHBOARD_SLUG_MIN_LENGTH,
  DashboardConfig,
  DashboardLayout,
  getStartingDashboardConfig,
  isValidDashboardSlug,
  t3,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Checkbox,
  Input,
  Select,
  TextArea,
  getSelectOptions,
  openConfirm,
  timActionForm,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { instanceState } from "~/state/instance/t1_store";
import { serverActions } from "~/server_actions";
import { LogoSelector } from "../slide_deck/slide_editor/LogoSelector";

type Props = {
  projectId: string;
  dashboardId: string;
  initialTitle: string;
  initialSlug: string;
  initialIsPublic: boolean;
  initialLayout: DashboardLayout;
  initialConfig: DashboardConfig;
};

type ReturnType = { saved: true };

const LOGO_SIZE_OPTIONS = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

export function DashboardSettingsModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const [title, setTitle] = createSignal(p.initialTitle);
  const [slug, setSlug] = createSignal(p.initialSlug);
  const [isPublic, setIsPublic] = createSignal(p.initialIsPublic);
  const [layoutType, setLayoutType] = createSignal<"sidebar" | "grid">(
    p.initialLayout.type,
  );
  const [config, setConfig] = createStore<DashboardConfig>(
    p.initialConfig ?? getStartingDashboardConfig(),
  );

  function addCustomLogo() {
    setConfig("logos", "availableCustom", (prev) => [...prev, ""]);
  }

  function removeCustomLogo(index: number) {
    const removed = config.logos.availableCustom[index];
    setConfig("logos", "availableCustom", (prev) => prev.toSpliced(index, 1));
    if (removed) {
      setConfig("logos", "selected", (prev) =>
        prev.filter((l) => l !== removed),
      );
    }
  }

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
      // Drop empty custom-logo rows before saving.
      const cleanedConfig: DashboardConfig = {
        ...unwrap(config),
        logos: {
          ...unwrap(config).logos,
          availableCustom: config.logos.availableCustom.filter(Boolean),
        },
      };
      return await serverActions.updateDashboard({
        projectId: p.projectId,
        dashboard_id: p.dashboardId,
        title: title().trim(),
        slug: slug(),
        isPublic: isPublic(),
        layout,
        config: cleanedConfig,
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

        <div class="border-base-300 ui-spy-sm border-t pt-4">
          <div class="font-700 text-sm">
            {t3({ en: "Logos", fr: "Logos" })}
          </div>
          <div class="text-base-content/70 mb-1 text-xs">
            {t3({
              en: "Custom logos (uploaded image assets)",
              fr: "Logos personnalisés (images téléversées)",
            })}
          </div>
          <For each={config.logos.availableCustom}>
            {(logo, i_logo) => (
              <div class="ui-gap-sm flex items-center">
                <Select
                  options={getSelectOptions(
                    instanceState.assets
                      .filter((f) => f.isImage)
                      .map((f) => f.fileName),
                  )}
                  value={logo}
                  onChange={(v) =>
                    setConfig("logos", "availableCustom", i_logo(), v)
                  }
                  fullWidth
                />
                <Button
                  intent="danger"
                  onClick={() => removeCustomLogo(i_logo())}
                  outline
                  iconName="trash"
                />
              </div>
            )}
          </For>
          <Button onClick={addCustomLogo} iconName="plus" size="sm">
            {t3({ en: "Add", fr: "Ajouter" })}
          </Button>

          <div class="pt-2">
            <div class="text-base-content/70 mb-1 text-xs">
              {t3({ en: "Show on dashboard", fr: "Afficher sur le tableau de bord" })}
            </div>
            <LogoSelector
              values={config.logos.selected}
              customLogos={config.logos.availableCustom.filter(Boolean)}
              onChange={(logos) => setConfig("logos", "selected", logos)}
            />
            <Show when={config.logos.selected.length > 0}>
              <div class="pt-2">
                <Select
                  label={t3({ en: "Size", fr: "Taille" })}
                  options={LOGO_SIZE_OPTIONS}
                  value={config.logos.size ?? "md"}
                  onChange={(v) =>
                    setConfig("logos", "size", v as "sm" | "md" | "lg" | "xl")
                  }
                />
              </div>
            </Show>
          </div>
        </div>

        <div class="border-base-300 ui-spy-sm border-t pt-4">
          <div class="font-700 text-sm">
            {t3({ en: "About", fr: "À propos" })}
          </div>
          <TextArea
            label={t3({
              en: "Summary (shown under the title) — markdown",
              fr: "Résumé (affiché sous le titre) — markdown",
            })}
            value={config.about.summary}
            onChange={(v) => setConfig("about", "summary", v)}
            rows={2}
            fullWidth
          />
          <TextArea
            label={t3({
              en: "About this dashboard (shown in a dialog) — markdown",
              fr: "À propos de ce tableau de bord (affiché dans une boîte de dialogue) — markdown",
            })}
            value={config.about.body}
            onChange={(v) => setConfig("about", "body", v)}
            rows={6}
            fullWidth
          />
        </div>
      </div>
    </AlertFormHolder>
  );
}
