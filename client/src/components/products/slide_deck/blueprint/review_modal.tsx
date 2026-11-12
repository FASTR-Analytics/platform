import {
  type DeckBlueprint,
  deckBlueprintFileName,
  type DeckBlueprintSlide,
  findSourceTermHits,
  isValidYearMonth,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
  serializeDeckBlueprint,
  type Slide,
  SLIDE_DECK_THEMES,
  type SlideDeckConfig,
  t3,
  TC,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  Checkbox,
  downloadText,
  Input,
  ModalContainer,
  PageHolder,
  type PageInputs,
  RadioGroup,
  Select,
  type StateHolder,
  StateHolderWrapper,
  TextArea,
} from "panther";
import {
  createMemo,
  createSignal,
  For,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";

// The topic review panel (one panel for both directions): the blueprint
// drafted from this deck ("make", then Download), or a blueprint file read
// for this deck ("apply", then the reporting period and Apply with AI).
// Everything the blueprint says is edited in place: its name, look, period
// roles, and per topic the purpose, the scaling rule and every pattern's
// briefs; topics merge with the next, split at a pattern, or go. A pattern
// drafted from this deck shows the slide it came from; one read from a file
// shows its grid.

export type BlueprintReviewApplyResult = {
  blueprint: DeckBlueprint;
  period:
    | { mode: "latest" }
    | { mode: "chosen"; start: number; end: number };
};

export type BlueprintReviewProps = {
  mode: "make" | "apply";
  blueprint: DeckBlueprint;
  warnings: string[];
  // The source's names to look for in the words; empty for a file.
  sourceTerms: string[];
  // Make mode: the deck's slides and its config, for the thumbnails, and per
  // topic the source slide of each pattern.
  sourceSlides?: Slide[];
  sourceConfig?: SlideDeckConfig;
  patternSources: (number | undefined)[][];
  // metricId → its presets, when the deck's package is known (make mode).
  presetOptions?: Record<string, { value: string; label: string }[]>;
};

type ReviewState = {
  bp: DeckBlueprint;
  sources: (number | undefined)[][];
};

function plainCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function renumber(s: ReviewState) {
  s.bp.topics.forEach((t, i) => (t.id = `t${i + 1}`));
}

// "2025-07" ⇄ 202507, for the month inputs.
function toMonthInput(v: number | undefined): string {
  if (v === undefined) return "";
  return `${Math.floor(v / 100)}-${String(v % 100).padStart(2, "0")}`;
}
function fromMonthInput(v: string): number | undefined {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? Number(m[1]) * 100 + Number(m[2]) : undefined;
}

export function BlueprintReviewModal(
  p: AlertComponentProps<
    BlueprintReviewProps,
    BlueprintReviewApplyResult | undefined
  >,
) {
  const [state, setState] = createStore<ReviewState>({
    bp: plainCopy(p.blueprint),
    sources: p.blueprint.topics.map((t, i) =>
      t.slides.map((_, j) => p.patternSources[i]?.[j])
    ),
  });
  const edit = (fn: (s: ReviewState) => void) => setState(produce(fn));

  const hits = createMemo(() =>
    findSourceTermHits(plainCopy(state.bp), p.sourceTerms)
  );

  const [periodMode, setPeriodMode] = createSignal<"latest" | "chosen">(
    "latest",
  );
  const [periodStart, setPeriodStart] = createSignal("");
  const [periodEnd, setPeriodEnd] = createSignal("");
  const [periodErr, setPeriodErr] = createSignal<string | undefined>();

  function finished(): DeckBlueprint {
    return plainCopy(unwrap(state.bp));
  }

  function download() {
    const bp = finished();
    downloadText(serializeDeckBlueprint(bp), deckBlueprintFileName(bp));
  }

  function apply() {
    if (periodMode() === "latest") {
      p.close({ blueprint: finished(), period: { mode: "latest" } });
      return;
    }
    const start = fromMonthInput(periodStart());
    const end = fromMonthInput(periodEnd());
    if (
      start === undefined || end === undefined || !isValidYearMonth(start) ||
      !isValidYearMonth(end) || start > end
    ) {
      setPeriodErr(t3({
        en: "Choose a first and a last month, in order.",
        fr: "Choisissez un premier et un dernier mois, dans l'ordre.",
        pt: "Escolha um primeiro e um último mês, por ordem.",
      }));
      return;
    }
    p.close({
      blueprint: finished(),
      period: { mode: "chosen", start, end },
    });
  }

  const roleOptions = () =>
    state.bp.periodRoles.map((r) => ({ value: r.id, label: r.label }));

  return (
    <ModalContainer
      width="3xl"
      height="xl"
      title={p.mode === "make"
        ? t3({
          en: "Review the blueprint",
          fr: "Vérifier le modèle",
          pt: "Rever o modelo",
        })
        : t3({
          en: "Apply a blueprint",
          fr: "Appliquer un modèle",
          pt: "Aplicar um modelo",
        })}
      subtitle={p.mode === "make"
        ? t3({
          en:
            "Check what the AI drafted from this deck. No data, names or numbers from this country should be left in it: the list below shows any it finds.",
          fr:
            "Vérifiez ce que l'IA a préparé à partir de cette présentation. Aucune donnée, aucun nom ni chiffre de ce pays ne doit y rester : la liste ci-dessous montre ceux qu'elle trouve.",
          pt:
            "Verifique o que a IA preparou a partir desta apresentação. Não devem ficar dados, nomes ou números deste país: a lista abaixo mostra os que encontrar.",
        })
        : t3({
          en:
            "Check the blueprint, choose the reporting period, then the AI checks this deck's data and proposes an outline for you to approve.",
          fr:
            "Vérifiez le modèle, choisissez la période, puis l'IA examine les données de cette présentation et propose un plan à approuver.",
          pt:
            "Verifique o modelo, escolha o período, e a IA analisa os dados desta apresentação e propõe um plano para aprovar.",
        })}
      onCancel={() => p.close(undefined)}
      cancelLabel={p.mode === "make"
        ? t3({ en: "Close", fr: "Fermer", pt: "Fechar" })
        : undefined}
      actions={[
        p.mode === "make"
          ? {
            label: t3({
              en: "Download blueprint file",
              fr: "Télécharger le fichier du modèle",
              pt: "Transferir o ficheiro do modelo",
            }),
            iconName: "download",
            onClick: download,
          }
          : {
            label: t3({
              en: "Apply with AI",
              fr: "Appliquer avec l'IA",
              pt: "Aplicar com a IA",
            }),
            iconName: "sparkles",
            onClick: apply,
          },
      ]}
    >
      <div class="ui-spy">
        <Show when={p.warnings.length > 0 || hits().length > 0}>
          <div class="ui-spy-sm">
            <Show when={hits().length > 0}>
              <div class="border-warning bg-base-100 ui-pad-sm rounded border">
                <div class="font-700 text-warning">
                  {t3({
                    en: "Names from the source country are still in the text",
                    fr: "Des noms du pays d'origine restent dans le texte",
                    pt: "Ainda há nomes do país de origem no texto",
                  })}
                </div>
                <ul class="ui-text-caption list-disc pl-5">
                  <For each={hits()}>
                    {(h) => <li>{h.where}: “{h.term}”</li>}
                  </For>
                </ul>
              </div>
            </Show>
            <Show when={p.warnings.length > 0}>
              <ul class="ui-text-caption list-disc pl-5">
                <For each={p.warnings}>{(w) => <li>{w}</li>}</For>
              </ul>
            </Show>
          </div>
        </Show>

        <div class="ui-gap grid grid-cols-1 md:grid-cols-2">
          <Input
            label={t3({ en: "Name", fr: "Nom", pt: "Nome" })}
            value={state.bp.name}
            onChange={(v) => setState("bp", "name", v)}
            fullWidth
          />
          <Select
            label={t3({ en: "Theme", fr: "Thème", pt: "Tema" })}
            value={state.bp.look.theme}
            options={SLIDE_DECK_THEMES.map((t) => ({ value: t, label: t }))}
            onChange={(v) => setState("bp", "look", "theme", v)}
            fullWidth
          />
        </div>
        <TextArea
          label={t3({ en: "Description", fr: "Description", pt: "Descrição" })}
          value={state.bp.description}
          onChange={(v) => setState("bp", "description", v)}
          rows={2}
          fullWidth
        />
        <div class="ui-gap grid grid-cols-1 md:grid-cols-2">
          <Show when={state.bp.look.footerPattern !== undefined}>
            <Input
              label={t3({
                en: "Footer ({Country}, {Period}, {Year} are filled in)",
                fr: "Pied de page ({Country}, {Period}, {Year} sont remplis)",
                pt: "Rodapé ({Country}, {Period}, {Year} são preenchidos)",
              })}
              value={state.bp.look.footerPattern ?? ""}
              onChange={(v) => setState("bp", "look", "footerPattern", v)}
              fullWidth
            />
          </Show>
          <Show when={state.bp.look.watermarkPattern !== undefined}>
            <Input
              label={t3({
                en: "Watermark",
                fr: "Filigrane",
                pt: "Marca de água",
              })}
              value={state.bp.look.watermarkPattern ?? ""}
              onChange={(v) => setState("bp", "look", "watermarkPattern", v)}
              fullWidth
            />
          </Show>
        </div>
        <div class="ui-text-caption">
          {t3({
            en:
              `Logos are not copied: the new deck picks its own (the source had ${state.bp.look.logoSlots.cover.count} on the cover, ${state.bp.look.logoSlots.header.count} in the header, ${state.bp.look.logoSlots.footer.count} in the footer).`,
            fr:
              `Les logos ne sont pas copiés : la nouvelle présentation choisit les siens (l'original en avait ${state.bp.look.logoSlots.cover.count} sur la couverture, ${state.bp.look.logoSlots.header.count} dans l'en-tête, ${state.bp.look.logoSlots.footer.count} dans le pied de page).`,
            pt:
              `Os logótipos não são copiados: a nova apresentação escolhe os seus (o original tinha ${state.bp.look.logoSlots.cover.count} na capa, ${state.bp.look.logoSlots.header.count} no cabeçalho, ${state.bp.look.logoSlots.footer.count} no rodapé).`,
          })}
        </div>

        <PeriodRolesEditor state={state} edit={edit} />

        <div class="font-700">
          {t3({
            en: `Topics (${state.bp.topics.length})`,
            fr: `Sujets (${state.bp.topics.length})`,
            pt: `Temas (${state.bp.topics.length})`,
          })}
        </div>
        <For each={state.bp.topics}>
          {(topic, ti) => (
            <div class="ui-pad-sm ui-spy-sm rounded border">
              <div class="ui-gap-sm flex items-end">
                <div class="flex-1">
                  <Input
                    label={t3({
                      en: `Topic ${ti() + 1}`,
                      fr: `Sujet ${ti() + 1}`,
                      pt: `Tema ${ti() + 1}`,
                    })}
                    value={topic.name}
                    onChange={(v) => setState("bp", "topics", ti(), "name", v)}
                    fullWidth
                  />
                </div>
                <Show when={ti() < state.bp.topics.length - 1}>
                  <Button
                    size="sm"
                    outline
                    onClick={() =>
                      edit((s) => {
                        const i = ti();
                        s.bp.topics[i].slides.push(
                          ...s.bp.topics[i + 1].slides,
                        );
                        s.sources[i].push(...s.sources[i + 1]);
                        s.bp.topics.splice(i + 1, 1);
                        s.sources.splice(i + 1, 1);
                        renumber(s);
                      })}
                  >
                    {t3({
                      en: "Merge with next",
                      fr: "Fusionner avec le suivant",
                      pt: "Juntar ao seguinte",
                    })}
                  </Button>
                </Show>
                <Show when={state.bp.topics.length > 1}>
                  <Button
                    size="sm"
                    outline
                    intent="danger"
                    iconName="trash"
                    ariaLabel={t3(TC.delete)}
                    onClick={() =>
                      edit((s) => {
                        s.bp.topics.splice(ti(), 1);
                        s.sources.splice(ti(), 1);
                        renumber(s);
                      })}
                  />
                </Show>
              </div>
              <div class="ui-gap grid grid-cols-1 md:grid-cols-2">
                <TextArea
                  label={t3({ en: "Purpose", fr: "Objectif", pt: "Objetivo" })}
                  value={topic.purpose}
                  onChange={(v) => setState("bp", "topics", ti(), "purpose", v)}
                  rows={2}
                  fullWidth
                />
                <TextArea
                  label={t3({
                    en: "How many slides (judged on the new country's data)",
                    fr:
                      "Combien de diapositives (selon les données du nouveau pays)",
                    pt: "Quantos diapositivos (segundo os dados do novo país)",
                  })}
                  value={topic.scalingRule}
                  onChange={(v) =>
                    setState("bp", "topics", ti(), "scalingRule", v)}
                  rows={2}
                  fullWidth
                />
              </div>
              <For each={topic.slides}>
                {(slide, si) => (
                  <div class="ui-gap flex items-start border-t pt-2">
                    <div class="w-56 flex-none">
                      <Show
                        when={state.sources[ti()]?.[si()] !== undefined &&
                          p.sourceSlides && p.sourceConfig}
                        fallback={<PatternDiagram slide={slide} />}
                      >
                        <SourceThumbnail
                          slide={p.sourceSlides![state.sources[ti()][si()]!]}
                          config={p.sourceConfig!}
                          index={state.sources[ti()][si()]!}
                        />
                      </Show>
                      <div class="ui-gap-sm mt-1 flex">
                        <Show when={si() > 0}>
                          <Button
                            size="sm"
                            outline
                            onClick={() =>
                              edit((s) => {
                                const i = ti();
                                const k = si();
                                const t = s.bp.topics[i];
                                s.bp.topics.splice(i + 1, 0, {
                                  id: "",
                                  name: `${t.name} (2)`,
                                  purpose: t.purpose,
                                  scalingRule: t.scalingRule,
                                  slides: t.slides.splice(k),
                                });
                                s.sources.splice(
                                  i + 1,
                                  0,
                                  s.sources[i].splice(k),
                                );
                                renumber(s);
                              })}
                          >
                            {t3({
                              en: "Split here",
                              fr: "Séparer ici",
                              pt: "Dividir aqui",
                            })}
                          </Button>
                        </Show>
                        <Show when={topic.slides.length > 1}>
                          <Button
                            size="sm"
                            outline
                            intent="danger"
                            iconName="trash"
                            ariaLabel={t3(TC.delete)}
                            onClick={() =>
                              edit((s) => {
                                s.bp.topics[ti()].slides.splice(si(), 1);
                                s.sources[ti()].splice(si(), 1);
                              })}
                          />
                        </Show>
                      </div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <PatternEditor
                        state={state}
                        edit={edit}
                        ti={ti()}
                        si={si()}
                        roleOptions={roleOptions()}
                        presetOptions={p.presetOptions}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>

        <Show when={p.mode === "apply"}>
          <div class="ui-pad-sm ui-spy-sm rounded border">
            <RadioGroup
              label={t3({
                en: "Reporting period",
                fr: "Période de rapport",
                pt: "Período de relatório",
              })}
              value={periodMode()}
              onChange={(v) => {
                setPeriodErr(undefined);
                setPeriodMode(v);
              }}
              options={[
                {
                  value: "latest",
                  label: t3({
                    en:
                      "The latest complete period in this deck's data (the AI finds it)",
                    fr:
                      "La dernière période complète des données de cette présentation (l'IA la trouve)",
                    pt:
                      "O último período completo nos dados desta apresentação (a IA encontra-o)",
                  }),
                },
                {
                  value: "chosen",
                  label: t3({
                    en: "Choose the months",
                    fr: "Choisir les mois",
                    pt: "Escolher os meses",
                  }),
                },
              ]}
            />
            <Show when={periodMode() === "chosen"}>
              <div class="ui-gap flex">
                <Input
                  type="month"
                  label={t3({ en: "From", fr: "De", pt: "De" })}
                  value={periodStart()}
                  onChange={setPeriodStart}
                />
                <Input
                  type="month"
                  label={t3({ en: "To", fr: "À", pt: "Até" })}
                  value={periodEnd()}
                  onChange={setPeriodEnd}
                  invalidMsg={periodErr()}
                />
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}

function PeriodRolesEditor(p: {
  state: ReviewState;
  edit: (fn: (s: ReviewState) => void) => void;
}) {
  const kindLabel = (k: string) =>
    k === "reporting"
      ? t3({ en: "Reporting", fr: "Rapport", pt: "Relatório" })
      : k === "comparison"
      ? t3({
        en: "Same months a year earlier",
        fr: "Mêmes mois un an avant",
        pt: "Mesmos meses um ano antes",
      })
      : t3({ en: "Trend window", fr: "Tendance", pt: "Tendência" });
  return (
    <div class="ui-spy-sm">
      <div class="font-700">
        {t3({
          en: "Time periods",
          fr: "Périodes",
          pt: "Períodos",
        })}
      </div>
      <For each={p.state.bp.periodRoles}>
        {(role, i) => (
          <div class="ui-gap-sm flex items-end">
            <Input
              size="sm"
              value={role.label}
              onChange={(v) =>
                p.edit((s) => {
                  s.bp.periodRoles[i()].label = v;
                })}
            />
            <span class="ui-text-caption pb-1">{kindLabel(role.kind)}</span>
            <Show when={role.kind !== "comparison"}>
              <div class="w-24">
                <Input
                  size="sm"
                  type="number"
                  value={String(role.months ?? "")}
                  onChange={(v) =>
                    p.edit((s) => {
                      const n = Math.round(+v);
                      s.bp.periodRoles[i()].months =
                        Number.isFinite(n) && n >= 1 && n <= 120
                          ? n
                          : undefined;
                    })}
                  fullWidth
                />
              </div>
              <span class="ui-text-caption pb-1">
                {t3({ en: "months", fr: "mois", pt: "meses" })}
              </span>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}

function PatternEditor(p: {
  state: ReviewState;
  edit: (fn: (s: ReviewState) => void) => void;
  ti: number;
  si: number;
  roleOptions: { value: string; label: string }[];
  presetOptions?: Record<string, { value: string; label: string }[]>;
}) {
  const slide = () => p.state.bp.topics[p.ti]?.slides[p.si];
  const at = (fn: (s: DeckBlueprintSlide) => void) =>
    p.edit((s) => fn(s.bp.topics[p.ti].slides[p.si]));
  const briefLabel = t3({
    en: "What to write",
    fr: "Ce qu'il faut écrire",
    pt: "O que escrever",
  });

  return (
    <Show when={slide()}>
      {(sl) => (
        <div class="ui-spy-sm">
          <Switch>
            <Match when={sl().type === "cover" || sl().type === "section"}>
              <Input
                size="sm"
                label={sl().type === "cover"
                  ? t3({
                    en: "Cover title",
                    fr: "Titre de couverture",
                    pt: "Título da capa",
                  })
                  : t3({
                    en: "Section title",
                    fr: "Titre de section",
                    pt: "Título da secção",
                  })}
                value={(sl() as { titleBrief: string }).titleBrief}
                onChange={(v) =>
                  at((s) => {
                    if (s.type !== "content") s.titleBrief = v;
                  })}
                fullWidth
              />
              <Input
                size="sm"
                label={t3({
                  en: "Subtitle",
                  fr: "Sous-titre",
                  pt: "Subtítulo",
                })}
                value={(sl() as { subtitleBrief?: string }).subtitleBrief ?? ""}
                onChange={(v) =>
                  at((s) => {
                    if (s.type !== "content") s.subtitleBrief = v || undefined;
                  })}
                fullWidth
              />
            </Match>
            <Match when={sl().type === "content"}>
              <Input
                size="sm"
                label={t3({
                  en: "Slide header",
                  fr: "En-tête",
                  pt: "Cabeçalho",
                })}
                value={(sl() as { headerBrief: string }).headerBrief}
                onChange={(v) =>
                  at((s) => {
                    if (s.type === "content") s.headerBrief = v;
                  })}
                fullWidth
              />
              <For
                each={sl().type === "content"
                  ? (sl() as Extract<DeckBlueprintSlide, { type: "content" }>)
                    .rows.flatMap((row, r) =>
                      row.map((cell, c) => ({ r, c, cell }))
                    )
                  : []}
              >
                {(item) => {
                  const cell = () => {
                    const s = slide();
                    return s?.type === "content"
                      ? s.rows[item.r]?.[item.c]
                      : undefined;
                  };
                  const atBlock = (
                    fn: (
                      b: NonNullable<ReturnType<typeof cell>>["block"],
                    ) => void,
                  ) =>
                    at((s) => {
                      if (s.type === "content") {
                        fn(s.rows[item.r][item.c].block);
                      }
                    });
                  return (
                    <Show when={cell()}>
                      {(cl) => (
                        <div class="bg-base-200 ui-pad-sm ui-spy-sm rounded">
                          <div class="ui-text-caption">
                            {`Row ${item.r + 1} · ${cl().span}/12 · `}
                            {cl().block.type === "text"
                              ? t3({ en: "Text", fr: "Texte", pt: "Texto" })
                              : cl().block.type === "figure"
                              ? `${
                                t3({
                                  en: "Chart",
                                  fr: "Graphique",
                                  pt: "Gráfico",
                                })
                              }: ${
                                (cl().block as { metricId: string }).metricId
                              }`
                              : t3({
                                en: "Image (the new deck adds its own)",
                                fr:
                                  "Image (la nouvelle présentation ajoute la sienne)",
                                pt:
                                  "Imagem (a nova apresentação acrescenta a sua)",
                              })}
                          </div>
                          <BlockFields
                            block={cl().block}
                            atBlock={atBlock}
                            briefLabel={briefLabel}
                            roleOptions={p.roleOptions}
                            presetOptions={p.presetOptions}
                          />
                        </div>
                      )}
                    </Show>
                  );
                }}
              </For>
            </Match>
          </Switch>
        </div>
      )}
    </Show>
  );
}

type AnyBlock = Extract<DeckBlueprintSlide, { type: "content" }>["rows"][
  number
][number]["block"];

function BlockFields(p: {
  block: AnyBlock;
  atBlock: (fn: (b: AnyBlock) => void) => void;
  briefLabel: string;
  roleOptions: { value: string; label: string }[];
  presetOptions?: Record<string, { value: string; label: string }[]>;
}) {
  return (
    <Switch>
      <Match when={p.block.type === "text" && p.block}>
        {(b) => {
          const tb = () => b() as Extract<AnyBlock, { type: "text" }>;
          return (
            <>
              <TextArea
                label={tb().targetWords
                  ? `${p.briefLabel} (~${tb().targetWords} words)`
                  : p.briefLabel}
                value={tb().brief}
                onChange={(v) =>
                  p.atBlock((x) => {
                    if (x.type === "text") x.brief = v;
                  })}
                rows={2}
                fullWidth
              />
              <Checkbox
                label={t3({
                  en: "Keep word for word (same text in every country)",
                  fr: "Garder mot pour mot (même texte dans chaque pays)",
                  pt:
                    "Manter palavra por palavra (o mesmo texto em todos os países)",
                })}
                checked={tb().keepVerbatim}
                onChange={(v) =>
                  p.atBlock((x) => {
                    if (x.type === "text") x.keepVerbatim = v;
                  })}
              />
              <Show when={tb().keepVerbatim}>
                <TextArea
                  value={tb().verbatimText ?? ""}
                  onChange={(v) =>
                    p.atBlock((x) => {
                      if (x.type === "text") x.verbatimText = v;
                    })}
                  rows={3}
                  fullWidth
                />
              </Show>
            </>
          );
        }}
      </Match>
      <Match when={p.block.type === "figure" && p.block}>
        {(b) => {
          const fb = () => b() as Extract<AnyBlock, { type: "figure" }>;
          const presets = () => p.presetOptions?.[fb().metricId];
          return (
            <>
              <Show
                when={presets()?.length}
                fallback={
                  <Input
                    size="sm"
                    label={t3({
                      en: "Preset",
                      fr: "Préréglage",
                      pt: "Predefinição",
                    })}
                    value={fb().vizPresetId}
                    onChange={(v) =>
                      p.atBlock((x) => {
                        if (x.type === "figure") x.vizPresetId = v;
                      })}
                    fullWidth
                  />
                }
              >
                <Select
                  size="sm"
                  label={t3({
                    en: "Preset",
                    fr: "Préréglage",
                    pt: "Predefinição",
                  })}
                  value={fb().vizPresetId}
                  options={presets()!}
                  onChange={(v) =>
                    p.atBlock((x) => {
                      if (x.type === "figure") x.vizPresetId = v;
                    })}
                  fullWidth
                />
              </Show>
              <TextArea
                label={t3({
                  en: "What the chart shows",
                  fr: "Ce que montre le graphique",
                  pt: "O que o gráfico mostra",
                })}
                value={fb().purpose}
                onChange={(v) =>
                  p.atBlock((x) => {
                    if (x.type === "figure") x.purpose = v;
                  })}
                rows={2}
                fullWidth
              />
              <Input
                size="sm"
                label={t3({
                  en: "Which rows (in words)",
                  fr: "Quelles lignes (en mots)",
                  pt: "Que linhas (em palavras)",
                })}
                value={fb().filterIntent ?? ""}
                onChange={(v) =>
                  p.atBlock((x) => {
                    if (x.type === "figure") x.filterIntent = v || undefined;
                  })}
                fullWidth
              />
              <Show
                when={fb().period.kind === "role"}
                fallback={
                  <div class="ui-text-caption">
                    {fb().period.kind === "relative"
                      ? t3({
                        en: "Time range: relative, kept as it is",
                        fr: "Période : relative, conservée",
                        pt: "Período: relativo, mantido",
                      })
                      : t3({
                        en: "Time range: the preset's own",
                        fr: "Période : celle du préréglage",
                        pt: "Período: o da predefinição",
                      })}
                  </div>
                }
              >
                <Select
                  size="sm"
                  label={t3({
                    en: "Time period",
                    fr: "Période",
                    pt: "Período",
                  })}
                  value={(fb().period as { role: string }).role}
                  options={p.roleOptions}
                  onChange={(v) =>
                    p.atBlock((x) => {
                      if (x.type === "figure") {
                        x.period = { kind: "role", role: v };
                      }
                    })}
                  fullWidth
                />
              </Show>
            </>
          );
        }}
      </Match>
      <Match when={p.block.type === "image_slot" && p.block}>
        {(b) => (
          <Input
            size="sm"
            label={t3({ en: "Note", fr: "Note", pt: "Nota" })}
            value={(b() as Extract<AnyBlock, { type: "image_slot" }>).note}
            onChange={(v) =>
              p.atBlock((x) => {
                if (x.type === "image_slot") x.note = v;
              })}
            fullWidth
          />
        )}
      </Match>
    </Switch>
  );
}

// The source slide the pattern was drafted from, rendered as the deck does.
function SourceThumbnail(p: {
  slide: Slide;
  config: SlideDeckConfig;
  index: number;
}) {
  const [page, setPage] = createSignal<StateHolder<{ inputs: PageInputs }>>({
    status: "loading",
  });
  onMount(async () => {
    const res = await convertSlideToPageInputs(p.slide, p.index, p.config);
    setPage(
      res.success
        ? { status: "ready", data: { inputs: res.data } }
        : { status: "error", err: res.err },
    );
  });
  return (
    <div class="aspect-video overflow-hidden rounded border">
      <StateHolderWrapper state={page()}>
        {(d) => (
          <PageHolder
            pageInputs={d.inputs}
            pageWidthDu={PAGE_WIDTH_DU}
            pageHeightDu={PAGE_HEIGHT_DU}
          />
        )}
      </StateHolderWrapper>
    </div>
  );
}

// A pattern read from a file: its grid, cell by cell.
function PatternDiagram(p: { slide: DeckBlueprintSlide }) {
  return (
    <div class="bg-base-200 ui-text-caption aspect-video rounded border p-1">
      <Switch>
        <Match when={p.slide.type !== "content"}>
          <div class="flex h-full items-center justify-center">
            {p.slide.type === "cover"
              ? t3({ en: "Cover", fr: "Couverture", pt: "Capa" })
              : t3({ en: "Section", fr: "Section", pt: "Secção" })}
          </div>
        </Match>
        <Match when={p.slide.type === "content"}>
          <div class="flex h-full flex-col gap-1">
            <For
              each={(p.slide as Extract<
                DeckBlueprintSlide,
                { type: "content" }
              >)
                .rows}
            >
              {(row) => (
                <div class="grid flex-1 grid-cols-12 gap-1">
                  <For each={row}>
                    {(cell) => (
                      <div
                        class="bg-base-100 flex items-center justify-center rounded"
                        style={{
                          "grid-column":
                            `span ${cell.span} / span ${cell.span}`,
                        }}
                      >
                        {cell.block.type === "figure"
                          ? t3({ en: "Chart", fr: "Graphique", pt: "Gráfico" })
                          : cell.block.type === "text"
                          ? t3({ en: "Text", fr: "Texte", pt: "Texto" })
                          : t3({ en: "Image", fr: "Image", pt: "Imagem" })}
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
