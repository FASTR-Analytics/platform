import { plural } from "panther";

export function slidesLabel(n: number): string {
  return `${n} ${plural(n, { one: "slide", other: "slides" })}`;
}

export function figuresLabel(n: number): string {
  return `${n} ${plural(n, { one: "figure", other: "figures" })}`;
}
