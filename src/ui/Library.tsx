import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { targetBeatHz } from "../audio/builder";
import type { CustomSession } from "../audio/builder";
import { listLibraryAudios, listMyRecentAudios } from "../lib/audioLibrary";
import type { CloudAudio, LibraryAudios } from "../lib/audioLibrary";
import { moveDeviceSavesToBank } from "../lib/clinician";
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
import { openAudioBank, openInStudio } from "./studioRequest";

/**
 * Library: where custom audio is listened to — a Clinician's recent designs,
 * audio made for or assigned to the User, Templates, and device-saved Studio
 * sessions with JSON import/export. Play asks only for the length, then the
 * Player shows the Play through the SAME shared BuilderEngine the Studio uses.
 * Managing designs lives in the Audio Bank. Fully standalone without
 * Supabase: the cloud sections hide entirely.
 */

const TEMPLATE_PREVIEW = 12;
const EMPTY_CLOUD: LibraryAudios = { madeForMe: [], assigned: [], templates: [] };

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
  const [cloud, setCloud] = useState<LibraryAudios>(EMPTY_CLOUD);
  const [mine, setMine] = useState<CloudAudio[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [moving, setMoving] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
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
  const designer = ent.isClinician && ent.configured;

  useEffect(() => {
    if (!signedIn) {
      // Sign-out (possibly from another tab) must drop the personalized lists.
      setCloud(EMPTY_CLOUD);
      setMine([]);
      setCloudError(null);
      return;
    }
    // Cancellation guard: a sign-out while this fetch is in flight must NOT
    // repopulate the previous account's data.
    let cancelled = false;
    void Promise.all([
      listLibraryAudios(),
      designer ? listMyRecentAudios(6) : Promise.resolve<CloudAudio[]>([]),
    ])
      .then(([lists, recent]) => {
        if (cancelled) return;
        setCloud(lists);
        setMine(recent);
        setCloudError(null);
      })
      .catch(() => {
        if (!cancelled) setCloudError("Could not load your sessions — try again later.");
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, designer, reload]);

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

  const handleMove = async () => {
    setMoving(true);
    try {
      const n = await moveDeviceSavesToBank();
      setSaved(listCustomSessions());
      setReload((r) => r + 1);
      flash(`Moved ${n} design${n === 1 ? "" : "s"} to your Audio Bank`);
    } catch {
      flash("Could not move your designs — try again.");
    } finally {
      setMoving(false);
    }
  };

  const allCloud = [...mine, ...cloud.madeForMe, ...cloud.assigned, ...cloud.templates];

  // Set up an item of any list by id (cloud Custom Audio first, then saved sessions).
  const setUpItem = (id: string) => {
    const cloudHit = allCloud.find((a) => a.id === id);
    const spec = cloudHit?.spec ?? saved.find((s) => s.id === id);
    if (!spec) return;
    setSetup({
      audio: {
        kind: cloudHit ? "custom" : "saved",
        id,
        name: cloudHit?.name ?? spec.name,
        emoji: null,
        band: bandForHz(targetBeatHz(spec)),
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

  const editButton = (audio: CloudAudio) => (
    <button
      className="chip small"
      aria-label={`Edit ${audio.name}`}
      onClick={() => openInStudio({ kind: "edit", audioId: audio.id })}
    >
      Edit
    </button>
  );

  const cloudRow = (audio: CloudAudio, extra?: ReactNode) => (
    <div className="library-item" key={audio.id}>
      {sceneThumb(audio.spec)}
      <div className="library-item-info">
        <span className="library-item-name">{audio.name}</span>
        {audio.goalTagline && <span className="library-item-tagline">{audio.goalTagline}</span>}
      </div>
      {transport(audio.id)}
      {audio.createdBy === ent.userId && editButton(audio)}
      {extra}
    </div>
  );

  const clinicianName = ent.link?.clinicianName ?? null;
  const { madeForMe, assigned, templates } = cloud;
  const shownTemplates = showAllTemplates ? templates : templates.slice(0, TEMPLATE_PREVIEW);
  const nothingForMe = madeForMe.length === 0 && assigned.length === 0 && templates.length === 0;

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

      {designer && signedIn && (
        <div className="library-section">
          <div className="library-section-head">
            <h2>Your designs</h2>
            <button className="chip" onClick={() => openInStudio({ kind: "new", madeFor: null })}>
              New design
            </button>
            <button className="chip" onClick={() => openAudioBank()}>
              Open Audio Bank
            </button>
          </div>
          {mine.length === 0 ? (
            !cloudError && (
              <p className="library-note">No designs yet — start one with New design.</p>
            )
          ) : (
            <div className="library-list">
              {mine.map((audio) => (
                <div className="library-item" key={audio.id}>
                  {sceneThumb(audio.spec)}
                  <div className="library-item-info">
                    <span className="library-item-name">{audio.name}</span>
                    {audio.goalTagline && (
                      <span className="library-item-tagline">{audio.goalTagline}</span>
                    )}
                  </div>
                  {transport(audio.id)}
                  {editButton(audio)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ent.configured && (
        <div className="library-section">
          <h2>{clinicianName ? `Made for you by ${clinicianName}` : "Made for you"}</h2>
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
          {signedIn && !cloudError && nothingForMe && (
            <p className="library-note">
              Nothing here yet — sessions made for you will appear here.
            </p>
          )}
          {madeForMe.length > 0 && (
            <div className="library-list">{madeForMe.map((a) => cloudRow(a))}</div>
          )}
          {assigned.length > 0 && (
            <>
              <h3 className="library-subheading">Assigned to you</h3>
              <p className="library-note">
                {clinicianName ? `From ${clinicianName}` : "Chosen for you"}
              </p>
              <div className="library-list">{assigned.map((a) => cloudRow(a))}</div>
            </>
          )}
          {templates.length > 0 && (
            <>
              <h3 className="library-subheading">Templates</h3>
              <div className="library-list">
                {shownTemplates.map((audio) =>
                  cloudRow(
                    audio,
                    ent.isClinician && (
                      <button
                        className="chip small"
                        aria-label={`Use ${audio.name} as a starting point`}
                        onClick={() =>
                          openInStudio({ kind: "copy", audioId: audio.id, madeFor: null })
                        }
                      >
                        Use
                      </button>
                    ),
                  ),
                )}
              </div>
              {!showAllTemplates && templates.length > TEMPLATE_PREVIEW && (
                <button className="chip small" onClick={() => setShowAllTemplates(true)}>
                  Show all {templates.length}
                </button>
              )}
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
        {designer && signedIn && saved.length > 0 && (
          <div className="library-move">
            <p className="library-note">
              Designs now live in your Audio Bank, where you can edit and assign them.
            </p>
            <button className="chip" disabled={moving} onClick={() => void handleMove()}>
              {moving ? "Moving…" : "Move to Audio Bank"}
            </button>
          </div>
        )}
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
