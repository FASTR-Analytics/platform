import { instanceState } from "~/state/instance/t1_store";

// The HFA indicator manager's write gate: one predicate, read by the
// manager's indicator write controls and, through the chat's tool guard, by
// the HFA write tools, so SYSTEM_05's open decision on the UI write gates
// (global admin here, can_configure_data on the routes) moves both at once.
export function canWriteHfaIndicators(): boolean {
  return instanceState.currentUserIsGlobalAdmin;
}
