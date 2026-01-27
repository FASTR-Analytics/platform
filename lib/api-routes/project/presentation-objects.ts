import { route } from "../route-utils.ts";
import {
  DisaggregationDisplayOption,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PeriodFilter,
  PeriodOption,
  PresentationObjectConfig,
  PresentationObjectDetail,
  PresentationObjectSummary,
  PresentationOption,
  ReplicantOptionsForPresentationObject,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
} from "../../types/mod.ts";

export const presentationObjectRouteRegistry = {
  createPresentationObject: route({
    path: "/presentation_objects",
    method: "POST",
    body: {} as {
      label: string;
      resultsValue: ResultsValue;
      config: PresentationObjectConfig;
      makeDefault: boolean;
      folderId?: string | null;
    },
    response: {} as {
      newPresentationObjectId: string;
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  duplicatePresentationObject: route({
    path: "/duplicate_presentation_object/:po_id",
    method: "POST",
    params: {} as { po_id: string },
    body: {} as {
      label: string;
      folderId?: string | null;
    },
    response: {} as {
      newPresentationObjectId: string;
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  getAllPresentationObjects: route({
    path: "/presentation_objects",
    method: "GET",
    response: {} as PresentationObjectSummary[],
    requiresProject: true,
  }),

  getPresentationObjectDetail: route({
    path: "/presentation_objects/:po_id",
    method: "GET",
    params: {} as { po_id: string },
    response: {} as PresentationObjectDetail,
    requiresProject: true,
  }),

  updatePresentationObjectLabel: route({
    path: "/presentation_object_label/:po_id",
    method: "POST",
    params: {} as { po_id: string },
    body: {} as {
      label: string;
    },
    response: {} as {
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  updatePresentationObjectConfig: route({
    path: "/presentation_object_config/:po_id",
    method: "POST",
    params: {} as { po_id: string },
    body: {} as {
      config: PresentationObjectConfig;
    },
    response: {} as {
      lastUpdated: string;
      reportItemsThatDependOnPresentationObjects: string[];
    },
    requiresProject: true,
  }),

  deletePresentationObject: route({
    path: "/presentation_objects/:po_id",
    method: "DELETE",
    params: {} as { po_id: string },
    response: {} as {
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  getPresentationObjectItems: route({
    path: "/presentation_object_items",
    method: "POST",
    body: {} as {
      resultsObjectId: string;
      fetchConfig: GenericLongFormFetchConfig;
      firstPeriodOption: PeriodOption | undefined;
    },
    response: {} as ItemsHolderPresentationObject,
    requiresProject: true,
  }),

  // getResultsObjectVariableInfo: route({
  //   path: "/results_object_variable_info",
  //   method: "POST",
  //   body: {} as {
  //     resultsObjectId: string;
  //     firstPeriodOption: PeriodOption | undefined;
  //     disaggregationOptions: DisaggregationOption[];
  //     moduleId: string;
  //     moduleLastRun: string;
  //   },
  //   response: {} as ResultsValueInfoForPresentationObject,
  //   requiresProject: true,
  // }),

  getResultsValueInfoForPresentationObject: route({
    path: "/results_value_info",
    method: "POST",
    body: {} as {
      metricId: string;
    },
    response: {} as ResultsValueInfoForPresentationObject,
    requiresProject: true,
  }),

  getReplicantOptions: route({
    path: "/replicant_options",
    method: "POST",
    body: {} as {
      resultsObjectId: string;
      replicateBy: DisaggregationOption;
      fetchConfig: GenericLongFormFetchConfig;
    },
    response: {} as ReplicantOptionsForPresentationObject,
    requiresProject: true,
  }),

  deleteAIVisualization: route({
    path: "/presentation_objects/ai/:po_id",
    method: "DELETE",
    params: {} as { po_id: string },
    response: {} as {
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  updateAIVisualization: route({
    path: "/presentation_objects/ai/:po_id",
    method: "POST",
    params: {} as { po_id: string },
    body: {} as {
      label?: string;
      presentationType?: PresentationOption;
      disaggregations?: { dimension: DisaggregationOption; displayAs: string }[];
      filters?: { dimension: DisaggregationOption; values: string[] }[];
      periodFilter?: { startPeriod?: number; endPeriod?: number } | null;
      valuesFilter?: string[] | null;
      valuesDisDisplayOpt?: DisaggregationDisplayOption;
      caption?: string;
      subCaption?: string;
      footnote?: string;
    },
    response: {} as {
      lastUpdated: string;
      reportItemsThatDependOnPresentationObjects: string[];
    },
    requiresProject: true,
  }),
} as const;

export type PresentationObjectRouteRegistry =
  typeof presentationObjectRouteRegistry;
