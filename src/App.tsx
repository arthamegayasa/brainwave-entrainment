import { useState } from "react";
import "./App.css";
import { AudioEngine, REGISTERED_KINDS } from "./audio/engine";
import { SOUND_LABELS_ID } from "./audio/constants";
import type { SoundKind } from "./audio/types";

// Module-level singletons on the React side — the engine itself never creates
// an AudioContext (ENG-07); it is created lazily inside a user gesture (UI-08).
let ctx: AudioContext | null = null;
let engine: AudioEngine | null = null;

async function ensureEngine(): Promise<AudioEngine> {
  if (!ctx) {
    ctx = new AudioContext();
  }
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  if (!engine) {
    engine = new AudioEngine(ctx);
  }
  return engine;
}

function App() {
  const [activeKind, setActiveKind] = useState<SoundKind | null>(null);
  const [volume, setVolume] = useState(0.8);

  const handlePlay = async (kind: SoundKind) => {
    const e = await ensureEngine();
    e.setMasterVolume(volume);
    e.play(kind);
    setActiveKind(kind);
  };

  const handleStop = () => {
    engine?.stop();
    setActiveKind(null);
  };

  const handleVolume = (v: number) => {
    setVolume(v);
    engine?.setMasterVolume(v);
  };

  return (
    <main className="audition">
      <h1>Healing Audio — Audisi Engine</h1>
      {REGISTERED_KINDS.map((kind) => (
        <button
          key={kind}
          className={activeKind === kind ? "active" : ""}
          onClick={() => void handlePlay(kind)}
        >
          {SOUND_LABELS_ID[kind]}
        </button>
      ))}
      <button onClick={handleStop}>Stop</button>
      <label>
        Volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => handleVolume(Number(e.target.value))}
        />
      </label>
      <p className="hint">Gunakan headphone untuk binaural</p>
    </main>
  );
}

export default App;
