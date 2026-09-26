import { useState } from "react";
import { loadPasswordViews } from "../lib/accounts";
import type { PasswordLogPerson, PasswordView } from "../lib/accounts";
import { accountLabel } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * The Admin's "Password views" (ADR-015, carried over from #8): who revealed
 * whose password, and when, newest first. Read through the Admin-only
 * password-access-log server function each time the list is opened; the log
 * table itself stays unreachable for every client.
 */

/** Views shown before "Show all". */
const FIRST_VIEWS = 10;

const whenFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function personLabel(person: PasswordLogPerson | null): string {
  return person ? (accountLabel(person) ?? "Unnamed user") : "Deleted account";
}

export function PasswordViews() {
  const [views, setViews] = useState<PasswordView[] | "loading" | "error" | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setViews("loading");
    try {
      setViews(await loadPasswordViews());
    } catch {
      setViews("error");
    }
  };

  return (
    <details
      className="password-views"
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary>Password views</summary>
      <p className="library-note">Every time someone revealed a password: who, whose, and when (your clock).</p>
      {views === "loading" && <p className="library-note">Loading…</p>}
      {views === "error" && (
        <p className="library-note">
          Could not load the password views.{" "}
          <button className="link-btn" onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}
      {Array.isArray(views) && views.length === 0 && <p className="library-note">No password has been viewed yet.</p>}
      {Array.isArray(views) && views.length > 0 && (
        <>
          <table className="password-views-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Viewer</th>
                <th scope="col">Whose password</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? views : views.slice(0, FIRST_VIEWS)).map((v, i) => (
                <tr key={`${v.revealedAt}-${i}`}>
                  <td>
                    <time dateTime={v.revealedAt}>{whenFormat.format(Date.parse(v.revealedAt))}</time>
                  </td>
                  <td>{personLabel(v.viewer)}</td>
                  <td>{personLabel(v.target)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!showAll && views.length > FIRST_VIEWS && (
            <button className="chip small" onClick={() => setShowAll(true)}>
              Show all {views.length}
            </button>
          )}
        </>
      )}
    </details>
  );
}
