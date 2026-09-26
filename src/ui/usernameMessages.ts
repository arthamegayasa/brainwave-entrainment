import { USERNAME_LOCK_DAYS } from "../../supabase/functions/_shared/accountRules.ts";
import type { UsernameRefusal } from "../../supabase/functions/_shared/accountRules.ts";

/** Why a typed Username was refused, for every form that sets one. */
export const USERNAME_REFUSALS = {
  invalid_username: "Usernames are 3–30 lowercase letters, numbers or hyphens.",
  username_taken: "That username is taken — try another.",
  username_locked: `That username belonged to someone until recently and stays reserved for ${USERNAME_LOCK_DAYS} days — try another.`,
} satisfies Record<UsernameRefusal, string>;
