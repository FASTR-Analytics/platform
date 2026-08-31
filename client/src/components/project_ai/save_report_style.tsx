import {
  REPORT_CUSTOM_BRIEF_MAX,
  REPORT_STYLE_REFERENCE_CSS_MAX,
  type ReportStyleColors,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  MODEL_OPTIONS,
  ModalContainer,
} from "panther";
import { createSignal, Match, onMount, Switch } from "solid-js";
import {
  ReportStyleEditor,
  type ReportStyleEditorResult,
} from "~/components/project/report_style_editor";
import { createProjectSDKClient } from "./ai_configs/defaults";

// "Save this report's style…" (AI pane kebab menu, HTML reports only): a
// one-shot Claude call distills the report's ACTUAL body/CSS into a reusable
// design brief in the same shape as the built-in preset briefs, plus tile
// colors — then hands the draft to the normal style editor for review/edit
// before it enters the library. The call rides the governed project AI proxy
// (same client the chat uses).

type Seed = {
  label: string;
  description: string;
  brief: string;
  referenceCss: string | null;
  colors: ReportStyleColors | null;
};

// The style's canonical implementation is the report's actual CSS — extracted
// EXACTLY, in code (the AI only writes the prose brief + colors; prose alone
// proved lossy: regenerated stylesheets never matched the source report).
function extractStyleBlocks(body: string): string | null {
  const out: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const css = m[1].trim();
    if (css) out.push(css);
  }
  if (out.length === 0) return null;
  return out.join("\n\n").slice(0, REPORT_STYLE_REFERENCE_CSS_MAX);
}

type Props = AlertComponentProps<
  { projectId: string; reportLabel: string; body: string },
  ReportStyleEditorResult
>;

const BODY_CAP = 60_000;

const DISTILL_PROMPT =
  `You will be shown the HTML body of a report. Distill its DESIGN LANGUAGE into a reusable style guide ("design brief") that an AI will follow when writing OTHER reports in this same visual style.

Return ONLY a JSON object (no code fences, no commentary), exactly this shape:
{"label": "<short style name, 2-3 words>", "description": "<one sentence, max 140 chars>", "brief": "<the design brief, max 4000 chars>", "colors": {"page": "<hex>", "ink": "<hex>", "accent": "<hex>"}}

The report's actual CSS is captured separately and will be handed to the AI verbatim as the stylesheet to REUSE — so do NOT paraphrase CSS rules into the brief. The brief's job is the MARKUP side: which classes exist and how to compose them.

The brief must cover, in this order:
**Fonts** — which family plays which role (the @import already lives in the captured CSS).
**Palette** — the tokens/hexes and their roles, briefly (the values live in the CSS).
**Structure** — the reusable layout devices and their CLASS NAMES: how a masthead, section, card grid, table, callout, footer is composed from the stylesheet's classes; which element carries which class. Generic — never this report's content or topic.
**Figures** — how figure images are framed and captioned (they render as transparent PNGs — the design's own background shows through them unless the CSS gives them one), naming the classes to wrap them in.
Restate the hard constraints: static markup only (no <script>, no <link>), inline <svg> allowed for ornament, break-inside:avoid on cards/figures for print.
"colors" = the page background, the main text color, and the single most characteristic accent, as hex.

REPORT BODY:
`;

function parseDistilled(raw: string): Seed {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in AI response");
  const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const label = typeof obj.label === "string" ? obj.label.slice(0, 80) : "";
  const brief = typeof obj.brief === "string"
    ? obj.brief.slice(0, REPORT_CUSTOM_BRIEF_MAX)
    : "";
  if (!label || !brief) throw new Error("AI response missing label or brief");
  const description = typeof obj.description === "string"
    ? obj.description.slice(0, 200)
    : "";
  const c = obj.colors as Record<string, unknown> | undefined;
  const hex = (v: unknown) =>
    typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim())
      ? v.trim()
      : undefined;
  const colors = c && hex(c.page) && hex(c.ink) && hex(c.accent)
    ? { page: hex(c.page)!, ink: hex(c.ink)!, accent: hex(c.accent)! }
    : null;
  return { label, description, brief, referenceCss: null, colors };
}

export function SaveReportStyleModal(p: Props) {
  const [state, setState] = createSignal<
    | { status: "loading" }
    | { status: "error"; err: string }
    | { status: "ready"; seed: Seed }
  >({ status: "loading" });

  async function distill() {
    setState({ status: "loading" });
    try {
      const client = createProjectSDKClient(p.projectId);
      // Track panther's curated model list (Sonnet tier — a distillation
      // doesn't need the flagship) instead of hardcoding an id that rots.
      const model = MODEL_OPTIONS.find((m) => m.value.startsWith("claude-sonnet"))
        ?.value ?? MODEL_OPTIONS[0].value;
      const res = await client.messages.create({
        model,
        max_tokens: 4_000,
        messages: [
          {
            role: "user",
            content: DISTILL_PROMPT + p.body.slice(0, BODY_CAP),
          },
        ],
      });
      const text = res.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("");
      const seed = parseDistilled(text);
      seed.referenceCss = extractStyleBlocks(p.body);
      setState({ status: "ready", seed });
    } catch (e) {
      setState({
        status: "error",
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  onMount(() => void distill());

  return (
    <Switch>
      <Match when={state().status === "ready"}>
        <ReportStyleEditor
          projectId={p.projectId}
          seed={(state() as { status: "ready"; seed: Seed }).seed}
          close={p.close}
        />
      </Match>
      <Match when={true}>
        <ModalContainer
          width="sm"
          title={t3({
            en: "Save this report's style",
            fr: "Enregistrer le style de ce rapport",
            pt: "Guardar o estilo deste relatório",
          })}
          leftButtons={
            // eslint-disable-next-line jsx-key
            [
              ...(state().status === "error"
                ? [
                  <Button intent="primary" iconName="refresh" onClick={() => void distill()}>
                    {t3({ en: "Retry", fr: "Réessayer", pt: "Tentar novamente" })}
                  </Button>,
                ]
                : []),
              <Button outline intent="neutral" iconName="x" onClick={() => p.close(undefined)}>
                {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
              </Button>,
            ]
          }
        >
          <Switch>
            <Match when={state().status === "loading"}>
              <div class="text-base-content-muted flex items-center gap-2 text-sm">
                <div class="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                {t3({
                  en: `Analyzing the styling of “${p.reportLabel}”…`,
                  fr: `Analyse du style de « ${p.reportLabel} »…`,
                  pt: `A analisar o estilo de “${p.reportLabel}”…`,
                })}
              </div>
            </Match>
            <Match when={state().status === "error"}>
              <div class="text-danger text-sm">
                {(state() as { status: "error"; err: string }).err}
              </div>
            </Match>
          </Switch>
        </ModalContainer>
      </Match>
    </Switch>
  );
}
