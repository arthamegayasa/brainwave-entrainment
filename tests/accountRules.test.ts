import { describe, expect, it } from "vitest";
import {
  checkNewPatient,
  firstName,
  generatePassword,
  internalLoginEmail,
  isValidUsername,
  mayCreatePatient,
  normalizeUsername,
  parseLoginIdentifier,
  parsePersonalUrlPath,
  patientLimitOf,
  personalUrlPath,
  shownEmail,
  suggestUsername,
  usernameStem,
} from "../supabase/functions/_shared/accountRules.ts";
import type { PatientCreator } from "../supabase/functions/_shared/accountRules.ts";

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
