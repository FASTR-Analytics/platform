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
  THEME_DENSITIES,
  THEME_RADII,
  THEME_TEXT_SCALES,
  type Theme,
  type ThemeDarkPrimary,
  type ThemeInk,
  type ThemePrimary,
  type ThemeRamp,
  type ThemeStatus,
} from "~/state/t4_theme";

type Item<T extends string> = { id: T; label: string };

function labelOf<T extends string>(items: Item<T>[], id: T): string {
  return items.find((i) => i.id === id)?.label ?? id;
}

// Numeric knobs ride the ButtonGroup's string ids: the label is the number
// itself, and onChange maps the id back to the step.
const percent = (v: number) => `${Math.round(v * 100)}%`;
function numericItems(steps: readonly number[], label: (v: number) => string) {
  return steps.map((v) => ({ id: String(v), label: label(v) }));
}
function stepOf<T extends number | string>(
  steps: readonly T[],
  id: string | undefined,
) {
  return steps.find((v) => String(v) === id);
}

// Every change applies immediately, so the page behind the modal is the
// preview. Done only closes; Reset returns every knob to the shipped look.
// The summary line names the current combination so a reviewer can quote it.
export function ThemeModal(p: AlertComponentProps<object, undefined>) {
  function update<K extends keyof Theme>(key: K, value: Theme[K] | undefined) {
    if (value === undefined) return;
    setTheme({ ...theme(), [key]: value });
  }

  const rampItems: Item<ThemeRamp>[] = [
    { id: "neutral", label: t3({ en: "Neutral", fr: "Neutre", pt: "Neutro" }) },
    { id: "tone", label: "Tone" },
    { id: "cool", label: t3({ en: "Cool", fr: "Froid", pt: "Frio" }) },
  ];
  const primaryItems: Item<ThemePrimary>[] = [
    { id: "current", label: t3({ en: "Current", fr: "Actuel", pt: "Atual" }) },
    {
      id: "deep-green",
      label: t3({ en: "Deep green", fr: "Vert profond", pt: "Verde profundo" }),
    },
    {
      id: "logo-green",
      label: t3({
        en: "Logo green",
        fr: "Vert du logo",
        pt: "Verde do logótipo",
      }),
    },
    { id: "blue", label: t3({ en: "Blue", fr: "Bleu", pt: "Azul" }) },
    { id: "navy", label: t3({ en: "Navy", fr: "Marine", pt: "Azul-marinho" }) },
  ];
  const inkItems: Item<ThemeInk>[] = [
    { id: "black", label: t3({ en: "Black", fr: "Noir", pt: "Preto" }) },
    {
      id: "near-black",
      label: t3({ en: "Near black", fr: "Presque noir", pt: "Quase preto" }),
    },
    {
      id: "charcoal",
      label: t3({ en: "Charcoal", fr: "Anthracite", pt: "Carvão" }),
    },
    { id: "soft", label: t3({ en: "Soft", fr: "Doux", pt: "Suave" }) },
    {
      id: "green-tinted",
      label: t3({ en: "Green-tinted", fr: "Teinté vert", pt: "Esverdeado" }),
    },
  ];
  const statusItems: Item<ThemeStatus>[] = [
    { id: "kit", label: t3({ en: "Default", fr: "Par défaut", pt: "Padrão" }) },
    {
      id: "brand-danger",
      label: t3({
        en: "Maroon danger",
        fr: "Danger bordeaux",
        pt: "Perigo bordô",
      }),
    },
  ];
  const darkPrimaryItems: Item<ThemeDarkPrimary>[] = [
    {
      id: "teal",
      label: t3({ en: "Teal", fr: "Sarcelle", pt: "Verde-azulado" }),
    },
    { id: "sky", label: t3({ en: "Sky", fr: "Ciel", pt: "Céu" }) },
  ];

  const radiusLabel = (r: Theme["radius"]) => `${r} px`;

  const summary = () =>
    [
      labelOf(rampItems, theme().ramp),
      labelOf(primaryItems, theme().primary),
      labelOf(inkItems, theme().ink),
      labelOf(statusItems, theme().status),
      labelOf(darkPrimaryItems, theme().darkPrimary),
      radiusLabel(theme().radius),
      percent(theme().density),
      percent(theme().textScale),
    ].join(" / ");

  return (
    <ModalContainer
      width="md"
      title={t3({ en: "Theme", fr: "Thème", pt: "Tema" })}
      subtitle={t3({
        en: "Applies on this device only. Figures keep their fixed colors.",
        fr: "S'applique uniquement à cet appareil. Les figures conservent leurs couleurs fixes.",
        pt: "Aplica-se apenas a este dispositivo. As figuras mantêm as suas cores fixas.",
      })}
      footer={
        <Button outline onClick={() => setTheme(DEFAULT_THEME)}>
          {t3({ en: "Reset", fr: "Réinitialiser", pt: "Repor" })}
        </Button>
      }
      actions={[{
        label: t3({ en: "Done", fr: "Terminé", pt: "Concluído" }),
        onClick: () => p.close(undefined),
      }]}
    >
      <div class="ui-spy">
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
            en: "Surface ramp",
            fr: "Gamme de surfaces",
            pt: "Gama de superfícies",
          })}
          items={rampItems}
          value={theme().ramp}
          onChange={(v) => update("ramp", v)}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Primary",
            fr: "Couleur principale",
            pt: "Cor principal",
          })}
          items={primaryItems}
          value={theme().primary}
          onChange={(v) => update("primary", v)}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Text ink",
            fr: "Encre du texte",
            pt: "Tinta do texto",
          })}
          items={inkItems}
          value={theme().ink}
          onChange={(v) => update("ink", v)}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Status colors",
            fr: "Couleurs d'état",
            pt: "Cores de estado",
          })}
          items={statusItems}
          value={theme().status}
          onChange={(v) => update("status", v)}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Dark mode primary",
            fr: "Couleur principale en mode sombre",
            pt: "Cor principal no modo escuro",
          })}
          items={darkPrimaryItems}
          value={theme().darkPrimary}
          onChange={(v) => update("darkPrimary", v)}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Corner rounding",
            fr: "Arrondi des coins",
            pt: "Arredondamento dos cantos",
          })}
          items={THEME_RADII.map((r) => ({
            id: String(r),
            label: radiusLabel(r),
          }))}
          value={String(theme().radius)}
          onChange={(v) => update("radius", stepOf(THEME_RADII, v))}
          fullWidth
        />
        <ButtonGroup
          label={t3({ en: "Density", fr: "Densité", pt: "Densidade" })}
          items={numericItems(THEME_DENSITIES, percent)}
          value={String(theme().density)}
          onChange={(v) => update("density", stepOf(THEME_DENSITIES, v))}
          fullWidth
        />
        <ButtonGroup
          label={t3({
            en: "Text size",
            fr: "Taille du texte",
            pt: "Tamanho do texto",
          })}
          items={numericItems(THEME_TEXT_SCALES, percent)}
          value={String(theme().textScale)}
          onChange={(v) => update("textScale", stepOf(THEME_TEXT_SCALES, v))}
          fullWidth
        />
        <div class="text-base-content-muted text-sm">{summary()}</div>
      </div>
    </ModalContainer>
  );
}
