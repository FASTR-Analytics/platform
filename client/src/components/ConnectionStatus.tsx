import { Show } from "solid-js";
import { useConnectionMonitor } from "~/state/t4_connection_monitor";

export function ConnectionStatus() {
  const { isOnline, connectionIssues } = useConnectionMonitor();

  return (
    <Show when={!isOnline() || connectionIssues()}>
      <div
        class={`ui-pad font-400 fixed right-5 bottom-5 z-50 rounded text-sm shadow-lg ${
          connectionIssues()
            ? "bg-danger text-danger-content"
            : "bg-neutral text-neutral-content"
        }`}
      >
        {!isOnline()
          ? "🔌 No internet connection"
          : "⚠️ Connection issues detected - requests may be slow"}
      </div>
    </Show>
  );
}
