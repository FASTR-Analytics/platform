import { Clerk } from "@clerk/clerk-js";
import { frFR } from "@clerk/localizations";
import { clearDataCache } from "~/state/clear_data_cache";
import {
  GlobalUser,
  t3,
  TC,
  createDevGlobalUser,
  setLanguage,
  LANGUAGE_STORAGE_KEY,
} from "lib";
import type { Language } from "panther";
import { StateHolderWrapper, timQuery } from "panther";
import { JSX, Show, createSignal, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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
  const storedLang = localStorage.getItem(
    LANGUAGE_STORAGE_KEY,
  ) as Language | null;
  if (storedLang) {
    setLanguage(storedLang);
  }

  const [clerkLoaded, setClerkLoaded] = createSignal(bypassAuth);
  const [clerkUser, setClerkUser] = createSignal(clerk.user);

  onMount(async () => {
    if (!bypassAuth) {
      let lang = storedLang;
      if (!lang) {
        const res = await serverActions.getInstanceMeta({});
        if (res.success) {
          lang = res.data.instanceLanguage;
          setLanguage(lang);
        }
      }
      await clerk.load({
        localization: lang === "fr" ? frFR : undefined,
      });
      clerk.addListener((e) => setClerkUser(e.user ?? null));
      setClerkLoaded(true);
    }
  });

  return (
    <Show
      when={clerkLoaded()}
      fallback={<div />}
    >
      <Show
        when={bypassAuth || clerkUser()}
        fallback={<ClerkNewLogin />}
      >
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
            : timQuery(() => serverActions.getCurrentUser({}), t3(TC.loading));

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
                      <div class="ui-pad">
                        {t3({
                          en: "Not yet approved for this instance",
                          fr: "Pas encore approuvé pour cette instance",
                        })}
                      </div>
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
    </Show>
  );
}

function ClerkNewLogin() {
  let authEl!: HTMLDivElement;

  const isSignUp = new URLSearchParams(window.location.search).get("mode") === "sign-up";
  const [meta, setMeta] = createSignal<{ instanceName: string; instanceLanguage: Language } | null>(null);

  onMount(async () => {
    const res = await serverActions.getInstanceMeta({});
    if (res.success) {
      if (!localStorage.getItem(LANGUAGE_STORAGE_KEY)) {
        setLanguage(res.data.instanceLanguage);
      }
      setMeta(res.data);
      if (isSignUp) {
        clerk.mountSignUp(authEl, { signInUrl: "/", fallbackRedirectUrl: "/" });
      } else {
        clerk.mountSignIn(authEl, { signUpUrl: "/?mode=sign-up" });
      }
    }
  });

  onCleanup(() => {
    if (isSignUp) {
      clerk.unmountSignUp(authEl);
    } else {
      clerk.unmountSignIn(authEl);
    }
  });

  return (
    <div class="flex h-full w-full">
      <div class="relative hidden w-2/5 overflow-hidden bg-[#ebf3f1] lg:flex">
        <div class="absolute -bottom-1/4 -left-1/4 h-[80%] w-[80%] rounded-full bg-[#d6e8e4]" />
        <div class="absolute -top-1/4 -right-1/4 h-[60%] w-[60%] rounded-full bg-[#ddecea]" />
        <div class="relative z-10 flex w-full flex-col justify-between p-10">
          <div>
            <img
              src="/images/logo.png"
              alt="Logo"
              class="h-8"
            />
          </div>
          <Show when={meta()}>
            {(m) => (
              <div>
                <div class="text-base-content font-800 text-5xl leading-tight">
                  {m().instanceName}
                </div>
                <div class="text-base-content/50 mt-3 text-lg">
                  {t3({
                    en: "Analytics platform",
                    fr: "Plateforme analytique",
                  })}
                </div>
              </div>
            )}
          </Show>
          <div class="text-neutral text-xs">
            {t3({
              en: "Powered by FASTR",
              fr: "Propulsé par FASTR",
            })}
          </div>
        </div>
      </div>
      <div class="flex flex-1 items-center justify-center overflow-y-auto">
        <div class="w-full max-w-md px-8 py-12">
          <Show when={meta()}>
            {(m) => (
              <div class="mb-8 text-center lg:hidden">
                <img src="/images/logo.png" alt="Logo" class="mx-auto mb-2 h-8" />
                <div class="font-700 text-xl">
                  {m().instanceName}
                </div>
                <div class="text-neutral text-sm">
                  {t3({
                    en: "Analytics platform",
                    fr: "Plateforme analytique",
                  })}
                </div>
              </div>
            )}
          </Show>
          <div ref={authEl} />
        </div>
      </div>
    </div>
  );
}
