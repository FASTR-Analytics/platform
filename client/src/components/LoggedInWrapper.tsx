import { Clerk } from "@clerk/clerk-js/headless";
import { clearDataCache } from "~/state/clear_data_cache";
import { GlobalUser, t, t2, T, createDevGlobalUser } from "lib";
import { Button, StateHolderWrapper, timQuery } from "panther";
import { JSX, Show, onMount } from "solid-js";
import { serverActions } from "~/server_actions";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkSignInFlow = import.meta.env.VITE_CLERK_SIGN_IN_FLOW;
const clerkSignUpFlow = import.meta.env.VITE_CLERK_SIGN_UP_FLOW;

// Only allow bypass auth if:
// 1. VITE_BYPASS_AUTH is set to true
// 2. Client is NOT built in production mode
const bypassAuth =
  import.meta.env.VITE_BYPASS_AUTH === "true" &&
  import.meta.env.MODE !== "production";

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
export const clerk = new Clerk(publishableKey);
if (!bypassAuth) {
  await clerk.load({
    // Set load options here
  });
}

type Props = {
  children: (
    globalUser: GlobalUser,
    attemptSignOut: () => Promise<void>,
  ) => JSX.Element;
};
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export function LoggedInWrapper(p: Props) {
  return (
    <Show when={bypassAuth || clerk.user} fallback={<ClerkNewLogin />}>
      {(_) => {
        ///////////////////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////////////////
        const loggedInInfo = bypassAuth
          ? {
              state: () => ({
                status: "ready" as const,
                data: createDevGlobalUser(
                  "Offline Development",
                  "en",
                  "gregorian",
                ),
              }),
            }
          : timQuery(
              () => serverActions.getCurrentUser({}),
              t2(T.FRENCH_UI_STRINGS.loading_1),
            );

        onMount(async () => {
          if (bypassAuth) return;
          try {
            const res = await serverActions.getInstanceMeta({});
            if (res.success) {
              const serverVersion = res.data.serverVersion;
              const storedVersion = localStorage.getItem("serverVersion");

              if (storedVersion && storedVersion !== serverVersion) {
                console.log(
                  `Server version changed from ${storedVersion} to ${serverVersion}, clearing cache...`,
                );
                await clearDataCache();
              }
              localStorage.setItem("serverVersion", serverVersion);
            }
          } catch (err) {
            console.error("Failed to check server version:", err);
          }
        });
        ///////////////////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////////////////
        ///////////////////////////////////////////////////////////////////////////////////

        async function attemptSignOut(): Promise<void> {
          // Note: Can't update loggedInInfo loading state with timQuery
          // but page will reload anyway
          if (!bypassAuth) {
            await clerk.signOut();
          }
          window.location.reload();
        }

        return (
          <StateHolderWrapper state={loggedInInfo.state()}>
            {(globalUserOrUndefined) => {
              return (
                <Show
                  when={globalUserOrUndefined}
                  fallback={
                    <div>{t("Not yet approved for this instance")}</div>
                  }
                >
                  {(_) => {
                    console.log(globalUserOrUndefined);
                    return p.children(globalUserOrUndefined, attemptSignOut);
                  }}
                </Show>
              );
            }}
          </StateHolderWrapper>
        );
      }}
    </Show>
  );
}

function ClerkNewLogin() {
  const instanceMeta = timQuery(
    () => serverActions.getInstanceMeta({}),
    t2(T.FRENCH_UI_STRINGS.loading_1),
  );

  return (
    <div class="h-full w-full overflow-y-auto">
      <div class="flex min-h-full w-full items-center justify-center">
        <div class="w-full pt-12 pb-72">
          <StateHolderWrapper state={instanceMeta.state()} spinner>
            {(keyedInstanceMeta) => {
              return (
                <div class="ui-spy px-4 text-center">
                  <img
                    src="/images/logo.png"
                    alt="Logo"
                    class="mx-auto mb-6 h-6"
                  />
                  <div class="font-700 text-4xl">
                    {t("FASTR Analytics Platform")}
                  </div>
                  <div class="font-700 text-xl">
                    {keyedInstanceMeta.instanceName}
                  </div>
                  <div class="ui-gap flex justify-center">
                    <Button
                      href={`${clerkSignInFlow}?redirect_url=${keyedInstanceMeta.instanceRedirectUrl}`}
                      iconName="login"
                    >
                      {t("Sign in")}
                    </Button>
                    <Button
                      href={`${clerkSignUpFlow}?redirect_url=${keyedInstanceMeta.instanceRedirectUrl}`}
                      iconName="userPlus"
                    >
                      {t("Sign up")}
                    </Button>
                  </div>
                </div>
              );
            }}
          </StateHolderWrapper>
        </div>
      </div>
    </div>
  );
}
