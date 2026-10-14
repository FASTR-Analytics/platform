import Uppy from "@uppy/core";
import Dashboard from "@uppy/dashboard";
import Tus from "@uppy/tus";
import { _SERVER_HOST } from "~/server_actions";

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
  allowedFileTypes?: string[];
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
    allowedFileTypes,
  } = config;

  const uppyConfig: any = {
    allowMultipleUploadBatches,
    autoProceed,
  };

  const restrictions: Record<string, any> = {};
  if (maxNumberOfFiles > 0) restrictions.maxNumberOfFiles = maxNumberOfFiles;
  if (allowedFileTypes) restrictions.allowedFileTypes = allowedFileTypes;
  if (Object.keys(restrictions).length > 0) {
    uppyConfig.restrictions = restrictions;
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

// Ask the user for one image and store it as an instance asset, through the
// same upload dialog every other upload uses. Resolves with the asset's file
// name once the asset list has it (the list arrives over SSE, a moment after
// the upload itself), or undefined when the dialog is closed without one.
// For callers that have no trigger element of their own to hand Uppy (the
// report editor's toolbar and pickers ask through a callback).
export function requestImageAssetUpload(
  isListed: (fileName: string) => boolean,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const uppy = new Uppy({
      autoProceed: false,
      restrictions: { maxNumberOfFiles: 1, allowedFileTypes: ["image/*"] },
    });
    uppy
      .use(Dashboard, {
        proudlyDisplayPoweredByUppy: false,
        showProgressDetails: true,
        closeAfterFinish: true,
      })
      .use(Tus, {
        endpoint: `${_SERVER_HOST}/upload`,
        chunkSize: 5 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
        parallelUploads: 1,
        withCredentials: true,
        storeFingerprintForResuming: false,
      });
    let uploaded: string | undefined;
    uppy.on("upload-success", (file) => {
      if (file) uploaded = file.name as string;
    });
    uppy.on("dashboard:modal-closed", () => {
      const name = uploaded;
      cleanupUppy(uppy);
      if (name === undefined) {
        resolve(undefined);
        return;
      }
      // Wait for the asset to be listed, but not forever: the file is stored
      // either way, and a late listing only delays the picker's thumbnail.
      const started = Date.now();
      const poll = () => {
        if (isListed(name) || Date.now() - started > 15_000) resolve(name);
        else setTimeout(poll, 150);
      };
      poll();
    });
    (uppy.getPlugin("Dashboard") as unknown as { openModal: () => void })
      .openModal();
  });
}
