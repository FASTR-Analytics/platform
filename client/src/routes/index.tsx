import { LoggedInWrapper } from "~/components/LoggedInWrapper";
import Instance from "~/components/instance/index";
import { InstanceLanguage, setCalendar, setLanguage } from "lib";
import { InstanceSSEBoundary } from "~/state/instance_sse";

export default function InstanceLoggedInWrapper() {
  return (
    <LoggedInWrapper>
      {(globalUser, attemptSignOut) => {
        const storedLang = localStorage.getItem("fastrLanguage") as InstanceLanguage | null;
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
