import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { useBackLayer } from "./backNavigation";
import { onPageRequest, openAudioBank, takeStudioRequest } from "./studioRequest";
import type { StudioRequest } from "./studioRequest";
import { useEntitlement } from "../lib/useEntitlement";
import { listTemplates } from "../lib/audioLibrary";
import type { CloudAudio } from "../lib/audioLibrary";
import {
  AUDIO_CATEGORIES,
  audioUses,
  getAudio,
  listBank,
  listMyPatients,
  moveDeviceSavesToBank,
  patientName,
  saveAudio,
} from "../lib/clinician";
import type { AudioCategory, BankAudio, PatientLink } from "../lib/clinician";

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

/** What the Audio Bank keeps with a design, besides the design itself. */
interface BankDetails {
  goalTagline: string;
  category: AudioCategory;
  /** Private: only the owner (and the Admin) reads them. */
  notes: string;
  /** The Patient it is made for; null for general Custom Audio. */
  madeFor: string | null;
  isTemplate: boolean;
  /** The name of the Custom Audio or Template it was copied from. */
  basedOn: string | null;
}

const NEW_DETAILS: BankDetails = {
  goalTagline: "",
  category: "other",
  notes: "",
  madeFor: null,
  isTemplate: false,
  basedOn: null,
};

/**
 * The Custom Audio the Studio edits, as last saved or opened: its id, how
 * many Users hear it, and the design and details then (for "Unsaved changes").
 */
interface BankCopy {
  id: string;
  uses: number;
  details: BankDetails;
  snapshot: string;
}

/** A design with its details, as compared for "Unsaved changes". */
function snapshotOf(
  design: Pick<CustomSession, "name" | "journey" | "layers" | "sceneId">,
  details: BankDetails,
): string {
  return JSON.stringify([design.name, design.journey, design.layers, design.sceneId ?? null, details]);
}

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
  /**
   * Saving to the Audio Bank replaces saving on the device for a Clinician
   * or the Admin on a configured build; standalone builds keep device saves.
   */
  const canBank = ent.isClinician && ent.configured;
  const [details, setDetails] = useState<BankDetails>(NEW_DETAILS);
  /** The Custom Audio being edited; null for a design not in the Audio Bank yet. */
  const [bank, setBank] = useState<BankCopy | null>(null);
  const [busy, setBusy] = useState(false);
  const [patients, setPatients] = useState<PatientLink[]>([]);
  const [openerShown, setOpenerShown] = useState(false);
  /** The design as shown before any edit, when it is not in the Audio Bank. */
  const [baseline, setBaseline] = useState<string | null>(null);

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

  /** A design that is not in the Audio Bank: imported, from the device, new, or a copy. */
  const loadUnbanked = (session: CustomSession, fresh: BankDetails = NEW_DETAILS) => {
    loadSession(session);
    setDetails(fresh);
    setBank(null);
    setBaseline(snapshotOf({ ...session, layers: mainFirst(session.layers) }, fresh));
  };

  const handleImportFile = async (file: File) => {
    try {
      loadUnbanked(importSessionJSON(await file.text()));
      flash("Session imported ✓");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Import failed");
    }
  };

  const loadSaved = (session: CustomSession) => {
    loadUnbanked(session);
    flash("Session loaded ✓");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Start a new design, made for `madeFor` or general. */
  const startNew = (madeFor: string | null) => {
    loadUnbanked(
      {
        version: 2,
        id: "custom-new-design",
        name: "New design",
        journey: DEFAULT_JOURNEY,
        layers: [newLayer("binaural"), newLayer("ocean")],
        createdAt: new Date().toISOString(),
      },
      { ...NEW_DETAILS, madeFor },
    );
  };

  /**
   * Show a Custom Audio or Template: "edit" opens it in place (Save updates
   * it), "copy" starts a new design from it, made for `madeFor`.
   */
  const openFromBank = async (request: Exclude<StudioRequest, { kind: "new" }>) => {
    setBusy(true);
    try {
      const audio = await getAudio(request.audioId);
      if (!audio) throw new Error("That audio is no longer in the Audio Bank.");
      // The row's name wins: Details in the Audio Bank renames the row only.
      const session = { ...audio.spec, name: audio.name };
      if (request.kind === "copy") {
        loadUnbanked(
          { ...session, name: audio.isTemplate ? audio.name : `${audio.name} (copy)` },
          {
            ...NEW_DETAILS,
            goalTagline: audio.goalTagline ?? "",
            category: audio.category,
            madeFor: request.madeFor,
            basedOn: audio.name,
          },
        );
        flash(`Started from ${audio.name}`);
        return;
      }
      const opened: BankDetails = {
        goalTagline: audio.goalTagline ?? "",
        category: audio.category,
        notes: audio.notes ?? "",
        madeFor: audio.madeFor,
        isTemplate: audio.isTemplate,
        basedOn: audio.basedOn,
      };
      loadSession(session);
      setDetails(opened);
      setBank({
        id: audio.id,
        uses: await audioUses(audio.id),
        details: opened,
        snapshot: snapshotOf({ ...session, layers: mainFirst(session.layers) }, opened),
      });
      flash(`Opened ${audio.name}`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not open it");
    } finally {
      setBusy(false);
    }
  };

  const takeRequest = (request: StudioRequest) => {
    setOpenerShown(false);
    if (request.kind === "new") startNew(request.madeFor);
    else void openFromBank(request);
  };

  /**
   * Save the design to the Audio Bank: in place when it is there already,
   * else (or `asCopy`) as a new Custom Audio. A copy takes "(copy)" in its
   * name and remembers what it is based on.
   */
  const saveToBank = async (asCopy: boolean) => {
    setBusy(true);
    try {
      const savedName = asCopy ? `${name} (copy)` : name;
      const savedDetails: BankDetails = asCopy ? { ...details, basedOn: name } : details;
      const session = { ...currentSession(), name: savedName };
      const id = await saveAudio(
        {
          spec: session,
          goalTagline: savedDetails.goalTagline.trim() || null,
          category: savedDetails.category,
          notes: savedDetails.notes.trim() || null,
          madeFor: savedDetails.madeFor,
          isTemplate: savedDetails.isTemplate,
          basedOn: savedDetails.basedOn,
        },
        asCopy ? null : (bank?.id ?? null),
      );
      setName(savedName);
      setDetails(savedDetails);
      setBank({ id, uses: await audioUses(id), details: savedDetails, snapshot: snapshotOf(session, savedDetails) });
      flash(asCopy ? "Saved as a copy ✓" : "Saved to your Audio Bank ✓");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const moveDeviceSaves = async () => {
    setBusy(true);
    try {
      const moved = await moveDeviceSavesToBank();
      flash(`Moved ${plural(moved, "design")} to your Audio Bank ✓`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Moving failed");
    } finally {
      setSaved(listCustomSessions());
      setBusy(false);
    }
  };

  // Requests from the Library, the Audio Bank, or a Patient's drawer: the
  // one waiting when the Studio shows, then any while it is showing.
  useEffect(() => {
    const take = () => {
      const request = takeStudioRequest();
      if (request) takeRequest(request);
    };
    take();
    return onPageRequest((page) => {
      if (page === "studio") take();
    });
    // Mount-only: each request is taken once, and the handlers read state when called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canBank) return;
    listMyPatients()
      .then(setPatients)
      .catch(() => setPatients([]));
  }, [canBank]);

  // The design as first shown, for "Unsaved changes" before its first save.
  useEffect(() => {
    setBaseline((known) => known ?? snapshotOf({ name, journey, layers, sceneId }, details));
    // Mount-only: later baselines come from opening or starting a design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const snapshot = snapshotOf({ name, journey, layers, sceneId }, details);
  const dirty = snapshot !== (bank?.snapshot ?? baseline);
  const nameOf = (patientId: string) => {
    const patient = patients.find((p) => p.patientId === patientId);
    return patient ? patientName(patient) : "a patient outside your list";
  };
  /** Leave the design on screen for another: confirmed when it has unsaved changes. */
  const mayLeave = () => !dirty || window.confirm(`Discard your unsaved changes to ${name}?`);
  const savedAt = bank
    ? [
        details.isTemplate ? "Template in your Audio Bank" : "In your Audio Bank",
        ...(details.madeFor ? [`made for ${nameOf(details.madeFor)}`] : []),
      ].join(" · ")
    : "Not in your Audio Bank yet";

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
            {canBank && (
              <span className={`studio-summary-item studio-saved-at${dirty && bank ? " is-dirty" : ""}`}>
                {savedAt}
                {dirty && bank && " · unsaved changes"}
              </span>
            )}
          </div>
          {canBank && (
            <div className="studio-hero-actions">
              <button className="chip small" onClick={() => mayLeave() && setOpenerShown(true)}>
                Open…
              </button>
              <button className="chip small" onClick={() => mayLeave() && startNew(null)}>
                New design
              </button>
            </div>
          )}
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
        {canBank ? (
          <button
            className="chip studio-save"
            disabled={!hasLayers || busy || (bank !== null && !dirty)}
            onClick={() => void saveToBank(false)}
          >
            {bank !== null && !dirty ? "Saved" : "Save"}
          </button>
        ) : (
          <button className="chip studio-save" disabled={!hasLayers} onClick={handleSave}>
            Save
          </button>
        )}
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
          title={canBank ? "Save" : "Save & share"}
          hint={
            canBank
              ? "Save it to your Audio Bank, for anyone you assign it to or made for one Patient. A file carries it anywhere."
              : "Keep this design on this device, or share it as a file."
          }
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && mayLeave()) void handleImportFile(file);
            e.target.value = "";
          }}
        />
        <div className="studio-share">
          {canBank ? (
            <>
              <BankPanel
                details={details}
                onDetails={setDetails}
                bank={bank}
                savedAt={savedAt}
                dirty={dirty}
                patients={patients}
                nameOf={nameOf}
                isAdmin={ent.role === "admin"}
                disabled={!hasLayers || busy}
                onSave={() => void saveToBank(false)}
                onSaveCopy={() => void saveToBank(true)}
                onOpenBank={() => mayLeave() && openAudioBank()}
              />
              <div className="studio-card">
                <h3>File</h3>
                <p className="studio-muted">A file carries the design to another device or person.</p>
                <div className="studio-actions">
                  <button className="chip" disabled={!hasLayers} onClick={handleExport}>
                    <span aria-hidden>↓ </span>Export
                  </button>
                  <button className="chip" onClick={() => fileRef.current?.click()}>
                    <span aria-hidden>↑ </span>Import
                  </button>
                </div>
                {saved.length > 0 && (
                  <div className="studio-device-saves">
                    <p className="studio-muted">
                      {plural(saved.length, "design")} still saved on this device. The Audio Bank keeps them
                      for every device.
                    </p>
                    <button className="chip" disabled={busy} onClick={() => void moveDeviceSaves()}>
                      Move to Audio Bank
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
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
              </div>
            </div>
          )}
        </div>

        {!canBank && saved.length > 0 && (
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

      {openerShown && (
        <OpenDialog
          madeFor={details.madeFor}
          onClose={() => setOpenerShown(false)}
          onOpen={takeRequest}
        />
      )}

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
 * The design's place in the Audio Bank: who it is made for, its details, and
 * Save (in place once it is there) or Save as copy. The database decides
 * what saves: only the Admin makes Templates, and Made for takes the saver's
 * own Patients.
 */
function BankPanel({
  details,
  onDetails,
  bank,
  savedAt,
  dirty,
  patients,
  nameOf,
  isAdmin,
  disabled,
  onSave,
  onSaveCopy,
  onOpenBank,
}: {
  details: BankDetails;
  onDetails: (details: BankDetails) => void;
  bank: BankCopy | null;
  savedAt: string;
  dirty: boolean;
  patients: PatientLink[];
  nameOf: (patientId: string) => string;
  isAdmin: boolean;
  disabled: boolean;
  onSave: () => void;
  onSaveCopy: () => void;
  onOpenBank: () => void;
}) {
  const set = (patch: Partial<BankDetails>) => onDetails({ ...details, ...patch });
  // General audio assigned to anyone cannot become one Patient's (the
  // database refuses it); a copy can.
  const madeForLocked = bank !== null && bank.details.madeFor === null && bank.uses > 0;
  const madeForOptions = [
    ...patients.map((p) => ({ id: p.patientId, name: patientName(p) })),
    ...(details.madeFor && !patients.some((p) => p.patientId === details.madeFor)
      ? [{ id: details.madeFor, name: nameOf(details.madeFor) }]
      : []),
  ];
  const listeners = bank?.uses ?? 0;
  return (
    <div className="studio-card bank-panel">
      <div className="bank-panel-head">
        <h3>Audio Bank</h3>
        <span className={`bank-panel-status${dirty && bank ? " is-dirty" : ""}`}>
          {savedAt}
          {dirty && bank && " · unsaved changes"}
        </span>
      </div>

      <label className="bank-field">
        <span>Made for</span>
        <select
          className="select"
          value={details.madeFor ?? ""}
          disabled={details.isTemplate || madeForLocked}
          onChange={(e) => set({ madeFor: e.target.value || null })}
        >
          <option value="">General: assign it to anyone</option>
          {madeForOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="studio-muted">
        {madeForLocked
          ? `Assigned to ${plural(listeners, "listener")}: Save as copy to make one for a Patient.`
          : details.madeFor
            ? `Only ${nameOf(details.madeFor)} gets it, in their Library under Made for you.`
            : "Assign it to patients from the Audio Bank."}
      </p>

      <label className="bank-field">
        <span>Category</span>
        <select
          className="select"
          value={details.category}
          onChange={(e) => set({ category: e.target.value as AudioCategory })}
        >
          {AUDIO_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <input
        className="text-input"
        value={details.goalTagline}
        maxLength={90}
        placeholder="Goal tagline (optional)"
        aria-label="Goal tagline"
        onChange={(e) => set({ goalTagline: e.target.value })}
      />
      <textarea
        className="text-input"
        value={details.notes}
        rows={2}
        maxLength={500}
        placeholder="Notes (only you see these)"
        aria-label="Notes"
        onChange={(e) => set({ notes: e.target.value })}
      />
      {isAdmin && (
        <label className="bank-check">
          <input
            type="checkbox"
            checked={details.isTemplate}
            disabled={details.madeFor !== null}
            onChange={(e) => set({ isTemplate: e.target.checked })}
          />
          Template: every User can play it
        </label>
      )}
      {details.basedOn && <p className="studio-muted">Based on {details.basedOn}</p>}

      {bank && listeners > 0 && (
        <p className="bank-panel-warning">
          {details.madeFor && listeners === 1
            ? `${nameOf(details.madeFor)} hears your changes from their next Play.`
            : `Used by ${plural(listeners, "listener")}: saving changes what they hear from their next Play. Save as copy keeps theirs.`}
        </p>
      )}

      <div className="studio-actions">
        <button className="chip selected" disabled={disabled || (bank !== null && !dirty)} onClick={onSave}>
          {bank ? "Save changes" : "Save to Audio Bank"}
        </button>
        {bank && (
          <button className="chip" disabled={disabled} onClick={onSaveCopy}>
            Save as copy
          </button>
        )}
        <button className="link-btn" onClick={onOpenBank}>
          Open Audio Bank
        </button>
      </div>
    </div>
  );
}

/**
 * Open a design from the Audio Bank, or start one from a Template (keeping
 * who the design on screen is made for). Search covers names and taglines;
 * lists show the first matches, so hundreds stay quick to scan.
 */
function OpenDialog({
  madeFor,
  onClose,
  onOpen,
}: {
  madeFor: string | null;
  onClose: () => void;
  onOpen: (request: StudioRequest) => void;
}) {
  const [query, setQuery] = useState("");
  const [own, setOwn] = useState<BankAudio[] | null>(null);
  const [templates, setTemplates] = useState<CloudAudio[]>([]);
  const [failed, setFailed] = useState(false);
  useBackLayer(true, onClose);

  useEffect(() => {
    Promise.all([listBank(), listTemplates()])
      .then(([bank, shared]) => {
        setOwn(bank);
        // The Admin's Templates are in their own bank already.
        setTemplates(shared.filter((t) => !bank.some((a) => a.id === t.id)));
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const needle = query.trim().toLowerCase();
  const matches = <T extends { name: string; goalTagline: string | null }>(list: T[]) =>
    list.filter((a) => `${a.name} ${a.goalTagline ?? ""}`.toLowerCase().includes(needle)).slice(0, 20);
  const ownMatches = matches(own ?? []);
  const templateMatches = matches(templates);

  return (
    <div
      className="sheet-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet studio-open" role="dialog" aria-modal="true" aria-label="Open a design">
        <div className="sheet-head">
          <h2>Open a design</h2>
          <button className="player-icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          className="text-input"
          type="search"
          value={query}
          placeholder="Search your Audio Bank and Templates"
          aria-label="Search designs"
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        {failed && <p className="studio-muted">Could not load your Audio Bank. Try again.</p>}
        {own === null && !failed && <p className="studio-muted">Loading…</p>}
        {own !== null && (
          <>
            <h3>Your Audio Bank</h3>
            {ownMatches.length === 0 ? (
              <p className="studio-muted">{needle ? "Nothing matches." : "Nothing saved yet."}</p>
            ) : (
              <ul className="studio-open-list">
                {ownMatches.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => onOpen({ kind: "edit", audioId: a.id })}>
                      <strong>{a.name}</strong>
                      <span>
                        {a.isTemplate ? "Template" : a.madeFor ? "Made for a patient" : "General"} · {a.category}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {templates.length > 0 && (
              <>
                <h3>Start from a Template</h3>
                {templateMatches.length === 0 ? (
                  <p className="studio-muted">Nothing matches.</p>
                ) : (
                  <ul className="studio-open-list">
                    {templateMatches.map((t) => (
                      <li key={t.id}>
                        <button onClick={() => onOpen({ kind: "copy", audioId: t.id, madeFor })}>
                          <strong>{t.name}</strong>
                          <span>{t.goalTagline ?? "Template"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
