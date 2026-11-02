import { PERSONA_COOKIE } from "lib";

// The two dev auth modes, each off in a production build: BYPASS_AUTH's
// synthetic admin, and PERSONA_AUTH's real user named by a cookie.
export const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true" &&
  import.meta.env.MODE !== "production";
export const personaAuth = import.meta.env.VITE_PERSONA_AUTH === "true" &&
  import.meta.env.MODE !== "production";
if (bypassAuth && personaAuth) {
  throw new Error(
    "VITE_PERSONA_AUTH and VITE_BYPASS_AUTH are both set: set one",
  );
}

// Clerk runs only outside both dev modes; the profile hides what needs it.
export const clerkActive = !bypassAuth && !personaAuth;

const PERSONA_STORAGE_KEY = "fastr_persona";

// The persona a `?persona=` query names is kept for later loads; the cookie
// is what the server reads (PERSONA_COOKIE).
function resolvePersona(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get(
    "persona",
  );
  if (fromQuery) {
    localStorage.setItem(PERSONA_STORAGE_KEY, fromQuery);
  }
  const email = fromQuery ?? localStorage.getItem(PERSONA_STORAGE_KEY);
  if (email) {
    document.cookie = `${PERSONA_COOKIE}=${
      encodeURIComponent(email)
    }; path=/; SameSite=Lax`;
  }
  return email;
}

export function clearPersona(): void {
  localStorage.removeItem(PERSONA_STORAGE_KEY);
  document.cookie = `${PERSONA_COOKIE}=; path=/; max-age=0`;
}

// The signed-in persona's email under VITE_PERSONA_AUTH, else null.
export const persona = personaAuth ? resolvePersona() : null;
