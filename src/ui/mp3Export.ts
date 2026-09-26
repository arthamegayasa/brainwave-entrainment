import type { ExportPhase } from "../audio/export";
import type { DownloadAudio } from "../state/listening";
import { recordDownload } from "../lib/listening";

/**
 * The app's single MP3 export (Audio Bank card or preset). One at a time
 * app-wide: an offline render holds up to ~1.3 GB, so two in parallel can
 * crash a phone. Module-level so the job and its progress survive the view
 * that started it unmounting (setup sheet closed, dashboard tab switched).
 */
export interface ExportJob {
  /** The item that started the export; only its control shows progress. */
  id: string;
  phase: ExportPhase;
  pct: number | null;
}

type ExportRender = (onPhase: (phase: ExportPhase, pct?: number) => void) => Promise<Blob>;

let job: ExportJob | null = null;
const listeners = new Set<() => void>();

function setJob(next: ExportJob | null): void {
  job = next;
  for (const listener of listeners) listener();
}

export function getExportJob(): ExportJob | null {
  return job;
}

/** Subscribe to getExportJob() changes (useSyncExternalStore contract). */
export function subscribeExport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Progress label for the control that owns the running export. */
export function exportLabel(current: ExportJob): string {
  return current.phase === "rendering" ? "Rendering…" : `Encoding ${current.pct ?? 0}%`;
}

/**
 * Run `render` as the app-wide export and download the result as
 * `<name>.mp3`, recorded as a Download of `audio`, `lengthMin` long, in the
 * signed-in User's Listening History. Resolves false without doing anything
 * while another export runs; render errors propagate to the caller.
 */
export async function runMp3Export(
  id: string,
  name: string,
  download: { audio: DownloadAudio; lengthMin: number },
  render: ExportRender,
): Promise<boolean> {
  if (job) return false;
  setJob({ id, phase: "rendering", pct: null });
  try {
    const blob = await render((phase, pct) => setJob({ id, phase, pct: pct ?? null }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Strip leading/trailing dashes so whitespace-only or fully non-ASCII
    // names fall back to "session" instead of downloading as "-.mp3".
    const core = name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    a.download = `${core || "session"}.mp3`;
    a.click();
    recordDownload(download.audio, download.lengthMin);
    // Revoking right after click() can cancel the download in Safari; keep
    // the URL alive until the browser has taken the file.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } finally {
    setJob(null);
  }
}
