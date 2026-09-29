import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { allRows } from "./allRows";
import type { CustomSession } from "../audio/builder";
import { sanitizeSession } from "../state/customPresets";

/**
 * The Library's cloud audio: what a User listens to. Custom Audio made for
 * them, other Custom Audio assigned to them, Templates, and for a Clinician
 * their latest designs. RLS decides every row. Every `spec` jsonb read from
 * the cloud is UNTRUSTED and passes through sanitizeSession before it can
 * reach the audio engine: rows whose spec fails it are dropped, never played.
 * A Clinician's private notes live in custom_audio_notes and never come here.
 */

export interface CloudAudio {
  id: string;
  name: string;
  goalTagline: string | null;
  spec: CustomSession;
  isTemplate: boolean;
  /** The User whose Audio Bank holds it. */
  createdBy: string;
  /** The Patient it was made for; null for general Custom Audio. */
  madeFor: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The columns a listener's client reads: never notes. */
const AUDIO_COLUMNS = "id, name, goal_tagline, spec, is_template, created_by, made_for, created_at, updated_at";

interface AudioRow {
  id: string;
  name: string;
  goal_tagline: string | null;
  spec: unknown;
  is_template: boolean;
  created_by: string;
  made_for: string | null;
  created_at: string;
  updated_at: string;
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
    createdBy: row.created_by,
    madeFor: row.made_for,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const toCloudAudios = (rows: AudioRow[]) => rows.map(toCloudAudio).filter((a): a is CloudAudio => a !== null);

export interface LibraryAudios {
  /** Custom Audio made for the signed-in User, newest Assignment first. */
  madeForMe: CloudAudio[];
  /** Other Custom Audio assigned to them, newest Assignment first. */
  assigned: CloudAudio[];
  /** Templates, most recently edited first. */
  templates: CloudAudio[];
}

/**
 * What the signed-in User's Library lists from the cloud. A Clinician's own
 * Audio Bank is not in it (see listMyRecentAudios), nor, for the Admin,
 * everyone's: only Assignments to them and Templates.
 */
export async function listLibraryAudios(): Promise<LibraryAudios> {
  const sb = client();
  const uid = await currentUserId(sb);
  const [assignments, templates] = await Promise.all([
    allRows<{ custom_audios: AudioRow | null }>((from, to) =>
      sb
        .from("audio_assignments")
        .select(`custom_audios(${AUDIO_COLUMNS})`)
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .order("audio_id")
        .range(from, to),
    ),
    listTemplates(),
  ]);
  const assigned = toCloudAudios(assignments.flatMap((a) => (a.custom_audios ? [a.custom_audios] : [])));
  return {
    madeForMe: assigned.filter((a) => a.madeFor === uid),
    assigned: assigned.filter((a) => a.madeFor !== uid && !a.isTemplate),
    templates,
  };
}

/** Every Template, most recently edited first: also the starting points for a new design. */
export async function listTemplates(): Promise<CloudAudio[]> {
  const sb = client();
  const rows = await allRows<AudioRow>((from, to) =>
    sb
      .from("custom_audios")
      .select(AUDIO_COLUMNS)
      .eq("is_template", true)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return toCloudAudios(rows);
}

/** A Clinician's `limit` most recently edited Custom Audio, for their Library. */
export async function listMyRecentAudios(limit: number): Promise<CloudAudio[]> {
  const sb = client();
  const uid = await currentUserId(sb);
  const { data, error } = await sb
    .from("custom_audios")
    .select(AUDIO_COLUMNS)
    .eq("created_by", uid)
    .order("updated_at", { ascending: false })
    .order("id")
    .limit(limit);
  if (error) throw error;
  return toCloudAudios((data ?? []) as AudioRow[]);
}

/** Make an audio visible to one User (idempotent upsert). */
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

/** Remove an audio from one User's Library. */
export async function unassignAudio(audioId: string, userId: string): Promise<void> {
  const sb = client();
  const { error } = await sb
    .from("audio_assignments")
    .delete()
    .eq("audio_id", audioId)
    .eq("user_id", userId);
  if (error) throw error;
}
