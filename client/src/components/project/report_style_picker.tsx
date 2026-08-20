import {
  type ReportHtmlStyle,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  ModalContainer,
  StateHolderFormError,
  type StateHolderFormAction,
} from "panther";
import { createSignal, For, onMount } from "solid-js";
import { serverActions } from "~/server_actions";

// Step 2 of the create-report wizard for HTML reports (project_reports.tsx owns
// the loop — panther has ONE alert slot, so this modal cannot stack on the
// form; the form closes with a draft and this opens next). Tile grid of every
// style preset with a hand-authored CSS mini-report mockup per tile — a
// deliberate impression of each design language (the real output is
// AI-generated per report), in the real Google Fonts, with greeked bars for
// body text so tiles stay language-neutral. Create happens HERE (style is
// fixed at creation); Back returns {back} so the wizard reopens the form.

export type ReportStylePickerResult = { newReportId: string } | { back: true };

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
    value: "bauhaus",
    label: () => t3({ en: "Bauhaus", fr: "Bauhaus", pt: "Bauhaus" }),
    description: () =>
      t3({
        en: "Primary-color geometry — blocks, circles and bars as ornament.",
        fr: "Géométrie en couleurs primaires — blocs, cercles et barres en ornement.",
        pt: "Geometria em cores primárias — blocos, círculos e barras como ornamento.",
      }),
  },
  {
    value: "blueprint",
    label: () => t3({ en: "Blueprint", fr: "Blueprint", pt: "Blueprint" }),
    description: () =>
      t3({
        en: "White line-work on blueprint blue; every figure a numbered plate.",
        fr: "Tracés blancs sur bleu de plan ; chaque figure devient une planche numérotée.",
        pt: "Traços brancos sobre azul de planta; cada figura é uma prancha numerada.",
      }),
  },
  {
    value: "broadsheet",
    label: () => t3({ en: "Broadsheet", fr: "Journal grand format", pt: "Jornal de grande formato" }),
    description: () =>
      t3({
        en: "Newspaper front page — masthead, columns, kickers, drop caps.",
        fr: "Une de journal — manchette, colonnes, surtitres, lettrines.",
        pt: "Primeira página de jornal — cabeçalho, colunas, antetítulos, capitulares.",
      }),
  },
  {
    value: "risograph",
    label: () => t3({ en: "Risograph", fr: "Risographie", pt: "Risografia" }),
    description: () =>
      t3({
        en: "Two-ink zine print — paper tint, offset shadows, stamped labels.",
        fr: "Impression deux encres façon zine — papier teinté, ombres décalées, tampons.",
        pt: "Impressão a duas tintas estilo zine — papel tingido, sombras desalinhadas, carimbos.",
      }),
  },
  {
    value: "artdeco",
    label: () => t3({ en: "Art deco", fr: "Art déco", pt: "Art déco" }),
    description: () =>
      t3({
        en: "1920s programme — symmetric, gilded rules and ornaments, small caps.",
        fr: "Programme années 1920 — symétrie, filets et ornements dorés, petites capitales.",
        pt: "Programa anos 1920 — simetria, filetes e ornamentos dourados, versaletes.",
      }),
  },
  {
    value: "japanese",
    label: () => t3({ en: "Japanese minimal", fr: "Minimalisme japonais", pt: "Minimalismo japonês" }),
    description: () =>
      t3({
        en: "Extreme whitespace, quiet type, a single vermilion seal.",
        fr: "Espace blanc extrême, typographie discrète, un unique sceau vermillon.",
        pt: "Espaço em branco extremo, tipografia discreta, um único selo vermelhão.",
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
  {
    value: "terminal",
    label: () => t3({ en: "Terminal", fr: "Terminal", pt: "Terminal" }),
    description: () =>
      t3({
        en: "Phosphor green on near-black, monospace everything, CLI furniture.",
        fr: "Vert phosphore sur quasi-noir, tout en chasse fixe, habillage type console.",
        pt: "Verde fósforo sobre quase preto, tudo monoespaçado, elementos de consola.",
      }),
  },
  {
    value: "brutalist",
    label: () => t3({ en: "Brutalist", fr: "Brutaliste", pt: "Brutalista" }),
    description: () =>
      t3({
        en: "Raw and loud — harsh borders, hard shadows, highlighter yellow.",
        fr: "Brut et criard — bordures dures, ombres franches, jaune surligneur.",
        pt: "Cru e ruidoso — margens duras, sombras rígidas, amarelo marcador.",
      }),
  },
];

// Loaded once, on first modal open; cached by the browser after that. Only the
// weights the tiles actually render.
const FONTS_LINK_ID = "report-style-picker-fonts";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@900&family=Archivo+Narrow:wght@700&family=Cormorant+Garamond&family=IBM+Plex+Mono&family=IBM+Plex+Sans&family=IBM+Plex+Sans+Condensed:wght@700&family=Inter:wght@400;900&family=JetBrains+Mono:wght@400;700&family=Libre+Franklin:wght@300;900&family=Marcellus&family=Oswald:wght@500&family=Playfair+Display:wght@900&family=Shippori+Mincho:wght@700&family=Source+Serif+4&family=Space+Grotesk:wght@500;700&family=Space+Mono&family=Zen+Kaku+Gothic+New&display=swap";

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

.rsp-bauhaus .rsp-page{background:#F5F1E8;color:#1A1A1A;font-family:'Space Grotesk',sans-serif;position:relative;}
.rsp-bauhaus .rsp-seal{display:block;position:absolute;top:10px;right:12px;width:13px;height:13px;background:#F0B429;border-radius:50%;}
.rsp-bauhaus .rsp-title{font-family:'Archivo',sans-serif;font-weight:900;text-transform:uppercase;font-size:15px;}
.rsp-bauhaus .rsp-eyebrow{color:#D02E26;font-weight:700;}
.rsp-bauhaus .rsp-rule{height:5px;background:#1F5CA9;}
.rsp-bauhaus .rsp-bar{background:#d8d2c4;}
.rsp-bauhaus .rsp-stat{font-family:'Archivo',sans-serif;font-weight:900;color:#D02E26;}
.rsp-bauhaus .rsp-chart i{border-radius:0;}
.rsp-bauhaus .rsp-chart i:nth-child(odd){background:#D02E26;}
.rsp-bauhaus .rsp-chart i:nth-child(2){background:#1F5CA9;}
.rsp-bauhaus .rsp-chart i:nth-child(4){background:#F0B429;}
.rsp-bauhaus .rsp-th{background:#1A1A1A;}.rsp-bauhaus .rsp-tr{background:#e4ddcd;}

.rsp-blueprint .rsp-page{background:#123B63;color:#E7F0F7;font-family:'IBM Plex Mono',monospace;background-image:repeating-linear-gradient(0deg,rgba(231,240,247,.07) 0 1px,transparent 1px 14px),repeating-linear-gradient(90deg,rgba(231,240,247,.07) 0 1px,transparent 1px 14px);}
.rsp-blueprint .rsp-eyebrow{color:#7FA6C6;}
.rsp-blueprint .rsp-title{font-family:'Archivo Narrow',sans-serif;text-transform:uppercase;letter-spacing:.06em;font-size:14px;}
.rsp-blueprint .rsp-rule{background:#7FA6C6;height:1px;border-bottom:1px dashed #7FA6C6;background:transparent;}
.rsp-blueprint .rsp-bar{background:rgba(231,240,247,.35);}
.rsp-blueprint .rsp-stat{color:#E7F0F7;}
.rsp-blueprint .rsp-chart{background:#fff;border:1px solid #E7F0F7;padding:4px 6px;outline:1px solid #7FA6C6;outline-offset:2px;}
.rsp-blueprint .rsp-chart i{background:#123B63;border-radius:0;}
.rsp-blueprint .rsp-th{background:rgba(231,240,247,.5);}.rsp-blueprint .rsp-tr{background:rgba(231,240,247,.2);}

.rsp-broadsheet .rsp-page{background:#FAF7F0;color:#1C1C1C;font-family:'Source Serif 4',serif;align-items:center;text-align:center;}
.rsp-broadsheet .rsp-eyebrow{font-family:'Oswald',sans-serif;text-transform:uppercase;color:#575757;}
.rsp-broadsheet .rsp-title{font-family:'Playfair Display',serif;font-weight:900;font-size:20px;border-top:1px solid #1C1C1C;border-bottom:1px solid #1C1C1C;padding:2px 10px;}
.rsp-broadsheet .rsp-rule{display:none;}
.rsp-broadsheet .rsp-body{width:100%;text-align:left;}
.rsp-broadsheet .rsp-col{column-gap:8px;}
.rsp-broadsheet .rsp-bar{background:#cfc9ba;}
.rsp-broadsheet .rsp-stat{font-family:'Playfair Display',serif;}
.rsp-broadsheet .rsp-chart{width:100%;border:1px solid #1C1C1C;padding:3px 5px;background:#fff;}
.rsp-broadsheet .rsp-chart i{background:#57534a;}
.rsp-broadsheet .rsp-table{width:100%;}
.rsp-broadsheet .rsp-th{background:#d9d2c1;}.rsp-broadsheet .rsp-tr{background:#eae4d5;}

.rsp-risograph .rsp-page{background:#F7F3E8;color:#1D3159;font-family:'Space Grotesk',sans-serif;}
.rsp-risograph .rsp-eyebrow{font-family:'Space Mono',monospace;border:1px solid #1D3159;display:inline-block;align-self:flex-start;padding:1px 4px;transform:rotate(-2deg);}
.rsp-risograph .rsp-title{font-weight:700;color:#0078BF;text-shadow:1.5px 1.5px 0 #FF48B0;}
.rsp-risograph .rsp-rule{height:3px;background:#0078BF;border-radius:2px;}
.rsp-risograph .rsp-bar{background:#b9c6e0;}
.rsp-risograph .rsp-stat{color:#FF48B0;font-weight:700;}
.rsp-risograph .rsp-chart{background:#fff;border:2px solid #0078BF;border-radius:6px;box-shadow:3px 3px 0 #FF48B0;padding:4px 6px;}
.rsp-risograph .rsp-chart i{background:#0078BF;}
.rsp-risograph .rsp-chart i:nth-child(even){background:#FF48B0;}
.rsp-risograph .rsp-th{background:#f3c9e2;}.rsp-risograph .rsp-tr{background:#cfe4f2;}

.rsp-artdeco .rsp-page{background:#F5EFE0;color:#191714;font-family:'Cormorant Garamond',serif;align-items:center;text-align:center;}
.rsp-artdeco .rsp-eyebrow{font-family:'Marcellus',serif;letter-spacing:.2em;color:#B08D3E;}
.rsp-artdeco .rsp-title{font-family:'Marcellus',serif;font-weight:400;text-transform:uppercase;letter-spacing:.18em;font-size:14px;}
.rsp-artdeco .rsp-rule{width:60%;height:1px;background:#B08D3E;box-shadow:0 2.5px 0 #B08D3E;}
.rsp-artdeco .rsp-body{width:88%;}
.rsp-artdeco .rsp-bar{background:#d8cfb8;}
.rsp-artdeco .rsp-stat{color:#B08D3E;font-family:'Marcellus',serif;}
.rsp-artdeco .rsp-chart{width:88%;border:1px solid #B08D3E;outline:1px solid #B08D3E;outline-offset:2px;padding:4px 6px;background:#fff;}
.rsp-artdeco .rsp-chart i{background:#1F3A2E;}
.rsp-artdeco .rsp-table{width:88%;}
.rsp-artdeco .rsp-th{background:#B08D3E;height:2px;}.rsp-artdeco .rsp-tr{background:#e4dcc6;}

.rsp-japanese .rsp-page{background:#FBFAF7;color:#2B2B28;font-family:'Zen Kaku Gothic New',sans-serif;padding:18px 16px;gap:10px;position:relative;}
.rsp-japanese .rsp-seal{display:block;position:absolute;top:16px;right:16px;width:9px;height:9px;background:#C73E2E;}
.rsp-japanese .rsp-eyebrow{display:none;}
.rsp-japanese .rsp-title{font-family:'Shippori Mincho',serif;font-size:13px;font-weight:700;}
.rsp-japanese .rsp-rule{display:none;}
.rsp-japanese .rsp-body{padding-top:4px;}
.rsp-japanese .rsp-col{gap:6px;}
.rsp-japanese .rsp-bar{background:#e4e2db;height:2.5px;}
.rsp-japanese .rsp-stat{font-weight:400;font-size:13px;color:#8C8A84;}
.rsp-japanese .rsp-chart{padding:4px 18px;justify-content:center;gap:7px;}
.rsp-japanese .rsp-chart i{background:#c8c6bd;max-width:9px;}
.rsp-japanese .rsp-table{display:none;}

.rsp-monochrome .rsp-page{font-family:'Libre Franklin',sans-serif;color:#000;gap:7px;}
.rsp-monochrome .rsp-eyebrow{color:#666;}
.rsp-monochrome .rsp-title{font-weight:900;font-size:19px;background:#000;color:#fff;padding:1px 6px;align-self:flex-start;}
.rsp-monochrome .rsp-rule{height:3px;background:#000;}
.rsp-monochrome .rsp-bar{background:#dcdcdc;border-radius:0;}
.rsp-monochrome .rsp-stat{font-weight:900;font-size:16px;}
.rsp-monochrome .rsp-chart i{background:#000;border-radius:0;}
.rsp-monochrome .rsp-th{background:#000;}.rsp-monochrome .rsp-tr{background:#e8e8e8;}

.rsp-terminal .rsp-page{background:#0C0F0D;color:#9BB39F;font-family:'JetBrains Mono',monospace;}
.rsp-terminal .rsp-eyebrow{color:#33FF66;}
.rsp-terminal .rsp-eyebrow::before{content:"$ ";}
.rsp-terminal .rsp-title{color:#33FF66;font-size:13px;font-weight:700;}
.rsp-terminal .rsp-rule{height:1px;background:#1E3A2A;}
.rsp-terminal .rsp-bar{background:#1E3A2A;}
.rsp-terminal .rsp-stat{color:#33FF66;}
.rsp-terminal .rsp-chart{background:#fff;border:1px solid #1E3A2A;padding:4px 6px;}
.rsp-terminal .rsp-chart i{background:#14532d;border-radius:0;}
.rsp-terminal .rsp-th{background:#1E3A2A;}.rsp-terminal .rsp-tr{background:#15231a;}

.rsp-brutalist .rsp-page{font-family:Arial,Helvetica,sans-serif;color:#000;border:3px solid #000;margin:5px 9px 9px 5px;height:calc(100% - 14px);box-shadow:4px 4px 0 #000;background:#fff;}
.rsp-brutalist .rsp-eyebrow{color:#000;font-weight:700;}
.rsp-brutalist .rsp-title{font-size:18px;text-transform:uppercase;background:#FFFF00;align-self:flex-start;padding:0 4px;}
.rsp-brutalist .rsp-rule{height:3px;background:#000;}
.rsp-brutalist .rsp-bar{background:#bbb;border-radius:0;}
.rsp-brutalist .rsp-stat{text-decoration:underline;font-size:16px;}
.rsp-brutalist .rsp-chart{border:3px solid #000;padding:3px 5px;}
.rsp-brutalist .rsp-chart i{background:#000;border-radius:0;}
.rsp-brutalist .rsp-chart i:nth-child(3){background:#FFFF00;border:1px solid #000;}
.rsp-brutalist .rsp-th{background:#000;}.rsp-brutalist .rsp-tr{background:#ddd;}
`;

export function ReportStylePicker(p: Props) {
  const [selected, setSelected] = createSignal<ReportHtmlStyle | undefined>();
  const [saveState, setSaveState] = createSignal<StateHolderFormAction>({
    status: "ready",
  });

  onMount(ensureFonts);

  async function create(style: ReportHtmlStyle | undefined) {
    if (!style || saveState().status === "loading") return;
    setSaveState({ status: "loading" });
    const res = await serverActions.createReport({
      projectId: p.projectId,
      label: p.label,
      folderId: p.folderId,
      format: "html",
      htmlStyle: style,
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
            {(opt) => (
              <button
                type="button"
                class="ui-focusable group rounded-md p-1.5 text-left"
                classList={{
                  "ring-primary ring-2": selected() === opt.value,
                  "hover:bg-base-200": selected() !== opt.value,
                }}
                onClick={() => setSelected(opt.value)}
                onDblClick={() => void create(opt.value)}
              >
                <StyleMock style={opt.value} />
                <div class="text-base-content mt-1.5 text-sm font-semibold">
                  {opt.label()}
                </div>
                <div class="text-base-content-muted text-xs leading-snug">
                  {opt.description()}
                </div>
              </button>
            )}
          </For>
        </div>
        <StateHolderFormError state={saveState()} />
      </div>
    </ModalContainer>
  );
}
