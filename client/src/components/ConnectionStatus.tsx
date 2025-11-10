import { Show } from "solid-js";
import { useConnectionMonitor } from "~/utils/connection-monitor";

export function ConnectionStatus() {
  const { isOnline, connectionIssues } = useConnectionMonitor();

  return (
    <Show when={!isOnline() || connectionIssues()}>
      <div
        class={`ui-pad fixed bottom-5 right-5 z-50 rounded text-sm font-400 text-white shadow-lg ${
          connectionIssues() ? "bg-danger" : "bg-neutral"
        }`}
      >
        {!isOnline()
          ? "🔌 No internet connection"
          : "⚠️ Connection issues detected - requests may be slow"}
      </div>
    </Show>
  );
}
