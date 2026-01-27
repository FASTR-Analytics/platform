import { get, set, del } from "idb-keyval";
import type { AiContentSlideInput } from "lib";

type WhiteboardData = {
  input: AiContentSlideInput | null;
  lastUpdated: string;
};

export async function loadWhiteboard(conversationId: string): Promise<WhiteboardData | undefined> {
  return await get<WhiteboardData>(`whiteboard/${conversationId}`);
}

export async function saveWhiteboard(conversationId: string, input: AiContentSlideInput | null): Promise<void> {
  await set(`whiteboard/${conversationId}`, {
    input,
    lastUpdated: new Date().toISOString(),
  } satisfies WhiteboardData);
}

export async function clearWhiteboard(conversationId: string): Promise<void> {
  await del(`whiteboard/${conversationId}`);
}
