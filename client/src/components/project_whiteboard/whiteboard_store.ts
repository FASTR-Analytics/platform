import { get, set, del } from "idb-keyval";
import type { ContentSlide } from "lib";

type WhiteboardData = {
  content: ContentSlide | null;
  lastUpdated: string;
};

export async function loadWhiteboard(conversationId: string): Promise<WhiteboardData | undefined> {
  return await get<WhiteboardData>(`whiteboard/${conversationId}`);
}

export async function saveWhiteboard(conversationId: string, content: ContentSlide | null): Promise<void> {
  await set(`whiteboard/${conversationId}`, {
    content,
    lastUpdated: new Date().toISOString(),
  } satisfies WhiteboardData);
}

export async function clearWhiteboard(conversationId: string): Promise<void> {
  await del(`whiteboard/${conversationId}`);
}
