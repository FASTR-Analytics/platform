import { formatNigeriaAdminAreaLabel } from "lib";

export function getNigeriaAdminAreaLabelReplacements(
  jsonArray: any[],
): Record<string, string> {
  const replacements: Record<string, string> = {};

  const uniqueValues = new Set<string>();
  for (const item of jsonArray) {
    if (item.admin_area_3) {
      uniqueValues.add(item.admin_area_3);
    }
    if (item.admin_area_4) {
      uniqueValues.add(item.admin_area_4);
    }
  }

  for (const value of uniqueValues) {
    const formatted = formatNigeriaAdminAreaLabel(value);
    if (formatted !== value) {
      replacements[value] = formatted;
    }
  }

  return replacements;
}
