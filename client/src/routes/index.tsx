import { LoggedInWrapper } from "~/components/LoggedInWrapper";
import Instance from "~/components/instance/index";
import { setCalendar, setLanguage } from "lib";
import type { Language } from "panther";
import { InstanceSSEBoundary } from "~/state/instance_sse";

export default function InstanceLoggedInWrapper() {
  return (
    <LoggedInWrapper>
      {(globalUser, attemptSignOut) => {
        const storedLang = localStorage.getItem("fastrLanguage") as Language | null;
        setLanguage(storedLang ?? globalUser.instanceLanguage);
        setCalendar(globalUser.instanceCalendar);
        return (
          <InstanceSSEBoundary>
            <Instance attemptSignOut={attemptSignOut} />
          </InstanceSSEBoundary>
        );
      }}
    </LoggedInWrapper>
  );
}
