import { t3 } from "lib";
import {
  type AlertComponentProps,
  Button,
  ButtonGroup,
  ModalContainer,
} from "panther";
import { schemePref, setScheme } from "~/state/t4_ui";
import {
  DEFAULT_THEME,
  setTheme,
  theme,
  THEME_RADII,
  type Theme,
  type ThemeDensity,
  type ThemePalette,
  type ThemeTextScale,
} from "~/state/t4_theme";

const PALETTE_ITEMS: { id: ThemePalette; label: string }[] = [
  { id: "fastr", label: "FASTR" },
  { id: "neutral", label: "Neutral" },
  { id: "warm", label: "Warm" },
  { id: "nord", label: "Nord" },
  { id: "corporate", label: "Corporate" },
  { id: "forest", label: "Forest" },
];

// Every change applies immediately, so the page behind the modal is the
// preview. Done only closes; Reset returns every knob to the shipped look.
export function ThemeModal(p: AlertComponentProps<object, undefined>) {
  function update<K extends keyof Theme>(key: K, value: Theme[K] | undefined) {
    if (value === undefined) return;
    setTheme({ ...theme(), [key]: value });
  }

  const densityItems: { id: ThemeDensity; label: string }[] = [
    {
      id: "compact",
      label: t3({ en: "Compact", fr: "Compact", pt: "Compacto" }),
    },
    {
      id: "default",
      label: t3({ en: "Default", fr: "Par défaut", pt: "Padrão" }),
    },
    {
      id: "comfortable",
      label: t3({ en: "Comfortable", fr: "Confortable", pt: "Confortável" }),
    },
  ];

  const textScaleItems: { id: ThemeTextScale; label: string }[] = [
    { id: "small", label: t3({ en: "Small", fr: "Petit", pt: "Pequeno" }) },
    {
      id: "default",
      label: t3({ en: "Default", fr: "Par défaut", pt: "Padrão" }),
    },
    { id: "large", label: t3({ en: "Large", fr: "Grand", pt: "Grande" }) },
  ];

  return (
    <ModalContainer
      width="md"
      title={t3({ en: "Theme", fr: "Thème", pt: "Tema" })}
      subtitle={t3({
        en: "Applies on this device only. Figures keep their fixed colors.",
        fr: "S'applique uniquement à cet appareil. Les figures conservent leurs couleurs fixes.",
        pt: "Aplica-se apenas a este dispositivo. As figuras mantêm as suas cores fixas.",
      })}
      leftButtons={
        <Button outline onClick={() => setTheme(DEFAULT_THEME)}>
          {t3({ en: "Reset", fr: "Réinitialiser", pt: "Repor" })}
        </Button>
      }
      rightButtons={
        <Button onClick={() => p.close(undefined)}>
          {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
        </Button>
      }
    >
      <div class="ui-spy">
        <ButtonGroup
          label={t3({ en: "Palette", fr: "Palette", pt: "Paleta" })}
          items={PALETTE_ITEMS}
          value={theme().palette}
          onChange={(v) => update("palette", v)}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Light or dark",
            fr: "Clair ou sombre",
            pt: "Claro ou escuro",
          })}
          items={[
            {
              id: "system" as const,
              label: t3({ en: "System", fr: "Système", pt: "Sistema" }),
            },
            {
              id: "light" as const,
              label: t3({ en: "Light", fr: "Clair", pt: "Claro" }),
            },
            {
              id: "dark" as const,
              label: t3({ en: "Dark", fr: "Sombre", pt: "Escuro" }),
            },
          ]}
          value={schemePref()}
          onChange={(v) => v && setScheme(v)}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Corner rounding",
            fr: "Arrondi des coins",
            pt: "Arredondamento dos cantos",
          })}
          items={THEME_RADII.map((r) => ({ id: String(r), label: `${r} px` }))}
          value={String(theme().radius)}
          onChange={(v) =>
            update(
              "radius",
              THEME_RADII.find((r) => String(r) === v),
            )
          }
          fullWidth
        />
        <ButtonGroup
          label={t3({ en: "Density", fr: "Densité", pt: "Densidade" })}
          items={densityItems}
          value={theme().density}
          onChange={(v) => update("density", v)}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Text size",
            fr: "Taille du texte",
            pt: "Tamanho do texto",
          })}
          items={textScaleItems}
          value={theme().textScale}
          onChange={(v) => update("textScale", v)}
          fullWidth
        />
      </div>
    </ModalContainer>
  );
}
