import {
  t3,
  type DatasetHmisWindowingCommon,
  type InstanceConfigFacilityColumns,
} from "lib";

// Validation + normalization applied to an HMIS windowing before it is sent
// to the server (per-project dataset settings and the results-package
// wizard): non-take-all selections must be non-empty; an active AA3
// selection clears the AA2 one; facility take-alls collapse to the instance
// facility-columns config.
export function validateAndNormalizeHmisWindowing(
  windowing: DatasetHmisWindowingCommon,
  facilityColumns: InstanceConfigFacilityColumns,
):
  | { success: true; windowing: DatasetHmisWindowingCommon }
  | { success: false; err: string } {
  if (
    !windowing.takeAllIndicators &&
    windowing.commonIndicatorsToInclude.length === 0
  ) {
    return {
      success: false,
      err: t3({
        en: "You must select at least one indicator",
        fr: "Vous devez sélectionner au moins un indicateur",
        pt: "Tem de selecionar pelo menos um indicador",
      }),
    };
  }

  const atLeastOneAdminAreaErr = {
    success: false as const,
    err: t3({
      en: "You must select at least one admin area",
      fr: "Vous devez sélectionner au moins une zone administrative",
      pt: "Tem de selecionar pelo menos uma zona administrativa",
    }),
  };
  const aa3Active = !(windowing.takeAllAdminArea3s ?? true);
  const aa3Items = windowing.adminArea3sToInclude ?? [];
  if (aa3Active) {
    if (aa3Items.length === 0) {
      return atLeastOneAdminAreaErr;
    }
  } else if (
    !windowing.takeAllAdminArea2s &&
    windowing.adminArea2sToInclude.length === 0
  ) {
    return atLeastOneAdminAreaErr;
  }

  if (
    facilityColumns.includeOwnership &&
    windowing.takeAllFacilityOwnerships === false &&
    (windowing.facilityOwnwershipsToInclude === undefined ||
      windowing.facilityOwnwershipsToInclude.length === 0)
  ) {
    return {
      success: false,
      err: t3({
        en: "You must select at least one facility ownership category",
        fr: "Vous devez sélectionner au moins une catégorie de propriété d'établissement",
        pt: "Tem de selecionar pelo menos uma categoria de propriedade de estabelecimento de saúde",
      }),
    };
  }

  if (
    facilityColumns.includeTypes &&
    windowing.takeAllFacilityTypes === false &&
    (windowing.facilityTypesToInclude === undefined ||
      windowing.facilityTypesToInclude.length === 0)
  ) {
    return {
      success: false,
      err: t3({
        en: "You must select at least one facility type",
        fr: "Vous devez sélectionner au moins un type d'établissement",
        pt: "Tem de selecionar pelo menos um tipo de estabelecimento de saúde",
      }),
    };
  }

  const takeAllFacilityOwnerships =
    facilityColumns.includeOwnership &&
    windowing.takeAllFacilityOwnerships !== false;
  const takeAllFacilityTypes =
    facilityColumns.includeTypes && windowing.takeAllFacilityTypes !== false;

  return {
    success: true,
    windowing: {
      ...windowing,
      ...(aa3Active
        ? { takeAllAdminArea2s: true, adminArea2sToInclude: [] }
        : {}),
      takeAllFacilityOwnerships,
      facilityOwnwershipsToInclude:
        windowing.facilityOwnwershipsToInclude ?? [],
      takeAllFacilityTypes,
      facilityTypesToInclude: windowing.facilityTypesToInclude ?? [],
    },
  };
}
