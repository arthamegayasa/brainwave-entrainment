import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { CustomSession } from "../audio/builder";
import { sanitizeSession } from "../state/customPresets";

/**
 * Cloud audio library (quick-260707-a47, extended quick-260714-a8a):
 * clinicians and admins publish Studio sessions — admins as shared templates,
 * clinicians into their Audio Bank for patient assignment; users read what
 * RLS lets them see. Every `spec` jsonb read from the cloud is UNTRUSTED and
 * passes through sanitizeSession before it can reach the audio engine — rows
 * whose spec fails sanitization are dropped, never played.
 */

export interface CloudAudio {
  id: string;
  name: string;
  goalTagline: string | null;
  spec: CustomSession;
  isTemplate: boolean;
  createdAt: string;
  /** Audio Bank metadata (quick-260714-a8a) — optional for older callers. */
  category?: string;
  notes?: string | null;
}

interface AudioRow {
  id: string;
  name: string;
  goal_tagline: string | null;
  spec: unknown;
  is_template: boolean;
  created_at: string;
  category?: string | null;
  notes?: string | null;
}

function client(): SupabaseClient {
  if (!supabase) throw new Error("Library not configured");
  return supabase;
}

async function currentUserId(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

function toCloudAudio(row: AudioRow): CloudAudio | null {
  const spec = sanitizeSession(row.spec);
  if (!spec) return null;
  return {
    id: row.id,
    name: row.name,
    goalTagline: row.goal_tagline,
    spec,
    isTemplate: row.is_template,
    createdAt: row.created_at,
    category: row.category ?? "other",
    notes: row.notes ?? null,
  };
}

/**
 * Audios visible to the signed-in user: shared templates plus rows assigned
 * to them (RLS enforces the visibility — the client just selects *).
 */
export async function listAssignedAudios(): Promise<CloudAudio[]> {
  const sb = client();
  const { data, error } = await sb
    .from("custom_audios")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AudioRow[])
    .map(toCloudAudio)
    .filter((a): a is CloudAudio => a !== null);
}

/**
 * Admin-only: list every user. RLS limits non-admins to their own row (plus,
 * for clinicians, their linked patients) — clinician flows must use
 * clinician.listMyPatients() instead, never this.
 */
export async function listAllUsers(): Promise<
  Array<{ userId: string; email: string | null }>
> {
  const sb = client();
  const { data, error } = await sb
    .from("profiles")
    .select("user_id, email")
    .order("email");
  if (error) throw error;
  return ((data ?? []) as Array<{ user_id: string; email: string | null }>).map(
    (r) => ({ userId: r.user_id, email: r.email }),
  );
}

/** Clinician/admin: publish a Studio session; returns the new audio id. */
export async function publishAudio(
  spec: CustomSession,
  opts: {
    name: string;
    goalTagline?: string;
    isTemplate: boolean;
    category?: string;
    notes?: string;
  },
): Promise<string> {
  const sb = client();
  const uid = await currentUserId(sb);
  const { data, error } = await sb
    .from("custom_audios")
    .insert({
      created_by: uid,
      name: opts.name,
      goal_tagline: opts.goalTagline ?? null,
      spec,
      is_template: opts.isTemplate,
      category: opts.category ?? "other",
      notes: opts.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Admin: make an audio visible to a specific user. */
export async function assignAudio(audioId: string, userId: string): Promise<void> {
  const sb = client();
  const uid = await currentUserId(sb);
  const { error } = await sb.from("audio_assignments").upsert({
    audio_id: audioId,
    user_id: userId,
    assigned_by: uid,
  });
  if (error) throw error;
}

/** Admin: remove an audio from a user's library. */
export async function unassignAudio(
  audioId: string,
  userId: string,
): Promise<void> {
  const sb = client();
  const { error } = await sb
    .from("audio_assignments")
    .delete()
    .eq("audio_id", audioId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Admin: list audios the current admin has published (sanitized). */
export async function listMyPublishedAudios(): Promise<CloudAudio[]> {
  const sb = client();
  const uid = await currentUserId(sb);
  const { data, error } = await sb
    .from("custom_audios")
    .select("*")
    .eq("created_by", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AudioRow[])
    .map(toCloudAudio)
    .filter((a): a is CloudAudio => a !== null);
}

/** Admin: delete an audio (assignments cascade). */
export async function deleteAudio(audioId: string): Promise<void> {
  const sb = client();
  const { error } = await sb.from("custom_audios").delete().eq("id", audioId);
  if (error) throw error;
}
