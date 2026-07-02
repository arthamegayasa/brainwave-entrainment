import { useEffect, useRef, useState } from "react";
import { BuilderEngine, isEntrainment } from "../audio/builder";
import type {
  BuilderCurve,
  BuilderLayerSpec,
  BuilderLayerType,
  CustomSession,
} from "../audio/builder";
import { findRelated } from "../audio/freqfinder";
import { SOLFEGGIO, SOUND_LABELS_ID } from "../audio/constants";
import {
  deleteCustomSession,
  exportSessionJSON,
  importSessionJSON,
  listCustomSessions,
  saveCustomSession,
} from "../state/customPresets";
import { formatClock } from "./bands";

let ctx: AudioContext | null = null;
let engine: BuilderEngine | null = null;

async function ensureBuilder(): Promise<BuilderEngine> {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  if (!engine) engine = new BuilderEngine(ctx);
  return engine;
}

const LAYER_TYPE_LABELS: Record<BuilderLayerType, string> = {
  binaural: "Binaural",
  isochronic: "Isochronic",
  monaural: "Monaural",
  pure: "Pure Tone",
  rain: SOUND_LABELS_ID.rain,
  ocean: SOUND_LABELS_ID.ocean,
  wind: SOUND_LABELS_ID.wind,
  brown: SOUND_LABELS_ID.brown,
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
  const [layers, setLayers] = useState<BuilderLayerSpec[]>([
    newLayer("binaural"),
    newLayer("ocean"),
  ]);
  const [curve, setCurve] = useState<BuilderCurve>(DEFAULT_CURVE);
  const [durationMin, setDurationMin] = useState<number | null>(30);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [name, setName] = useState("Sesi Custom Saya");
  const [saved, setSaved] = useState<CustomSession[]>(() => listCustomSessions());
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
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
    engine?.stop();
    setPlaying(false);
  };

  const patchLayer = (id: string, patch: Partial<BuilderLayerSpec>) => {
    setLayers((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...patch } : l));
      const updated = next.find((l) => l.id === id);
      if (updated && playing) engine?.updateLayer(updated);
      return next;
    });
  };

  const addLayer = () => {
    const layer = newLayer();
    setLayers((prev) => [...prev, layer]);
    if (playing) engine?.addLayer(layer);
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (playing) engine?.removeLayer(id);
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
    flash("Tersimpan ✓");
  };

  const handleExport = () => {
    const blob = new Blob([exportSessionJSON(currentSession())], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Z0-9]+/g, "-") || "sesi"}.serenade.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const imported = importSessionJSON(await file.text());
      setName(imported.name);
      setCurve(imported.curve);
      setLayers(imported.layers);
      flash("Preset ter-import ✓");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Import gagal");
    }
  };

  const loadSaved = (session: CustomSession) => {
    setName(session.name);
    setCurve(session.curve);
    setLayers(session.layers);
    flash("Preset dimuat ✓");
  };

  return (
    <section className="builder">
      <div className="builder-head">
        <div>
          <h1>Studio</h1>
          <p className="builder-sub">
            Rakit sesi multi-layer versimu sendiri — pilih metode, carrier, dan
            kurva perjalanan frekuensi.
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
              ▶ Putar
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
            + Tambah Layer
          </button>
        </div>

        <div className="builder-col">
          <div className="builder-section-title">Kurva Sesi</div>
          <CurveEditor curve={curve} onChange={setCurve} />

          <div className="builder-section-title">Durasi</div>
          <div className="chips">
            {DURATIONS.map((d) => (
              <button
                key={d ?? "inf"}
                className={`chip ${durationMin === d ? "selected" : ""}`}
                onClick={() => setDurationMin(d)}
              >
                {d === null ? "∞" : `${d} mnt`}
              </button>
            ))}
          </div>

          <div className="builder-section-title">Simpan & Bagikan</div>
          <div className="save-row">
            <input
              className="text-input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              aria-label="Nama preset"
            />
            <button className="chip" onClick={handleSave}>
              Simpan
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

          {saved.length > 0 && (
            <>
              <div className="builder-section-title">Preset Tersimpan</div>
              <div className="saved-list">
                {saved.map((s) => (
                  <div className="saved-item" key={s.id}>
                    <button className="saved-name" onClick={() => loadSaved(s)}>
                      {s.name}
                    </button>
                    <button
                      className="saved-del"
                      aria-label={`Hapus ${s.name}`}
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
          aria-label="Jenis layer"
          onChange={(e) => onPatch({ type: e.target.value as BuilderLayerType })}
        >
          {LAYER_TYPES.map((t) => (
            <option key={t} value={t}>
              {LAYER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button className="saved-del" aria-label="Hapus layer" onClick={onRemove}>
          ✕
        </button>
      </div>

      {tonal && (
        <div className="layer-row">
          <label className="inline-label">
            {layer.type === "pure" ? "Nada (Hz)" : "Carrier (Hz)"}
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
            {showFinder ? "Tutup" : "🔍 Frekuensi terkait"}
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
              <option value="follow">Ikuti kurva sesi</option>
              <option value="fixed">Tetap</option>
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
          Mulai (Hz)
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
          Turun (menit)
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
          Kembali naik di akhir
        </label>
        {curve.endHz !== null && (
          <>
            <label className="inline-label">
              Akhir (Hz)
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
              Naik (menit)
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
