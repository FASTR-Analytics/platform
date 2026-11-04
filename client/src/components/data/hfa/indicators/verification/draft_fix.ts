import {
  buildHfaFixMessage,
  buildHfaVerificationBlocks,
  fixToPatch,
  hfaFixOutputSchema,
  type HfaIndicatorEditorDraft,
  type HfaIndicatorEditorPatch,
  type HfaTaxonomyInput,
  type HfaVerificationFinding,
  t3,
} from "lib";
import { callAIStructured } from "panther";
import { createSignal } from "solid-js";
import { createAiProxyClient } from "~/components/_shared/mod.ts";
import { getSnapshotInstanceState } from "~/state/instance/t1_store";
import { loadReadInput, validateHfaIndicatorPatch } from "../_shared/mod.ts";
import {
  callErrorMessage,
  hfaVerificationSystem,
  noAnswerReason,
} from "./runner.ts";

// `mono` marks code, shown in the code face.
export type HfaDraftFixChange = {
  field: string;
  previous: string;
  mono: boolean;
};

export type HfaDraftFixState =
  | { status: "idle" }
  | { status: "drafting" }
  | { status: "applied"; note: string; changes: HfaDraftFixChange[] }
  | { status: "not_applied"; reason: string };

// What the code editor hands a fix: the indicator's open findings, the
// taxonomy its controls offer, its draft read live, which is the saved version
// when the fix is asked for, and its write.
export type HfaDraftFixRequest = {
  indicatorId: string;
  findings: HfaVerificationFinding[];
  taxonomy: HfaTaxonomyInput;
  draft: () => HfaIndicatorEditorDraft;
  apply: (patch: HfaIndicatorEditorPatch) => void;
};

export type HfaDraftFix = {
  state: () => HfaDraftFixState;
  draft: (request: HfaDraftFixRequest) => Promise<void>;
  clear: () => void;
  abort: () => void;
};

// One fix at a time per editor. The indicator is read fresh, because the
// editor's props are the manager's state when it opened and go stale after a
// save in the editor; the patch lands only on a draft unchanged since the fix
// was asked for, the saved version the model drafted it against. `clear`
// leaves a fix being drafted alone, so its outcome still shows.
export function createHfaDraftFix(): HfaDraftFix {
  const [state, setState] = createSignal<HfaDraftFixState>({
    status: "idle",
  });
  let controller: AbortController | undefined;

  async function draft(request: HfaDraftFixRequest): Promise<void> {
    controller?.abort();
    const thisController = new AbortController();
    controller = thisController;
    setState({ status: "drafting" });
    let outcome: HfaDraftFixState;
    try {
      outcome = await draftFix(request, thisController.signal);
    } catch (e) {
      const message = callErrorMessage(e);
      outcome = {
        status: "not_applied",
        reason: t3({
          en: `No fix was drafted: ${message}`,
          fr: `Aucune correction n'a été proposée : ${message}`,
          pt: `Nenhuma correção foi proposta: ${message}`,
        }),
      };
    }
    if (thisController.signal.aborted) return;
    controller = undefined;
    setState(outcome);
  }

  return {
    state,
    draft,
    clear: () =>
      setState((st) => st.status === "drafting" ? st : { status: "idle" }),
    abort: () => controller?.abort(),
  };
}

async function draftFix(
  request: HfaDraftFixRequest,
  signal: AbortSignal,
): Promise<HfaDraftFixState> {
  const asked = JSON.stringify(request.draft());
  const read = await loadReadInput(true);
  const res = await callAIStructured(
    {
      sdkClient: createAiProxyClient(),
      system: hfaVerificationSystem(
        buildHfaVerificationBlocks(
          read,
          getSnapshotInstanceState().instanceLanguage,
        ),
      ),
    },
    [{
      role: "user",
      content: buildHfaFixMessage(
        read,
        request.indicatorId,
        request.findings,
      ),
    }],
    hfaFixOutputSchema,
    { signal },
  );
  signal.throwIfAborted();
  if (res.data === null) {
    const reason = noAnswerReason(res.stopReason);
    return {
      status: "not_applied",
      reason: t3({
        en: `No fix was drafted: ${reason}.`,
        fr: `Aucune correction n'a été proposée : ${reason}.`,
        pt: `Nenhuma correção foi proposta: ${reason}.`,
      }),
    };
  }
  const note = res.data.note;
  const patch = fixToPatch(res.data);
  if (Object.keys(patch).length === 0) {
    return {
      status: "not_applied",
      reason: t3({
        en: `The model proposed no change: ${note}`,
        fr: `Le modèle n'a proposé aucune modification : ${note}`,
        pt: `O modelo não propôs nenhuma alteração: ${note}`,
      }),
    };
  }
  const before = request.draft();
  if (JSON.stringify(before) !== asked) {
    return {
      status: "not_applied",
      reason: t3({
        en:
          "The indicator was edited while the fix was drafted, so the fix was not applied. Save, then draft a fix again.",
        fr:
          "L'indicateur a été modifié pendant la préparation de la correction, qui n'a donc pas été appliquée. Sauvegardez, puis proposez à nouveau une correction.",
        pt:
          "O indicador foi editado enquanto a correção era preparada, por isso a correção não foi aplicada. Guarde e proponha novamente uma correção.",
      }),
    };
  }
  if (
    patch.categoryId !== undefined &&
    patch.categoryId !== before.categoryId &&
    before.subCategoryId !== null &&
    patch.subCategoryId === undefined
  ) {
    return {
      status: "not_applied",
      reason: t3({
        en:
          "The fix moves the indicator to another category without naming a sub-category of it, which would clear its sub-category, so it was not applied.",
        fr:
          "La correction déplace l'indicateur vers une autre catégorie sans nommer l'une de ses sous-catégories, ce qui effacerait sa sous-catégorie ; elle n'a donc pas été appliquée.",
        pt:
          "A correção move o indicador para outra categoria sem indicar uma das suas subcategorias, o que apagaria a sua subcategoria; por isso não foi aplicada.",
      }),
    };
  }
  const checked = validateHfaIndicatorPatch(patch, before, request.taxonomy);
  if ("error" in checked) {
    return {
      status: "not_applied",
      reason: t3({
        en: `The fix was not applied: ${checked.error}`,
        fr: `La correction n'a pas été appliquée : ${checked.error}`,
        pt: `A correção não foi aplicada: ${checked.error}`,
      }),
    };
  }
  request.apply(checked.patch);
  return {
    status: "applied",
    note,
    changes: draftChanges(before, request.draft(), request.taxonomy),
  };
}

function emptyText(): string {
  return t3({ en: "(empty)", fr: "(vide)", pt: "(vazio)" });
}

function shown(text: string): string {
  return text.trim() === "" ? emptyText() : text;
}

function labelOf(
  items: { id: string; label: string }[],
  id: string | null,
): string {
  return id === null
    ? emptyText()
    : (items.find((i) => i.id === id)?.label ?? id);
}

// Each field the fix changed, with its value before the fix, as the
// editor's controls show it.
function draftChanges(
  before: HfaIndicatorEditorDraft,
  after: HfaIndicatorEditorDraft,
  taxonomy: HfaTaxonomyInput,
): HfaDraftFixChange[] {
  const changes: HfaDraftFixChange[] = [];
  const add = (field: string, a: string, b: string, mono = false) => {
    if (a !== b) changes.push({ field, previous: a, mono });
  };
  const typeText = (type: HfaIndicatorEditorDraft["type"]) =>
    type === "binary"
      ? t3({ en: "Boolean", fr: "Booléen", pt: "Booleano" })
      : t3({ en: "Numeric", fr: "Numérique", pt: "Numérico" });
  const aggregationText = (
    aggregation: HfaIndicatorEditorDraft["aggregation"],
  ) =>
    aggregation === "sum"
      ? t3({ en: "Sum", fr: "Somme", pt: "Soma" })
      : t3({ en: "Average", fr: "Moyenne", pt: "Média" });
  const serviceText = (ids: string[]) =>
    ids.length === 0
      ? emptyText()
      : ids.map((id) => labelOf(taxonomy.serviceCategories, id)).join(", ");

  add(
    t3({ en: "Short label", fr: "Libellé court", pt: "Etiqueta curta" }),
    shown(before.shortLabel),
    shown(after.shortLabel),
  );
  add(
    t3({ en: "Long label", fr: "Libellé long", pt: "Etiqueta longa" }),
    shown(before.definition),
    shown(after.definition),
  );
  add(
    t3({ en: "Type", fr: "Type", pt: "Tipo" }),
    typeText(before.type),
    typeText(after.type),
  );
  add(
    t3({ en: "Aggregation", fr: "Agrégation", pt: "Agregação" }),
    aggregationText(before.aggregation),
    aggregationText(after.aggregation),
  );
  add(
    t3({ en: "Category", fr: "Catégorie", pt: "Categoria" }),
    labelOf(taxonomy.categories, before.categoryId),
    labelOf(taxonomy.categories, after.categoryId),
  );
  add(
    t3({ en: "Sub-category", fr: "Sous-catégorie", pt: "Subcategoria" }),
    labelOf(taxonomy.subCategories, before.subCategoryId),
    labelOf(taxonomy.subCategories, after.subCategoryId),
  );
  add(
    t3({
      en: "Service categories",
      fr: "Catégories de service",
      pt: "Categorias de serviço",
    }),
    serviceText(before.serviceCategoryIds),
    serviceText(after.serviceCategoryIds),
  );
  add(
    t3({
      en: "Variant group",
      fr: "Groupe de variantes",
      pt: "Grupo de variantes",
    }),
    labelOf(taxonomy.variantGroups, before.variantGroupId),
    labelOf(taxonomy.variantGroups, after.variantGroupId),
  );
  for (const b of before.code) {
    const a = after.code.find((c) => c.timePoint === b.timePoint);
    if (a === undefined) continue;
    add(
      t3({
        en: `Indicator code, ${b.timePoint}`,
        fr: `Code de l'indicateur, ${b.timePoint}`,
        pt: `Código do indicador, ${b.timePoint}`,
      }),
      shown(b.code),
      shown(a.code),
      true,
    );
    add(
      t3({
        en: `Filter code, ${b.timePoint}`,
        fr: `Code filtre, ${b.timePoint}`,
        pt: `Código de filtro, ${b.timePoint}`,
      }),
      shown(b.filterCode),
      shown(a.filterCode),
      true,
    );
  }
  const variantRows = new Map<string, { timePoint: string; itemId: string }>();
  for (const r of [...before.variantCode, ...after.variantCode]) {
    variantRows.set(`${r.timePoint} / ${r.itemId}`, r);
  }
  const variantCodeOf = (
    draft: HfaIndicatorEditorDraft,
    row: { timePoint: string; itemId: string },
  ) =>
    draft.variantCode.find((r) =>
      r.timePoint === row.timePoint && r.itemId === row.itemId
    )?.code ?? "";
  for (const row of variantRows.values()) {
    add(
      `${labelOf(taxonomy.variantItems, row.itemId)}, ${row.timePoint}`,
      shown(variantCodeOf(before, row)),
      shown(variantCodeOf(after, row)),
      true,
    );
  }
  return changes;
}
