import {
  FASTR_COVER_LAYOUTS,
  FASTR_FRAME_STYLES,
  fastrThemeIds,
  REPORT_BACKBONE_CHART_TYPES,
  REPORT_BACKBONE_COMPARISONS,
  REPORT_BACKBONE_FREQUENCIES,
  REPORT_BACKBONE_REGISTERS,
  REPORT_BACKBONE_WIDGETS,
  type ReportBackbone,
  type ReportBackboneChartType,
  type ReportBackboneFrequency,
  type ReportBackboneHeaderAttr,
  type ReportBackboneWidget,
  t3,
} from "lib";
import { Checkbox, Input, Select, TextArea } from "panther";
import { For, type JSX } from "solid-js";

// The review and edit form of a report backbone (lib/types/report_backbone.ts),
// inside the report style editor: every setting the AI read from the example,
// grouped as the backbone is (look, cover, length, structure, templates,
// blocks, charts, voice), each adjustable. Controlled: the editor holds the
// backbone and saves it with the style.

type Props = {
  value: ReportBackbone;
  onChange: (next: ReportBackbone) => void;
};

const DEFAULT_OPTION = "";

export function ReportBackboneFields(p: Props) {
  const b = () => p.value;
  const set = (patch: Partial<ReportBackbone>) =>
    p.onChange({ ...b(), ...patch });
  const header = (k: ReportBackboneHeaderAttr) => b().look.report?.[k] ?? "";
  const setHeader = (k: ReportBackboneHeaderAttr, v: string | undefined) => {
    const next = { ...(b().look.report ?? {}) };
    if (v === undefined || v.trim() === "") delete next[k];
    else next[k] = v;
    set({ look: { ...b().look, report: next } });
  };
  const num = (v: string): number | undefined => {
    const n = Number(v.trim());
    return v.trim() === "" || !Number.isFinite(n) ? undefined : n;
  };
  const list = (v: string, sep: RegExp) =>
    v.split(sep).map((s) => s.trim()).filter((s) => s.length > 0);

  const freqOptions = [
    {
      value: DEFAULT_OPTION,
      label: t3({
        en: "As the guide says",
        fr: "Par défaut",
        pt: "Por omissão",
      }),
    },
    ...REPORT_BACKBONE_FREQUENCIES.map((f) => ({
      value: f,
      label: {
        never: t3({ en: "Never", fr: "Jamais", pt: "Nunca" }),
        rare: t3({ en: "Rarely", fr: "Rarement", pt: "Raramente" }),
        normal: t3({ en: "Normally", fr: "Normalement", pt: "Normalmente" }),
        often: t3({ en: "Often", fr: "Souvent", pt: "Frequentemente" }),
      }[f],
    })),
  ];

  return (
    <div class="ui-spy">
      <Group title={t3({ en: "Look", fr: "Apparence", pt: "Aspeto" })}>
        <Select
          label={t3({ en: "Theme", fr: "Thème", pt: "Tema" })}
          value={b().look.theme ?? DEFAULT_OPTION}
          options={[
            {
              value: DEFAULT_OPTION,
              label: t3({
                en: "The report's own",
                fr: "Celui du rapport",
                pt: "O do relatório",
              }),
            },
            ...fastrThemeIds().map((id) => ({ value: id, label: id })),
          ]}
          onChange={(v) =>
            set({ look: { ...b().look, theme: v === "" ? undefined : v } })}
          fullWidth
        />
        <div class="flex flex-wrap gap-4">
          <Checkbox
            label={t3({
              en: "Numbered figures and tables",
              fr: "Figures et tableaux numérotés",
              pt: "Figuras e tabelas numeradas",
            })}
            checked={header("figures") === "numbered"}
            onChange={(c) => setHeader("figures", c ? "numbered" : undefined)}
          />
          <Checkbox
            label={t3({
              en: "Captions above figures",
              fr: "Légendes au-dessus",
              pt: "Legendas acima",
            })}
            checked={header("captions") === "above"}
            onChange={(c) => setHeader("captions", c ? "above" : undefined)}
          />
          <Checkbox
            label={t3({
              en: "Numbered sections",
              fr: "Sections numérotées",
              pt: "Secções numeradas",
            })}
            checked={b().structure?.numberedSections === true}
            onChange={(c) =>
              set({ structure: { ...b().structure, numberedSections: c } })}
          />
          <Checkbox
            label={t3({
              en: "Section headings as bars",
              fr: "Titres en bandeaux",
              pt: "Títulos em faixas",
            })}
            checked={header("sections") === "bar"}
            onChange={(c) => setHeader("sections", c ? "bar" : undefined)}
          />
          <Checkbox
            label={t3({
              en: "Whole caption bold in the accent",
              fr: "Légende entière en gras",
              pt: "Legenda inteira a negrito",
            })}
            checked={header("captionstyle") === "bold"}
            onChange={(c) => setHeader("captionstyle", c ? "bold" : undefined)}
          />
          <Checkbox
            label={t3({
              en: "Page numbers",
              fr: "Numéros de page",
              pt: "Números de página",
            })}
            checked={header("pagenumbers") !== "none"}
            onChange={(c) => setHeader("pagenumbers", c ? undefined : "none")}
          />
        </div>
        <Input
          label={t3({
            en: "Source line under every figure",
            fr: "Ligne de source sous chaque figure",
            pt: "Linha de fonte sob cada figura",
          })}
          value={header("source")}
          onChange={(v) => setHeader("source", v)}
          fullWidth
        />
        <Input
          label={t3({
            en: "Header on every page ({Place} {Period} {Year} {Issue})",
            fr: "En-tête de chaque page ({Place} {Period} {Year} {Issue})",
            pt: "Cabeçalho de cada página ({Place} {Period} {Year} {Issue})",
          })}
          value={header("header")}
          onChange={(v) => setHeader("header", v)}
          fullWidth
        />
        <Input
          label={t3({
            en: "Footer text (instead of the title)",
            fr: "Texte du pied de page (au lieu du titre)",
            pt: "Texto do rodapé (em vez do título)",
          })}
          value={header("footer")}
          onChange={(v) => setHeader("footer", v)}
          fullWidth
        />
        <div class="grid grid-cols-3 gap-3">
          <Select
            label={t3({ en: "Page frame", fr: "Cadre", pt: "Moldura" })}
            value={header("frame")}
            options={[
              {
                value: DEFAULT_OPTION,
                label: t3({ en: "None", fr: "Aucun", pt: "Nenhuma" }),
              },
              ...FASTR_FRAME_STYLES.map((f) => ({ value: f, label: f })),
            ]}
            onChange={(v) => setHeader("frame", v)}
            fullWidth
          />
          <Input
            label={t3({
              en: "Frame colour (and inner line's)",
              fr: "Couleur du cadre (et du filet intérieur)",
              pt: "Cor da moldura (e do filete interior)",
            })}
            value={header("framecolor")}
            onChange={(v) => setHeader("framecolor", v)}
            fullWidth
          />
          <Input
            label={t3({
              en: "Footer rule colours",
              fr: "Couleurs du filet",
              pt: "Cores do filete",
            })}
            value={header("footerrule")}
            onChange={(v) => setHeader("footerrule", v)}
            fullWidth
          />
        </div>
      </Group>

      <Group title={t3({ en: "Cover", fr: "Couverture", pt: "Capa" })}>
        <div class="grid grid-cols-3 gap-3">
          <Select
            label={t3({ en: "Layout", fr: "Mise en page", pt: "Disposição" })}
            value={b().cover?.layout ?? DEFAULT_OPTION}
            options={[
              {
                value: DEFAULT_OPTION,
                label: t3({
                  en: "The AI's choice",
                  fr: "Au choix de l'IA",
                  pt: "À escolha da IA",
                }),
              },
              ...FASTR_COVER_LAYOUTS.map((l) => ({ value: l, label: l })),
            ]}
            onChange={(v) =>
              set({
                cover: { ...b().cover, layout: v === "" ? undefined : v },
              })}
            fullWidth
          />
          <Input
            label={t3({ en: "Issue line", fr: "Numéro", pt: "Número" })}
            value={b().cover?.issue ?? ""}
            onChange={(v) =>
              set({ cover: { ...b().cover, issue: v || undefined } })}
            fullWidth
          />
          <Input
            label={t3({ en: "Date line", fr: "Date", pt: "Data" })}
            value={b().cover?.date ?? ""}
            onChange={(v) =>
              set({ cover: { ...b().cover, date: v || undefined } })}
            fullWidth
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <Select
            label={t3({
              en: "Cover background",
              fr: "Fond de la couverture",
              pt: "Fundo da capa",
            })}
            value={b().cover?.tone ?? DEFAULT_OPTION}
            options={[
              {
                value: DEFAULT_OPTION,
                label: t3({
                  en: "The AI's choice",
                  fr: "Au choix de l'IA",
                  pt: "À escolha da IA",
                }),
              },
              {
                value: "default",
                label: t3({
                  en: "White page",
                  fr: "Page blanche",
                  pt: "Página branca",
                }),
              },
              {
                value: "ink",
                label: t3({ en: "Dark", fr: "Sombre", pt: "Escuro" }),
              },
              {
                value: "accent",
                label: t3({
                  en: "Accent colour",
                  fr: "Couleur d'accent",
                  pt: "Cor de destaque",
                }),
              },
              {
                value: "paper",
                label: t3({ en: "Pale", fr: "Pâle", pt: "Claro" }),
              },
            ]}
            onChange={(v) =>
              set({ cover: { ...b().cover, tone: v === "" ? undefined : v } })}
            fullWidth
          />
          <Input
            label={t3({
              en: "Title box and issue strip colours",
              fr: "Couleurs du cadre du titre et du bandeau",
              pt: "Cores da caixa do título e da faixa",
            })}
            value={b().cover?.boxColor ?? ""}
            onChange={(v) =>
              set({ cover: { ...b().cover, boxColor: v.trim() || undefined } })}
            fullWidth
          />
        </div>
        <div class="flex flex-wrap gap-4">
          <Checkbox
            label={t3({
              en: "The cover is a page of its own",
              fr: "La couverture est une page entière",
              pt: "A capa é uma página inteira",
            })}
            checked={b().cover?.fill === true}
            onChange={(c) => set({ cover: { ...b().cover, fill: c } })}
          />
          <Checkbox
            label={t3({
              en: "Title in capitals",
              fr: "Titre en majuscules",
              pt: "Título em maiúsculas",
            })}
            checked={b().cover?.upperTitle === true}
            onChange={(c) =>
              set({ cover: { ...b().cover, upperTitle: c || undefined } })}
          />
          <Checkbox
            label={t3({
              en: "Sign-off at the right",
              fr: "Signature à droite",
              pt: "Assinatura à direita",
            })}
            checked={b().signoff?.right === true}
            onChange={(c) => {
              const so = b().signoff;
              if (so !== undefined) {
                set({ signoff: { ...so, right: c || undefined } });
              }
            }}
          />
        </div>
        <TextArea
          label={t3({
            en: "Masthead lines (one per line; logos go either side)",
            fr: "Lignes de l'en-tête officiel (une par ligne)",
            pt: "Linhas do cabeçalho oficial (uma por linha)",
          })}
          value={(b().cover?.masthead ?? []).join("\n")}
          onChange={(v) =>
            set({
              cover: {
                ...b().cover,
                masthead: list(v, /\n/).slice(0, 6),
              },
            })}
          rows={3}
          fullWidth
        />
        <Input
          label={t3({
            en: "Sign-off labels (comma separated)",
            fr: "Libellés des signataires (séparés par des virgules)",
            pt: "Rótulos dos signatários (separados por vírgulas)",
          })}
          value={(b().signoff?.labels ?? []).join(", ")}
          onChange={(v) => {
            const labels = list(v, /,/).slice(0, 3);
            set({
              signoff: labels.length === 0
                ? undefined
                : { ...b().signoff, labels },
            });
          }}
          fullWidth
        />
      </Group>

      <Group title={t3({ en: "Length", fr: "Longueur", pt: "Extensão" })}>
        <div class="grid grid-cols-5 gap-3">
          <Input
            label={t3({ en: "Pages from", fr: "Pages de", pt: "Páginas de" })}
            value={String(b().length?.pagesMin ?? "")}
            onChange={(v) =>
              set({ length: { ...b().length, pagesMin: num(v) } })}
            fullWidth
          />
          <Input
            label={t3({ en: "to", fr: "à", pt: "a" })}
            value={String(b().length?.pagesMax ?? "")}
            onChange={(v) =>
              set({ length: { ...b().length, pagesMax: num(v) } })}
            fullWidth
          />
          <Input
            label={t3({
              en: "Words a page",
              fr: "Mots par page",
              pt: "Palavras por página",
            })}
            value={String(b().length?.wordsPerPage ?? "")}
            onChange={(v) =>
              set({ length: { ...b().length, wordsPerPage: num(v) } })}
            fullWidth
          />
          <Input
            label={t3({
              en: "Words a chart",
              fr: "Mots par graphique",
              pt: "Palavras por gráfico",
            })}
            value={String(b().length?.wordsPerFigure ?? "")}
            onChange={(v) =>
              set({ length: { ...b().length, wordsPerFigure: num(v) } })}
            fullWidth
          />
          <Input
            label={t3({
              en: "Least page fill %",
              fr: "Remplissage minimal %",
              pt: "Preenchimento mínimo %",
            })}
            value={b().length?.minPageFill === undefined
              ? ""
              : String(Math.round(b().length!.minPageFill! * 100))}
            onChange={(v) => {
              const n = num(v);
              set({
                length: {
                  ...b().length,
                  minPageFill: n === undefined
                    ? undefined
                    : Math.min(0.9, Math.max(0.1, n / 100)),
                },
              });
            }}
            fullWidth
          />
        </div>
      </Group>

      <Group title={t3({ en: "Structure", fr: "Structure", pt: "Estrutura" })}>
        <TextArea
          label={t3({
            en: "Usual outline (one section per line: role: purpose)",
            fr: "Plan habituel (une section par ligne : rôle : objet)",
            pt: "Estrutura habitual (uma secção por linha: papel: objetivo)",
          })}
          value={(b().structure?.outline ?? []).map((o) =>
            `${o.role}: ${o.purpose}${o.repeat ? " (repeat)" : ""}`
          ).join("\n")}
          onChange={(v) =>
            set({
              structure: {
                ...b().structure,
                outline: list(v, /\n/).slice(0, 30).map((line) => {
                  const repeat = /\(repeat\)\s*$/.test(line);
                  const clean = line.replace(/\s*\(repeat\)\s*$/, "");
                  const at = clean.indexOf(":");
                  return {
                    role: (at < 0 ? clean : clean.slice(0, at)).trim().slice(
                      0,
                      80,
                    ),
                    purpose: (at < 0 ? "" : clean.slice(at + 1)).trim().slice(
                      0,
                      300,
                    ),
                    ...(repeat ? { repeat: true } : {}),
                  };
                }),
              },
            })}
          rows={5}
          fullWidth
        />
        <div class="grid grid-cols-2 gap-3">
          <Input
            label={t3({
              en: "Lead-in after each figure",
              fr: "Amorce après chaque figure",
              pt: "Abertura após cada figura",
            })}
            value={b().structure?.figureLeadIn ?? ""}
            onChange={(v) => set({
              structure: { ...b().structure, figureLeadIn: v || undefined },
            })}
            fullWidth
          />
          <Checkbox
            label={t3({
              en: "One figure and its analysis per section",
              fr: "Une figure et son analyse par section",
              pt: "Uma figura e a sua análise por secção",
            })}
            checked={b().structure?.oneFigurePerSection === true}
            onChange={(c) =>
              set({ structure: { ...b().structure, oneFigurePerSection: c } })}
          />
        </div>
        {
          /* Unticked says the example departs from the format's default; the
            default itself is stored as absent. */
        }
        <div class="flex flex-wrap gap-4">
          <For each={STRUCTURE_DEFAULT_ON}>
            {(f) => (
              <Checkbox
                label={f.label()}
                checked={b().structure?.[f.key] !== false}
                onChange={(c) =>
                  set({
                    structure: {
                      ...b().structure,
                      [f.key]: c ? undefined : false,
                    },
                  })}
              />
            )}
          </For>
          <Checkbox
            label={t3({
              en: "Justified text",
              fr: "Texte justifié",
              pt: "Texto justificado",
            })}
            checked={b().structure?.justified === true}
            onChange={(c) =>
              set({
                structure: { ...b().structure, justified: c || undefined },
              })}
          />
        </div>
      </Group>

      <Group
        title={t3({
          en: "Page templates and blocks",
          fr: "Modèles de page et blocs",
          pt: "Modelos de página e blocos",
        })}
      >
        <Select
          label={t3({
            en: "Page templates",
            fr: "Modèles de page",
            pt: "Modelos de página",
          })}
          value={b().templates?.use ?? DEFAULT_OPTION}
          options={freqOptions}
          onChange={(v) =>
            set({
              templates: {
                ...b().templates,
                use: v === "" ? undefined : v as ReportBackboneFrequency,
              },
            })}
          fullWidth
        />
        <div class="grid grid-cols-3 gap-3">
          <For each={[...REPORT_BACKBONE_WIDGETS]}>
            {(w: ReportBackboneWidget) => (
              <Select
                label={w}
                value={b().widgets?.[w] ?? DEFAULT_OPTION}
                options={freqOptions}
                size="sm"
                onChange={(v) => {
                  const next = { ...(b().widgets ?? {}) };
                  if (v === "") delete next[w];
                  else next[w] = v as ReportBackboneFrequency;
                  set({ widgets: next });
                }}
                fullWidth
              />
            )}
          </For>
        </div>
      </Group>

      <Group title={t3({ en: "Charts", fr: "Graphiques", pt: "Gráficos" })}>
        <Input
          label={t3({
            en: `Preferred types, in order (${
              REPORT_BACKBONE_CHART_TYPES.join(", ")
            })`,
            fr: `Types préférés, dans l'ordre (${
              REPORT_BACKBONE_CHART_TYPES.join(", ")
            })`,
            pt: `Tipos preferidos, por ordem (${
              REPORT_BACKBONE_CHART_TYPES.join(", ")
            })`,
          })}
          value={(b().charts?.preferred ?? []).join(", ")}
          onChange={(v) =>
            set({
              charts: {
                ...b().charts,
                preferred: list(v, /,/).filter((t) =>
                  (REPORT_BACKBONE_CHART_TYPES as readonly string[]).includes(
                    t,
                  )
                ) as ReportBackboneChartType[],
              },
            })}
          fullWidth
        />
        <div class="grid grid-cols-2 gap-3">
          <Input
            label={t3({
              en: "Broken down",
              fr: "Ventilé",
              pt: "Desagregado",
            })}
            value={b().charts?.breakdown ?? ""}
            onChange={(v) =>
              set({ charts: { ...b().charts, breakdown: v || undefined } })}
            fullWidth
          />
          <Select
            label={t3({
              en: "Compared with",
              fr: "Comparé à",
              pt: "Comparado com",
            })}
            value={b().charts?.comparison ?? DEFAULT_OPTION}
            options={[
              {
                value: DEFAULT_OPTION,
                label: t3({ en: "—", fr: "—", pt: "—" }),
              },
              ...REPORT_BACKBONE_COMPARISONS.map((c) => ({
                value: c,
                label: {
                  none: t3({ en: "Nothing", fr: "Rien", pt: "Nada" }),
                  same_period_last_year: t3({
                    en: "Same period last year",
                    fr: "Même période l'an dernier",
                    pt: "Mesmo período do ano anterior",
                  }),
                  trend: t3({
                    en: "A trend",
                    fr: "Une tendance",
                    pt: "Uma tendência",
                  }),
                }[c],
              })),
            ]}
            onChange={(v) =>
              set({
                charts: {
                  ...b().charts,
                  comparison: v === ""
                    ? undefined
                    : v as (typeof REPORT_BACKBONE_COMPARISONS)[number],
                },
              })}
            fullWidth
          />
        </div>
      </Group>

      <Group title={t3({ en: "Voice", fr: "Ton", pt: "Tom" })}>
        <div class="grid grid-cols-2 gap-3">
          <Input
            label={t3({
              en: "Language (e.g. fr)",
              fr: "Langue (ex. fr)",
              pt: "Língua (ex. pt)",
            })}
            value={b().voice?.language ?? ""}
            onChange={(v) =>
              set({
                voice: { ...b().voice, language: v.trim() || undefined },
              })}
            fullWidth
          />
          <Select
            label={t3({ en: "Register", fr: "Registre", pt: "Registo" })}
            value={b().voice?.register ?? DEFAULT_OPTION}
            options={[
              { value: DEFAULT_OPTION, label: "—" },
              ...REPORT_BACKBONE_REGISTERS.map((r) => ({
                value: r,
                label: {
                  formal: t3({ en: "Formal", fr: "Formel", pt: "Formal" }),
                  plain: t3({ en: "Plain", fr: "Simple", pt: "Simples" }),
                  technical: t3({
                    en: "Technical",
                    fr: "Technique",
                    pt: "Técnico",
                  }),
                }[r],
              })),
            ]}
            onChange={(v) =>
              set({
                voice: {
                  ...b().voice,
                  register: v === ""
                    ? undefined
                    : v as (typeof REPORT_BACKBONE_REGISTERS)[number],
                },
              })}
            fullWidth
          />
        </div>
        <TextArea
          label={t3({
            en: "Notes for the AI (how this style reads)",
            fr: "Notes pour l'IA (comment ce style se lit)",
            pt: "Notas para a IA (como este estilo se lê)",
          })}
          value={b().voice?.notes ?? ""}
          onChange={(v) =>
            set({ voice: { ...b().voice, notes: v || undefined } })}
          rows={4}
          fullWidth
        />
      </Group>
    </div>
  );
}

// The structure's yes-by-default traits, which an example may lack.
const STRUCTURE_DEFAULT_ON: {
  key: "headings" | "introduction" | "conclusion" | "figureIntro";
  label: () => string;
}[] = [
  {
    key: "headings",
    label: () =>
      t3({
        en: "Section headings",
        fr: "Titres de section",
        pt: "Títulos de secção",
      }),
  },
  {
    key: "introduction",
    label: () =>
      t3({
        en: "An introduction",
        fr: "Une introduction",
        pt: "Uma introdução",
      }),
  },
  {
    key: "conclusion",
    label: () =>
      t3({ en: "A conclusion", fr: "Une conclusion", pt: "Uma conclusão" }),
  },
  {
    key: "figureIntro",
    label: () =>
      t3({
        en: "A sentence introduces each figure",
        fr: "Une phrase annonce chaque figure",
        pt: "Uma frase anuncia cada figura",
      }),
  },
];

function Group(p: { title: string; children: JSX.Element }) {
  return (
    <div class="ui-spy-sm rounded border p-3">
      <div class="ui-label">{p.title}</div>
      {p.children}
    </div>
  );
}
