import { describe, expect, it } from "vitest";
import {
  checkNewPatient,
  checkoutCustomer,
  firstName,
  generatePassword,
  internalLoginEmail,
  isInactiveClinician,
  isValidUsername,
  keepsPasswordCopy,
  mayChangeUsername,
  mayClaimUsername,
  mayCreatePatient,
  mayManageLink,
  mayReadPasswordAccessLog,
  mayRevealOrResetPassword,
  normalizeUsername,
  parseLoginIdentifier,
  parsePersonalUrlPath,
  patientLimitOf,
  personalUrlPath,
  personalUrlTarget,
  rolesOf,
  shownEmail,
  suggestUsername,
  takenOrLockedUsernames,
  usernameStem,
} from "../supabase/functions/_shared/accountRules.ts";
import type {
  PasswordAccount,
  PatientCreator,
  UsernameState,
} from "../supabase/functions/_shared/accountRules.ts";

describe("Username normalization", () => {
  it("lowercases, trims and drops a leading @", () => {
    expect(normalizeUsername("  @Ivan-Moon ")).toBe("ivan-moon");
  });
});

describe("Username validation", () => {
  it("accepts a–z, 0–9 and hyphen from 3 to 30 characters", () => {
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("ketut-ayu-2")).toBe(true);
    expect(isValidUsername("a".repeat(30))).toBe(true);
  });

  it("rejects 2 and 31 characters", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(31))).toBe(false);
  });

  it("rejects uppercase, spaces, underscores, dots and accents", () => {
    for (const bad of ["Ivan", "ivan moon", "ivan_moon", "ivan.moon", "josé"]) {
      expect(isValidUsername(bad), bad).toBe(false);
    }
  });
});

describe("Username suggestion", () => {
  const none = new Set<string>();

  it("suggests the first name first", () => {
    expect(suggestUsername("Ivan Pratama", none)).toBe("ivan");
  });

  it("falls back to first-last when the first name is taken", () => {
    expect(suggestUsername("Ivan Pratama", new Set(["ivan"]))).toBe("ivan-pratama");
  });

  it("then numbers the first name from 2", () => {
    expect(suggestUsername("Ivan Pratama", new Set(["ivan", "ivan-pratama"]))).toBe("ivan-2");
    expect(
      suggestUsername("Ivan Pratama", new Set(["ivan", "ivan-pratama", "ivan-2", "ivan-3"])),
    ).toBe("ivan-4");
  });

  it("numbers a one-word name straight after the first name", () => {
    expect(suggestUsername("Made", new Set(["made"]))).toBe("made-2");
  });

  it("uses the first and last of several names", () => {
    expect(suggestUsername("Ketut Ayu Lestari", new Set(["ketut"]))).toBe("ketut-lestari");
  });

  it("skips a first name shorter than 3 characters", () => {
    expect(suggestUsername("Al Smith", none)).toBe("al-smith");
    expect(suggestUsername("Al", none)).toBe("al-2");
  });

  it("drops accents and punctuation", () => {
    expect(suggestUsername("  José  O'Neil ", none)).toBe("jose");
    expect(suggestUsername("José O'Neil", new Set(["jose"]))).toBe("jose-oneil");
  });

  it("stays within 30 characters", () => {
    const long = "Bartholomewbartholomewbartholomew Wolfeschlegelsteinhausen";
    const taken = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const username = suggestUsername(long, taken)!;
      expect(isValidUsername(username), username).toBe(true);
      taken.add(username);
    }
    expect(taken.size).toBe(3);
  });

  it("suggests nothing for a name without latin letters or digits", () => {
    expect(suggestUsername("王芳", none)).toBeNull();
    expect(suggestUsername("   ", none)).toBeNull();
  });

  it("starts every suggestion with the stem, so one prefix lookup finds all taken ones", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const username = suggestUsername("Ketut Ayu", taken)!;
      expect(username.startsWith(usernameStem("Ketut Ayu")!), username).toBe(true);
      taken.add(username);
    }
  });
});

describe("may create Patient", () => {
  const clinician = (patientCount: number, patientLimit = 30): PatientCreator => ({
    role: "clinician",
    patientCount,
    patientLimit,
  });

  it("lets a Clinician under the limit create a Patient with a new email", () => {
    expect(mayCreatePatient({ creator: clinician(29), emailRegistered: false })).toEqual({
      ok: true,
    });
  });

  it("refuses a Clinician who reached the limit", () => {
    expect(mayCreatePatient({ creator: clinician(30), emailRegistered: false })).toEqual({
      ok: false,
      reason: "patient_limit_reached",
    });
  });

  it("follows a limit the Admin raised for one Clinician", () => {
    expect(mayCreatePatient({ creator: clinician(30, 40), emailRegistered: false }).ok).toBe(true);
    expect(mayCreatePatient({ creator: clinician(40, 40), emailRegistered: false }).ok).toBe(false);
  });

  it("gives the Admin no limit", () => {
    const admin: PatientCreator = { role: "admin", patientCount: 500, patientLimit: 30 };
    expect(mayCreatePatient({ creator: admin, emailRegistered: false })).toEqual({ ok: true });
    expect(patientLimitOf(admin)).toBeNull();
    expect(patientLimitOf(clinician(0, 45))).toBe(45);
  });

  it("refuses a Regular", () => {
    const regular: PatientCreator = { role: "user", patientCount: 0, patientLimit: 30 };
    expect(mayCreatePatient({ creator: regular, emailRegistered: false })).toEqual({
      ok: false,
      reason: "not_clinician",
    });
  });

  it("refuses an email that already belongs to an account, for the Admin too", () => {
    const admin: PatientCreator = { role: "admin", patientCount: 0, patientLimit: 30 };
    for (const creator of [clinician(0), admin]) {
      expect(mayCreatePatient({ creator, emailRegistered: true })).toEqual({
        ok: false,
        reason: "email_registered",
      });
    }
  });
});

describe("New Patient details", () => {
  const valid = { name: " Ivan Pratama ", email: "", username: "@Ivan", password: "hujan-biru-42" };

  it("normalizes the name, a blank email and the Username", () => {
    expect(checkNewPatient(valid)).toEqual({
      ok: true,
      patient: { name: "Ivan Pratama", email: null, username: "ivan", password: "hujan-biru-42" },
    });
  });

  it("keeps an email as a lowercase contact email", () => {
    const result = checkNewPatient({ ...valid, email: " Ivan@Mail.COM " });
    expect(result.ok && result.patient.email).toBe("ivan@mail.com");
  });

  it("needs a name, a valid email when given, a valid Username and 6+ password characters", () => {
    expect(checkNewPatient({ ...valid, name: "  " })).toEqual({ ok: false, error: "name_required" });
    expect(checkNewPatient({ ...valid, email: "ivan@" })).toEqual({ ok: false, error: "invalid_email" });
    expect(checkNewPatient({ ...valid, username: "iv" })).toEqual({
      ok: false,
      error: "invalid_username",
    });
    expect(checkNewPatient({ ...valid, password: "12345" })).toEqual({
      ok: false,
      error: "password_too_short",
    });
    expect(checkNewPatient({ ...valid, password: "123456" }).ok).toBe(true);
  });
});

describe("Generated password", () => {
  it("reads as word-word-number and has at least 6 characters", () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(password).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]{2}$/);
      expect(password.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("draws every part from the random source", () => {
    const lowest = generatePassword(() => 0);
    const highest = generatePassword((max) => max - 1);
    expect(lowest).toMatch(/-100$/);
    expect(highest).toMatch(/-999$/);
    expect(lowest.split("-")[0]).not.toBe(highest.split("-")[0]);
    expect(lowest.split("-")[1]).not.toBe(highest.split("-")[1]);
  });
});

describe("Sign-in identifier", () => {
  it("reads a Username, with or without @", () => {
    expect(parseLoginIdentifier(" Ivan ")).toEqual({ kind: "username", username: "ivan" });
    expect(parseLoginIdentifier("@ivan-moon")).toEqual({ kind: "username", username: "ivan-moon" });
  });

  it("reads an email in lowercase", () => {
    expect(parseLoginIdentifier(" Ivan.Moon@Mail.com ")).toEqual({
      kind: "email",
      email: "ivan.moon@mail.com",
    });
  });

  it("rejects what is neither", () => {
    for (const bad of ["", "  ", "iv", "ivan moon", "ivan@", "@", "a@b"]) {
      expect(parseLoginIdentifier(bad), bad).toBeNull();
    }
  });
});

describe("Shown email", () => {
  it("shows the contact email of an account that signs in with an internal login email", () => {
    const loginEmail = internalLoginEmail("5f0c7c1e-8d1c-4a55-9d3a-2f3c1b0e6a11");
    expect(shownEmail({ loginEmail, contactEmail: "ivan@mail.com" })).toBe("ivan@mail.com");
  });

  it("never shows an internal login email, even without a contact email", () => {
    const loginEmail = internalLoginEmail("5f0c7c1e-8d1c-4a55-9d3a-2f3c1b0e6a11");
    expect(shownEmail({ loginEmail, contactEmail: null })).toBeNull();
  });

  it("shows the login email of a magic-link account", () => {
    expect(shownEmail({ loginEmail: "nadia@mail.com", contactEmail: null })).toBe("nadia@mail.com");
  });
});

describe("Checkout customer", () => {
  const loginEmail = internalLoginEmail("5f0c7c1e-8d1c-4a55-9d3a-2f3c1b0e6a11");

  it("gives the payment provider a Username account's contact email", () => {
    expect(checkoutCustomer({ loginEmail, contactEmail: "ivan@mail.com" })).toEqual({ email: "ivan@mail.com" });
  });

  it("gives the payment provider no email for a Username account without a contact email", () => {
    expect(checkoutCustomer({ loginEmail, contactEmail: null })).toEqual({});
  });

  it("gives the payment provider a magic-link account's login email", () => {
    expect(checkoutCustomer({ loginEmail: "nadia@mail.com", contactEmail: null })).toEqual({
      email: "nadia@mail.com",
    });
  });
});

describe("Personal URL path", () => {
  it("opens the Username in /p/<username>, in any case and with a trailing slash", () => {
    expect(parsePersonalUrlPath("/p/ivan")).toEqual({ username: "ivan" });
    expect(parsePersonalUrlPath("/p/Ivan-Moon/")).toEqual({ username: "ivan-moon" });
  });

  it("is the path a Clinician copies for a Username", () => {
    expect(parsePersonalUrlPath(personalUrlPath("ivan-moon"))).toEqual({ username: "ivan-moon" });
  });

  it("leaves every other path to the app", () => {
    for (const path of ["/", "/privacy", "/pricing", "/pa/ivan", "/index.html"]) {
      expect(parsePersonalUrlPath(path), path).toBeNull();
    }
  });

  it("opens a /p path without a valid Username as a Personal URL nobody owns", () => {
    for (const path of ["/p", "/p/", "/p/iv", "/p/ivan/extra", "/p/ivan%20moon", "/p/ivan_moon"]) {
      expect(parsePersonalUrlPath(path), path).toEqual({ username: null });
    }
  });
});

describe("First name on a Personal URL", () => {
  it("is the first word of the name, never the rest", () => {
    expect(firstName("Ivan Moon")).toBe("Ivan");
    expect(firstName("  Siti   Nurhaliza binti Tarudin ")).toBe("Siti");
    expect(firstName("Budi")).toBe("Budi");
  });

  it("is absent without a name", () => {
    expect(firstName(null)).toBeNull();
    expect(firstName("   ")).toBeNull();
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const releasedAt = new Date("2026-09-01T10:00:00Z");
const afterRelease = (ms: number) => new Date(releasedAt.getTime() + ms);
/** "ivan" after its owner was renamed to "ivan-moon"; owner null = a deleted account. */
const released = (owner: string | null): UsernameState => ({
  holder: null,
  lastRelease: { owner, ownerUsername: owner === null ? null : "ivan-moon", releasedAt },
});

describe("Claiming a released Username", () => {
  it("refuses another account until 30 days after the release", () => {
    for (const now of [afterRelease(0), afterRelease(30 * DAY_MS - 1)]) {
      expect(mayClaimUsername({ state: released("ivan-id"), claimant: "budi-id", now })).toEqual({
        ok: false,
        reason: "username_locked",
      });
    }
  });

  it("allows another account from 30 days after the release", () => {
    for (const now of [afterRelease(30 * DAY_MS), afterRelease(400 * DAY_MS)]) {
      expect(mayClaimUsername({ state: released("ivan-id"), claimant: "budi-id", now })).toEqual({
        ok: true,
      });
    }
  });

  it("locks a new Patient out the same way", () => {
    const state = released("ivan-id");
    expect(mayClaimUsername({ state, claimant: null, now: afterRelease(30 * DAY_MS - 1) }).ok).toBe(
      false,
    );
    expect(mayClaimUsername({ state, claimant: null, now: afterRelease(30 * DAY_MS) }).ok).toBe(true);
  });

  it("lets the owner take their released Username back at once", () => {
    expect(
      mayClaimUsername({ state: released("ivan-id"), claimant: "ivan-id", now: afterRelease(1) }),
    ).toEqual({ ok: true });
  });

  it("keeps a deleted account's Username locked for everyone for 30 days", () => {
    for (const claimant of ["budi-id", null]) {
      expect(
        mayClaimUsername({ state: released(null), claimant, now: afterRelease(30 * DAY_MS - 1) }),
      ).toEqual({ ok: false, reason: "username_locked" });
      expect(
        mayClaimUsername({ state: released(null), claimant, now: afterRelease(30 * DAY_MS) }).ok,
      ).toBe(true);
    }
  });

  it("refuses a Username another account holds, however old its release", () => {
    const state: UsernameState = { ...released("ivan-id"), holder: "made-id" };
    for (const claimant of ["budi-id", "ivan-id", null]) {
      expect(mayClaimUsername({ state, claimant, now: afterRelease(400 * DAY_MS) })).toEqual({
        ok: false,
        reason: "username_taken",
      });
    }
  });

  it("allows a Username nobody holds and nobody released", () => {
    const state: UsernameState = { holder: null, lastRelease: null };
    expect(mayClaimUsername({ state, claimant: null, now: releasedAt })).toEqual({ ok: true });
  });
});

describe("Old Personal URL", () => {
  it("opens the account that holds the Username", () => {
    expect(personalUrlTarget("ivan", { holder: "ivan-id", lastRelease: null })).toBe("ivan");
  });

  it("redirects to the owner's current Username while the old one is unclaimed", () => {
    expect(personalUrlTarget("ivan", released("ivan-id"))).toBe("ivan-moon");
  });

  it("stops redirecting once another account holds the old Username", () => {
    expect(personalUrlTarget("ivan", { ...released("ivan-id"), holder: "made-id" })).toBe("ivan");
  });

  it("opens a Username its owner took back", () => {
    expect(personalUrlTarget("ivan", { ...released("ivan-id"), holder: "ivan-id" })).toBe("ivan");
  });

  it("leads nowhere for a Username never held, or released by a deleted account", () => {
    expect(personalUrlTarget("ivan", { holder: null, lastRelease: null })).toBeNull();
    expect(personalUrlTarget("ivan", released(null))).toBeNull();
  });
});

describe("Username suggestion around released Usernames", () => {
  const releases = [{ username: "ivan", releasedAt }];

  it("skips a Username released less than 30 days ago", () => {
    const taken = takenOrLockedUsernames({
      held: [],
      releases,
      now: afterRelease(30 * DAY_MS - 1),
    });
    expect(suggestUsername("Ivan Pratama", taken)).toBe("ivan-pratama");
  });

  it("offers it again from 30 days after the release", () => {
    const taken = takenOrLockedUsernames({ held: [], releases, now: afterRelease(30 * DAY_MS) });
    expect(suggestUsername("Ivan Pratama", taken)).toBe("ivan");
  });

  it("still skips Usernames accounts hold", () => {
    const taken = takenOrLockedUsernames({
      held: ["ivan", "ivan-pratama"],
      releases: [],
      now: releasedAt,
    });
    expect(suggestUsername("Ivan Pratama", taken)).toBe("ivan-2");
  });
});

describe("may change a Username", () => {
  /** Ivan, a Patient of Clinician A. */
  const ivan = { clinicianId: "clinician-a", username: "ivan" };

  it("lets the owning Clinician change their Patient's Username", () => {
    const actor = { id: "clinician-a", role: "clinician" } as const;
    expect(mayChangeUsername({ actor, account: ivan })).toEqual({ ok: true });
  });

  it("lets the Admin change any account's Username", () => {
    const actor = { id: "admin", role: "admin" } as const;
    expect(mayChangeUsername({ actor, account: ivan })).toEqual({ ok: true });
    expect(mayChangeUsername({ actor, account: { clinicianId: null, username: "ivan" } })).toEqual({
      ok: true,
    });
  });

  it("refuses another Clinician, the Patient themselves and a Clinician who lost the role", () => {
    const actors = [
      { id: "clinician-b", role: "clinician" },
      { id: "ivan-id", role: "user" },
      { id: "clinician-a", role: "user" },
    ] as const;
    for (const actor of actors) {
      expect(mayChangeUsername({ actor, account: ivan }), actor.id).toEqual({
        ok: false,
        reason: "not_allowed",
      });
    }
  });

  it("refuses an account without a Username: adding one needs a password login too", () => {
    const noUsername = { clinicianId: "clinician-a", username: null };
    for (const actor of [
      { id: "clinician-a", role: "clinician" },
      { id: "admin", role: "admin" },
    ] as const) {
      expect(mayChangeUsername({ actor, account: noUsername })).toEqual({
        ok: false,
        reason: "no_username",
      });
    }
  });

  it("refuses another Clinician before saying whether the account has a Username", () => {
    const actor = { id: "clinician-b", role: "clinician" } as const;
    expect(
      mayChangeUsername({ actor, account: { clinicianId: "clinician-a", username: null } }),
    ).toEqual({ ok: false, reason: "not_allowed" });
  });
});

describe("may reveal or reset a password", () => {
  /** Ivan, a Patient of Clinician A. */
  const ivan: PasswordAccount = { role: "user", clinicianOrigin: null, clinicianId: "clinician-a" };

  it("lets the owning Clinician reveal and reset their Patient's password", () => {
    const actor = { id: "clinician-a", role: "clinician" } as const;
    expect(mayRevealOrResetPassword({ actor, account: ivan })).toEqual({ ok: true });
  });

  it("refuses another Clinician, the Patient themselves and a Clinician who lost the role", () => {
    const actors = [
      { id: "clinician-b", role: "clinician" },
      { id: "ivan-id", role: "user" },
      { id: "clinician-a", role: "user" },
    ] as const;
    for (const actor of actors) {
      expect(mayRevealOrResetPassword({ actor, account: ivan }), actor.id).toEqual({
        ok: false,
        reason: "not_allowed",
      });
    }
  });

  it("lets the Admin reveal and reset any Patient's password", () => {
    const actor = { id: "admin", role: "admin" } as const;
    expect(mayRevealOrResetPassword({ actor, account: ivan })).toEqual({ ok: true });
  });

  it("leaves a Patient who also holds the Clinician role to the Admin alone", () => {
    const clinicianPatient: PasswordAccount = {
      role: "clinician",
      clinicianOrigin: "subscription",
      clinicianId: "clinician-a",
    };
    expect(
      mayRevealOrResetPassword({ actor: { id: "clinician-a", role: "clinician" }, account: clinicianPatient }),
    ).toEqual({ ok: false, reason: "not_allowed" });
    expect(
      mayRevealOrResetPassword({ actor: { id: "admin", role: "admin" }, account: clinicianPatient }),
    ).toEqual({ ok: true });
  });

  it("lets only the Admin handle a Clinician the Admin created", () => {
    const granted: PasswordAccount = { role: "clinician", clinicianOrigin: "admin", clinicianId: null };
    expect(mayRevealOrResetPassword({ actor: { id: "admin", role: "admin" }, account: granted })).toEqual({
      ok: true,
    });
    expect(
      mayRevealOrResetPassword({ actor: { id: "clinician-a", role: "clinician" }, account: granted }),
    ).toEqual({ ok: false, reason: "not_allowed" });
  });

  it("refuses everyone for a subscription Clinician, a Regular and the Admin account", () => {
    const accounts: PasswordAccount[] = [
      { role: "clinician", clinicianOrigin: "subscription", clinicianId: null },
      { role: "clinician", clinicianOrigin: null, clinicianId: null },
      { role: "user", clinicianOrigin: null, clinicianId: null },
      { role: "admin", clinicianOrigin: null, clinicianId: null },
    ];
    for (const account of accounts) {
      for (const actor of [
        { id: "admin", role: "admin" },
        { id: "clinician-a", role: "clinician" },
      ] as const) {
        expect(mayRevealOrResetPassword({ actor, account }), `${actor.id} → ${account.role}`).toEqual({
          ok: false,
          reason: "not_allowed",
        });
      }
    }
  });
});

describe("password copy", () => {
  it("is kept for a Patient, including one who also holds the Clinician role", () => {
    expect(keepsPasswordCopy({ role: "user", clinicianOrigin: null, clinicianId: "clinician-a" })).toBe(
      true,
    );
    expect(
      keepsPasswordCopy({ role: "clinician", clinicianOrigin: "subscription", clinicianId: "clinician-a" }),
    ).toBe(true);
  });

  it("is kept for a Clinician the Admin created", () => {
    expect(keepsPasswordCopy({ role: "clinician", clinicianOrigin: "admin", clinicianId: null })).toBe(true);
  });

  it("is not kept for a Regular, a subscription Clinician or the Admin", () => {
    const accounts: PasswordAccount[] = [
      { role: "user", clinicianOrigin: null, clinicianId: null },
      { role: "clinician", clinicianOrigin: "subscription", clinicianId: null },
      { role: "admin", clinicianOrigin: null, clinicianId: null },
    ];
    for (const account of accounts) expect(keepsPasswordCopy(account), account.role).toBe(false);
  });
});

describe("may read the password access log", () => {
  it("lets only the Admin read it", () => {
    expect(mayReadPasswordAccessLog("admin")).toBe(true);
    expect(mayReadPasswordAccessLog("clinician")).toBe(false);
    expect(mayReadPasswordAccessLog("user")).toBe(false);
  });
});

describe("may disconnect a Patient or switch their Premium grant", () => {
  /** Ivan, a Patient of Clinician A. */
  const ivan = { clinicianId: "clinician-a" };

  it("lets the owning Clinician manage their Patient's Link", () => {
    const actor = { id: "clinician-a", role: "clinician" } as const;
    expect(mayManageLink({ actor, account: ivan })).toEqual({ ok: true });
  });

  it("lets the Admin manage any Patient's Link", () => {
    const actor = { id: "admin", role: "admin" } as const;
    expect(mayManageLink({ actor, account: ivan })).toEqual({ ok: true });
  });

  it("refuses the Patient themselves, another Clinician and a Clinician who lost the role", () => {
    const actors = [
      { id: "ivan-id", role: "user" },
      { id: "ivan-id", role: "clinician" },
      { id: "clinician-b", role: "clinician" },
      { id: "clinician-a", role: "user" },
    ] as const;
    for (const actor of actors) {
      expect(mayManageLink({ actor, account: ivan }), `${actor.id} as ${actor.role}`).toEqual({
        ok: false,
        reason: "not_allowed",
      });
    }
  });

  it("tells the Admin when the account has no Link to manage", () => {
    const actor = { id: "admin", role: "admin" } as const;
    expect(mayManageLink({ actor, account: { clinicianId: null } })).toEqual({
      ok: false,
      reason: "not_linked",
    });
  });

  it("refuses a Clinician before saying whether the account has a Link", () => {
    const actor = { id: "clinician-b", role: "clinician" } as const;
    expect(mayManageLink({ actor, account: { clinicianId: null } })).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });
});

describe("roles of a User", () => {
  it("shows a User without a Link or a Clinician role as a Regular", () => {
    expect(rolesOf({ role: "user", clinicianId: null, patientCount: 0 })).toEqual(["regular"]);
  });

  it("shows a linked User as a Patient", () => {
    expect(rolesOf({ role: "user", clinicianId: "clinician-a", patientCount: 0 })).toEqual(["patient"]);
  });

  it("shows both roles for a Clinician who is someone's Patient", () => {
    expect(rolesOf({ role: "clinician", clinicianId: "clinician-a", patientCount: 3 })).toEqual([
      "clinician",
      "patient",
    ]);
  });

  it("shows the Admin as the Admin, with or without Patients", () => {
    expect(rolesOf({ role: "admin", clinicianId: null, patientCount: 0 })).toEqual(["admin"]);
    expect(rolesOf({ role: "admin", clinicianId: null, patientCount: 4 })).toEqual(["admin"]);
  });

  it("keeps an Inactive Clinician a Clinician, never a Regular", () => {
    expect(rolesOf({ role: "user", clinicianId: null, patientCount: 2 })).toEqual(["clinician"]);
    expect(rolesOf({ role: "user", clinicianId: "clinician-a", patientCount: 1 })).toEqual(["clinician", "patient"]);
  });
});

describe("Inactive Clinician", () => {
  it("is a User who still has Patients but no longer holds the Clinician role", () => {
    expect(isInactiveClinician({ role: "user", patientCount: 1 })).toBe(true);
  });

  it("is not a Clinician or the Admin with Patients, nor a User without any", () => {
    expect(isInactiveClinician({ role: "clinician", patientCount: 5 })).toBe(false);
    expect(isInactiveClinician({ role: "admin", patientCount: 5 })).toBe(false);
    expect(isInactiveClinician({ role: "user", patientCount: 0 })).toBe(false);
  });
});
