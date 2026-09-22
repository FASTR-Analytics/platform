import { SortMode, t3 } from "lib";
import { Select, splitDataAttrs, type DataAttrs } from "panther";

export function sortBySortMode<T>(
  items: readonly T[],
  mode: SortMode,
  getName: (item: T) => string,
  getDate: (item: T) => string | undefined,
): T[] {
  const byName = (a: T, b: T) =>
    getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" });
  if (mode === "name") {
    return [...items].sort(byName);
  }
  return [...items].sort((a, b) => {
    const da = getDate(a);
    const db = getDate(b);
    if (da === undefined && db === undefined) {
      return byName(a, b);
    }
    if (da === undefined) {
      return 1;
    }
    if (db === undefined) {
      return -1;
    }
    const cmp = db.localeCompare(da);
    return cmp !== 0 ? cmp : byName(a, b);
  });
}

// DataAttrs so a tour anchor rides the component itself, as
// PROTOCOL_UI_COMPONENTS rule 9 requires, instead of a wrapper div.
type Props = {
  value: SortMode;
  onChange: (mode: SortMode) => void;
} & DataAttrs;

export function SortControl(p: Props) {
  const [dataAttrs] = splitDataAttrs(p);
  return (
    <Select
      {...dataAttrs}
      value={p.value}
      options={[
        { value: "name", label: t3({ en: "Name", fr: "Nom", pt: "Nome" }) },
        {
          value: "recent",
          label: t3({
            en: "Recently updated",
            fr: "Récemment modifié",
            pt: "Atualizado recentemente",
          }),
        },
      ]}
      onChange={(v) => p.onChange(v as SortMode)}
    />
  );
}
