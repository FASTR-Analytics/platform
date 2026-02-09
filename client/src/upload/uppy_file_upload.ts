import Uppy from "@uppy/core";
import Dashboard from "@uppy/dashboard";
import Tus from "@uppy/tus";
import { _SERVER_HOST } from "~/server_actions/config";

export type UppyFileUploadConfig = {
  triggerId: string;
  onModalClosed?: () => void;
  maxNumberOfFiles?: number;
  autoProceed?: boolean;
  allowMultipleUploadBatches?: boolean;
  endpoint?: string;
  onUploadSuccess?: (file: any, response: any) => void;
  onComplete?: (result: any) => void;
  onUploadError?: (file: any, error: any) => void;
  headers?: Record<string, string>;
};

export function createUppyInstance(config: UppyFileUploadConfig): Uppy {
  const {
    triggerId,
    onModalClosed,
    maxNumberOfFiles = 1,
    autoProceed = false,
    allowMultipleUploadBatches = false,
    endpoint = `${_SERVER_HOST}/upload`,
    onUploadSuccess,
    onComplete,
    onUploadError,
    headers = {},
  } = config;

  const uppyConfig: any = {
    allowMultipleUploadBatches,
    autoProceed,
  };

  if (maxNumberOfFiles > 0) {
    uppyConfig.restrictions = {
      maxNumberOfFiles,
    };
  }

  const uppy = new Uppy(uppyConfig);

  uppy
    .use(Dashboard, {
      trigger: triggerId,
      proudlyDisplayPoweredByUppy: false,
      showProgressDetails: true,
      closeAfterFinish: true,
    })
    .use(Tus, {
      endpoint,
      chunkSize: 5 * 1024 * 1024, // 5MB chunks
      retryDelays: [0, 1000, 3000, 5000],
      parallelUploads: 1,
      withCredentials: true,
      storeFingerprintForResuming: false,
      headers,
      onBeforeRequest: async (req: any) => {
        // Add any custom headers before each request
        // Can be used for auth tokens etc.
      },
    });

  // Clear state when modal opens to ensure fresh state
  uppy.on("dashboard:modal-open", () => {
    uppy.clear();
  });

  // Always clear state when modal is closed to ensure fresh state on reopen
  uppy.on("dashboard:modal-closed", () => {
    // Clear all files and reset state
    uppy.clear();

    // Call user's onModalClosed callback if provided
    if (onModalClosed) {
      onModalClosed();
    }
  });

  if (onUploadSuccess) {
    uppy.on("upload-success", onUploadSuccess);
  }

  if (onComplete) {
    uppy.on("complete", onComplete);
  }

  if (onUploadError) {
    uppy.on("upload-error", onUploadError);
  }

  return uppy;
}

export function cleanupUppy(uppy: Uppy | undefined) {
  if (uppy) {
    uppy.clear();
    uppy.destroy();
  }
}
