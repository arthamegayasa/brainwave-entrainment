import { useCallback, useEffect, useRef, useState } from "react";
import { isEntrainment } from "../audio/builder";
import type {
  BuilderCurve,
  BuilderLayerSpec,
  BuilderLayerType,
  CustomSession,
} from "../audio/builder";
import { findRelated } from "../audio/freqfinder";
import { SOLFEGGIO, SOUND_LABELS } from "../audio/constants";
import {
  deleteCustomSession,
  exportSessionJSON,
  importSessionJSON,
  listCustomSessions,
  saveCustomSession,
} from "../state/customPresets";
import { formatClock } from "./bands";
import { ensureBuilder, getBuilderEngine } from "./builderEngine";
import { useEntitlement } from "../lib/useEntitlement";
import { isPaymentsConfigured } from "../lib/supabase";
import {
  assignAudio,
  deleteAudio,
  listAllUsers,
  listMyPublishedAudios,
  publishAudio,
} from "../lib/audioLibrary";
import type { CloudAudio } from "../lib/audioLibrary";

const LAYER_TYPE_LABELS: Record<BuilderLayerType, string> = {
  binaural: "Binaural",
  isochronic: "Isochronic",
  monaural: "Monaural",
  pure: "Pure Tone",
  rain: SOUND_LABELS.rain,
  ocean: SOUND_LABELS.ocean,
  wind: SOUND_LABELS.wind,
  brown: SOUND_LABELS.brown,
};

const LAYER_TYPES = Object.keys(LAYER_TYPE_LABELS) as BuilderLayerType[];

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

const DEFAULT_CURVE: BuilderCurve = {
  startHz: 10,
  targetHz: 6,
  endHz: 10,
  rampInMin: 10,
  rampOutMin: 5,
};

const DURATIONS: (number | null)[] = [15, 30, 45, 60, null];

export function Builder() {
  const ent = useEntitlement();
  const [layers, setLayers] = useState<BuilderLayerSpec[]>([
    newLayer("binaural"),
    newLayer("ocean"),
  ]);
  const [curve, setCurve] = useState<BuilderCurve>(DEFAULT_CURVE);
  const [durationMin, setDurationMin] = useState<number | null>(30);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [name, setName] = useState("My Custom Session");
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
      if (!engine.isRunning) setPlaying(false);
      else if (p.remainingSec !== null && p.remainingSec <= 0) {
        setPlaying(false);
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [playing]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2600);
  };

  const handlePlay = async () => {
    const e = await ensureBuilder();
    e.start(layers, curve, durationMin);
    setPlaying(true);
  };

  const handleStop = () => {
    getBuilderEngine()?.stop();
    setPlaying(false);
  };

  const patchLayer = (id: string, patch: Partial<BuilderLayerSpec>) => {
    setLayers((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...patch } : l));
      const updated = next.find((l) => l.id === id);
      if (updated && playing) getBuilderEngine()?.updateLayer(updated);
      return next;
    });
  };

  const addLayer = () => {
    const layer = newLayer();
    setLayers((prev) => [...prev, layer]);
    if (playing) getBuilderEngine()?.addLayer(layer);
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (playing) getBuilderEngine()?.removeLayer(id);
  };

  const currentSession = (): CustomSession => ({
    version: 1,
    id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    curve,
    layers,
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
    a.download = `${name.replace(/[^a-zA-Z0-9]+/g, "-") || "session"}.serenade.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const imported = importSessionJSON(await file.text());
      setName(imported.name);
      setCurve(imported.curve);
      setLayers(imported.layers);
      flash("Preset imported ✓");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Import failed");
    }
  };

  const loadSaved = (session: CustomSession) => {
    setName(session.name);
    setCurve(session.curve);
    setLayers(session.layers);
    flash("Preset loaded ✓");
  };

  return (
    <section className="builder">
      <div className="builder-head">
        <div>
          <h1>Studio</h1>
          <p className="builder-sub">
            Build your own multi-layer session — choose the method, carrier, and
            the path the frequency travels.
          </p>
        </div>
        <div className="builder-transport">
          {playing ? (
            <>
              <span className="transport-time">
                {remaining === null ? formatClock(elapsed) : formatClock(remaining)}
              </span>
              <button className="pill-btn stop" onClick={handleStop}>
                ■ Stop
              </button>
            </>
          ) : (
            <button className="start-btn compact" onClick={() => void handlePlay()}>
              ▶ Play
            </button>
          )}
        </div>
      </div>

      <div className="builder-grid">
        <div className="builder-col">
          <div className="builder-section-title">Layers</div>
          {layers.map((layer) => (
            <LayerCard
              key={layer.id}
              layer={layer}
              onPatch={(patch) => patchLayer(layer.id, patch)}
              onRemove={() => removeLayer(layer.id)}
            />
          ))}
          <button className="chip add-layer" onClick={addLayer}>
            + Add Layer
          </button>
        </div>

        <div className="builder-col">
          <div className="builder-section-title">Session Curve</div>
          <CurveEditor curve={curve} onChange={setCurve} />

          <div className="builder-section-title">Duration</div>
          <div className="chips">
            {DURATIONS.map((d) => (
              <button
                key={d ?? "inf"}
                className={`chip ${durationMin === d ? "selected" : ""}`}
                onClick={() => setDurationMin(d)}
              >
                {d === null ? "∞" : `${d} min`}
              </button>
            ))}
          </div>

          <div className="builder-section-title">Save &amp; Share</div>
          <div className="save-row">
            <input
              className="text-input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              aria-label="Preset name"
            />
            <button className="chip" onClick={handleSave}>
              Save
            </button>
            <button className="chip" onClick={handleExport}>
              Export
            </button>
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
          {notice && <div className="notice">{notice}</div>}

          {ent.role === "admin" && isPaymentsConfigured && (
            <PublishPanel getSession={currentSession} flash={flash} />
          )}

          {saved.length > 0 && (
            <>
              <div className="builder-section-title">Saved Presets</div>
              <div className="saved-list">
                {saved.map((s) => (
                  <div className="saved-item" key={s.id}>
                    <button className="saved-name" onClick={() => loadSaved(s)}>
                      {s.name}
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
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Admin-only publish panel (D-04): pushes the current Studio design to the
 * cloud library — either as a shared template or assigned to a single user.
 * Rendered only when role === "admin" AND Supabase is configured; RLS blocks
 * these operations server-side for everyone else regardless of UI state.
 */
function PublishPanel({
  getSession,
  flash,
}: {
  getSession: () => CustomSession;
  flash: (msg: string) => void;
}) {
  const [tagline, setTagline] = useState("");
  const [users, setUsers] = useState<Array<{ userId: string; email: string | null }>>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [published, setPublished] = useState<CloudAudio[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [allUsers, mine] = await Promise.all([
        listAllUsers(),
        listMyPublishedAudios(),
      ]);
      setUsers(allUsers);
      setPublished(mine);
      setSelectedUser((prev) => prev || allUsers[0]?.userId || "");
    } catch {
      flash("Could not load library data");
    }
    // flash is stable enough for this panel — recreating it must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const publishTemplate = async () => {
    setBusy(true);
    try {
      const session = getSession();
      await publishAudio(session, {
        name: session.name,
        goalTagline: tagline.trim() || undefined,
        isTemplate: true,
      });
      flash("Published as template ✓");
      await refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  const publishForUser = async () => {
    if (!selectedUser) return;
    setBusy(true);
    try {
      const session = getSession();
      const id = await publishAudio(session, {
        name: session.name,
        goalTagline: tagline.trim() || undefined,
        isTemplate: false,
      });
      await assignAudio(id, selectedUser);
      flash("Published for user ✓");
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
    <>
      <div className="builder-section-title">Publish</div>
      <div className="publish-panel">
        <input
          className="text-input"
          value={tagline}
          maxLength={90}
          placeholder="Goal tagline (optional)"
          aria-label="Goal tagline"
          onChange={(e) => setTagline(e.target.value)}
        />
        <div className="publish-actions">
          <button className="chip" disabled={busy} onClick={() => void publishTemplate()}>
            Publish as template
          </button>
        </div>
        <div className="publish-actions">
          <select
            className="select"
            value={selectedUser}
            aria-label="Assign to user"
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.email ?? u.userId}
              </option>
            ))}
          </select>
          <button
            className="chip"
            disabled={busy || !selectedUser}
            onClick={() => void publishForUser()}
          >
            Publish for this user
          </button>
        </div>
        {published.length > 0 && (
          <div className="saved-list">
            {published.map((a) => (
              <div className="saved-item" key={a.id}>
                <span className="saved-name">
                  {a.name}
                  {a.isTemplate ? " · template" : ""}
                </span>
                <button
                  className="saved-del"
                  aria-label={`Delete ${a.name}`}
                  onClick={() => void remove(a.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function LayerCard({
  layer,
  onPatch,
  onRemove,
}: {
  layer: BuilderLayerSpec;
  onPatch: (patch: Partial<BuilderLayerSpec>) => void;
  onRemove: () => void;
}) {
  const [showFinder, setShowFinder] = useState(false);
  const entrainment = isEntrainment(layer.type);
  const tonal = entrainment || layer.type === "pure";
  const suggestions = showFinder ? findRelated(layer.carrierHz).slice(0, 6) : [];

  return (
    <div className="layer-card">
      <div className="layer-row">
        <select
          className="select"
          value={layer.type}
          aria-label="Layer type"
          onChange={(e) => onPatch({ type: e.target.value as BuilderLayerType })}
        >
          {LAYER_TYPES.map((t) => (
            <option key={t} value={t}>
              {LAYER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button className="saved-del" aria-label="Remove layer" onClick={onRemove}>
          ✕
        </button>
      </div>

      {tonal && (
        <div className="layer-row">
          <label className="inline-label">
            {layer.type === "pure" ? "Tone (Hz)" : "Carrier (Hz)"}
            <input
              className="num-input"
              type="number"
              min={20}
              max={1500}
              step={0.01}
              value={layer.carrierHz}
              onChange={(e) => onPatch({ carrierHz: Number(e.target.value) })}
            />
          </label>
          <button className="chip small" onClick={() => setShowFinder((v) => !v)}>
            {showFinder ? "Close" : "🔍 Related frequencies"}
          </button>
        </div>
      )}

      {showFinder && tonal && (
        <div className="finder">
          {suggestions.map((s) => (
            <button
              key={s.hz}
              className="chip small"
              title={s.relation}
              onClick={() => {
                onPatch({ carrierHz: s.hz });
                setShowFinder(false);
              }}
            >
              {s.hz} Hz · {s.relation}
            </button>
          ))}
        </div>
      )}

      {entrainment && (
        <div className="layer-row">
          <label className="inline-label">
            Beat
            <select
              className="select"
              value={layer.beatMode}
              onChange={(e) =>
                onPatch({ beatMode: e.target.value as "follow" | "fixed" })
              }
            >
              <option value="follow">Follow session curve</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>
          {layer.beatMode === "fixed" && (
            <label className="inline-label">
              Hz
              <input
                className="num-input"
                type="number"
                min={0.5}
                max={50}
                step={0.1}
                value={layer.fixedBeatHz}
                onChange={(e) => onPatch({ fixedBeatHz: Number(e.target.value) })}
              />
            </label>
          )}
        </div>
      )}

      <label className="mixer-row compact">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={layer.gain}
          style={{ "--fill": `${layer.gain * 100}%` } as React.CSSProperties}
          onChange={(e) => onPatch({ gain: Number(e.target.value) })}
        />
        <span className="value">{Math.round(layer.gain * 100)}%</span>
      </label>
    </div>
  );
}

function CurveEditor({
  curve,
  onChange,
}: {
  curve: BuilderCurve;
  onChange: (c: BuilderCurve) => void;
}) {
  const patch = (p: Partial<BuilderCurve>) => onChange({ ...curve, ...p });

  // Mini preview: normalized polyline of the ramp shape.
  const maxHz = Math.max(curve.startHz, curve.targetHz, curve.endHz ?? 0, 1);
  const y = (hz: number) => 44 - (hz / maxHz) * 36;
  const endY = curve.endHz === null ? y(curve.targetHz) : y(curve.endHz);
  const path = `M 4 ${y(curve.startHz)} L 56 ${y(curve.targetHz)} L 124 ${y(curve.targetHz)} L 176 ${endY}`;

  return (
    <div className="curve-editor">
      <svg viewBox="0 0 180 48" className="curve-preview" aria-hidden>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <div className="curve-fields">
        <label className="inline-label">
          Start (Hz)
          <input
            className="num-input"
            type="number"
            min={0.5}
            max={50}
            step={0.1}
            value={curve.startHz}
            onChange={(e) => patch({ startHz: Number(e.target.value) })}
          />
        </label>
        <label className="inline-label">
          Target (Hz)
          <input
            className="num-input"
            type="number"
            min={0.5}
            max={50}
            step={0.1}
            value={curve.targetHz}
            onChange={(e) => patch({ targetHz: Number(e.target.value) })}
          />
        </label>
        <label className="inline-label">
          Descend (min)
          <input
            className="num-input"
            type="number"
            min={0.1}
            max={60}
            step={0.5}
            value={curve.rampInMin}
            onChange={(e) => patch({ rampInMin: Number(e.target.value) })}
          />
        </label>
        <label className="inline-label check">
          <input
            type="checkbox"
            checked={curve.endHz !== null}
            onChange={(e) => patch({ endHz: e.target.checked ? curve.startHz : null })}
          />
          Rise back at the end
        </label>
        {curve.endHz !== null && (
          <>
            <label className="inline-label">
              End (Hz)
              <input
                className="num-input"
                type="number"
                min={0.5}
                max={50}
                step={0.1}
                value={curve.endHz}
                onChange={(e) => patch({ endHz: Number(e.target.value) })}
              />
            </label>
            <label className="inline-label">
              Rise (min)
              <input
                className="num-input"
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={curve.rampOutMin}
                onChange={(e) => patch({ rampOutMin: Number(e.target.value) })}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
