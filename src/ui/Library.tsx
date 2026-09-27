import { useEffect, useRef, useState } from "react";
import type { CustomSession } from "../audio/builder";
import { listAssignedAudios } from "../lib/audioLibrary";
import type { CloudAudio } from "../lib/audioLibrary";
import { useEntitlement } from "../lib/useEntitlement";
import {
  deleteCustomSession,
  exportSessionJSON,
  importSessionJSON,
  listCustomSessions,
  saveCustomSession,
} from "../state/customPresets";
import type { AudioKind } from "../state/listening";
import { loadPrefs } from "../state/prefs";
import { bandForHz, formatClock } from "./bands";
import { startLibraryPlay, stopPlay, useNowPlaying, usePlayProgress } from "./nowPlaying";

/**
 * Library: the user-facing home for custom audio — cloud sessions
 * crafted by the SwaraSanti team ("Made for you" + templates) and locally saved
 * Studio sessions with JSON import/export. Playback goes through the SAME
 * shared BuilderEngine the Studio uses, so one custom session plays at a time.
 * Fully standalone without Supabase: the cloud section hides entirely.
 */

interface LibraryProps {
  /** Opens the Account sheet — sign-in lives there now. */
  onSignIn: () => void;
  /** Called before custom audio starts — the running Play stops first. */
  onBeforePlay: () => void;
}

/** The running Play's time left (or heard, when open-ended), repainted while it runs. */
function PlayTime() {
  const progress = usePlayProgress();
  if (!progress) return null;
  return (
    <span className="transport-time">
      {formatClock(progress.remainingSec ?? progress.elapsedSec)}
    </span>
  );
}

export function Library({ onSignIn, onBeforePlay }: LibraryProps) {
  const ent = useEntitlement();
  const [cloud, setCloud] = useState<CloudAudio[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CustomSession[]>(() => listCustomSessions());
  // Now Playing outlives this view, so a remount (nav away and back) shows the
  // Stop control for audio that is still playing.
  const play = useNowPlaying();
  const playingId = play && play.audio.kind !== "preset" ? play.audio.id : null;
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const signedIn = ent.signedIn;

  useEffect(() => {
    if (!signedIn) {
      // Sign-out (possibly from another tab) must drop the personalized list.
      setCloud([]);
      setCloudError(null);
      return;
    }
    // Cancellation guard: if sign-out fires while this fetch is in flight,
    // its resolution must NOT repopulate the previous account's data (the
    // "Made for you" list renders on assigned.length, not on signedIn).
    let cancelled = false;
    void listAssignedAudios()
      .then((rows) => {
        if (cancelled) return;
        setCloud(rows);
        setCloudError(null);
      })
      .catch(() => {
        if (!cancelled) setCloudError("Could not load your sessions — try again later.");
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2600);
  };

  /** Play `spec` as `kind` (cloud Custom Audio or a saved session) under the list's id and name. */
  const playItem = (kind: AudioKind, id: string, name: string, spec: CustomSession) => {
    onBeforePlay(); // one pair of ears: the running Play stops first
    const prefs = loadPrefs();
    const durationMin =
      prefs.lastDurationMin === "inf" ? null : prefs.lastDurationMin ?? 30;
    startLibraryPlay(
      { kind, id, name, emoji: null, band: bandForHz(spec.curve.targetHz) },
      spec,
      durationMin,
    );
  };

  const handleExport = (session: CustomSession) => {
    const blob = new Blob([exportSessionJSON(session)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name.replace(/[^a-zA-Z0-9]+/g, "-") || "session"}.swarasanti.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const imported = importSessionJSON(await file.text());
      saveCustomSession(imported);
      setSaved(listCustomSessions());
      flash("Session imported ✓");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Import failed");
    }
  };

  const handleDelete = (id: string) => {
    if (playingId === id) stopPlay();
    deleteCustomSession(id);
    setSaved(listCustomSessions());
  };

  // Resolve a play target from either list by id (cloud first, then saved).
  const playFrom = (id: string) => {
    const cloudHit = cloud.find((a) => a.id === id);
    if (cloudHit) return playItem("custom", id, cloudHit.name, cloudHit.spec);
    const savedHit = saved.find((s) => s.id === id);
    if (savedHit) return playItem("saved", id, savedHit.name, savedHit);
  };

  const transport = (id: string) =>
    playingId === id ? (
      <span className="library-transport">
        <PlayTime />
        <button className="pill-btn stop" onClick={stopPlay}>
          ■ Stop
        </button>
      </span>
    ) : (
      <button className="chip" onClick={() => playFrom(id)}>
        ▶ Play
      </button>
    );

  const assigned = cloud.filter((a) => !a.isTemplate);
  const templates = cloud.filter((a) => a.isTemplate);

  return (
    <section className="library">
      <header className="library-head">
        <h1>Library</h1>
        <p className="library-sub">
          Your sessions in one place — made for you, and made by you.
        </p>
      </header>

      {ent.link && (
        <div className="library-section my-clinician">
          <h2>My clinician</h2>
          <p className="library-note">
            Connected to {ent.link.clinicianName ?? "your clinician"}
          </p>
        </div>
      )}

      {ent.configured && (
        <div className="library-section">
          <h2>Made for you</h2>
          <p className="library-note">
            Sessions crafted for you by the SwaraSanti team.
          </p>
          {ent.loading && <p className="library-note">Loading your sessions…</p>}
          {!ent.loading && !signedIn && (
            <p className="library-note">
              Sign in to see sessions made for you.{" "}
              <button className="chip small" onClick={onSignIn}>
                Sign in
              </button>
            </p>
          )}
          {signedIn && cloudError && <p className="library-note">{cloudError}</p>}
          {signedIn && !cloudError && assigned.length === 0 && templates.length === 0 && (
            <p className="library-note">
              Nothing here yet — sessions assigned to you will appear here.
            </p>
          )}
          {assigned.length > 0 && (
            <div className="library-list">
              {assigned.map((audio) => (
                <div className="library-item" key={audio.id}>
                  <div className="library-item-info">
                    <span className="library-item-name">{audio.name}</span>
                    {audio.goalTagline && (
                      <span className="library-item-tagline">{audio.goalTagline}</span>
                    )}
                  </div>
                  {transport(audio.id)}
                </div>
              ))}
            </div>
          )}
          {templates.length > 0 && (
            <>
              <h3 className="library-subheading">Templates</h3>
              <div className="library-list">
                {templates.map((audio) => (
                  <div className="library-item" key={audio.id}>
                    <div className="library-item-info">
                      <span className="library-item-name">{audio.name}</span>
                      {audio.goalTagline && (
                        <span className="library-item-tagline">{audio.goalTagline}</span>
                      )}
                    </div>
                    {transport(audio.id)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="library-section">
        <div className="library-section-head">
          <h2>My saved sessions</h2>
          <button className="chip" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {saved.length === 0 ? (
          <p className="library-note">
            No saved sessions yet — design one in the Studio or import a
            .swarasanti.json file.
          </p>
        ) : (
          <div className="library-list">
            {saved.map((session) => (
              <div className="library-item" key={session.id}>
                <div className="library-item-info">
                  <span className="library-item-name">{session.name}</span>
                </div>
                {transport(session.id)}
                <button className="chip small" onClick={() => handleExport(session)}>
                  Export
                </button>
                <button
                  className="saved-del"
                  aria-label={`Delete ${session.name}`}
                  onClick={() => handleDelete(session.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {notice && <div className="notice">{notice}</div>}
    </section>
  );
}
