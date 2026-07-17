import {
  DASHBOARD_SLUG_MAX_LENGTH,
  DASHBOARD_SLUG_MIN_LENGTH,
  DashboardConfig,
  DashboardLayout,
  getStartingDashboardConfig,
  isValidDashboardSlug,
  t3,
  TC,
} from "lib";
import {
  Button,
  Checkbox,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Input,
  Select,
  SettingsSection,
  TextArea,
  getSelectOptions,
  openConfirm,
  createButtonAction,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { instanceState } from "~/state/instance/t1_store";
import { serverActions } from "~/server_actions";
import { LogoSectionEditor } from "../_shared/logo_section_editor";

export type DashboardSettingsProps = {
  projectId: string;
  dashboardId: string;
  initialTitle: string;
  initialSlug: string;
  initialIsPublic: boolean;
  initialLayout: DashboardLayout;
  initialConfig: DashboardConfig;
};

type Props = EditorComponentProps<DashboardSettingsProps, { saved: true }>;

export function DashboardSettings(p: Props) {
  const [title, setTitle] = createSignal(p.initialTitle);
  const [slug, setSlug] = createSignal(p.initialSlug);
  const [isPublic, setIsPublic] = createSignal(p.initialIsPublic);
  const [layoutType, setLayoutType] = createSignal<"sidebar" | "grid">(
    p.initialLayout.type,
  );
  const [config, setConfig] = createStore<DashboardConfig>(
    structuredClone(p.initialConfig ?? getStartingDashboardConfig()),
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

  const save = createButtonAction(
    async () => {
      if (!title().trim()) {
        return {
          success: false as const,
          err: t3({ en: "Title is required", fr: "Le titre est requis", pt: "O título é obrigatório" }),
        };
      }
      if (!isValidDashboardSlug(slug())) {
        return {
          success: false as const,
          err: t3({
            en: `Slug must be ${DASHBOARD_SLUG_MIN_LENGTH}-${DASHBOARD_SLUG_MAX_LENGTH} lowercase letters/numbers/hyphens`,
            fr: `Le slug doit comporter ${DASHBOARD_SLUG_MIN_LENGTH} à ${DASHBOARD_SLUG_MAX_LENGTH} caractères (lettres minuscules, chiffres ou traits d'union)`,
            pt: `O slug deve ter ${DASHBOARD_SLUG_MIN_LENGTH} a ${DASHBOARD_SLUG_MAX_LENGTH} caracteres (letras minúsculas, números ou hífenes)`,
          }),
        };
      }
      // Warn before locking down a previously public dashboard.
      if (p.initialIsPublic && !isPublic()) {
        const confirmed = await openConfirm({
          text: t3({
            en: "Require authentication for this dashboard? The public URL will stop working.",
            fr: "Exiger l'authentification pour ce tableau de bord ? L'URL publique cessera de fonctionner.",
            pt: "Exigir autenticação para este painel? O URL público deixará de funcionar.",
          }),
          intent: "warning",
        });
        if (!confirmed) {
          return {
            success: false as const,
            err: t3({ en: "Cancelled", fr: "Annulé", pt: "Cancelado" }),
          };
        }
      }
      const layout: DashboardLayout = { type: layoutType() };
      // Drop empty custom-logo rows before saving.
      const cleaned = unwrap(config);
      const cleanedConfig: DashboardConfig = {
        ...cleaned,
        logos: {
          ...cleaned.logos,
          availableCustom: cleaned.logos.availableCustom.filter(Boolean),
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
    <FrameTop
      panelChildren={
        <HeadingBar
          class="border-border"
          heading={t3({
            en: "Dashboard settings",
            fr: "Paramètres du tableau de bord",
            pt: "Definições do painel",
          })}
        >
          <div class="ui-gap-sm flex">
            <Button
              onClick={save.click}
              state={save.state()}
              intent="success"
              iconName="save"
            >
              {t3(TC.save)}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
              outline
            >
              {t3(TC.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <div class="ui-pad ui-gap grid overflow-auto lg:grid-cols-2 lg:items-start">
        <SettingsSection header={t3({ en: "General", fr: "Général", pt: "Geral" })}>
          <div class="ui-spy">
            <Input
              label={t3({ en: "Title", fr: "Titre", pt: "Título" })}
              value={title()}
              onChange={setTitle}
              fullWidth
            />
            <Input
              label={t3({ en: "URL slug", fr: "Slug URL", pt: "Slug do URL" })}
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
                pt: "Exigir autenticação",
              })}
            />
            <Select
              label={t3({ en: "Layout", fr: "Disposition", pt: "Disposição" })}
              options={[
                {
                  value: "sidebar",
                  label: t3({ en: "Sidebar", fr: "Barre latérale", pt: "Barra lateral" }),
                },
                { value: "grid", label: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }) },
              ]}
              value={layoutType()}
              onChange={(v) => setLayoutType(v as "sidebar" | "grid")}
              fullWidth
            />
          </div>
        </SettingsSection>

        <SettingsSection header={t3({ en: "Logos", fr: "Logos", pt: "Logótipos" })}>
          <div class="ui-spy">
            <div class="ui-spy-sm">
              <div class="text-base-content-muted font-700 text-sm">
                {t3({
                  en: "Custom logos (uploaded image assets)",
                  fr: "Logos personnalisés (images téléversées)",
                  pt: "Logótipos personalizados (imagens carregadas)",
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
                {t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
              </Button>
            </div>

            <LogoSectionEditor
              title={t3({
                en: "Show on dashboard",
                fr: "Afficher sur le tableau de bord",
                pt: "Mostrar no painel",
              })}
              dontShowSizing
              config={{ selected: config.logos.selected, showByDefault: true }}
              customLogos={config.logos.availableCustom.filter(Boolean)}
              onChange={(c) => setConfig("logos", "selected", c.selected)}
            />

            <Show when={config.logos.selected.length > 0}>
              <Select
                label={t3({ en: "Placement", fr: "Emplacement", pt: "Posicionamento" })}
                options={[
                  {
                    value: "left",
                    label: t3({
                      en: "Far left (left of title)",
                      fr: "Tout à gauche (à gauche du titre)",
                      pt: "Extrema esquerda (à esquerda do título)",
                    }),
                  },
                  {
                    value: "right",
                    label: t3({
                      en: "Far right (right of buttons)",
                      fr: "Tout à droite (à droite des boutons)",
                      pt: "Extrema direita (à direita dos botões)",
                    }),
                  },
                ]}
                value={config.logos.placement ?? "left"}
                onChange={(v) =>
                  setConfig("logos", "placement", v as "left" | "right")
                }
              />
            </Show>
          </div>
        </SettingsSection>

        <SettingsSection header={t3({ en: "About", fr: "À propos", pt: "Acerca de" })}>
          <div class="ui-spy">
            <TextArea
              label={t3({
                en: "Summary (shown under the title) — markdown",
                fr: "Résumé (affiché sous le titre) — markdown",
                pt: "Resumo (apresentado sob o título) — markdown",
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
                pt: "Acerca deste painel (apresentado numa caixa de diálogo) — markdown",
              })}
              value={config.about.body}
              onChange={(v) => setConfig("about", "body", v)}
              rows={6}
              fullWidth
            />
          </div>
        </SettingsSection>
      </div>
    </FrameTop>
  );
}
