export type RunStreamMsg = {
  text: string;
  type:
    | "starting"
    | "r-output"
    | "r-error"
    | "download-file"
    | "upload-file"
    | "finished"
    | "close";
};
