import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CustomSession } from "../audio/builder";
import type { Band } from "../audio/presets";
import { sanitizeSession } from "../state/customPresets";
import { bandForHz } from "../ui/bands";
import { assignAudio, unassignAudio } from "./audioLibrary";

/**
 * Clinician data layer (quick-260714-a8a): patients, invite codes, Audio Bank,
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
  email: string | null;
  linkedAt: string;
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
 * Linked patients with their emails. patient_links FKs point at auth.users,
 * NOT profiles, so PostgREST embedded joins are unavailable — two-step fetch:
 * links first (RLS scopes to own rows), then the linked patients' profiles
 * (the profiles policy lets clinicians read exactly those rows).
 */
export async function listMyPatients(): Promise<PatientLink[]> {
  const sb = client();
  const uid = await currentUserId(sb);
  const { data: links, error } = await sb
    .from("patient_links")
    .select("patient_id, created_at")
    .eq("clinician_id", uid)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (links ?? []) as Array<{ patient_id: string; created_at: string }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.patient_id);
  const { data: profiles, error: profErr } = await sb
    .from("profiles")
    .select("user_id, email")
    .in("user_id", ids);
  if (profErr) throw profErr;
  const emailById = new Map(
    ((profiles ?? []) as Array<{ user_id: string; email: string | null }>).map(
      (p) => [p.user_id, p.email],
    ),
  );

  return rows.map((r) => ({
    patientId: r.patient_id,
    email: emailById.get(r.patient_id) ?? null,
    linkedAt: r.created_at,
  }));
}

/** Create a single-use invite code (DB defaults generate code + 30-day expiry). */
export async function createInviteCode(): Promise<{ code: string; expiresAt: string }> {
  const sb = client();
  const uid = await currentUserId(sb);
  const { data, error } = await sb
    .from("invite_codes")
    .insert({ clinician_id: uid })
    .select("code, expires_at")
    .single();
  if (error) throw error;
  const row = data as { code: string; expires_at: string };
  return { code: row.code, expiresAt: row.expires_at };
}

/** Active (unused, unexpired) invite codes, newest first. */
export async function listInviteCodes(): Promise<Array<{ code: string; expiresAt: string }>> {
  const sb = client();
  const { data, error } = await sb
    .from("invite_codes")
    .select("code, expires_at")
    .is("used_by", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{ code: string; expires_at: string }>).map((r) => ({
    code: r.code,
    expiresAt: r.expires_at,
  }));
}

/** Revoke an unused invite code. */
export async function revokeInviteCode(code: string): Promise<void> {
  const sb = client();
  const { error } = await sb.from("invite_codes").delete().eq("code", code);
  if (error) throw error;
}

/** Sever the link with a patient (RLS restricts to own links). */
export async function unlinkPatient(patientId: string): Promise<void> {
  const sb = client();
  const { error } = await sb
    .from("patient_links")
    .delete()
    .eq("patient_id", patientId);
  if (error) throw error;
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

/** Hide (insert row) or show (delete row) a built-in preset for a patient. */
export async function setPresetHidden(
  patientId: string,
  presetId: string,
  hidden: boolean,
): Promise<void> {
  const sb = client();
  const uid = await currentUserId(sb);
  if (hidden) {
    const { error } = await sb.from("template_visibility").upsert({
      clinician_id: uid,
      patient_id: patientId,
      preset_id: presetId,
    });
    if (error) throw error;
  } else {
    const { error } = await sb
      .from("template_visibility")
      .delete()
      .eq("clinician_id", uid)
      .eq("patient_id", patientId)
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

  const out: BankAudio[] = [];
  for (const row of (data ?? []) as BankRow[]) {
    const spec = sanitizeSession(row.spec);
    if (!spec) continue;
    out.push({
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
    });
  }
  return out;
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
