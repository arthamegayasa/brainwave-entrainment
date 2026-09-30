import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { targetBeatHz } from "../audio/builder";
import type { CustomSession } from "../audio/builder";
import type { Band } from "../audio/presets";
import { deleteCustomSession, listCustomSessions, sanitizeSession } from "../state/customPresets";
import { bandForHz } from "../ui/bands";
import { allRows } from "./allRows";
import { assignAudio, unassignAudio } from "./audioLibrary";
import { shownEmail } from "../../supabase/functions/_shared/accountRules.ts";
import type { AccountRole } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * Clinician data layer: patients, Audio Bank,
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
  /** Set when the audio was made for this Patient (made_for); null for general audio. */
  madeFor: string | null;
}

export interface BankAudio {
  id: string;
  name: string;
  goalTagline: string | null;
  category: AudioCategory;
  /** The owner's private notes (custom_audio_notes): null when none, or for anyone else. */
  notes: string | null;
  spec: CustomSession;
  isTemplate: boolean;
  /** The Patient it was made for; null for general Custom Audio. */
  madeFor: string | null;
  /** The name of the Custom Audio or Template it was copied from. */
  basedOn: string | null;
  createdAt: string;
  /** Its last save, set by the database. */
  updatedAt: string;
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
  const rows = await allRows<{
    audio_id: string;
    custom_audios: {
      name: string;
      category: string | null;
      goal_tagline: string | null;
      made_for: string | null;
    } | null;
  }>((from, to) =>
    sb
      .from("audio_assignments")
      .select("audio_id, custom_audios(name, category, goal_tagline, made_for)")
      .eq("user_id", patientId)
      .order("created_at", { ascending: false })
      .order("audio_id")
      .range(from, to),
  );
  return rows.map((r) => ({
    audioId: r.audio_id,
    name: r.custom_audios?.name ?? "Untitled",
    category: coerceCategory(r.custom_audios?.category),
    goalTagline: r.custom_audios?.goal_tagline ?? null,
    madeFor: r.custom_audios?.made_for ?? null,
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
  spec: unknown;
  is_template: boolean;
  made_for: string | null;
  based_on: string | null;
  created_at: string;
  updated_at: string;
}

/** The Custom Audio columns a Clinician's client reads; notes live in custom_audio_notes. */
const BANK_COLUMNS = "id, name, goal_tagline, category, spec, is_template, made_for, based_on, created_at, updated_at";

function toBankAudio(row: BankRow, notes: string | null): BankAudio | null {
  const spec = sanitizeSession(row.spec);
  if (!spec) return null;
  return {
    id: row.id,
    name: row.name,
    goalTagline: row.goal_tagline,
    category: coerceCategory(row.category),
    notes,
    spec,
    isTemplate: row.is_template,
    madeFor: row.made_for,
    basedOn: row.based_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    band: bandForHz(targetBeatHz(spec)),
    targetHz: targetBeatHz(spec),
    layerCount: spec.layers.length,
  };
}

/**
 * The clinician's Audio Bank: own custom_audios rows with their notes, most
 * recently saved first. Specs failing sanitizeSession are DROPPED (never
 * reach the engine); unknown category values coerce to 'other'.
 */
export async function listBank(): Promise<BankAudio[]> {
  const sb = client();
  const uid = await currentUserId(sb);
  const [rows, notes] = await Promise.all([
    allRows<BankRow>((from, to) =>
      sb
        .from("custom_audios")
        .select(BANK_COLUMNS)
        .eq("created_by", uid)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    allRows<{ audio_id: string; notes: string }>((from, to) =>
      sb.from("custom_audio_notes").select("audio_id, notes").order("audio_id").range(from, to),
    ),
  ]);
  const notesOf = new Map(notes.map((n) => [n.audio_id, n.notes]));
  return rows.map((row) => toBankAudio(row, notesOf.get(row.id) ?? null)).filter((audio) => audio !== null);
}

/**
 * One Custom Audio the signed-in User may read, with its notes when they own
 * it: their own, a Template, or (for the Admin) anyone's. Null when gone.
 */
export async function getAudio(id: string): Promise<BankAudio | null> {
  const sb = client();
  const [audio, notes] = await Promise.all([
    sb.from("custom_audios").select(BANK_COLUMNS).eq("id", id).maybeSingle(),
    sb.from("custom_audio_notes").select("notes").eq("audio_id", id).maybeSingle(),
  ]);
  if (audio.error) throw audio.error;
  if (notes.error) throw notes.error;
  const row: BankRow | null = audio.data;
  const note: { notes: string } | null = notes.data;
  return row ? toBankAudio(row, note?.notes ?? null) : null;
}

/** How many Users each Custom Audio is assigned to, for the rows RLS lets the caller see. */
export async function listAudioUses(): Promise<Record<string, number>> {
  const sb = client();
  const rows = await allRows<{ audio_id: string }>((from, to) =>
    sb.from("audio_assignments").select("audio_id").order("audio_id").order("user_id").range(from, to),
  );
  const uses: Record<string, number> = {};
  for (const row of rows) uses[row.audio_id] = (uses[row.audio_id] ?? 0) + 1;
  return uses;
}

/** How many Users one Custom Audio is assigned to. */
export async function audioUses(id: string): Promise<number> {
  const { count, error } = await client()
    .from("audio_assignments")
    .select("user_id", { count: "exact", head: true })
    .eq("audio_id", id);
  if (error) throw error;
  return count ?? 0;
}

/** A Studio design with its Audio Bank details, as saved. */
export interface AudioDraft {
  /** The design; its name names the Custom Audio. */
  spec: CustomSession;
  goalTagline: string | null;
  category: AudioCategory;
  notes: string | null;
  /** The Patient it is made for (one of the saver's own); null for general. */
  madeFor: string | null;
  /** Admin only: every User sees it. The database refuses it from a Clinician. */
  isTemplate: boolean;
  basedOn: string | null;
}

/** What the database's audio rules say, in the Studio's words. */
const AUDIO_ERRORS: Record<string, string> = {
  not_your_patient: "Made for must be one of your own Patients.",
  assigned_to_others: "This audio is assigned to other patients. Save a copy for this Patient instead.",
  personal_audio: "This audio was made for one Patient. Duplicate it for anyone else.",
  personal_template: "A Template is for everyone, so it cannot be made for one Patient.",
};

function audioError(error: { message?: string }): unknown {
  const code = Object.keys(AUDIO_ERRORS).find((key) => error.message?.includes(key));
  return code ? new Error(AUDIO_ERRORS[code]) : error;
}

async function saveNotes(sb: SupabaseClient, audioId: string, notes: string | null): Promise<void> {
  const text = notes?.trim() ?? "";
  const { error } = text
    ? await sb.from("custom_audio_notes").upsert({ audio_id: audioId, notes: text })
    : await sb.from("custom_audio_notes").delete().eq("audio_id", audioId);
  if (error) throw error;
}

/**
 * Save a design to the signed-in User's Audio Bank: a new Custom Audio when
 * `id` is null, else an update of that one, which everyone it is assigned to
 * hears from their next Play. Returns its id. Custom Audio made for a Patient
 * is assigned to them by the database.
 */
export async function saveAudio(draft: AudioDraft, id: string | null): Promise<string> {
  const sb = client();
  const row = {
    name: draft.spec.name,
    goal_tagline: draft.goalTagline,
    category: draft.category,
    spec: draft.spec,
    made_for: draft.madeFor,
    is_template: draft.isTemplate,
    based_on: draft.basedOn,
  };
  let audioId: string;
  if (id === null) {
    const uid = await currentUserId(sb);
    const { data, error } = await sb
      .from("custom_audios")
      .insert({ ...row, created_by: uid })
      .select("id")
      .single();
    if (error) throw audioError(error);
    const created: { id: string } = data;
    audioId = created.id;
  } else {
    const { data, error } = await sb.from("custom_audios").update(row).eq("id", id).select("id");
    if (error) throw audioError(error);
    if (!data?.length) throw new Error("This audio is no longer in your Audio Bank. Save a copy instead.");
    audioId = id;
  }
  await saveNotes(sb, audioId, draft.notes);
  return audioId;
}

/** Delete a bank audio (assignments and notes cascade). */
export async function deleteAudio(id: string): Promise<void> {
  const { error } = await client().from("custom_audios").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Move every design saved on this device into the Audio Bank as general
 * Custom Audio, each off the device once it is saved. Returns how many moved.
 */
export async function moveDeviceSavesToBank(): Promise<number> {
  const sessions = listCustomSessions();
  for (const spec of sessions) {
    await saveAudio(
      { spec, goalTagline: null, category: "other", notes: null, madeFor: null, isTemplate: false, basedOn: null },
      null,
    );
    deleteCustomSession(spec.id);
  }
  return sessions.length;
}

/**
 * Admin: how many Custom Audio a User created, their Audio Bank's size. A
 * former Clinician keeps theirs (#15). RLS lets only the Admin count anyone's.
 */
export async function audioBankSize(userId: string): Promise<number> {
  const { count, error } = await client()
    .from("custom_audios")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId);
  if (error) throw error;
  return count ?? 0;
}

/** One Clinician's Audio Bank, named after them. */
export interface AudioBank {
  ownerId: string;
  /** The owner's name, else the email to show (never an internal login email). */
  ownerName: string;
  audios: BankAudio[];
}

/**
 * Admin: every Audio Bank, the Admin's own first, then by owner name; each
 * most recently saved first. RLS gives the Admin every Custom Audio and every profile.
 */
export async function listEveryBank(): Promise<AudioBank[]> {
  const sb = client();
  const uid = await currentUserId(sb);
  const rows = await allRows<BankRow & { created_by: string | null }>((from, to) =>
    sb
      .from("custom_audios")
      .select(`${BANK_COLUMNS}, created_by`)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
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
    const audio = toBankAudio(row, null);
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

/**
 * Update Audio Bank details (name / tagline / category / notes) and, for
 * Change Scene, the stored spec carrying the new Scene id.
 */
export async function updateAudioMeta(
  id: string,
  patch: {
    name?: string;
    goalTagline?: string | null;
    category?: AudioCategory;
    notes?: string | null;
    spec?: CustomSession;
  },
): Promise<void> {
  const sb = client();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.goalTagline !== undefined) update.goal_tagline = patch.goalTagline;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.spec !== undefined) update.spec = patch.spec;
  if (Object.keys(update).length > 0) {
    const { error } = await sb.from("custom_audios").update(update).eq("id", id);
    if (error) throw audioError(error);
  }
  if (patch.notes !== undefined) await saveNotes(sb, id, patch.notes);
}
