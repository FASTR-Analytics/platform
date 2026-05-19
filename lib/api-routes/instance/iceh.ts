import type {
  IcehDataDetail,
  IcehIndicator,
  IcehDisaggregator,
  IcehDataRow,
} from "../../types/dataset_iceh.ts";
import type {
  IcehUploadAttemptDetail,
  IcehUploadStatusResponse,
  IcehStep1Result,
} from "../../types/dataset_iceh_import.ts";
import { route } from "../route-utils.ts";

export const icehRouteRegistry = {
  getDatasetIcehDetail: route({
    method: "GET",
    path: "/iceh/detail",
    response: {} as IcehDataDetail,
  }),
  getDatasetIcehIndicators: route({
    method: "GET",
    path: "/iceh/indicators",
    response: {} as IcehIndicator[],
  }),
  getDatasetIcehDisaggregators: route({
    method: "GET",
    path: "/iceh/disaggregators",
    response: {} as IcehDisaggregator[],
  }),
  getDatasetIcehData: route({
    method: "GET",
    path: "/iceh/data",
    response: {} as IcehDataRow[],
  }),
  createDatasetIcehUploadAttempt: route({
    method: "POST",
    path: "/iceh/upload-attempt",
  }),
  getDatasetIcehUploadAttempt: route({
    method: "GET",
    path: "/iceh/upload-attempt",
    response: {} as IcehUploadAttemptDetail | undefined,
  }),
  getDatasetIcehUploadStatus: route({
    method: "GET",
    path: "/iceh/upload-attempt/status",
    response: {} as IcehUploadStatusResponse,
  }),
  deleteDatasetIcehUploadAttempt: route({
    method: "DELETE",
    path: "/iceh/upload-attempt",
  }),
  updateDatasetIcehUploadAttemptStep1: route({
    method: "POST",
    path: "/iceh/upload-attempt/step1",
    body: {} as { zipAssetFileName: string },
    response: {} as IcehStep1Result,
  }),
  updateDatasetIcehUploadAttemptStep2: route({
    method: "POST",
    path: "/iceh/upload-attempt/step2",
  }),
  updateDatasetIcehUploadAttemptStep3: route({
    method: "POST",
    path: "/iceh/upload-attempt/step3",
  }),
  deleteDatasetIcehData: route({
    method: "DELETE",
    path: "/iceh/data",
  }),
};
