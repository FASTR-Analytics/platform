import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import type {
  HfaDictionaryForValidation,
  HfaIndicator,
  HfaIndicatorCategory,
  HfaIndicatorCode,
  HfaIndicatorServiceCategory,
  HfaIndicatorSubCategory,
  HfaIndicatorVariantCode,
  HfaIndicatorVariantGroup,
  HfaIndicatorVariantItem,
  HfaWorkbookImportResult,
} from "../../types/mod.ts";
import {
  HFA_INDICATOR_ID_REGEX,
  HFA_VARIANT_ITEM_ID_REGEX,
  isReservedHfaId,
} from "../../hfa_indicator_code.ts";
import { route } from "../route-utils.ts";

const hfaIndicatorCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaIndicatorSubCategorySchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaIndicatorServiceCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaIndicatorVariantGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const hfaVariantItemIdSchema = z
  .string()
  .regex(
    HFA_VARIANT_ITEM_ID_REGEX,
    "item id must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 characters)",
  );

const hfaIndicatorVariantItemSchema = z.object({
  id: hfaVariantItemIdSchema,
  groupId: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

export const hfaIndicatorVariantCodeSchema = z.object({
  indicatorId: z.string(),
  timePoint: z.string(),
  itemId: z.string(),
  code: z.string(),
});

const RESERVED_INDICATOR_ID_MESSAGE =
  "Indicator ID is reserved: indicator code or the analysis script already gives it a meaning. Choose a different ID";

const hfaIndicatorIdShapeSchema = z
  .string()
  .regex(
    HFA_INDICATOR_ID_REGEX,
    "Indicator ID must start with a letter and contain only letters, digits, and underscores (max 64 characters)",
  );

const hfaIndicatorIdSchema = hfaIndicatorIdShapeSchema.refine(
  (n) => !isReservedHfaId(n),
  RESERVED_INDICATOR_ID_MESSAGE,
);

// Shape only. The update paths identify the row by indicatorId and never
// change it, so the body carries the stored id back unchanged. Applying the
// reserved-word rule to it would lock every indicator whose id predates the
// rule out of all edits: and fail a whole bulk batch atomically.
export const hfaIndicatorEditSchema = z.object({
  indicatorId: hfaIndicatorIdShapeSchema,
  categoryId: z.string().nullable(),
  subCategoryId: z.string().nullable(),
  serviceCategoryIds: z.array(z.string()),
  shortLabel: z.string(),
  definition: z.string(),
  type: z.enum(["binary", "numeric"]),
  aggregation: z.enum(["sum", "avg"]),
  sortOrder: z.number(),
  variantGroupId: z.string().nullable(),
});

// Batch and workbook creation paths carry ids the client assigned with
// nextHfaIndicatorId; an id entering the dictionary must also clear the
// reserved set. The single create route assigns the id on the server.
const hfaIndicatorSchema = hfaIndicatorEditSchema.extend({
  indicatorId: hfaIndicatorIdSchema,
});
const hfaIndicatorCreateSchema = hfaIndicatorEditSchema.omit({
  indicatorId: true,
});

export const hfaIndicatorCodeSchema = z.object({
  indicatorId: z.string(),
  timePoint: z.string(),
  code: z.string(),
  filterCode: z.string().optional(),
});

const hfaWorkbookImportSchema = z.object({
  categories: z.array(z.object({ id: z.string(), label: z.string() })),
  subCategories: z.array(
    z.object({ id: z.string(), categoryId: z.string(), label: z.string() }),
  ),
  serviceCategories: z.array(z.object({ id: z.string(), label: z.string() })),
  variantGroups: z.array(z.object({ id: z.string(), label: z.string() })),
  variantItems: z.array(
    z.object({
      id: hfaVariantItemIdSchema,
      groupId: z.string(),
      label: z.string(),
    }),
  ),
  indicators: z.array(z.object({
    indicatorId: hfaIndicatorIdSchema,
    categoryId: z.string().nullable(),
    subCategoryId: z.string().nullable(),
    serviceCategoryIds: z.array(z.string()),
    shortLabel: z.string(),
    definition: z.string(),
    type: z.enum(["binary", "numeric"]),
    aggregation: z.enum(["sum", "avg"]),
    variantGroupId: z.string().nullable(),
  })),
  code: z.array(hfaIndicatorCodeSchema),
  variantCode: z.array(hfaIndicatorVariantCodeSchema),
  replaceAll: z.boolean(),
});

const idBodySchema = z.object({ id: z.string() });
const orderedIdsBodySchema = z.object({ orderedIds: z.array(z.string()) });

export const hfaIndicatorRouteRegistry = {
  // Categories
  getHfaIndicatorCategories: route({
    path: "/hfa-indicator-categories",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaIndicatorCategory[],
  }),
  createHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ category: hfaIndicatorCategorySchema }),
  }),
  updateHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories/update",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ oldId: z.string(), category: hfaIndicatorCategorySchema }),
  }),
  deleteHfaIndicatorCategory: route({
    path: "/hfa-indicator-categories/delete",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: idBodySchema,
  }),
  reorderHfaIndicatorCategories: route({
    path: "/hfa-indicator-categories/reorder",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: orderedIdsBodySchema,
  }),
  // Sub-categories
  getHfaIndicatorSubCategories: route({
    path: "/hfa-indicator-sub-categories",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaIndicatorSubCategory[],
  }),
  createHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ subCategory: hfaIndicatorSubCategorySchema }),
  }),
  updateHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories/update",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      oldId: z.string(),
      subCategory: hfaIndicatorSubCategorySchema,
    }),
  }),
  deleteHfaIndicatorSubCategory: route({
    path: "/hfa-indicator-sub-categories/delete",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: idBodySchema,
  }),
  reorderHfaIndicatorSubCategories: route({
    path: "/hfa-indicator-sub-categories/reorder",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ categoryId: z.string(), orderedIds: z.array(z.string()) }),
  }),
  // Service categories
  getHfaIndicatorServiceCategories: route({
    path: "/hfa-indicator-service-categories",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaIndicatorServiceCategory[],
  }),
  createHfaIndicatorServiceCategory: route({
    path: "/hfa-indicator-service-categories",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ serviceCategory: hfaIndicatorServiceCategorySchema }),
  }),
  updateHfaIndicatorServiceCategory: route({
    path: "/hfa-indicator-service-categories/update",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      oldId: z.string(),
      serviceCategory: hfaIndicatorServiceCategorySchema,
    }),
  }),
  deleteHfaIndicatorServiceCategory: route({
    path: "/hfa-indicator-service-categories/delete",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: idBodySchema,
  }),
  reorderHfaIndicatorServiceCategories: route({
    path: "/hfa-indicator-service-categories/reorder",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: orderedIdsBodySchema,
  }),
  // Variant groups
  getHfaIndicatorVariantGroups: route({
    path: "/hfa-indicator-variant-groups",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaIndicatorVariantGroup[],
  }),
  createHfaIndicatorVariantGroup: route({
    path: "/hfa-indicator-variant-groups",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ group: hfaIndicatorVariantGroupSchema }),
  }),
  updateHfaIndicatorVariantGroup: route({
    path: "/hfa-indicator-variant-groups/update",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      oldId: z.string(),
      group: hfaIndicatorVariantGroupSchema,
    }),
  }),
  deleteHfaIndicatorVariantGroup: route({
    path: "/hfa-indicator-variant-groups/delete",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: idBodySchema,
  }),
  reorderHfaIndicatorVariantGroups: route({
    path: "/hfa-indicator-variant-groups/reorder",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: orderedIdsBodySchema,
  }),
  // Variant items
  getHfaIndicatorVariantItems: route({
    path: "/hfa-indicator-variant-items",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaIndicatorVariantItem[],
  }),
  createHfaIndicatorVariantItem: route({
    path: "/hfa-indicator-variant-items",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ item: hfaIndicatorVariantItemSchema }),
  }),
  updateHfaIndicatorVariantItem: route({
    path: "/hfa-indicator-variant-items/update",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ oldId: z.string(), item: hfaIndicatorVariantItemSchema }),
  }),
  deleteHfaIndicatorVariantItem: route({
    path: "/hfa-indicator-variant-items/delete",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: idBodySchema,
  }),
  reorderHfaIndicatorVariantItems: route({
    path: "/hfa-indicator-variant-items/reorder",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ groupId: z.string(), orderedIds: z.array(z.string()) }),
  }),
  // Indicators
  getHfaIndicators: route({
    path: "/hfa-indicators",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaIndicator[],
  }),
  createHfaIndicator: route({
    path: "/hfa-indicators",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ indicator: hfaIndicatorCreateSchema }),
    response: {} as { indicatorId: string },
  }),
  updateHfaIndicator: route({
    path: "/hfa-indicators/update",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ indicator: hfaIndicatorEditSchema }),
  }),
  deleteHfaIndicators: route({
    path: "/hfa-indicators/delete",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ indicatorIds: z.array(z.string()) }),
  }),
  batchUploadHfaIndicators: route({
    path: "/hfa-indicators/batch",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      indicators: z.array(hfaIndicatorSchema),
      code: z.array(hfaIndicatorCodeSchema),
      variantCode: z.array(hfaIndicatorVariantCodeSchema),
    }),
    response: {} as { createdIndicatorIds: string[] },
  }),
  importHfaIndicatorsWorkbook: route({
    path: "/hfa-indicators/import-workbook",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: hfaWorkbookImportSchema,
    response: {} as HfaWorkbookImportResult,
  }),
  getHfaIndicatorCode: route({
    path: "/hfa-indicators/code",
    method: "POST",
    guard: GUARD.permission("can_view_data"),
    body: z.object({ indicatorId: z.string() }),
    response: {} as HfaIndicatorCode[],
  }),
  getAllHfaIndicatorCode: route({
    path: "/hfa-indicators/code/all",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaIndicatorCode[],
  }),
  getHfaIndicatorVariantCode: route({
    path: "/hfa-indicators/variant-code",
    method: "POST",
    guard: GUARD.permission("can_view_data"),
    body: z.object({ indicatorId: z.string() }),
    response: {} as HfaIndicatorVariantCode[],
  }),
  getAllHfaIndicatorVariantCode: route({
    path: "/hfa-indicators/variant-code/all",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaIndicatorVariantCode[],
  }),
  saveHfaIndicatorFull: route({
    path: "/hfa-indicators/save-full",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      indicator: hfaIndicatorEditSchema,
      code: z.array(hfaIndicatorCodeSchema.omit({ indicatorId: true })),
      variantCode: z.array(
        hfaIndicatorVariantCodeSchema.omit({ indicatorId: true }),
      ),
    }),
  }),
  // update_hfa_indicators' save; its contract is saveHfaIndicatorsBatch.
  saveHfaIndicatorsBatch: route({
    path: "/hfa-indicators/save-batch",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      indicators: z.array(z.object({
        indicator: hfaIndicatorEditSchema,
        code: z.array(hfaIndicatorCodeSchema.omit({ indicatorId: true }))
          .optional(),
        variantCode: z.array(
          hfaIndicatorVariantCodeSchema.omit({ indicatorId: true }),
        ).optional(),
      })).min(1),
    }),
  }),
  getHfaDictionaryForValidation: route({
    path: "/hfa-indicators/dictionary",
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    response: {} as HfaDictionaryForValidation,
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
