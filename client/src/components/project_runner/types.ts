import { JSX } from "solid-js";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "failed";

export type Props = {
  projectId: string;
  children: JSX.Element;
};