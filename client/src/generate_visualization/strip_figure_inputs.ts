import type { FigureInputs } from "panther";

export function stripFigureInputsForStorage(fi: FigureInputs): FigureInputs {
  const stripped: any = { ...fi, style: undefined };
  if ("mapData" in stripped && stripped.mapData) {
    stripped.mapData = { ...stripped.mapData, geoData: undefined };
  }
  return stripped;
}
