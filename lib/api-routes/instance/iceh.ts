import type {
  IcehDataDetail,
  IcehDisplayData,
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
  getDatasetIcehDisplayData: route({
    method: "GET",
    path: "/iceh/display-data",
    response: {} as IcehDisplayData,
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
    response: {} as IcehUploadStatusResponse | null,
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
