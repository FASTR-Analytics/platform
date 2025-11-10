import { LoggedInWrapper } from "~/components/LoggedInWrapper";
import Instance from "~/components/instance/index";
import { setCalendar, setLanguage } from "lib";

export default function InstanceLoggedInWrapper() {
  return (
    <LoggedInWrapper>
      {(globalUser, attemptSignOut) => {
        setLanguage(globalUser.instanceLanguage);
        setCalendar(globalUser.instanceCalendar);
        return (
          <Instance globalUser={globalUser} attemptSignOut={attemptSignOut} />
        );
      }}
    </LoggedInWrapper>
  );
}
