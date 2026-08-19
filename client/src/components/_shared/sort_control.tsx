import { ProductSortMode, t3 } from "lib";
import { Select } from "panther";

// ONE sort vocabulary across the app: `ProductSortMode` ("label" | "recent").
// "label" is what the thing is called — products, folders and packages all use
// that word for their display name, so the sort mode uses it too.
export function sortBySortMode<T>(
  items: readonly T[],
  mode: ProductSortMode,
  getLabel: (item: T) => string,
  getDate: (item: T) => string | undefined,
): T[] {
  const byLabel = (a: T, b: T) =>
    getLabel(a).localeCompare(getLabel(b), undefined, { sensitivity: "base" });
  if (mode === "label") {
    return [...items].sort(byLabel);
  }
  return [...items].sort((a, b) => {
    const da = getDate(a);
    const db = getDate(b);
    if (da === undefined && db === undefined) {
      return byLabel(a, b);
    }
    if (da === undefined) {
      return 1;
    }
    if (db === undefined) {
      return -1;
    }
    const cmp = db.localeCompare(da);
    return cmp !== 0 ? cmp : byLabel(a, b);
  });
}

type Props = {
  value: ProductSortMode;
  onChange: (mode: ProductSortMode) => void;
};

export function SortControl(p: Props) {
  return (
    <Select
      value={p.value}
      options={[
        { value: "label", label: t3({ en: "Name", fr: "Nom", pt: "Nome" }) },
        {
          value: "recent",
          label: t3({
            en: "Recently updated",
            fr: "Récemment modifié",
            pt: "Atualizado recentemente",
          }),
        },
      ]}
      onChange={(v) => p.onChange(v as ProductSortMode)}
    />
  );
}
