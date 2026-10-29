import { createSignal, For } from "solid-js";
import {
  AlertComponentProps,
  createFormAction,
  createQuery,
  Input,
  ModalContainer,
  RadioGroup,
  TextArea,
} from "panther";
import { t3 } from "lib";
import { serverActions } from "~/server_actions";
import type { CustomPrompt } from "lib";

type Props = {
  initialContent: string;
  existingPrompt?: CustomPrompt;
};

export type SaveToPromptLibraryResult = { saved: true } | undefined;

export function SaveToPromptLibraryModal(
  p: AlertComponentProps<Props, SaveToPromptLibraryResult>,
) {
  const isEdit = () => !!p.existingPrompt;

  const [name, setName] = createSignal(p.existingPrompt?.name ?? "");
  const [content, setContent] = createSignal(
    p.existingPrompt?.content ?? p.initialContent,
  );
  const [category, setCategory] = createSignal(
    p.existingPrompt?.category ?? "",
  );
  const [scope, setScope] = createSignal<"user" | "country">(
    p.existingPrompt?.scope ?? "user",
  );
  const categories = createQuery(() => serverActions.getCustomPrompts({}));
  // The datalist is an aid, so a failed fetch leaves it empty rather than
  // blocking the form.
  const existingCategories = (): string[] => {
    const st = categories.state();
    if (st.status !== "ready") {
      return [];
    }
    return [...new Set(st.data.map((pr) => pr.category).filter(Boolean))]
      .sort();
  };

  const save = createFormAction(
    async () => {
      const trimmedName = name().trim();
      const trimmedContent = content().trim();
      if (!trimmedName) {
        return {
          success: false as const,
          err: t3({
            en: "Name is required",
            fr: "Le nom est requis",
            pt: "O nome é obrigatório",
          }),
        };
      }
      if (!trimmedContent) {
        return {
          success: false as const,
          err: t3({
            en: "Prompt content is required",
            fr: "Le contenu du prompt est requis",
            pt: "O conteúdo do prompt é obrigatório",
          }),
        };
      }
      const fields = {
        name: trimmedName,
        content: trimmedContent,
        category: category().trim(),
        scope: scope(),
      };
      const existing = p.existingPrompt;
      return existing
        ? await serverActions.updateCustomPrompt({ id: existing.id, ...fields })
        : await serverActions.createCustomPrompt(fields);
    },
    () => p.close({ saved: true }),
  );

  return (
    <ModalContainer
      title={isEdit()
        ? t3({
          en: "Edit prompt",
          fr: "Modifier le prompt",
          pt: "Editar prompt",
        })
        : t3({
          en: "Save to prompt library",
          fr: "Enregistrer dans la bibliothèque",
          pt: "Guardar na biblioteca de prompts",
        })}
      width="lg"
      scroll="content"
      onCancel={() => p.close(undefined)}
      actions={[
        {
          label: t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" }),
          onClick: save.click,
          state: save.state(),
          // Button shows a spinner for a loading state but stays clickable.
          disabled: save.state().status === "loading",
        },
      ]}
    >
      <div class="flex flex-col gap-4">
        <Input
          label={t3({ en: "Name", fr: "Nom", pt: "Nome" })}
          value={name()}
          onChange={setName}
          placeholder={t3({
            en: "e.g. Summarise key findings",
            fr: "ex. Résumer les points clés",
            pt: "ex. Resumir as principais conclusões",
          })}
          fullWidth
          autoFocus
        />
        <div>
          <Input
            label={t3({ en: "Category", fr: "Catégorie", pt: "Categoria" })}
            value={category()}
            onChange={setCategory}
            placeholder={t3({
              en: "e.g. Analysis, Reporting...",
              fr: "ex. Analyse, Rapport...",
              pt: "ex. Análise, Relatórios...",
            })}
            fullWidth
            list="prompt-categories"
          />
          <datalist id="prompt-categories">
            <For each={existingCategories()}>
              {(cat) => <option value={cat} />}
            </For>
          </datalist>
        </div>
        <TextArea
          label={t3({ en: "Prompt", fr: "Prompt", pt: "Prompt" })}
          value={content()}
          onChange={setContent}
          fullWidth
          height="200px"
        />
        <RadioGroup
          label={t3({ en: "Visibility", fr: "Visibilité", pt: "Visibilidade" })}
          value={scope()}
          onChange={(v) => setScope(v as "user" | "country")}
          horizontal
          options={[
            {
              value: "user",
              label: t3({
                en: "My prompts (private)",
                fr: "Mes prompts (privé)",
                pt: "Os meus prompts (privado)",
              }),
            },
            {
              value: "country",
              label: t3({
                en: "Country prompts (shared)",
                fr: "Prompts pays (partagé)",
                pt: "Prompts do país (partilhado)",
              }),
            },
          ]}
        />
      </div>
    </ModalContainer>
  );
}
