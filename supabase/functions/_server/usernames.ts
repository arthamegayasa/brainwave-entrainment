// Username history reads for the account server functions (#7). Deno-only
// (it takes the service-role client), so it lives outside _shared; the
// decisions on what it reads are in _shared/accountRules.ts.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { UsernameState } from "../_shared/accountRules.ts";

interface UsernameStateRow {
  holder_id: string | null;
  owner_id: string | null;
  released_at: string | null;
  owner_username: string | null;
}

/**
 * Who holds a Username and its latest release, read in one snapshot by
 * username_state() (0008), for mayClaimUsername and personalUrlTarget.
 */
export async function usernameStateOf(
  admin: SupabaseClient,
  username: string,
): Promise<UsernameState> {
  const { data, error } = await admin.rpc("username_state", { p_username: username }).single();
  if (error) throw error;
  const row = data as UsernameStateRow;
  return {
    holder: row.holder_id,
    lastRelease:
      row.released_at === null
        ? null
        : {
            owner: row.owner_id,
            ownerUsername: row.owner_username,
            releasedAt: new Date(row.released_at),
          },
  };
}

/**
 * Every release in the Username history of a Username starting with `stem`,
 * for takenOrLockedUsernames. The stem is a–z/0–9 only, so it holds no LIKE
 * wildcards.
 */
export async function releasesStartingWith(
  admin: SupabaseClient,
  stem: string,
): Promise<Array<{ username: string; releasedAt: Date }>> {
  const { data, error } = await admin
    .from("username_history")
    .select("username, released_at")
    .like("username", `${stem}%`);
  if (error) throw error;
  return (data as Array<{ username: string; released_at: string }>).map((row) => ({
    username: row.username,
    releasedAt: new Date(row.released_at),
  }));
}
