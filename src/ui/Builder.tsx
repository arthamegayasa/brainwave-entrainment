import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { followsJourney, isEntrainment, mainLayer, targetBeatHz } from "../audio/builder";
import type {
  BuilderLayerSpec,
  BuilderLayerType,
  CustomSession,
  Journey,
} from "../audio/builder";
import { beatAt } from "../audio/schedule";
import { SOLFEGGIO } from "../audio/constants";
import {
  deleteCustomSession,
  exportSessionJSON,
  importSessionJSON,
  listCustomSessions,
  saveCustomSession,
} from "../state/customPresets";
import { BAND_COLORS, bandForHz, formatClock } from "./bands";
import { ScenePicker } from "./ScenePicker";
import { sceneOf, scenePainting } from "./scenes";
import { BandChip, bandName } from "./StudioField";
import { JourneyEditor, PreviewLength } from "./StudioJourney";
import { AddLayer, LayerCard, MainBeatEmpty } from "./StudioLayers";
import {
  ensureBuilder,
  getBuilderEngine,
  getBuilderItem,
  setBuilderItem,
  stopBuilderPlayback,
} from "./builderEngine";
import {
  isAudioBlocked,
  resumeAudio,
  setMediaPresentation,
  subscribeAudio,
} from "./audioContext";
import { useEntitlement } from "../lib/useEntitlement";
import { isPaymentsConfigured } from "../lib/supabase";
import {
  deleteAudio,
  listMyPublishedAudios,
  publishAudio,
} from "../lib/audioLibrary";
import type { CloudAudio } from "../lib/audioLibrary";
import { AUDIO_CATEGORIES } from "../lib/clinician";
import type { AudioCategory } from "../lib/clinician";
import type { AccountRole } from "../../supabase/functions/_shared/accountRules.ts";


let layerCounter = 0;
function newLayer(type: BuilderLayerType = "binaural"): BuilderLayerSpec {
  layerCounter += 1;
  return {
    id: `layer-${Date.now().toString(36)}-${layerCounter}`,
    type,
    carrierHz: type === "pure" ? SOLFEGGIO.healing : 200,
    beatMode: "follow",
    fixedBeatHz: 10,
    gain: 0.7,
  };
}

/** A meditation's shape: down to theta, hold, and back near waking at the end. */
const DEFAULT_JOURNEY: Journey = {
  startHz: 10,
  points: [
    { hz: 6, minutes: 10, easing: "ease-in-out" },
    { hz: 10, minutes: 5, easing: "ease-in-out" },
  ],
  holdAt: 0,
};

/**
 * The main Beat (the first entrainment layer) leads the list, so it shows
 * first as Layer 1. Only display order changes: layers mix in parallel, and
 * entrainment layers keep their order among themselves.
 */
function mainFirst(layers: BuilderLayerSpec[]): BuilderLayerSpec[] {
  const i = layers.findIndex((layer) => isEntrainment(layer.type));
  return i > 0 ? [layers[i], ...layers.slice(0, i), ...layers.slice(i + 1)] : layers;
}

/** The Studio preview's Media controls: not a Play, shown with the Scene picked now. */
function previewMedia(sceneId: string | undefined) {
  return {
    title: "Studio preview",
    scene: sceneOf({ sceneId }),
    durationSec: null,
    position: () => 0,
    stop: stopBuilderPlayback,
  };
}

/** Item id the Studio preview claims on the shared engine. */
const STUDIO_PREVIEW_ID = "studio-preview";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface BuilderProps {
  /** Called before preview audio starts — the running Play stops first. */
  onBeforePlay: () => void;
}

export function Builder({ onBeforePlay }: BuilderProps) {
  const ent = useEntitlement();
  const [layers, setLayers] = useState<BuilderLayerSpec[]>([
    newLayer("binaural"),
    newLayer("ocean"),
  ]);
  const [journey, setJourney] = useState<Journey>(DEFAULT_JOURNEY);
  const [durationMin, setDurationMin] = useState<number | null>(30);
  // Re-derive from the shared module so a remount keeps a live preview's
  // transport instead of showing Play over audible audio.
  const [playing, setPlaying] = useState(
    () => getBuilderItem() === STUDIO_PREVIEW_ID,
  );
  // A preview is not a Play, so no Mini-player shows it: its own transport
  // asks for the tap when the device holds the audio (a call, another app).
  const held = useSyncExternalStore(subscribeAudio, isAudioBlocked);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  /** The Journey's Beat the preview plays now, from the engine's own schedule. */
  const [liveHz, setLiveHz] = useState<number | null>(null);
  /** The journey the running preview started with; edits after it wait for Restart. */
  const [previewed, setPreviewed] = useState<{ journey: Journey; durationMin: number | null } | null>(null);
  const [name, setName] = useState("My Custom Session");
  /** The Scene the designer picked; none until they pick (the default shows). */
  const [sceneId, setSceneId] = useState<string | undefined>();
  const [saved, setSaved] = useState<CustomSession[]>(() => listCustomSessions());
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const engine = getBuilderEngine();
      if (!engine) return;
      const p = engine.progress();
      setElapsed(p.elapsedSec);
      setRemaining(p.remainingSec);
      const schedule = engine.getSchedule();
      setLiveHz(schedule ? beatAt(schedule, p.elapsedSec) : null);
      // Covers explicit stop, another view claiming the engine, and a timed
      // preview's natural end (self-healed inside getBuilderItem()).
      if (getBuilderItem() !== STUDIO_PREVIEW_ID) setPlaying(false);
    }, 300);
    return () => window.clearInterval(id);
  }, [playing]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const handlePlay = () => {
    onBeforePlay(); // one pair of ears: the running Play stops first
    const e = ensureBuilder();
    e.stop();
    e.start(layers, journey, durationMin);
    setBuilderItem(STUDIO_PREVIEW_ID);
    setMediaPresentation(previewMedia(sceneId));
    setElapsed(0);
    setRemaining(durationMin === null ? null : durationMin * 60);
    setLiveHz(journey.startHz);
    setPreviewed({ journey, durationMin });
    setPlaying(true);
  };

  const handleStop = () => {
    stopBuilderPlayback();
    setPlaying(false);
  };

  const pickScene = (picked: string | undefined) => {
    setSceneId(picked);
    if (getBuilderItem() === STUDIO_PREVIEW_ID) setMediaPresentation(previewMedia(picked));
  };

  const patchLayer = (id: string, patch: Partial<BuilderLayerSpec>) => {
    setLayers((prev) => {
      const next = mainFirst(prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      const updated = next.find((l) => l.id === id);
      if (updated && playing) getBuilderEngine()?.updateLayer(updated);
      return next;
    });
  };

  const addLayer = (type: BuilderLayerType) => {
    const layer = newLayer(type);
    setLayers((prev) => mainFirst([...prev, layer]));
    if (playing) getBuilderEngine()?.addLayer(layer);
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => mainFirst(prev.filter((l) => l.id !== id)));
    if (playing) getBuilderEngine()?.removeLayer(id);
  };

  const currentSession = (): CustomSession => ({
    version: 2,
    id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    journey,
    layers,
    sceneId,
    createdAt: new Date().toISOString(),
  });

  const handleSave = () => {
    saveCustomSession(currentSession());
    setSaved(listCustomSessions());
    flash("Saved ✓");
  };

  const handleExport = () => {
    const blob = new Blob([exportSessionJSON(currentSession())], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Z0-9]+/g, "-") || "session"}.swarasanti.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Show a saved or imported session's design in the Studio. A running
   * preview stops: it would keep playing the old layers under the new ones.
   */
  const loadSession = (session: CustomSession) => {
    if (playing) handleStop();
    setName(session.name);
    setJourney(session.journey);
    setLayers(mainFirst(session.layers));
    setSceneId(session.sceneId);
  };

  const handleImportFile = async (file: File) => {
    try {
      loadSession(importSessionJSON(await file.text()));
      flash("Session imported ✓");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Import failed");
    }
  };

  const loadSaved = (session: CustomSession) => {
    loadSession(session);
    flash("Session loaded ✓");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasLayers = layers.length > 0;
  const scene = sceneOf({ sceneId });
  const stale =
    playing &&
    previewed !== null &&
    (previewed.durationMin !== durationMin ||
      JSON.stringify(previewed.journey) !== JSON.stringify(journey));
  const main = mainLayer(layers);
  const shownHz =
    playing && liveHz !== null && main?.beatMode !== "fixed" ? liveHz : targetBeatHz({ journey, layers });
  // The bands the main Beat passes through, each once in a row.
  const beatHzs =
    main?.beatMode === "fixed" ? [main.fixedBeatHz] : [journey.startHz, ...journey.points.map((p) => p.hz)];
  const bandPath = beatHzs.filter((hz, i) => i === 0 || bandForHz(hz) !== bandForHz(beatHzs[i - 1]));
  // Layers riding the Journey when the main Beat is fixed: the Journey stays for them.
  const riders = layers.flatMap((l, i) => (isEntrainment(l.type) && l.beatMode === "follow" ? [i + 1] : []));
  const followers =
    main?.beatMode !== "fixed" || riders.length === 0
      ? null
      : riders.length === 1
        ? `Layer ${riders[0]} follows`
        : `Layers ${riders.join(", ")} follow`;
  const others = main ? layers.slice(1) : layers;
  const previewLength = (
    <PreviewLength durationMin={durationMin} onChange={setDurationMin} stale={stale} onRestart={handlePlay} />
  );

  return (
    <section className="builder">
      <header className="studio-hero">
        <img
          key={scene}
          className="studio-hero-scene"
          src={scenePainting(scene, 768)}
          srcSet={`${scenePainting(scene, 768)} 768w, ${scenePainting(scene, 1536)} 1536w`}
          sizes="(min-width: 1080px) 1080px, 100vw"
          alt=""
          draggable={false}
        />
        <div className="studio-hero-body">
          <h1 className="studio-eyebrow">Studio</h1>
          <label className="studio-name">
            <input
              className="studio-name-input"
              value={name}
              maxLength={60}
              size={Math.max(name.length, 8)}
              placeholder="Name this session"
              aria-label="Session name"
              onChange={(e) => setName(e.target.value)}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 20h4L19 9l-4-4L4 16z" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </label>
          <p className="studio-sub">
            Choose the Beat and its journey, layer the sound, pick a Scene — then preview and save.
          </p>
          <div className="studio-summary">
            <span className="studio-summary-item">{plural(layers.length, "layer")}</span>
            {main && (
              <span className="studio-summary-item studio-summary-path">
                {bandPath.map((hz, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span aria-hidden>→</span>}
                    <BandChip hz={hz} />
                  </Fragment>
                ))}
                {main.beatMode === "fixed" && <span className="studio-summary-fixed">fixed</span>}
              </span>
            )}
          </div>
        </div>
      </header>

      <div
        className={`studio-bar${playing ? " is-playing" : ""}`}
        style={{ "--band": BAND_COLORS[bandForHz(shownHz)] } as CSSProperties}
      >
        <div className="studio-bar-status">
          <span className="studio-bar-orb" aria-hidden />
          <div className="studio-bar-text">
            {playing ? (
              <>
                <strong className="transport-time">
                  {remaining === null ? formatClock(elapsed) : `${formatClock(remaining)} left`}
                </strong>
                <span>
                  Beat {shownHz.toFixed(1)} Hz · {bandName(shownHz)}
                </span>
              </>
            ) : (
              <>
                <strong>Preview</strong>
                <span>
                  {durationMin === null ? "Endless" : `${durationMin} min`} · {plural(layers.length, "layer")}
                </span>
              </>
            )}
          </div>
        </div>
        <button className="chip studio-save" disabled={!hasLayers} onClick={handleSave}>
          Save
        </button>
        <div className="builder-transport">
          {playing ? (
            <>
              {held && (
                <button className="start-btn compact player-held" onClick={resumeAudio}>
                  <span aria-hidden>▶ </span>Tap to resume
                </button>
              )}
              <button className="pill-btn stop" onClick={handleStop}>
                <span aria-hidden>■ </span>Stop
              </button>
            </>
          ) : (
            <button className="start-btn compact" disabled={!hasLayers} onClick={handlePlay}>
              <span aria-hidden>▶ </span>Play
            </button>
          )}
        </div>
        {playing && remaining !== null && (
          <span
            className="studio-bar-progress"
            style={{ "--progress": `${(elapsed / Math.max(1, elapsed + remaining)) * 100}%` } as CSSProperties}
            aria-hidden
          />
        )}
      </div>

      <section className="studio-section" aria-labelledby="studio-beat">
        <StudioStep
          n={1}
          id="studio-beat"
          title="Beat"
          hint="Choose how the Beat reaches the listener, then let it follow a journey or stay fixed."
        />
        {main ? (
          <LayerCard
            key={main.id}
            layer={main}
            index={0}
            journey={journey}
            main
            onPatch={(patch) => patchLayer(main.id, patch)}
            onRemove={() => removeLayer(main.id)}
          />
        ) : (
          <MainBeatEmpty count={layers.length} onAdd={addLayer} />
        )}
        {followsJourney(layers) ? (
          <JourneyEditor
            journey={journey}
            durationMin={durationMin}
            onChange={setJourney}
            live={playing && liveHz !== null ? { elapsedSec: elapsed, hz: liveHz } : null}
            preview={previewLength}
            followers={followers}
          />
        ) : (
          <div className="studio-preview-length">{previewLength}</div>
        )}
      </section>

      <section className="studio-section" aria-labelledby="studio-layers">
        <StudioStep
          n={2}
          id="studio-layers"
          title="Layers"
          hint="Add more over the main Beat: another Beat, a tone, or ambience. Changes play at once while you preview."
        />
        {others.length > 0 && (
          <div className="layer-grid">
            {others.map((layer, i) => (
              <LayerCard
                key={layer.id}
                layer={layer}
                index={i + (main ? 1 : 0)}
                journey={journey}
                onPatch={(patch) => patchLayer(layer.id, patch)}
                onRemove={() => removeLayer(layer.id)}
              />
            ))}
          </div>
        )}
        {!hasLayers && <p className="layer-empty">No layers yet. Add one below to hear your session.</p>}
        <AddLayer count={layers.length} onAdd={addLayer} />
      </section>

      <section className="studio-section" aria-labelledby="studio-scene">
        <StudioStep n={3} id="studio-scene" title="Scene" hint="The painting shown with this session in the Player, the Library, and Media controls." />
        <ScenePicker value={sceneId} onChange={pickScene} />
      </section>

      <section className="studio-section" aria-labelledby="studio-share">
        <StudioStep
          n={4}
          id="studio-share"
          title="Save & share"
          hint={
            ent.isClinician && isPaymentsConfigured
              ? "Keep this design on this device, share it as a file, or add it to your Audio Bank."
              : "Keep this design on this device, or share it as a file."
          }
        />
        <div className="studio-share">
          <div className="studio-card">
            <h3>This device</h3>
            <p className="studio-muted">Saved sessions also appear in your Library. A file carries the design anywhere.</p>
            <div className="studio-actions">
              <button className="chip selected" disabled={!hasLayers} onClick={handleSave}>
                Save on this device
              </button>
              <button className="chip" disabled={!hasLayers} onClick={handleExport}>
                <span aria-hidden>↓ </span>Export
              </button>
              <button className="chip" onClick={() => fileRef.current?.click()}>
                <span aria-hidden>↑ </span>Import
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
          </div>

          {ent.isClinician && isPaymentsConfigured && (
            <PublishPanel
              getSession={currentSession}
              flash={flash}
              role={ent.role}
              disabled={!hasLayers}
            />
          )}
        </div>

        {saved.length > 0 && (
          <div className="studio-saved">
            <h3>
              Saved sessions <span className="studio-count">{saved.length}</span>
            </h3>
            <ul className="saved-grid">
              {saved.map((s) => (
                <li className="saved-card" key={s.id}>
                  <button className="saved-open" aria-label={`Open ${s.name}`} onClick={() => loadSaved(s)}>
                    <img src={scenePainting(sceneOf(s), 768)} alt="" loading="lazy" draggable={false} />
                    <span className="saved-info">
                      <span className="saved-title">{s.name}</span>
                      <span className="saved-meta">
                        {plural(s.layers.length, "layer")} ·{" "}
                        {mainLayer(s.layers)?.beatMode === "fixed"
                          ? `${targetBeatHz(s)} Hz fixed`
                          : `${[s.journey.startHz, ...s.journey.points.map((p) => p.hz)].join(" → ")} Hz`}
                      </span>
                    </span>
                  </button>
                  <button
                    className="saved-del"
                    aria-label={`Delete ${s.name}`}
                    onClick={() => {
                      deleteCustomSession(s.id);
                      setSaved(listCustomSessions());
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {notice && (
        <div className="notice dash-notice" role="status">
          {notice}
        </div>
      )}
    </section>
  );
}

/** A numbered step heading: what the section is for, in one line. */
function StudioStep({ n, id, title, hint }: { n: number; id: string; title: string; hint: string }) {
  return (
    <div className="studio-step">
      <span className="studio-step-num" aria-hidden>
        {n}
      </span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{hint}</p>
      </div>
    </div>
  );
}

/**
 * Clinician publish panel: saves the current Studio design to the
 * clinician's Audio Bank with category + notes; assignment to patients
 * happens in the Dashboard. Admins additionally publish shared templates.
 * Rendered only when isClinician AND Supabase is configured; RLS blocks
 * these operations server-side for everyone else regardless of UI state.
 */
function PublishPanel({
  getSession,
  flash,
  role,
  disabled,
}: {
  getSession: () => CustomSession;
  flash: (msg: string) => void;
  role: AccountRole;
  /** No layers: nothing worth publishing. */
  disabled: boolean;
}) {
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState<AudioCategory>("other");
  const [notes, setNotes] = useState("");
  const [published, setPublished] = useState<CloudAudio[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPublished(await listMyPublishedAudios());
    } catch {
      flash("Could not load library data");
    }
    // flash is stable enough for this panel — recreating it must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveToBank = async () => {
    setBusy(true);
    try {
      const session = getSession();
      await publishAudio(session, {
        name: session.name,
        goalTagline: tagline.trim() || undefined,
        isTemplate: false,
        category,
        notes: notes.trim() || undefined,
      });
      flash("Saved to your Audio Bank ✓");
      await refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const publishTemplate = async () => {
    setBusy(true);
    try {
      const session = getSession();
      await publishAudio(session, {
        name: session.name,
        goalTagline: tagline.trim() || undefined,
        isTemplate: true,
        category,
        notes: notes.trim() || undefined,
      });
      flash("Published as template ✓");
      await refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAudio(id);
      flash("Deleted ✓");
      await refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="studio-card publish-panel">
      <h3>Audio Bank</h3>
      <p className="studio-muted">Assign it to patients from the Dashboard.</p>
      <input
        className="text-input"
        value={tagline}
        maxLength={90}
        placeholder="Goal tagline (optional)"
        aria-label="Goal tagline"
        onChange={(e) => setTagline(e.target.value)}
      />
      <select
        className="select"
        value={category}
        aria-label="Category"
        onChange={(e) => setCategory(e.target.value as AudioCategory)}
      >
        {AUDIO_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <textarea
        className="text-input"
        value={notes}
        rows={2}
        maxLength={500}
        placeholder="Notes (visible only to you)"
        aria-label="Notes"
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="studio-actions">
        <button className="chip selected" disabled={busy || disabled} onClick={() => void saveToBank()}>
          Save to Audio Bank
        </button>
        {role === "admin" && (
          <button className="chip" disabled={busy || disabled} onClick={() => void publishTemplate()}>
            Publish as template
          </button>
        )}
      </div>
      {published.length > 0 && (
        <ul className="publish-list">
          {published.map((a) => (
            <li key={a.id}>
              <span>
                {a.name}
                {a.isTemplate && <span className="studio-tag">template</span>}
              </span>
              <button
                className="saved-del"
                aria-label={`Delete ${a.name}`}
                onClick={() => void remove(a.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
