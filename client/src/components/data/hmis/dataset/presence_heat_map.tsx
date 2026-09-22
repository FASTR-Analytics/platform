import { getCalendar, t3, type PeriodBounds } from "lib";
import { formatPeriod } from "panther";
import { For, Show, createMemo } from "solid-js";

export type HeatMapAxis = "month" | "year";

type Props = {
  // The explorer's rows after the indicator filter: one per indicator × month
  // with records, under `indicator_common_id` and `period_id`.
  vizItems: Record<string, string>[];
  indicators: string[];
  labelReplacements: Record<string, string>;
  periodBounds: PeriodBounds;
  axis: HeatMapAxis;
};

type Column = { key: number; title: string };
type YearGroup = { year: number; span: number };

// Presence, not magnitude (PLAN_A8 ruling 3): a cell is filled where the
// indicator has at least one record in the period. A DOM grid rather than a
// panther figure (ruling 4): hover comes from the title attribute.
export function PresenceHeatMap(p: Props) {
  const columns = createMemo<Column[]>(() =>
    p.axis === "month"
      ? enumerateMonths(p.periodBounds).map((periodId) => ({
          key: periodId,
          title: formatPeriod(periodId, "year-month", getCalendar()),
        }))
      : enumerateYears(p.periodBounds).map((year) => ({
          key: year,
          title: String(year),
        })),
  );

  const yearGroups = createMemo<YearGroup[]>(() => {
    const groups: YearGroup[] = [];
    for (const periodId of enumerateMonths(p.periodBounds)) {
      const year = Math.floor(periodId / 100);
      const last = groups[groups.length - 1];
      if (last && last.year === year) {
        last.span++;
      } else {
        groups.push({ year, span: 1 });
      }
    }
    return groups;
  });

  const filled = createMemo(() => {
    const set = new Set<string>();
    for (const row of p.vizItems) {
      const periodId = Number(row["period_id"]);
      const key = p.axis === "month" ? periodId : Math.floor(periodId / 100);
      set.add(`${row["indicator_common_id"]}|${key}`);
    }
    return set;
  });

  const labelOf = (id: string) => p.labelReplacements[id] ?? id;

  return (
    <div class="w-full overflow-x-auto">
      <table class="border-separate border-spacing-0 text-xs">
        <thead>
          <tr class="h-5">
            <th class="bg-base-100 sticky left-0 z-10" />
            <Show
              when={p.axis === "month"}
              fallback={
                <For each={columns()}>
                  {(col) => (
                    <th class="font-400 px-2 pb-1 text-center align-bottom">
                      {col.title}
                    </th>
                  )}
                </For>
              }
            >
              <For each={yearGroups()}>
                {(group) => (
                  <th
                    colSpan={group.span}
                    class="border-base-300 font-400 border-l pl-1 text-left align-bottom"
                  >
                    {group.year}
                  </th>
                )}
              </For>
            </Show>
          </tr>
        </thead>
        <tbody>
          <For each={p.indicators}>
            {(id) => (
              <tr>
                <td
                  class="bg-base-100 sticky left-0 z-10 max-w-64 truncate pr-2 pl-0"
                  title={labelOf(id)}
                >
                  {labelOf(id)}
                </td>
                <For each={columns()}>
                  {(col) => (
                    <td class="p-px">
                      <div
                        class={`h-4 rounded-sm border ${
                          p.axis === "year" ? "w-full min-w-4" : "w-4"
                        } ${
                          filled().has(`${id}|${col.key}`)
                            ? "bg-success border-success"
                            : "border-base-300"
                        }`}
                        title={`${labelOf(id)} · ${col.title}${
                          filled().has(`${id}|${col.key}`)
                            ? ""
                            : ` · ${t3({ en: "no data", fr: "aucune donnée", pt: "sem dados" })}`
                        }`}
                      />
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

function enumerateMonths(bounds: PeriodBounds): number[] {
  const out: number[] = [];
  let year = Math.floor(bounds.min / 100);
  let month = bounds.min % 100;
  while (year * 100 + month <= bounds.max) {
    out.push(year * 100 + month);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
}

function enumerateYears(bounds: PeriodBounds): number[] {
  const out: number[] = [];
  for (
    let year = Math.floor(bounds.min / 100);
    year <= Math.floor(bounds.max / 100);
    year++
  ) {
    out.push(year);
  }
  return out;
}
