/**
 * Account rules (ADR-014, ADR-016, ADR-018): the one place that decides what a
 * valid Username is and who may do what to an account. Pure TypeScript with no
 * Deno, React or Supabase imports, so the app and the server functions share
 * it; the server functions are the authority, the app only mirrors them.
 */

const USERNAME_PATTERN = /^[a-z0-9-]{3,30}$/;
const USERNAME_MAX_LENGTH = 30;
/** Leaves room for a "-999" suffix within the 30-character limit. */
const STEM_MAX_LENGTH = 26;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Supabase Auth's default minimum (config.toml `minimum_password_length`). */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * Accounts with a Username sign in with an internal login email (ADR-018):
 * random, under a reserved top-level domain that can never receive mail, and
 * never shown to anyone. The real email, if any, is the contact email.
 */
const INTERNAL_LOGIN_EMAIL_DOMAIN = "login.serenade.invalid";

export function internalLoginEmail(randomId: string): string {
  return `${randomId}@${INTERNAL_LOGIN_EMAIL_DOMAIN}`;
}

/** The email to show for an account: never its internal login email. */
export function shownEmail(account: {
  loginEmail: string | null;
  contactEmail: string | null;
}): string | null {
  const { loginEmail, contactEmail } = account;
  if (contactEmail !== null) return contactEmail;
  if (loginEmail === null || loginEmail.toLowerCase().endsWith(`@${INTERNAL_LOGIN_EMAIL_DOMAIN}`)) {
    return null;
  }
  return loginEmail;
}

/** The stored form of a typed Username: trimmed, lowercase, without "@". */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** A Username is 3–30 characters of a–z, 0–9 and hyphen. */
export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** A name's words in Username characters: accents dropped, apostrophes removed. */
function nameWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

/**
 * The first-name part every suggestion for `name` starts with, so one prefix
 * lookup finds every taken candidate. Null when the name has no usable letters.
 */
export function usernameStem(name: string): string | null {
  const first = nameWords(name)[0];
  return first === undefined ? null : first.slice(0, STEM_MAX_LENGTH);
}

/**
 * Suggests a free Username for a person's name: the first name, then
 * first-last, then the first name numbered from 2. Null when the name has no
 * usable letters (the Clinician types one instead).
 */
export function suggestUsername(name: string, taken: ReadonlySet<string>): string | null {
  const words = nameWords(name);
  const stem = usernameStem(name);
  if (stem === null) return null;

  const named = [stem];
  if (words.length > 1) {
    named.push(`${stem}-${words[words.length - 1]}`.slice(0, USERNAME_MAX_LENGTH));
  }
  const free = named.find((candidate) => isValidUsername(candidate) && !taken.has(candidate));
  if (free !== undefined) return free;

  for (let n = 2; `${stem}-${n}`.length <= USERNAME_MAX_LENGTH; n++) {
    if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
  }
  return null;
}

/**
 * How long a released Username stays locked for everyone but the account that
 * released it (ADR-016), so an old Personal URL never opens someone else's
 * sign-in page right away.
 */
export const USERNAME_LOCK_DAYS = 30;
const USERNAME_LOCK_MS = USERNAME_LOCK_DAYS * 24 * 60 * 60 * 1000;

/** The latest release of a Username in the Username history. */
export interface UsernameRelease {
  /** The account that released it; null once that account is deleted. */
  owner: string | null;
  /** The owner's current Username; null when they hold none. */
  ownerUsername: string | null;
  releasedAt: Date;
}

/** One Username as the server reads it at one moment. */
export interface UsernameState {
  /** The account that holds the Username now; null when unclaimed. */
  holder: string | null;
  /** Its latest release; null when it was never released. */
  lastRelease: UsernameRelease | null;
}

export type UsernameClaimRefusal = "username_taken" | "username_locked";

/** Every reason a Username typed into a form is refused. */
export type UsernameRefusal = "invalid_username" | UsernameClaimRefusal;

/** Whether a Username released at `releasedAt` is still locked at `now`. */
function isLockedSince(releasedAt: Date, now: Date): boolean {
  return now.getTime() < releasedAt.getTime() + USERNAME_LOCK_MS;
}

/**
 * Whether `claimant` may take a Username: not while another account holds it,
 * and not for 30 days after another account released it, whether by a rename
 * or, once recorded as a release, by deleting the account. The account that
 * released it may take it back at once.
 */
export function mayClaimUsername(request: {
  state: UsernameState;
  /** The account taking the Username; null for a Patient not created yet. */
  claimant: string | null;
  now: Date;
}): { ok: true } | { ok: false; reason: UsernameClaimRefusal } {
  const { state, claimant, now } = request;
  if (state.holder !== null) {
    return state.holder === claimant ? { ok: true } : { ok: false, reason: "username_taken" };
  }
  const release = state.lastRelease;
  const ownRelease = claimant !== null && claimant === release?.owner;
  if (release !== null && !ownRelease && isLockedSince(release.releasedAt, now)) {
    return { ok: false, reason: "username_locked" };
  }
  return { ok: true };
}

/**
 * The Usernames a new Patient cannot take, for `suggestUsername`: those an
 * account holds, and those released less than 30 days ago.
 */
export function takenOrLockedUsernames(request: {
  held: readonly string[];
  /** Username history rows, in any order: a new Patient has no release of their own. */
  releases: ReadonlyArray<{ username: string; releasedAt: Date }>;
  now: Date;
}): Set<string> {
  const { held, releases, now } = request;
  const taken = new Set(held);
  for (const release of releases) {
    if (isLockedSince(release.releasedAt, now)) taken.add(release.username);
  }
  return taken;
}

/** The role stored on a profile; "Patient" and "Regular" derive from Links. */
export type AccountRole = "user" | "clinician" | "admin";

/** The signed-in User asking to create a Patient, as the server sees them. */
export interface PatientCreator {
  role: AccountRole;
  /** Patients currently Linked to this User. */
  patientCount: number;
  /** The per-Clinician Patient limit on their profile (default 30). */
  patientLimit: number;
}

export type CreatePatientRefusal = "not_clinician" | "patient_limit_reached" | "email_registered";

/** The most Patients this User may have; null means no limit (the Admin). */
export function patientLimitOf(user: Pick<PatientCreator, "role" | "patientLimit">): number | null {
  return user.role === "admin" ? null : user.patientLimit;
}

/** A Clinician, or the Admin, who holds every Clinician power. */
export function hasClinicianPowers(role: AccountRole): boolean {
  return role === "clinician" || role === "admin";
}

/**
 * Only a Clinician or the Admin creates Patients, a Clinician only under their
 * Patient limit, and never with an email that already belongs to an account
 * as its login email or contact email (the Admin links such an account
 * instead, ADR-014).
 */
export function mayCreatePatient(request: {
  creator: PatientCreator;
  emailRegistered: boolean;
}): { ok: true } | { ok: false; reason: CreatePatientRefusal } {
  const { creator, emailRegistered } = request;
  if (!hasClinicianPowers(creator.role)) {
    return { ok: false, reason: "not_clinician" };
  }
  const limit = patientLimitOf(creator);
  if (limit !== null && creator.patientCount >= limit) {
    return { ok: false, reason: "patient_limit_reached" };
  }
  if (emailRegistered) return { ok: false, reason: "email_registered" };
  return { ok: true };
}

export type NewPatientProblem =
  | "name_required"
  | "invalid_email"
  | "invalid_username"
  | "password_too_short";

/** Every refusal the create-patient function answers with (as `{ error }`). */
export type CreatePatientError = NewPatientProblem | CreatePatientRefusal | UsernameClaimRefusal;

export type ChangeUsernameRefusal = "not_allowed" | "no_username";

/**
 * Only the account's own Clinician (while they hold the role) or the Admin
 * changes a Username; a Patient never changes their own. Only an account that
 * has a Username gets a new one: adding a first Username also moves the
 * account to a password login (ADR-018), which this does not do.
 */
export function mayChangeUsername(request: {
  actor: { id: string; role: AccountRole };
  account: {
    /** The Clinician of the account's Link; null without a Link. */
    clinicianId: string | null;
    username: string | null;
  };
}): { ok: true } | { ok: false; reason: ChangeUsernameRefusal } {
  const { actor, account } = request;
  const ownClinician = actor.role === "clinician" && account.clinicianId === actor.id;
  if (actor.role !== "admin" && !ownClinician) return { ok: false, reason: "not_allowed" };
  if (account.username === null) return { ok: false, reason: "no_username" };
  return { ok: true };
}

/** Every refusal the change-username function answers with (as `{ error }`). */
export type ChangeUsernameError = UsernameRefusal | ChangeUsernameRefusal;

/** Every refusal the resolve-login endpoint answers with (as `{ error }`). */
export type ResolveLoginError = "invalid_identifier" | "unknown_username";

/**
 * The personal-url endpoint's only refusal: no account opens at that Username.
 * An invalid and an unknown Username get the same answer, so it never hints
 * whether a Username ever existed.
 */
export type PersonalUrlError = "not_found";

/** The "+ New patient" fields as typed; `email` is "" when left blank. */
export interface NewPatientInput {
  name: string;
  email: string;
  username: string;
  password: string;
}

export interface NewPatient {
  name: string;
  /** The contact email, lowercase; null when the Patient has none. */
  email: string | null;
  username: string;
  password: string;
}

/** Checks and normalizes the "+ New patient" fields, in the app and on the server. */
export function checkNewPatient(input: NewPatientInput):
  | { ok: true; patient: NewPatient }
  | { ok: false; error: NewPatientProblem } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const username = normalizeUsername(input.username);
  if (name.length === 0) return { ok: false, error: "name_required" };
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) return { ok: false, error: "invalid_email" };
  if (!isValidUsername(username)) return { ok: false, error: "invalid_username" };
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: "password_too_short" };
  }
  return {
    ok: true,
    patient: { name, email: email.length > 0 ? email : null, username, password: input.password },
  };
}

export type LoginIdentifier =
  | { kind: "email"; email: string }
  | { kind: "username"; username: string };

/** Reads what someone typed into "Email or username"; null when it is neither. */
export function parseLoginIdentifier(raw: string): LoginIdentifier | null {
  const trimmed = raw.trim();
  if (trimmed.indexOf("@") > 0) {
    const email = trimmed.toLowerCase();
    return EMAIL_PATTERN.test(email) ? { kind: "email", email } : null;
  }
  const username = normalizeUsername(trimmed);
  return isValidUsername(username) ? { kind: "username", username } : null;
}

/** The path of a Username's Personal URL (ADR-016): "/p/<username>". */
export function personalUrlPath(username: string): string {
  return `/p/${username}`;
}

/**
 * Reads a path as a Personal URL: "/p/Ivan/" opens the Username "ivan". Null
 * for a path outside /p, which the app handles as before. A /p path that
 * names no valid Username still opens the Personal URL page, with a null
 * Username: the page shows "Link not found", exactly as for an unknown one.
 */
export function parsePersonalUrlPath(pathname: string): { username: string | null } | null {
  const match = /^\/p(?:\/(.*))?$/.exec(pathname);
  if (match === null) return null;
  const username = normalizeUsername((match[1] ?? "").replace(/\/$/, ""));
  return { username: isValidUsername(username) ? username : null };
}

/**
 * The Username whose account a Personal URL opens (ADR-016): its own while an
 * account holds it. An unclaimed Username redirects to the current Username
 * of the account that released it last, until another account claims it,
 * however long that takes. Null when it opens no account.
 */
export function personalUrlTarget(username: string, state: UsernameState): string | null {
  if (state.holder !== null) return username;
  return state.lastRelease?.ownerUsername ?? null;
}

/**
 * The name a Personal URL greets its owner with: the first word of their
 * name, never the rest, since ADR-016 makes only the first name public. Null
 * without a name.
 */
export function firstName(name: string | null): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first.length > 0 ? first : null;
}

// Short Indonesian words a Clinician can dictate over the phone: 64 × 64
// words × 900 numbers ≈ 3.7 million passwords (about 22 bits).
const PASSWORD_NOUNS = [
  "hujan", "awan", "bulan", "bintang", "laut", "pantai", "gunung", "sungai",
  "danau", "pohon", "daun", "bunga", "embun", "angin", "pelangi", "fajar",
  "senja", "pagi", "malam", "langit", "ombak", "pasir", "batu", "kabut",
  "mentari", "kopi", "madu", "buku", "lampu", "taman", "kebun", "burung",
  "ikan", "kucing", "rusa", "kelinci", "merpati", "lilin", "nada", "lagu",
  "cahaya", "mimpi", "bambu", "padi", "kelapa", "mangga", "jeruk", "pisang",
  "teh", "roti", "kapal", "perahu", "sepeda", "payung", "jendela", "pintu",
  "bukit", "hutan", "sawah", "pulau", "teluk", "mawar", "melati", "anggrek",
];
const PASSWORD_ADJECTIVES = [
  "biru", "hijau", "merah", "kuning", "ungu", "putih", "jingga", "emas",
  "perak", "tenang", "damai", "hangat", "sejuk", "lembut", "cerah", "terang",
  "manis", "segar", "riang", "ceria", "teduh", "indah", "bening", "harum",
  "kecil", "besar", "tinggi", "luas", "baru", "ringan", "pelan", "bulat",
  "cokelat", "jernih", "ramah", "rapi", "bersih", "lincah", "gesit", "sabar",
  "setia", "jujur", "berani", "pintar", "cantik", "mungil", "gagah", "megah",
  "sehat", "kuat", "lapang", "rindang", "sunyi", "syahdu", "elok", "anggun",
  "merdu", "mulia", "tangguh", "hening", "teguh", "cermat", "jenaka", "rukun",
];

function cryptoRandomInt(maxExclusive: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] % maxExclusive;
}

/** A readable password such as `hujan-biru-427`: noun, adjective, 100–999. */
export function generatePassword(
  randomInt: (maxExclusive: number) => number = cryptoRandomInt,
): string {
  const noun = PASSWORD_NOUNS[randomInt(PASSWORD_NOUNS.length)];
  const adjective = PASSWORD_ADJECTIVES[randomInt(PASSWORD_ADJECTIVES.length)];
  return `${noun}-${adjective}-${100 + randomInt(900)}`;
}
