import { t3, type Dhis2ScheduleRecurrence } from "lib";

export function dayOfWeekLabel(day: number): string {
  const labels = [
    t3({ en: "Sunday", fr: "Dimanche", pt: "Domingo" }),
    t3({ en: "Monday", fr: "Lundi", pt: "Segunda-feira" }),
    t3({ en: "Tuesday", fr: "Mardi", pt: "Terça-feira" }),
    t3({ en: "Wednesday", fr: "Mercredi", pt: "Quarta-feira" }),
    t3({ en: "Thursday", fr: "Jeudi", pt: "Quinta-feira" }),
    t3({ en: "Friday", fr: "Vendredi", pt: "Sexta-feira" }),
    t3({ en: "Saturday", fr: "Samedi", pt: "Sábado" }),
  ];
  return labels[day] ?? String(day);
}

export function nthLabel(nth: 1 | 2 | 3 | 4 | "last"): string {
  const labels: Record<string, string> = {
    1: t3({ en: "First", fr: "Premier", pt: "Primeiro" }),
    2: t3({ en: "Second", fr: "Deuxième", pt: "Segundo" }),
    3: t3({ en: "Third", fr: "Troisième", pt: "Terceiro" }),
    4: t3({ en: "Fourth", fr: "Quatrième", pt: "Quarto" }),
    last: t3({ en: "Last", fr: "Dernier", pt: "Último" }),
  };
  return labels[String(nth)];
}

export function weekdayOfWallDate(wallDate: string): number {
  const [y, m, d] = wallDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function recurrenceLabel(rec: Dhis2ScheduleRecurrence): string {
  if (rec.kind === "daily") {
    return `${t3({ en: "Daily", fr: "Chaque jour", pt: "Diariamente" })} ${rec.startTime} (${rec.timezone})`;
  }
  if (rec.kind === "weekly") {
    const day = dayOfWeekLabel(weekdayOfWallDate(rec.firstRunDate));
    if (rec.everyNWeeks === 1) {
      return `${day} ${rec.startTime} (${rec.timezone}), ${t3({ en: "weekly", fr: "chaque semaine", pt: "semanalmente" })}`;
    }
    return `${day} ${rec.startTime} (${rec.timezone}), ${t3({ en: "every", fr: "toutes les", pt: "a cada" })} ${rec.everyNWeeks} ${t3({ en: "weeks from", fr: "semaines à partir du", pt: "semanas a partir de" })} ${rec.firstRunDate}`;
  }
  const nthDay = `${nthLabel(rec.nth)} ${dayOfWeekLabel(rec.weekday)}`;
  if (rec.everyNMonths === 1) {
    return `${nthDay} ${rec.startTime} (${rec.timezone}), ${t3({ en: "monthly", fr: "chaque mois", pt: "mensalmente" })}`;
  }
  return `${nthDay} ${rec.startTime} (${rec.timezone}), ${t3({ en: "every", fr: "tous les", pt: "a cada" })} ${rec.everyNMonths} ${t3({ en: "months from", fr: "mois à partir de", pt: "meses a partir de" })} ${rec.anchorMonth}`;
}
