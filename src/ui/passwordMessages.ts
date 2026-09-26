import { PASSWORD_MIN_LENGTH } from "../../supabase/functions/_shared/accountRules.ts";
import type { PasswordProblem } from "../../supabase/functions/_shared/accountRules.ts";

/** Why a typed password was refused, for every form that sets one. */
export const PASSWORD_REFUSALS = {
  password_too_short: `Passwords need at least ${PASSWORD_MIN_LENGTH} characters.`,
} satisfies Record<PasswordProblem, string>;
