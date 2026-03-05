import { LoggedInWrapper } from "~/components/LoggedInWrapper";
import Instance from "~/components/instance/index";
import { InstanceLanguage, setCalendar, setLanguage } from "lib";

export default function InstanceLoggedInWrapper() {
  return (
    <LoggedInWrapper>
      {(globalUser, attemptSignOut) => {
        const storedLang = localStorage.getItem("fastrLanguage") as InstanceLanguage | null;
        setLanguage(storedLang ?? globalUser.instanceLanguage);
        setCalendar(globalUser.instanceCalendar);
        return (
          <Instance globalUser={globalUser} attemptSignOut={attemptSignOut} />
        );
      }}
    </LoggedInWrapper>
  );
}
