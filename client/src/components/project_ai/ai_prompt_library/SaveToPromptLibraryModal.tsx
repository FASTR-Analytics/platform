import { createSignal, For, onMount } from "solid-js";
import {
  AlertComponentProps,
  Button,
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
  const [existingCategories, setExistingCategories] = createSignal<string[]>([]);
  const [isSaving, setIsSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  onMount(async () => {
    const res = await serverActions.getCustomPrompts({});
    if (res.success && res.data) {
      const cats = [...new Set(res.data.map((pr) => pr.category).filter(Boolean))].sort();
      setExistingCategories(cats);
    }
  });

  const handleSave = async () => {
    if (!name().trim()) {
      setError(t3({ en: "Name is required", fr: "Le nom est requis" }));
      return;
    }
    if (!content().trim()) {
      setError(t3({ en: "Prompt content is required", fr: "Le contenu du prompt est requis" }));
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      if (isEdit() && p.existingPrompt) {
        const res = await serverActions.updateCustomPrompt({
          id: p.existingPrompt.id,
          name: name().trim(),
          content: content().trim(),
          category: category().trim(),
          scope: scope(),
        });
        if (!res.success) {
          setError(res.err ?? t3({ en: "Failed to save", fr: "Échec de l'enregistrement" }));
          return;
        }
      } else {
        const res = await serverActions.createCustomPrompt({
          name: name().trim(),
          content: content().trim(),
          category: category().trim(),
          scope: scope(),
        });
        if (!res.success) {
          setError(res.err ?? t3({ en: "Failed to save", fr: "Échec de l'enregistrement" }));
          return;
        }
      }
      p.close({ saved: true });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalContainer
      title={
        isEdit()
          ? t3({ en: "Edit prompt", fr: "Modifier le prompt" })
          : t3({ en: "Save to prompt library", fr: "Enregistrer dans la bibliothèque" })
      }
      width="lg"
      scroll="content"
      rightButtons={[
        <Button onClick={() => p.close(undefined)} intent="neutral">
          {t3({ en: "Cancel", fr: "Annuler" })}
        </Button>,
        <Button onClick={handleSave} intent="primary" disabled={isSaving()}>
          {isSaving()
            ? t3({ en: "Saving...", fr: "Enregistrement..." })
            : t3({ en: "Save", fr: "Enregistrer" })}
        </Button>,
      ]}
    >
      <div class="flex flex-col gap-4">
        <Input
          label={t3({ en: "Name", fr: "Nom" })}
          value={name()}
          onChange={setName}
          placeholder={t3({ en: "e.g. Summarise key findings", fr: "ex. Résumer les points clés" })}
          fullWidth
          autoFocus
        />
        <div>
          <Input
            label={t3({ en: "Category", fr: "Catégorie" })}
            value={category()}
            onChange={setCategory}
            placeholder={t3({ en: "e.g. Analysis, Reporting...", fr: "ex. Analyse, Rapport..." })}
            fullWidth
          />
          <datalist id="prompt-categories">
            <For each={existingCategories()}>
              {(cat) => <option value={cat} />}
            </For>
          </datalist>
        </div>
        <TextArea
          label={t3({ en: "Prompt", fr: "Prompt" })}
          value={content()}
          onChange={setContent}
          fullWidth
          height="200px"
        />
        <RadioGroup
          label={t3({ en: "Visibility", fr: "Visibilité" })}
          value={scope()}
          onChange={(v) => setScope(v as "user" | "country")}
          horizontal
          options={[
            {
              value: "user",
              label: t3({ en: "My prompts (private)", fr: "Mes prompts (privé)" }),
            },
            {
              value: "country",
              label: t3({ en: "Country prompts (shared)", fr: "Prompts pays (partagé)" }),
            },
          ]}
        />
        {error() && (
          <div class="text-danger text-sm">{error()}</div>
        )}
      </div>
    </ModalContainer>
  );
}
