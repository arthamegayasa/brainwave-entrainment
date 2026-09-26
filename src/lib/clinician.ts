import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CustomSession } from "../audio/builder";
import type { Band } from "../audio/presets";
import { sanitizeSession } from "../state/customPresets";
import { bandForHz } from "../ui/bands";
import { assignAudio, unassignAudio } from "./audioLibrary";
import { shownEmail } from "../../supabase/functions/_shared/accountRules.ts";
import type { AccountRole } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * Clinician data layer (quick-260714-a8a): patients, Audio Bank,
 * per-patient preset visibility, and assignment. Every function throws when
 * Supabase isn't configured — the Dashboard renders only for clinicians on a
 * configured build, and RLS enforces every rule server-side regardless.
 *
 * Every cloud `spec` jsonb is UNTRUSTED and passes through sanitizeSession
 * before it can reach the audio engine — rows failing sanitization are
 * DROPPED, never played.
 */

/** Single source for the Dashboard + Builder category pickers. */
export const AUDIO_CATEGORIES = [
  "sleep",
  "meditation",
  "relaxation",
  "anxiety",
  "focus",
  "energy",
  "creativity",
  "other",
] as const;

export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export interface PatientLink {
  patientId: string;
  /** The Clinician of the Patient's Link: the one who curates them (the Admin acts in their name). */
  clinicianId: string;
  /** The Patient's name (profile display name); null for older Links. */
  name: string | null;
  /** The role on the Patient's profile: a Patient may also be a Clinician. */
  role: AccountRole;
  username: string | null;
  /** The email to show; never an internal login email (ADR-018). */
  email: string | null;
  linkedAt: string;
  /** Whether the Link carries the Premium grant (ADR-014). */
  premiumGrant: boolean;
}

/** How a Patient reads in the Dashboard: their name, else their email. */
export function patientName(patient: PatientLink): string {
  return patient.name ?? patient.email ?? "Unnamed patient";
}

export interface PatientAssignment {
  audioId: string;
  name: string;
  category: string;
  goalTagline: string | null;
}

export interface BankAudio {
  id: string;
  name: string;
  goalTagline: string | null;
  category: AudioCategory;
  notes: string | null;
  spec: CustomSession;
  isTemplate: boolean;
  createdAt: string;
  band: Band;
  targetHz: number;
  layerCount: number;
}

function client(): SupabaseClient {
  if (!supabase) throw new Error("Clinician features not configured");
  return supabase;
}

async function currentUserId(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

function coerceCategory(value: string | null | undefined): AudioCategory {
  return (AUDIO_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as AudioCategory)
    : "other";
}

/**
 * Linked patients with their names, Usernames and emails. patient_links FKs
 * point at auth.users, NOT profiles, so PostgREST embedded joins are
 * unavailable — two-step fetch: links first (RLS scopes to own rows), then
 * the linked patients' profiles (the profiles policy lets clinicians read
 * exactly those rows).
 */
export async function listMyPatients(): Promise<PatientLink[]> {
  const sb = client();
  const uid = await currentUserId(sb);
  const { data: links, error } = await sb
    .from("patient_links")
    .select("patient_id, created_at, premium_grant")
    .eq("clinician_id", uid)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (links ?? []) as Array<{
    patient_id: string;
    created_at: string;
    premium_grant: boolean;
  }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.patient_id);
  const { data: profiles, error: profErr } = await sb
    .from("profiles")
    .select("user_id, email, display_name, username, contact_email, role")
    .in("user_id", ids);
  if (profErr) throw profErr;
  const profileById = new Map(
    (
      (profiles ?? []) as Array<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        username: string | null;
        contact_email: string | null;
        role: AccountRole;
      }>
    ).map((p) => [p.user_id, p]),
  );

  return rows.map((r) => {
    const profile = profileById.get(r.patient_id);
    return {
      patientId: r.patient_id,
      clinicianId: uid,
      name: profile?.display_name ?? null,
      // Without their profile (it cannot be read) they show as a Patient only.
      role: profile?.role ?? "user",
      username: profile?.username ?? null,
      email: profile
        ? shownEmail({ loginEmail: profile.email, contactEmail: profile.contact_email })
        : null,
      linkedAt: r.created_at,
      premiumGrant: r.premium_grant,
    };
  });
}

/**
 * Audios assigned to one patient. audio_assignments has a real FK to
 * custom_audios, so the embedded select works here.
 */
export async function listPatientAssignments(
  patientId: string,
): Promise<PatientAssignment[]> {
  const sb = client();
  const { data, error } = await sb
    .from("audio_assignments")
    .select("audio_id, custom_audios(name, category, goal_tagline)")
    .eq("user_id", patientId);
  if (error) throw error;
  return (
    (data ?? []) as unknown as Array<{
      audio_id: string;
      custom_audios: {
        name: string;
        category: string | null;
        goal_tagline: string | null;
      } | null;
    }>
  ).map((r) => ({
    audioId: r.audio_id,
    name: r.custom_audios?.name ?? "Untitled",
    category: coerceCategory(r.custom_audios?.category),
    goalTagline: r.custom_audios?.goal_tagline ?? null,
  }));
}

/**
 * Assigned-audio count per patient in ONE query (RLS scopes the rows to
 * assignments the clinician can manage) — powers the patient-list rows.
 */
export async function listAssignmentCounts(): Promise<Record<string, number>> {
  const sb = client();
  const { data, error } = await sb.from("audio_assignments").select("user_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ user_id: string }>) {
    counts[row.user_id] = (counts[row.user_id] ?? 0) + 1;
  }
  return counts;
}

/** Preset ids currently HIDDEN for a patient (row present = hidden). */
export async function getHiddenPresets(patientId: string): Promise<string[]> {
  const sb = client();
  const { data, error } = await sb
    .from("template_visibility")
    .select("preset_id")
    .eq("patient_id", patientId);
  if (error) throw error;
  return ((data ?? []) as Array<{ preset_id: string }>).map((r) => r.preset_id);
}

/**
 * Hide (insert row) or show (delete row) a built-in preset for a Patient. A
 * hidden Preset belongs to the Patient's Link, under their Clinician, also
 * when the Admin hides it: their Clinician sees it, and ending the Link
 * removes it. Showing removes every row hiding it that RLS lets the caller
 * manage.
 */
export async function setPresetHidden(
  patient: Pick<PatientLink, "patientId" | "clinicianId">,
  presetId: string,
  hidden: boolean,
): Promise<void> {
  const sb = client();
  if (hidden) {
    const { error } = await sb.from("template_visibility").upsert({
      clinician_id: patient.clinicianId,
      patient_id: patient.patientId,
      preset_id: presetId,
    });
    if (error) throw error;
  } else {
    const { error } = await sb
      .from("template_visibility")
      .delete()
      .eq("patient_id", patient.patientId)
      .eq("preset_id", presetId);
    if (error) throw error;
  }
}

/** Make a bank audio visible to one linked patient (idempotent upsert). */
export async function assignToPatient(
  audioId: string,
  patientId: string,
): Promise<void> {
  return assignAudio(audioId, patientId);
}

/** Remove a bank audio from one patient's library. */
export async function unassignFromPatient(
  audioId: string,
  patientId: string,
): Promise<void> {
  return unassignAudio(audioId, patientId);
}

/** Assign a bank audio to every linked patient in one bulk upsert. */
export async function assignToAllPatients(audioId: string): Promise<void> {
  const sb = client();
  const uid = await currentUserId(sb);
  const patients = await listMyPatients();
  if (patients.length === 0) return;
  const { error } = await sb.from("audio_assignments").upsert(
    patients.map((p) => ({
      audio_id: audioId,
      user_id: p.patientId,
      assigned_by: uid,
    })),
  );
  if (error) throw error;
}

interface BankRow {
  id: string;
  name: string;
  goal_tagline: string | null;
  category: string | null;
  notes: string | null;
  spec: unknown;
  is_template: boolean;
  created_at: string;
}

function toBankAudio(row: BankRow): BankAudio | null {
  const spec = sanitizeSession(row.spec);
  if (!spec) return null;
  return {
    id: row.id,
    name: row.name,
    goalTagline: row.goal_tagline,
    category: coerceCategory(row.category),
    notes: row.notes,
    spec,
    isTemplate: row.is_template,
    createdAt: row.created_at,
    band: bandForHz(spec.curve.targetHz),
    targetHz: spec.curve.targetHz,
    layerCount: spec.layers.length,
  };
}

/**
 * The clinician's Audio Bank: own custom_audios rows, newest first. Specs
 * failing sanitizeSession are DROPPED (never reach the engine); unknown
 * category values coerce to 'other'.
 */
export async function listBank(): Promise<BankAudio[]> {
  const sb = client();
  const uid = await currentUserId(sb);
  const { data, error } = await sb
    .from("custom_audios")
    .select("*")
    .eq("created_by", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as BankRow[]).map(toBankAudio).filter((audio) => audio !== null);
}

/** One Clinician's Audio Bank, named after them. */
export interface AudioBank {
  ownerId: string;
  /** The owner's name, else the email to show (never an internal login email). */
  ownerName: string;
  audios: BankAudio[];
}

/** Rows per request, within PostgREST's row cap (max_rows). */
const PAGE_ROWS = 500;

/**
 * Admin: every Audio Bank, the Admin's own first, then by owner name; each
 * newest first. RLS gives the Admin every Custom Audio and every profile.
 */
export async function listEveryBank(): Promise<AudioBank[]> {
  const sb = client();
  const uid = await currentUserId(sb);
  const rows: Array<BankRow & { created_by: string | null }> = [];
  for (;;) {
    const { data, error } = await sb
      .from("custom_audios")
      .select("id, name, goal_tagline, category, notes, spec, is_template, created_at, created_by")
      .order("created_at", { ascending: false })
      .order("id")
      .range(rows.length, rows.length + PAGE_ROWS - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<BankRow & { created_by: string | null }>;
    rows.push(...page);
    if (page.length < PAGE_ROWS) break;
  }
  if (rows.length === 0) return [];

  const ownerIds = [...new Set(rows.flatMap((r) => (r.created_by ? [r.created_by] : [])))];
  const { data: owners, error: ownerErr } = await sb
    .from("profiles")
    .select("user_id, email, display_name, contact_email")
    .in("user_id", ownerIds);
  if (ownerErr) throw ownerErr;
  const ownerName = new Map(
    (
      (owners ?? []) as Array<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        contact_email: string | null;
      }>
    ).map((p) => [
      p.user_id,
      p.display_name ?? shownEmail({ loginEmail: p.email, contactEmail: p.contact_email }) ?? "Unnamed clinician",
    ]),
  );

  const banks = new Map<string, AudioBank>();
  for (const row of rows) {
    const audio = toBankAudio(row);
    if (!audio || !row.created_by) continue;
    let bank = banks.get(row.created_by);
    if (!bank) {
      const name = ownerName.get(row.created_by) ?? "Unnamed clinician";
      bank = { ownerId: row.created_by, ownerName: row.created_by === uid ? `${name} (you)` : name, audios: [] };
      banks.set(row.created_by, bank);
    }
    bank.audios.push(audio);
  }
  return [...banks.values()].sort(
    (a, b) => Number(b.ownerId === uid) - Number(a.ownerId === uid) || a.ownerName.localeCompare(b.ownerName),
  );
}

/** Update Audio Bank metadata (name / tagline / category / notes). */
export async function updateAudioMeta(
  id: string,
  patch: {
    name?: string;
    goalTagline?: string | null;
    category?: AudioCategory;
    notes?: string | null;
  },
): Promise<void> {
  const sb = client();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.goalTagline !== undefined) update.goal_tagline = patch.goalTagline;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.notes !== undefined) update.notes = patch.notes;
  const { error } = await sb.from("custom_audios").update(update).eq("id", id);
  if (error) throw error;
}

/** Delete a bank audio (assignments cascade) — re-exported for the Dashboard. */
export { deleteAudio } from "./audioLibrary";
