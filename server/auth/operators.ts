import { H_USERS } from "./h_users.ts";

// The operator tier: the one reader of the untracked H_USERS list.
export function isHUser(email: string): boolean {
  return H_USERS.includes(email);
}
