import type { InstanceCalendar } from "./types/instance.ts";

// The month a date falls in, as a period id (YYYYMM) in the given calendar.
// The app models both calendars as 12 months a year (no Pagume): Ethiopian
// month 1 is Gregorian September, and the Ethiopian year is the Gregorian
// year less 7 from September and less 8 before it.
export function periodIdForDate(
  calendar: InstanceCalendar,
  date: Date,
): number {
  const gregorianYear = date.getFullYear();
  const gregorianMonth = date.getMonth() + 1;
  if (calendar === "ethiopian") {
    if (gregorianMonth >= 9) {
      return (gregorianYear - 7) * 100 + (gregorianMonth - 8);
    }
    return (gregorianYear - 8) * 100 + (gregorianMonth + 4);
  }
  return gregorianYear * 100 + gregorianMonth;
}
