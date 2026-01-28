import { _SERVER_HOST } from "./config";

export type AnthropicFileResponse = {
  id: string;
  type: string;
  filename: string;
  size: number;
  created_at: string;
};

export async function uploadAssetToAnthropic(
  projectId: string,
  assetFilename: string
): Promise<{ success: true; file_id: string } | { success: false; error: string }> {
  try {
    const response = await fetch(`${_SERVER_HOST}/ai/files`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Project-Id": projectId,
      },
      body: JSON.stringify({ assetFilename }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData?.error?.message ?? `Upload failed: ${response.status}`,
      };
    }

    const data: AnthropicFileResponse = await response.json();
    return { success: true, file_id: data.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function deleteAnthropicFile(
  projectId: string,
  fileId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const response = await fetch(`${_SERVER_HOST}/ai/files/${fileId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Project-Id": projectId,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData?.error?.message ?? `Delete failed: ${response.status}`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
