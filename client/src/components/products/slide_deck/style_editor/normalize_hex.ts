// Shared by the inline ColorThemePicker and its modal. Lives in its own module
// so the two components don't have to import each other.
export function normalizeHex(input: string): string {
  const stripped = input.trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(stripped)) {
    return `#${stripped}`;
  }
  if (/^[0-9A-Fa-f]{3}$/.test(stripped)) {
    return `#${stripped}`;
  }
  return input;
}
