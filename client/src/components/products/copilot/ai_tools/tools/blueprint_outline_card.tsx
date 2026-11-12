import {
  type DeckBlueprint,
  type DeckBlueprintOutlineTopic,
  formatPeriodRange,
  resolvePeriodRoles,
  t3,
  TC,
} from "lib";
import {
  Button,
  Checkbox,
  Input,
  RadioGroup,
  type StateHolder,
  StateHolderWrapper,
} from "panther";
import { createSignal, For, onMount, Show } from "solid-js";

export type BlueprintOutlineInput = {
  reportingPeriod: { start: number; end: number };
  topics: (Omit<DeckBlueprintOutlineTopic, "standIns"> & {
    standIns?: { original: string; replacement: string; reason: string }[];
  })[];
};

export type BlueprintOutlineDeckState = {
  slideCount: number;
  // No slides, or only the untouched default cover: nothing to keep.
  untouched: boolean;
  themeChosen: boolean;
};

export type BlueprintOutlineDecision = {
  topics: DeckBlueprintOutlineTopic[];
  placement: "replace" | "append";
  useLook: boolean;
};

type Ctx = { blueprint: DeckBlueprint; state: BlueprintOutlineDeckState };

type Props = {
  input: BlueprintOutlineInput;
  // The run and the deck as they are now; undefined when the deck or its run
  // has gone (the card then offers only Cancel).
  loadContext: () => Promise<Ctx | undefined>;
  onSubmit: (d: BlueprintOutlineDecision) => void;
  onCancel: () => void;
};

// The outline the model proposes for a blueprint run, edited by the person
// before anything is written: slides per topic (0 drops it), each stand-in
// accepted or not, replace-or-add when the deck has content, and whether the
// blueprint's look is applied. Build answers the tool (blueprint.tsx).
export function BlueprintOutlineCard(p: Props) {
  const [ctx, setCtx] = createSignal<StateHolder<Ctx>>({ status: "loading" });
  onMount(async () => {
    const c = await p.loadContext();
    setCtx(
      c ? { status: "ready", data: c } : {
        status: "error",
        err: t3({
          en: "This deck is no longer open, or its blueprint run has ended.",
          fr:
            "Cette présentation n'est plus ouverte, ou l'application du modèle est terminée.",
          pt:
            "Esta apresentação já não está aberta, ou a aplicação do modelo terminou.",
        }),
      },
    );
  });

  return (
    <div class="bg-base-100 ui-pad ui-spy-sm my-1 max-w-full rounded border">
      <StateHolderWrapper state={ctx()}>
        {(c) => <OutlineEditor {...p} ctx={c} />}
      </StateHolderWrapper>
      <Show when={ctx().status === "error"}>
        <div class="flex justify-end">
          <Button intent="base-300" onClick={p.onCancel}>
            {t3(TC.cancel)}
          </Button>
        </div>
      </Show>
    </div>
  );
}

function OutlineEditor(p: Props & { ctx: Ctx }) {
  const bp = p.ctx.blueprint;
  const state = p.ctx.state;
  const hasContent = state.slideCount > 0 && !state.untouched;

  const [topics, setTopics] = createSignal<DeckBlueprintOutlineTopic[]>(
    bp.topics.map((t) => {
      const proposed = p.input.topics.find((x) => x.topicId === t.id);
      return {
        topicId: t.id,
        slideCount: proposed?.slideCount ?? 0,
        reason: proposed?.reason ?? "",
        slideNotes: proposed?.slideNotes,
        standIns: proposed?.standIns?.map((s) => ({ ...s, accepted: true })),
        translatedVerbatim: proposed?.translatedVerbatim,
      };
    }),
  );
  const [placement, setPlacement] = createSignal<"replace" | "append">(
    hasContent ? "append" : "replace",
  );
  const [useLook, setUseLook] = createSignal(
    !hasContent || !state.themeChosen,
  );

  const periods = resolvePeriodRoles(bp.periodRoles, p.input.reportingPeriod);
  const total = () => topics().reduce((n, t) => n + t.slideCount, 0);

  function patch(i: number, next: Partial<DeckBlueprintOutlineTopic>) {
    setTopics((ts) => ts.map((t, j) => (j === i ? { ...t, ...next } : t)));
  }

  return (
    <div class="ui-spy-sm">
      <div class="font-700">
        {t3({
          en: `Outline: ${bp.name}`,
          fr: `Plan : ${bp.name}`,
          pt: `Plano: ${bp.name}`,
        })}
      </div>
      <div class="ui-text-caption">
        <For each={periods}>
          {(r) => <div>{r.label}: {formatPeriodRange(r)}</div>}
        </For>
      </div>

      <div class="ui-spy-sm">
        <For each={topics()}>
          {(t, i) => {
            const topic = bp.topics.find((b) => b.id === t.topicId);
            return (
              <div
                class="data-[dropped=true]:opacity-60 rounded border p-2"
                data-dropped={t.slideCount === 0}
              >
                <div class="ui-gap-sm flex items-start justify-between">
                  <div class="min-w-0">
                    <div class="font-700 truncate">{topic?.name}</div>
                    <div class="ui-text-caption">{t.reason}</div>
                  </div>
                  <div class="w-20 flex-none">
                    <Input
                      size="sm"
                      type="number"
                      value={String(t.slideCount)}
                      onChange={(v) => {
                        const n = Math.max(0, Math.min(30, Math.round(+v)));
                        if (Number.isFinite(n)) patch(i(), { slideCount: n });
                      }}
                      fullWidth
                    />
                  </div>
                </div>
                <Show when={t.slideCount === 0}>
                  <div class="ui-text-caption">
                    {t3({
                      en: "Dropped: no slides for this topic.",
                      fr: "Retiré : aucune diapositive pour ce sujet.",
                      pt: "Removido: nenhum diapositivo para este tema.",
                    })}
                  </div>
                </Show>
                <Show
                  when={t.slideCount > 0 && (t.slideNotes?.length ?? 0) > 0}
                >
                  <ul class="ui-text-caption list-disc pl-5">
                    <For each={t.slideNotes}>{(n) => <li>{n}</li>}</For>
                  </ul>
                </Show>
                <Show when={t.slideCount > 0}>
                  <For each={t.standIns ?? []}>
                    {(s, k) => (
                      <div class="mt-1">
                        <Checkbox
                          label={t3({
                            en:
                              `Stand-in: ${s.original} → ${s.replacement} (${s.reason})`,
                            fr:
                              `Remplacement : ${s.original} → ${s.replacement} (${s.reason})`,
                            pt:
                              `Substituição: ${s.original} → ${s.replacement} (${s.reason})`,
                          })}
                          checked={s.accepted !== false}
                          onChange={(v) =>
                            patch(i(), {
                              standIns: t.standIns?.map((x, j) =>
                                j === k() ? { ...x, accepted: v } : x
                              ),
                            })}
                        />
                      </div>
                    )}
                  </For>
                  <Show when={t.translatedVerbatim}>
                    <div class="ui-text-caption text-warning mt-1">
                      {t3({
                        en:
                          "Text kept word for word will be translated from English: please check it.",
                        fr:
                          "Le texte conservé mot pour mot sera traduit de l'anglais : veuillez le vérifier.",
                        pt:
                          "O texto mantido palavra por palavra será traduzido do inglês: verifique-o.",
                      })}
                    </div>
                  </Show>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={hasContent}>
        <RadioGroup
          label={t3({
            en: `This deck already has ${state.slideCount} slide(s)`,
            fr:
              `Cette présentation contient déjà ${state.slideCount} diapositive(s)`,
            pt: `Esta apresentação já tem ${state.slideCount} diapositivo(s)`,
          })}
          value={placement()}
          onChange={setPlacement}
          options={[
            {
              value: "append",
              label: t3({
                en: "Add the new slides after them",
                fr: "Ajouter les nouvelles diapositives après",
                pt: "Adicionar os novos diapositivos depois",
              }),
            },
            {
              value: "replace",
              label: t3({
                en:
                  "Replace them (a version is saved first, so it can be undone)",
                fr:
                  "Les remplacer (une version est enregistrée avant, pour pouvoir annuler)",
                pt:
                  "Substituí-los (uma versão é guardada antes, para poder anular)",
              }),
            },
          ]}
        />
      </Show>
      <Checkbox
        label={t3({
          en:
            `Use the blueprint's look (theme "${bp.look.theme}", header, page numbers, footer)`,
          fr:
            `Utiliser l'apparence du modèle (thème « ${bp.look.theme} », en-tête, numéros de page, pied de page)`,
          pt:
            `Usar o aspeto do modelo (tema "${bp.look.theme}", cabeçalho, números de página, rodapé)`,
        })}
        checked={useLook()}
        onChange={setUseLook}
      />

      <div class="ui-gap-sm flex justify-end">
        <Button intent="base-300" onClick={p.onCancel}>
          {t3(TC.cancel)}
        </Button>
        <Button
          intent="primary"
          disabled={total() === 0}
          onClick={() =>
            p.onSubmit({
              topics: topics(),
              placement: placement(),
              useLook: useLook(),
            })}
        >
          {t3({
            en: `Build ${total()} slide(s)`,
            fr: `Créer ${total()} diapositive(s)`,
            pt: `Criar ${total()} diapositivo(s)`,
          })}
        </Button>
      </div>
    </div>
  );
}
