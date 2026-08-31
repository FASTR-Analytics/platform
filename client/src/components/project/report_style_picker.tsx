import {
  type ReportCustomStyle,
  type ReportHtmlStyle,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  Icon,
  ModalContainer,
  StateHolderFormError,
  type StateHolderFormAction,
} from "panther";
import { createSignal, For, onMount, Show } from "solid-js";
import { serverActions } from "~/server_actions";

// Step 2 of the create-report wizard for HTML reports (project_reports.tsx owns
// the loop — panther has ONE alert slot, so this modal cannot stack on the
// form; the form closes with a draft and this opens next). Tile grid of every
// style preset with a hand-authored CSS mini-report mockup per tile — a
// deliberate impression of each design language (the real output is
// AI-generated per report), in the real Google Fonts, with greeked bars for
// body text so tiles stay language-neutral. Create happens HERE (style is
// fixed at creation); Back returns {back} so the wizard reopens the form.

export type ReportStylePickerResult =
  | { newReportId: string }
  | { back: true }
  // Open the style editor (new when style is absent) — the wizard loop in
  // project_reports.tsx runs it and re-opens this picker after.
  | { editStyle: { style?: ReportCustomStyle } };

type Sel =
  | { kind: "preset"; value: ReportHtmlStyle }
  | { kind: "custom"; style: ReportCustomStyle };

type Props = AlertComponentProps<
  { projectId: string; label: string; folderId: string | null },
  ReportStylePickerResult
>;

export const STYLE_OPTIONS: {
  value: ReportHtmlStyle;
  label: () => string;
  description: () => string;
}[] = [
  {
    value: "default",
    label: () => t3({ en: "Platform default", fr: "Style par défaut", pt: "Estilo padrão" }),
    description: () =>
      t3({
        en: "Plain white page; the AI keeps styling minimal.",
        fr: "Page blanche sobre ; l'IA garde une mise en forme minimale.",
        pt: "Página branca simples; a IA mantém a formatação mínima.",
      }),
  },
  {
    value: "minimal",
    label: () => t3({ en: "Minimal", fr: "Minimal", pt: "Minimalista" }),
    description: () =>
      t3({
        en: "Generous whitespace, hairline rules, one quiet accent — no boxes.",
        fr: "Beaucoup d'espace, filets fins, un seul accent discret — sans encadrés.",
        pt: "Muito espaço em branco, filetes finos, um acento discreto — sem caixas.",
      }),
  },
  {
    value: "corporate",
    label: () => t3({ en: "Corporate", fr: "Institutionnel", pt: "Corporativo" }),
    description: () =>
      t3({
        en: "Navy headings, KPI band, blue-ruled sections — the briefing classic.",
        fr: "Titres marine, bandeau d'indicateurs, sections soulignées de bleu.",
        pt: "Títulos azul-marinho, faixa de KPIs, secções com regra azul.",
      }),
  },
  {
    value: "ministry",
    label: () => t3({ en: "Ministry", fr: "Ministériel", pt: "Ministerial" }),
    description: () =>
      t3({
        en: "Formal government document — centered title, numbered sections, ruled tables.",
        fr: "Document officiel — titre centré, sections numérotées, tableaux à filets.",
        pt: "Documento oficial — título centrado, secções numeradas, tabelas com grelha.",
      }),
  },
  {
    value: "classic",
    label: () => t3({ en: "Classic", fr: "Classique", pt: "Clássico" }),
    description: () =>
      t3({
        en: "Serif prose, numbered figures, footnoted sources — a well-set report.",
        fr: "Prose en serif, figures numérotées, sources en notes — un rapport soigné.",
        pt: "Prosa serifada, figuras numeradas, fontes em notas — um relatório cuidado.",
      }),
  },
  {
    value: "executive",
    label: () => t3({ en: "Executive", fr: "Exécutif", pt: "Executivo" }),
    description: () =>
      t3({
        en: "Compact and decision-oriented — stat tiles, tight columns, action list.",
        fr: "Compact et orienté décision — tuiles de chiffres, colonnes serrées, actions.",
        pt: "Compacto e orientado à decisão — mosaicos de números, colunas densas, ações.",
      }),
  },
  {
    value: "clinical",
    label: () => t3({ en: "Clinical", fr: "Clinique", pt: "Clínico" }),
    description: () =>
      t3({
        en: "Calm teal accents, key-message panels, status pills — public-health idiom.",
        fr: "Accents sarcelle, encadrés de messages clés, pastilles de statut.",
        pt: "Acentos verde-azulado, painéis de mensagens-chave, etiquetas de estado.",
      }),
  },
  {
    value: "editorial",
    label: () => t3({ en: "Editorial", fr: "Éditorial", pt: "Editorial" }),
    description: () =>
      t3({
        en: "Magazine-style briefing — masthead, cards, badges, stat strips.",
        fr: "Style magazine — manchette, cartes, badges, bandeaux de chiffres.",
        pt: "Estilo revista — cabeçalho, cartões, distintivos, faixas de números.",
      }),
  },
  {
    value: "swiss",
    label: () => t3({ en: "Swiss / International", fr: "Suisse / International", pt: "Suíço / Internacional" }),
    description: () =>
      t3({
        en: "Strict grid, huge headlines, one red accent, nothing decorative.",
        fr: "Grille stricte, très grands titres, un seul accent rouge, aucun décor.",
        pt: "Grelha rigorosa, títulos enormes, um único vermelho, nada decorativo.",
      }),
  },
  {
    value: "monochrome",
    label: () => t3({ en: "Monochrome ink", fr: "Encre monochrome", pt: "Tinta monocromática" }),
    description: () =>
      t3({
        en: "Pure black on white — your charts become the only color on the page.",
        fr: "Noir pur sur blanc — vos graphiques deviennent la seule couleur de la page.",
        pt: "Preto puro sobre branco — os gráficos tornam-se a única cor da página.",
      }),
  },
];

// Loaded once, on first modal open; cached by the browser after that. Only the
// weights the tiles actually render.
const FONTS_LINK_ID = "report-style-picker-fonts";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=IBM+Plex+Sans&family=IBM+Plex+Sans+Condensed:wght@700&family=Inter:wght@400;700;800;900&family=Libre+Franklin:wght@300;900&family=Public+Sans:wght@400;700&family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,700&display=swap";

function ensureFonts() {
  if (document.getElementById(FONTS_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONTS_LINK_ID;
  link.rel = "stylesheet";
  link.href = FONTS_HREF;
  document.head.appendChild(link);
}

// One shared skeleton; each style re-skins (and hides parts of) it via CSS.
// Real text only where the typeface matters (title, stat); bars elsewhere.
function StyleMock(p: { style: ReportHtmlStyle }) {
  return (
    <div class={`rsp rsp-${p.style}`} aria-hidden="true">
      <div class="rsp-page">
        <i class="rsp-seal" />
        <div class="rsp-eyebrow">2026 · 08</div>
        <div class="rsp-title">
          {t3({ en: "Report", fr: "Rapport", pt: "Relatório" })}
        </div>
        <i class="rsp-rule" />
        <div class="rsp-body">
          <div class="rsp-col">
            <i class="rsp-bar" style={{ width: "92%" }} />
            <i class="rsp-bar" style={{ width: "78%" }} />
            <i class="rsp-bar" style={{ width: "85%" }} />
            <i class="rsp-bar" style={{ width: "60%" }} />
          </div>
          <div class="rsp-stat">84%</div>
        </div>
        <div class="rsp-chart">
          <i style={{ height: "45%" }} />
          <i style={{ height: "72%" }} />
          <i style={{ height: "58%" }} />
          <i style={{ height: "90%" }} />
          <i style={{ height: "65%" }} />
        </div>
        <div class="rsp-table">
          <i class="rsp-th" />
          <i class="rsp-tr" />
          <i class="rsp-tr" />
        </div>
      </div>
    </div>
  );
}

// A custom style's tile: the generic skeleton skinned by the style's three
// stored colors (page/ink/accent) via CSS custom properties.
function CustomStyleMock(p2: { style: ReportCustomStyle }) {
  const c = p2.style.colors;
  return (
    <div
      class="rsp rsp-customx"
      aria-hidden="true"
      style={c
        ? { "--ct-page": c.page, "--ct-ink": c.ink, "--ct-accent": c.accent }
        : undefined}
    >
      <div class="rsp-page">
        <i class="rsp-seal" />
        <div class="rsp-eyebrow">2026 · 08</div>
        <div class="rsp-title">
          {t3({ en: "Report", fr: "Rapport", pt: "Relatório" })}
        </div>
        <i class="rsp-rule" />
        <div class="rsp-body">
          <div class="rsp-col">
            <i class="rsp-bar" style={{ width: "92%" }} />
            <i class="rsp-bar" style={{ width: "78%" }} />
            <i class="rsp-bar" style={{ width: "85%" }} />
            <i class="rsp-bar" style={{ width: "60%" }} />
          </div>
          <div class="rsp-stat">84%</div>
        </div>
        <div class="rsp-chart">
          <i style={{ height: "45%" }} />
          <i style={{ height: "72%" }} />
          <i style={{ height: "58%" }} />
          <i style={{ height: "90%" }} />
          <i style={{ height: "65%" }} />
        </div>
        <div class="rsp-table">
          <i class="rsp-th" />
          <i class="rsp-tr" />
          <i class="rsp-tr" />
        </div>
      </div>
    </div>
  );
}

// Hand-authored impressions of each design language (see the AI briefs in
// lib/ai_tools/build_system_prompt.ts REPORT_STYLE_BRIEFS — palettes and type
// choices mirror them). Tuning a tile = editing its block here.
const MOCK_CSS = `
.rsp{aspect-ratio:4/3;overflow:hidden;border-radius:4px;border:1px solid var(--color-base-300);pointer-events:none;}
.rsp-page{height:100%;padding:12px 14px;background:#fff;color:#222;font-family:system-ui,sans-serif;display:flex;flex-direction:column;gap:6px;}
.rsp i{display:block;flex:none;}
.rsp-seal{display:none;}
.rsp-eyebrow{font-size:6.5px;letter-spacing:.12em;color:#999;}
.rsp-title{font-size:17px;font-weight:700;line-height:1.05;}
.rsp-rule{height:1px;background:#ddd;}
.rsp-body{display:flex;gap:10px;align-items:flex-start;}
.rsp-col{flex:1;display:flex;flex-direction:column;gap:4px;padding-top:2px;}
.rsp-bar{height:3.5px;background:#c9c9c9;border-radius:1px;}
.rsp-stat{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;}
.rsp-chart{flex:1;min-height:26px;display:flex;gap:4px;align-items:flex-end;padding:2px 0;}
.rsp-chart i{flex:1;background:#9db8cc;border-radius:1px 1px 0 0;}
.rsp-table{display:flex;flex-direction:column;gap:2.5px;}
.rsp-th{height:5px;background:#e3e3e3;}
.rsp-tr{height:3px;background:#efefef;}

.rsp-minimal .rsp-page{font-family:'Inter',system-ui,sans-serif;color:#1B2430;gap:8px;padding:16px;}
.rsp-minimal .rsp-eyebrow{color:#5C6672;}
.rsp-minimal .rsp-title{font-size:15px;font-weight:700;}
.rsp-minimal .rsp-rule{height:1px;background:#E5E8EC;}
.rsp-minimal .rsp-bar{background:#E5E8EC;}
.rsp-minimal .rsp-stat{color:#3B5B7E;font-weight:700;}
.rsp-minimal .rsp-chart i{background:#3B5B7E;border-radius:1px;}
.rsp-minimal .rsp-th{background:#D7DDE3;height:3px;}.rsp-minimal .rsp-tr{background:#EFF1F4;}

.rsp-corporate .rsp-page{font-family:'Source Sans 3',system-ui,sans-serif;color:#222B36;}
.rsp-corporate .rsp-eyebrow{color:#5C6672;}
.rsp-corporate .rsp-title{color:#1F4E79;font-weight:700;font-size:16px;}
.rsp-corporate .rsp-rule{height:3px;background:#2E75B6;}
.rsp-corporate .rsp-body{background:#EEF3F8;border-top:3px solid #1F4E79;border-radius:3px;padding:6px 8px;}
.rsp-corporate .rsp-bar{background:#C9D7E4;}
.rsp-corporate .rsp-stat{color:#1F4E79;font-weight:700;}
.rsp-corporate .rsp-chart i{background:#2E75B6;}
.rsp-corporate .rsp-th{background:#1F4E79;}.rsp-corporate .rsp-tr{background:#E4ECF3;}

.rsp-ministry .rsp-page{font-family:'Source Sans 3',system-ui,sans-serif;color:#1A1A1A;align-items:center;text-align:center;}
.rsp-ministry .rsp-eyebrow{color:#555;letter-spacing:.2em;}
.rsp-ministry .rsp-title{font-family:'Source Serif 4',Georgia,serif;color:#0F2B46;font-weight:700;font-size:14.5px;border-top:1px solid #0F2B46;border-bottom:1px solid #0F2B46;padding:3px 12px;box-shadow:0 3px 0 -2px #0F2B46, 0 -3px 0 -2px #0F2B46;}
.rsp-ministry .rsp-rule{display:none;}
.rsp-ministry .rsp-body{width:100%;text-align:left;}
.rsp-ministry .rsp-bar{background:#D8D8D8;}
.rsp-ministry .rsp-stat{font-family:'Source Serif 4',serif;color:#0F2B46;}
.rsp-ministry .rsp-chart{width:100%;border:1px solid #8A8A8A;padding:3px 5px;}
.rsp-ministry .rsp-chart i{background:#0F2B46;border-radius:0;}
.rsp-ministry .rsp-table{width:100%;border:1px solid #8A8A8A;padding:2px;gap:2px;}
.rsp-ministry .rsp-th{background:#B9BFC6;}.rsp-ministry .rsp-tr{background:#E9EBED;}

.rsp-classic .rsp-page{font-family:'Source Serif 4',Georgia,serif;color:#2B2B2B;gap:7px;}
.rsp-classic .rsp-eyebrow{font-variant:small-caps;letter-spacing:.14em;color:#666;}
.rsp-classic .rsp-title{font-weight:700;font-size:15px;}
.rsp-classic .rsp-rule{height:1px;background:#CCC;}
.rsp-classic .rsp-bar{background:#DDD;height:3px;}
.rsp-classic .rsp-stat{color:#7B2D26;}
.rsp-classic .rsp-chart{border-top:1px solid #CCC;border-bottom:1px solid #CCC;padding:4px 8px;}
.rsp-classic .rsp-chart i{background:#5A5A5A;border-radius:0;}
.rsp-classic .rsp-th{background:#CCC;height:2px;}.rsp-classic .rsp-tr{background:#EBEBEB;}

.rsp-executive .rsp-page{font-family:'Inter',system-ui,sans-serif;color:#1E293B;gap:5px;padding:11px 13px;}
.rsp-executive .rsp-eyebrow{color:#64748B;font-weight:700;}
.rsp-executive .rsp-title{font-weight:800;font-size:14px;}
.rsp-executive .rsp-rule{display:none;}
.rsp-executive .rsp-body{background:#E8F4F6;border-left:2.5px solid #0E7490;padding:5px 8px;border-radius:2px;}
.rsp-executive .rsp-bar{background:#CBD5E1;height:3px;}
.rsp-executive .rsp-stat{font-weight:800;color:#0E7490;font-size:16px;}
.rsp-executive .rsp-chart{min-height:20px;}
.rsp-executive .rsp-chart i{background:#0E7490;}
.rsp-executive .rsp-th{background:#1E293B;height:3px;}.rsp-executive .rsp-tr{background:#EDF1F5;}

.rsp-clinical .rsp-page{font-family:'Public Sans',system-ui,sans-serif;color:#21303A;}
.rsp-clinical .rsp-eyebrow{color:#5B6B76;}
.rsp-clinical .rsp-title{color:#0F766E;font-weight:700;font-size:15px;border-left:3.5px solid #0F766E;padding-left:7px;}
.rsp-clinical .rsp-rule{height:1px;background:#DCE4E8;}
.rsp-clinical .rsp-body{background:#E6F2F0;border-left:3px solid #0F766E;border-radius:2px;padding:5px 8px;}
.rsp-clinical .rsp-bar{background:#CBD9D6;}
.rsp-clinical .rsp-stat{color:#0F766E;font-weight:700;}
.rsp-clinical .rsp-chart i{background:#0F766E;}
.rsp-clinical .rsp-th{background:#BFD8D4;}.rsp-clinical .rsp-tr{background:#EAF3F1;}

.rsp-editorial .rsp-page{background:#E9EEF3;color:#0F2130;font-family:'IBM Plex Sans',system-ui,sans-serif;}
.rsp-editorial .rsp-eyebrow{font-family:'IBM Plex Mono',monospace;color:#8A98A5;}
.rsp-editorial .rsp-title{font-family:'IBM Plex Sans Condensed',sans-serif;letter-spacing:-.01em;}
.rsp-editorial .rsp-rule{display:none;}
.rsp-editorial .rsp-body,.rsp-editorial .rsp-table{background:#fff;border:1px solid #C9D5DF;border-radius:4px;padding:5px 7px;}
.rsp-editorial .rsp-body{border-top:2.5px solid #14685A;}
.rsp-editorial .rsp-stat{font-family:'IBM Plex Mono',monospace;color:#B03F35;}
.rsp-editorial .rsp-chart{background:#fff;border:1px solid #C9D5DF;border-radius:4px;padding:4px 6px;}
.rsp-editorial .rsp-chart i{background:#2A6FA8;}
.rsp-editorial .rsp-bar{background:#C9D5DF;}
.rsp-editorial .rsp-th{background:#DDE5EC;}.rsp-editorial .rsp-tr{background:#EDF1F5;}

.rsp-swiss .rsp-page{font-family:'Inter',system-ui,sans-serif;color:#111;gap:7px;}
.rsp-swiss .rsp-eyebrow{color:#E30613;font-weight:700;letter-spacing:.08em;}
.rsp-swiss .rsp-title{font-size:21px;font-weight:900;letter-spacing:-.03em;}
.rsp-swiss .rsp-rule{height:4px;background:#E30613;width:38%;}
.rsp-swiss .rsp-bar{background:#ddd;border-radius:0;}
.rsp-swiss .rsp-stat{font-weight:900;font-size:16px;}
.rsp-swiss .rsp-chart i{background:#111;border-radius:0;}
.rsp-swiss .rsp-chart i:nth-child(4){background:#E30613;}
.rsp-swiss .rsp-th{background:#111;height:3px;}.rsp-swiss .rsp-tr{background:#e6e6e6;}

.rsp-monochrome .rsp-page{font-family:'Libre Franklin',sans-serif;color:#000;gap:7px;}
.rsp-monochrome .rsp-eyebrow{color:#666;}
.rsp-monochrome .rsp-title{font-weight:900;font-size:19px;background:#000;color:#fff;padding:1px 6px;align-self:flex-start;}
.rsp-monochrome .rsp-rule{height:3px;background:#000;}
.rsp-monochrome .rsp-bar{background:#dcdcdc;border-radius:0;}
.rsp-monochrome .rsp-stat{font-weight:900;font-size:16px;}
.rsp-monochrome .rsp-chart i{background:#000;border-radius:0;}
.rsp-monochrome .rsp-th{background:#000;}.rsp-monochrome .rsp-tr{background:#e8e8e8;}

.rsp-customx .rsp-page{background:var(--ct-page,#fff);color:var(--ct-ink,#222);}
.rsp-customx .rsp-eyebrow{color:color-mix(in srgb,var(--ct-ink,#222) 55%,var(--ct-page,#fff));}
.rsp-customx .rsp-rule{background:var(--ct-accent,#888);height:2.5px;}
.rsp-customx .rsp-bar{background:color-mix(in srgb,var(--ct-ink,#222) 22%,var(--ct-page,#fff));}
.rsp-customx .rsp-stat{color:var(--ct-accent,#555);}
.rsp-customx .rsp-chart i{background:var(--ct-accent,#9db8cc);}
.rsp-customx .rsp-th{background:color-mix(in srgb,var(--ct-ink,#222) 35%,var(--ct-page,#fff));}
.rsp-customx .rsp-tr{background:color-mix(in srgb,var(--ct-ink,#222) 12%,var(--ct-page,#fff));}
`;

export function ReportStylePicker(p: Props) {
  const [selected, setSelected] = createSignal<Sel | undefined>();
  const [customStyles, setCustomStyles] = createSignal<ReportCustomStyle[]>([]);
  const [saveState, setSaveState] = createSignal<StateHolderFormAction>({
    status: "ready",
  });

  onMount(() => {
    ensureFonts();
    void (async () => {
      const res = await serverActions.listReportStyles({
        projectId: p.projectId,
      });
      if (res.success) setCustomStyles(res.data);
    })();
  });

  function isSelected(sel: Sel): boolean {
    const cur = selected();
    if (!cur) return false;
    if (cur.kind === "preset" && sel.kind === "preset") {
      return cur.value === sel.value;
    }
    if (cur.kind === "custom" && sel.kind === "custom") {
      return cur.style.id === sel.style.id;
    }
    return false;
  }

  async function create(sel: Sel | undefined) {
    if (!sel || saveState().status === "loading") return;
    setSaveState({ status: "loading" });
    const res = await serverActions.createReport({
      projectId: p.projectId,
      label: p.label,
      folderId: p.folderId,
      format: "html",
      htmlStyle: sel.kind === "preset" ? sel.value : undefined,
      customStyleId: sel.kind === "custom" ? sel.style.id : undefined,
    });
    if (!res.success) {
      setSaveState({ status: "error", err: res.err });
      return;
    }
    p.close({ newReportId: res.data.reportId });
  }

  return (
    <ModalContainer
      width="2xl"
      title={t3({
        en: `Choose a style for “${p.label}”`,
        fr: `Choisissez un style pour « ${p.label} »`,
        pt: `Escolha um estilo para “${p.label}”`,
      })}
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            intent="success"
            iconName="plus"
            disabled={selected() === undefined}
            state={saveState()}
            onClick={() => void create(selected())}
          >
            {t3({ en: "Create report", fr: "Créer le rapport", pt: "Criar relatório" })}
          </Button>,
          <Button
            outline
            intent="neutral"
            iconName="chevronLeft"
            onClick={() => p.close({ back: true })}
          >
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>,
        ]
      }
    >
      <style>{MOCK_CSS}</style>
      <div class="ui-spy-sm">
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "The style guides how the AI designs this report — fixed at creation. Previews are an impression of each style; the AI writes the real layout.",
            fr: "Le style guide la conception du rapport par l'IA — fixé à la création. Les aperçus donnent une impression de chaque style ; l'IA écrit la mise en page réelle.",
            pt: "O estilo orienta como a IA desenha este relatório — fixado na criação. As pré-visualizações são uma impressão de cada estilo; a IA escreve o layout real.",
          })}
        </div>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <For each={STYLE_OPTIONS}>
            {(opt) => {
              const sel: Sel = { kind: "preset", value: opt.value };
              return (
                <button
                  type="button"
                  class="ui-focusable group rounded-md p-1.5 text-left"
                  classList={{
                    "ring-primary ring-2": isSelected(sel),
                    "hover:bg-base-200": !isSelected(sel),
                  }}
                  onClick={() => setSelected(sel)}
                  onDblClick={() => void create(sel)}
                >
                  <StyleMock style={opt.value} />
                  <div class="text-base-content mt-1.5 text-sm font-semibold">
                    {opt.label()}
                  </div>
                  <div class="text-base-content-muted text-xs leading-snug">
                    {opt.description()}
                  </div>
                </button>
              );
            }}
          </For>
          <For each={customStyles()}>
            {(style) => {
              const sel: Sel = { kind: "custom", style };
              return (
                <button
                  type="button"
                  class="ui-focusable group relative rounded-md p-1.5 text-left"
                  classList={{
                    "ring-primary ring-2": isSelected(sel),
                    "hover:bg-base-200": !isSelected(sel),
                  }}
                  onClick={() => setSelected(sel)}
                  onDblClick={() => void create(sel)}
                >
                  <CustomStyleMock style={style} />
                  <div class="text-base-content mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
                    <span class="min-w-0 truncate">{style.label}</span>
                    <span class="bg-base-300 text-base-content rounded px-1 text-[10px] font-normal">
                      {t3({ en: "custom", fr: "perso", pt: "próprio" })}
                    </span>
                    <Show when={style.referenceCss}>
                      {/* Carries the source report's stylesheet — high fidelity. */}
                      <span
                        class="bg-success/15 text-success rounded px-1 text-[10px] font-normal"
                        title={t3({
                          en: "Includes the source report's exact stylesheet",
                          fr: "Inclut la feuille de style exacte du rapport source",
                          pt: "Inclui a folha de estilos exata do relatório de origem",
                        })}
                      >
                        CSS
                      </span>
                    </Show>
                  </div>
                  <div class="text-base-content-muted text-xs leading-snug">
                    {style.description}
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    class="bg-base-100 hover:bg-base-200 absolute top-3 right-3 rounded border p-1"
                    title={t3({ en: "Edit style", fr: "Modifier le style", pt: "Editar estilo" })}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.close({ editStyle: { style } });
                    }}
                  >
                    <Icon iconName="pencil" class="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            }}
          </For>
          <button
            type="button"
            class="ui-focusable border-base-300 text-base-content-muted hover:bg-base-200 flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-1.5"
            onClick={() => p.close({ editStyle: {} })}
          >
            <Icon iconName="plus" class="h-6 w-6" />
            <span class="text-sm font-semibold">
              {t3({ en: "New custom style", fr: "Nouveau style personnalisé", pt: "Novo estilo personalizado" })}
            </span>
            <span class="px-3 text-center text-xs leading-snug">
              {t3({
                en: "Write your own design brief, or start from a preset's",
                fr: "Écrivez votre propre guide de style, ou partez d'un préréglage",
                pt: "Escreva o seu próprio guia de estilo, ou parta de uma predefinição",
              })}
            </span>
          </button>
        </div>
        <StateHolderFormError state={saveState()} />
      </div>
    </ModalContainer>
  );
}
