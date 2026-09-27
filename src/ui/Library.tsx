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
import type { AudioSnapshot } from "../state/listening";
import { loadPrefs, savePrefs } from "../state/prefs";
import { BAND_COLORS, bandForHz } from "./bands";
import { DurationRow } from "./DurationRow";
import { startLibraryPlay, stopPlay, useNowPlaying } from "./nowPlaying";
import { sceneOf, scenePainting } from "./scenes";

/**
 * Library: the user-facing home for custom audio — cloud sessions
 * crafted by the SwaraSanti team ("Made for you" + templates) and locally saved
 * Studio sessions with JSON import/export. Play asks only for the length, then
 * the Player shows the Play; it goes through the SAME shared BuilderEngine the
 * Studio uses, so one custom session plays at a time. Fully standalone without
 * Supabase: the cloud section hides entirely.
 */

interface LibraryProps {
  /** Opens the Account sheet — sign-in lives there now. */
  onSignIn: () => void;
  /** Called before custom audio starts — the running Play stops first. */
  onBeforePlay: () => void;
  /** Shows the running Play in the Player. */
  onOpenPlayer: () => void;
}

interface DurationSheetProps {
  audio: AudioSnapshot;
  onClose: () => void;
  /** Starts the Play for `durationMin` (null = ∞); called inside the Start tap. */
  onStart: (durationMin: number | null) => void;
}

/**
 * The setup of a Custom Audio or saved Studio session: only its length. Its
 * designer fixed everything else in the Studio (layers, ambient, mix), so
 * there is nothing more to choose. Defaults to the last length the User
 * picked, Preset or not.
 */
function DurationSheet({ audio, onClose, onStart }: DurationSheetProps) {
  const [durationMin, setDurationMin] = useState<number | null>(() => {
    const last = loadPrefs().lastDurationMin;
    return last === "inf" ? null : last ?? 30;
  });

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Set up ${audio.name}`}
        style={{ "--accent": audio.band ? BAND_COLORS[audio.band] : undefined } as React.CSSProperties}
      >
        <div className="sheet-head">
          <h2>{audio.name}</h2>
        </div>
        <DurationRow value={durationMin} onChange={setDurationMin} />
        <button className="start-btn" onClick={() => onStart(durationMin)}>
          Start Session
        </button>
        <button className="close-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Library({ onSignIn, onBeforePlay, onOpenPlayer }: LibraryProps) {
  const ent = useEntitlement();
  const [cloud, setCloud] = useState<CloudAudio[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CustomSession[]>(() => listCustomSessions());
  // Now Playing outlives this view, so a remount (nav away and back) still
  // marks the row of audio that is playing.
  const play = useNowPlaying();
  const playingId = play && play.audio.kind !== "preset" ? play.audio.id : null;
  /** The item whose duration sheet is open. */
  const [setup, setSetup] = useState<{ audio: AudioSnapshot; spec: CustomSession } | null>(null);
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

  /** Start the set-up item as the running Play, inside the Start tap, and show it in the Player. */
  const startSetUp = (durationMin: number | null) => {
    if (!setup) return;
    onBeforePlay(); // one pair of ears: the running Play stops first
    startLibraryPlay(setup.audio, setup.spec, durationMin);
    savePrefs({ lastDurationMin: durationMin ?? "inf" });
    setSetup(null);
    onOpenPlayer();
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

  // Set up an item of either list by id (cloud Custom Audio first, then saved sessions).
  const setUpItem = (id: string) => {
    const cloudHit = cloud.find((a) => a.id === id);
    const spec = cloudHit?.spec ?? saved.find((s) => s.id === id);
    if (!spec) return;
    setSetup({
      audio: {
        kind: cloudHit ? "custom" : "saved",
        id,
        name: cloudHit?.name ?? spec.name,
        emoji: null,
        band: bandForHz(spec.curve.targetHz),
      },
      spec,
    });
  };

  // The playing row never restarts its Play: it opens the Player instead. Its
  // time left is in the Mini-player, so the name keeps its room on a phone.
  const transport = (id: string) =>
    playingId === id ? (
      <button className="chip selected library-playing" aria-label="Playing: open the Player" onClick={onOpenPlayer}>
        Playing
      </button>
    ) : (
      <button className="chip" onClick={() => setUpItem(id)}>
        <span aria-hidden>▶</span> Play
      </button>
    );

  /** The Scene an item shows, its designer's choice or the default. */
  const sceneThumb = (spec: CustomSession) => (
    <img className="library-item-scene" src={scenePainting(sceneOf(spec), 768)} alt="" />
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
                  {sceneThumb(audio.spec)}
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
                    {sceneThumb(audio.spec)}
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
                {sceneThumb(session)}
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
      {setup && (
        <DurationSheet audio={setup.audio} onClose={() => setSetup(null)} onStart={startSetUp} />
      )}
    </section>
  );
}
