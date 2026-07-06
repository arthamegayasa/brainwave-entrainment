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
import { loadPrefs } from "../state/prefs";
import { formatClock } from "./bands";
import { ensureBuilder, getBuilderEngine } from "./builderEngine";

/**
 * Library (D-04): the user-facing home for custom audio — cloud sessions
 * crafted by the Serenade team ("Made for you" + templates) and locally saved
 * Studio sessions with JSON import/export. Playback goes through the SAME
 * shared BuilderEngine the Studio uses, so one custom session plays at a time.
 * Fully standalone without Supabase: the cloud section hides entirely.
 */

interface LibraryProps {
  onUpgrade: () => void;
}

export function Library({ onUpgrade }: LibraryProps) {
  const ent = useEntitlement();
  const [cloud, setCloud] = useState<CloudAudio[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CustomSession[]>(() => listCustomSessions());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const signedIn = ent.configured && ent.email !== null;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    listAssignedAudios()
      .then((rows) => {
        if (!cancelled) {
          setCloud(rows);
          setCloudError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setCloudError("Could not load your sessions — try again later.");
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  // Poll the shared engine while playing, mirroring the Studio transport.
  useEffect(() => {
    if (!playingId) return;
    const id = window.setInterval(() => {
      const engine = getBuilderEngine();
      if (!engine) return;
      const p = engine.progress();
      setElapsed(p.elapsedSec);
      setRemaining(p.remainingSec);
      if (!engine.isRunning) setPlayingId(null);
    }, 300);
    return () => window.clearInterval(id);
  }, [playingId]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const play = async (id: string, spec: CustomSession) => {
    const prefs = loadPrefs();
    const durationMin =
      prefs.lastDurationMin === "inf" ? null : prefs.lastDurationMin ?? 30;
    const engine = await ensureBuilder();
    engine.stop();
    engine.start(spec.layers, spec.curve, durationMin);
    setPlayingId(id);
  };

  const stop = () => {
    getBuilderEngine()?.stop();
    setPlayingId(null);
  };

  const handleExport = (session: CustomSession) => {
    const blob = new Blob([exportSessionJSON(session)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name.replace(/[^a-zA-Z0-9]+/g, "-") || "session"}.serenade.json`;
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
    if (playingId === id) stop();
    deleteCustomSession(id);
    setSaved(listCustomSessions());
  };

  // Resolve a play target from either list by id (cloud first, then saved).
  const playFrom = async (id: string) => {
    const cloudHit = cloud.find((a) => a.id === id);
    if (cloudHit) return play(id, cloudHit.spec);
    const savedHit = saved.find((s) => s.id === id);
    if (savedHit) return play(id, savedHit);
  };

  const transport = (id: string) =>
    playingId === id ? (
      <span className="library-transport">
        <span className="transport-time">
          {remaining === null ? formatClock(elapsed) : formatClock(remaining)}
        </span>
        <button className="pill-btn stop" onClick={stop}>
          ■ Stop
        </button>
      </span>
    ) : (
      <button className="chip" onClick={() => void playFrom(id)}>
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

      {ent.configured && (
        <div className="library-section">
          <h2>Made for you</h2>
          <p className="library-note">
            Sessions crafted for you by the Serenade team.
          </p>
          {!signedIn && (
            <p className="library-note">
              Sign in on the{" "}
              <button className="link-btn" onClick={onUpgrade}>
                Premium page
              </button>{" "}
              to see sessions made for you.
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
            .serenade.json file.
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
