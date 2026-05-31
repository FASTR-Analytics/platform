import { DashboardItem, t3 } from "lib";
import { EditableList, openPrompt } from "panther";

type Props = {
  items: DashboardItem[];
  canConfigure: boolean;
  onReorder: (oldIds: string[], newIds: string[]) => Promise<void>;
  onUpdateLabel: (itemId: string, label: string) => Promise<void>;
  onDelete: (item: DashboardItem) => Promise<void>;
};

export function DashboardItemList(p: Props) {
  async function editLabel(id: string) {
    const item = p.items.find((i) => i.id === id);
    if (!item) return;
    const next = await openPrompt({
      initialInputText: item.label,
      title: t3({ en: "Rename item", fr: "Renommer l'élément" }),
      saveButtonLabel: t3({ en: "Save", fr: "Sauvegarder" }),
    });
    const trimmed = next?.trim();
    if (trimmed && trimmed !== item.label) {
      await p.onUpdateLabel(id, trimmed);
    }
  }

  return (
    <EditableList<string>
      items={p.items.map((i) => ({ id: i.id, label: i.label }))}
      readOnly={!p.canConfigure}
      onReorder={(ids) =>
        p.onReorder(
          p.items.map((i) => i.id),
          ids,
        )
      }
      onEdit={editLabel}
      onDelete={([id]) => {
        const item = p.items.find((i) => i.id === id);
        if (item) p.onDelete(item);
      }}
      emptyMessage={t3({
        en: "No items yet. Click 'Add item' to start.",
        fr: "Aucun élément. Cliquez sur « Ajouter un élément ».",
      })}
    />
  );
}
