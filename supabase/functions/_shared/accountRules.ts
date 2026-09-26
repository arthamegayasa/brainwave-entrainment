/**
 * Account rules (ADR-014, ADR-015, ADR-016, ADR-018): the one place that
 * decides what a valid Username is and who may do what to an account. Pure
 * TypeScript with no Deno, React or Supabase imports, so the app and the
 * server functions share it; the server functions are the authority, the app
 * only mirrors them.
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

/**
 * How an account reads to someone else: its name, else the email to show,
 * else its @Username. Null when it has none of them.
 */
export function accountLabel(account: {
  name: string | null;
  /** The email to show (`shownEmail`), never an internal login email. */
  email: string | null;
  username: string | null;
}): string | null {
  return account.name ?? account.email ?? (account.username ? `@${account.username}` : null);
}

/**
 * The customer details a payment provider (Midtrans) receives for an
 * account's checkout: the email shown for it, never an internal login email,
 * and none for a Username account without a contact email.
 */
export function checkoutCustomer(account: {
  loginEmail: string | null;
  contactEmail: string | null;
}): { email?: string } {
  const email = shownEmail(account);
  return email === null ? {} : { email };
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
 * An Inactive Clinician (CONTEXT.md): a User who is still the Clinician of
 * Links but no longer holds the Clinician role. Their Patients stay linked,
 * unmonitored, until the role returns or the Admin Transfers them.
 */
export function isInactiveClinician(user: { role: AccountRole; patientCount: number }): boolean {
  return !hasClinicianPowers(user.role) && user.patientCount > 0;
}

/** A role as the Dashboard shows it: the stored role, or Patient and Regular derived from Links. */
export type ShownRole = "admin" | "clinician" | "patient" | "regular";

/**
 * Every role a User holds, in the order the badges show them. Roles overlap:
 * a Clinician can be someone's Patient. An Inactive Clinician stays a
 * Clinician (flagged apart), never a Regular.
 */
export function rolesOf(user: {
  role: AccountRole;
  /** The Clinician of their Link; null without a Link. */
  clinicianId: string | null;
  /** The Patients Linked to them. */
  patientCount: number;
}): ShownRole[] {
  if (user.role === "admin") return ["admin"];
  const roles: ShownRole[] = [];
  if (user.role === "clinician" || isInactiveClinician(user)) roles.push("clinician");
  if (user.clinicianId !== null) roles.push("patient");
  return roles.length > 0 ? roles : ["regular"];
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

/**
 * Whether `actor` is the Clinician of an account's Link while they hold the
 * role: an Inactive Clinician keeps their Links but no power over them.
 */
function isOwnClinician(actor: { id: string; role: AccountRole }, clinicianId: string | null): boolean {
  return actor.role === "clinician" && clinicianId === actor.id;
}

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
  if (actor.role !== "admin" && !isOwnClinician(actor, account.clinicianId)) {
    return { ok: false, reason: "not_allowed" };
  }
  if (account.username === null) return { ok: false, reason: "no_username" };
  return { ok: true };
}

/** Every refusal the change-username function answers with (as `{ error }`). */
export type ChangeUsernameError = UsernameRefusal | ChangeUsernameRefusal;

export type LinkRefusal = "not_allowed" | "not_linked";

/**
 * Who may disconnect a Patient or switch the Premium grant on their Link
 * (ADR-014): their own Clinician while they hold the role, or the Admin. Never
 * the Patient: a Link is permanent from their side.
 */
export function mayManageLink(request: {
  actor: { id: string; role: AccountRole };
  account: {
    /** The Clinician of the account's Link; null without a Link. */
    clinicianId: string | null;
  };
}): { ok: true } | { ok: false; reason: LinkRefusal } {
  const { actor, account } = request;
  if (actor.role !== "admin" && !isOwnClinician(actor, account.clinicianId)) {
    return { ok: false, reason: "not_allowed" };
  }
  if (account.clinicianId === null) return { ok: false, reason: "not_linked" };
  return { ok: true };
}

/** Every refusal the disconnect-patient function answers with (as `{ error }`). */
export type DisconnectPatientError = LinkRefusal;

/** Every refusal the set-premium-grant function answers with (as `{ error }`). */
export type SetPremiumGrantError = LinkRefusal | "invalid_premium";

/** Where a Clinician's role came from (ADR-014): a subscription, or granted by the Admin. */
export type ClinicianOrigin = "subscription" | "admin";

/** A profile's stored role and where its Clinician role came from. */
export interface ProfileRole {
  role: AccountRole;
  /** Where the Clinician role came from; null without the role or when none is recorded. */
  clinicianOrigin: ClinicianOrigin | null;
}

/** A payment the webhook settled: paid, or the failure of the order on file. */
export interface SettledPayment {
  plan: "premium" | "clinician";
  outcome: "paid" | "failed";
}

/**
 * What a settled payment does to the payer's Clinician role (ADR-014); null
 * leaves the profile as it is. Payments only promote to or demote from a
 * subscription Clinician: a paid clinician plan makes a User one, a paid
 * Premium plan (the cheaper choice) or a failed clinician order takes the role
 * away again, and the origin with it. A Clinician granted by the Admin (or
 * without a recorded origin) and the Admin are never touched.
 */
export function clinicianRoleAfterPayment(account: ProfileRole, payment: SettledPayment): ProfileRole | null {
  const { plan, outcome } = payment;
  if (account.role === "user") {
    return plan === "clinician" && outcome === "paid" ? { role: "clinician", clinicianOrigin: "subscription" } : null;
  }
  if (account.role !== "clinician" || account.clinicianOrigin !== "subscription") return null;
  const leaves = plan === "premium" ? outcome === "paid" : outcome === "failed";
  return leaves ? { role: "user", clinicianOrigin: null } : null;
}

/** Refusals of the Admin's Clinician management: anyone but the Admin asking. */
export type AdminOnlyRefusal = "not_allowed";

/** The "+ Create clinician" fields as typed. */
export interface NewClinicianInput {
  name: string;
  email: string;
  password: string;
}

export interface NewClinician {
  name: string;
  /** Their real email, lowercase: a Clinician the Admin creates signs in with it (ADR-018). */
  email: string;
  password: string;
}

export type NewClinicianProblem = "name_required" | "invalid_email" | "password_too_short";

/** Checks and normalizes the "+ Create clinician" fields, in the app and on the server. */
export function checkNewClinician(input: NewClinicianInput):
  | { ok: true; clinician: NewClinician }
  | { ok: false; error: NewClinicianProblem } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length === 0) return { ok: false, error: "name_required" };
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "invalid_email" };
  if (input.password.length < PASSWORD_MIN_LENGTH) return { ok: false, error: "password_too_short" };
  return { ok: true, clinician: { name, email, password: input.password } };
}

export type CreateClinicianRefusal = AdminOnlyRefusal | "email_registered";

/**
 * Only the Admin creates a Clinician (ADR-014), and never with an email that
 * already belongs to an account as its login email or contact email: the
 * Admin promotes that User instead.
 */
export function mayCreateClinician(request: {
  actor: { role: AccountRole };
  emailRegistered: boolean;
}): { ok: true } | { ok: false; reason: CreateClinicianRefusal } {
  if (request.actor.role !== "admin") return { ok: false, reason: "not_allowed" };
  if (request.emailRegistered) return { ok: false, reason: "email_registered" };
  return { ok: true };
}

/** Every refusal the create-clinician function answers with (as `{ error }`). */
export type CreateClinicianError = NewClinicianProblem | CreateClinicianRefusal;

export type PromoteToClinicianRefusal = AdminOnlyRefusal | "already_clinician";

/**
 * Only the Admin promotes a User to Clinician, granting the role (origin
 * "admin", which payments never touch). Any User without the role qualifies:
 * a Regular, a Patient (roles overlap) or an Inactive Clinician. The Admin
 * account never becomes a Clinician.
 */
export function mayPromoteToClinician(request: {
  actor: { role: AccountRole };
  account: { role: AccountRole };
}): { ok: true } | { ok: false; reason: PromoteToClinicianRefusal } {
  const { actor, account } = request;
  if (actor.role !== "admin" || account.role === "admin") return { ok: false, reason: "not_allowed" };
  if (account.role === "clinician") return { ok: false, reason: "already_clinician" };
  return { ok: true };
}

/** Every refusal the promote-clinician function answers with (as `{ error }`). */
export type PromoteToClinicianError = PromoteToClinicianRefusal;

/** The highest Patient limit the Admin may set for one Clinician. */
export const PATIENT_LIMIT_MAX = 1000;

export type SetPatientLimitRefusal = AdminOnlyRefusal | "not_clinician" | "invalid_limit";

/**
 * Only the Admin sets a Clinician's Patient limit, and only for someone who
 * holds the Clinician role (the Admin has no limit). The limit is a whole
 * number from the Patients they already have up to PATIENT_LIMIT_MAX, so a
 * typo can be undone but the limit never falls below their Patients.
 */
export function maySetPatientLimit(request: {
  actor: { role: AccountRole };
  account: { role: AccountRole; patientCount: number };
  limit: number;
}): { ok: true } | { ok: false; reason: SetPatientLimitRefusal } {
  const { actor, account, limit } = request;
  if (actor.role !== "admin") return { ok: false, reason: "not_allowed" };
  if (account.role !== "clinician") return { ok: false, reason: "not_clinician" };
  if (!Number.isInteger(limit) || limit < account.patientCount || limit > PATIENT_LIMIT_MAX) {
    return { ok: false, reason: "invalid_limit" };
  }
  return { ok: true };
}

/** Every refusal the set-patient-limit function answers with (as `{ error }`). */
export type SetPatientLimitError = SetPatientLimitRefusal;

/** An account whose password is revealed, reset or changed, as the server reads it. */
export interface PasswordAccount extends ProfileRole {
  /** The Clinician of its Link; null without a Link. */
  clinicianId: string | null;
}

/**
 * Whether setting this account's password keeps an encrypted copy of it
 * (ADR-015): a Patient's, for their Clinician and the Admin, and a Clinician
 * the Admin created, for the Admin. Nobody can reveal anyone else's password,
 * so no copy of it is kept.
 */
export function keepsPasswordCopy(account: PasswordAccount): boolean {
  const isPatient = account.clinicianId !== null;
  const adminCreatedClinician = account.role === "clinician" && account.clinicianOrigin === "admin";
  return isPatient || adminCreatedClinician;
}

export type PasswordRefusal = "not_allowed";

/**
 * Who may reveal or reset an account's password (ADR-015): the Admin, for
 * every account that keeps a password copy; a Patient's own Clinician, while
 * they hold the role, unless that Patient also holds the Clinician role.
 */
export function mayRevealOrResetPassword(request: {
  actor: { id: string; role: AccountRole };
  account: PasswordAccount;
}): { ok: true } | { ok: false; reason: PasswordRefusal } {
  const { actor, account } = request;
  if (actor.role === "admin") {
    return keepsPasswordCopy(account) ? { ok: true } : { ok: false, reason: "not_allowed" };
  }
  // One Clinician must never sign in as another (and see their Patients).
  if (isOwnClinician(actor, account.clinicianId) && account.role === "user") return { ok: true };
  return { ok: false, reason: "not_allowed" };
}

/** Only the Admin reads who revealed whose password, and when (ADR-015). */
export function mayReadPasswordAccessLog(role: AccountRole): boolean {
  return role === "admin";
}

/** Every refusal the reveal-password function answers with (as `{ error }`). */
export type RevealPasswordError = PasswordRefusal | "no_password_copy";

/** Why a new password is refused, wherever one is set. */
export type PasswordProblem = "password_too_short";

/** Every refusal the reset-password function answers with (as `{ error }`). */
export type ResetPasswordError = PasswordRefusal | PasswordProblem;

/** Every refusal the change-password function answers with (as `{ error }`). */
export type ChangePasswordError = PasswordProblem;

/** Every refusal the password-access-log function answers with (as `{ error }`). */
export type PasswordAccessLogError = PasswordRefusal;

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
