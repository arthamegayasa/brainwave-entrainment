import { BuilderEngine } from "../audio/builder";

/**
 * Shared BuilderEngine singleton (quick-260707-a47): Studio and Library both
 * start custom sessions through this module, so they share ONE AudioContext
 * and only one custom session plays at a time. The AudioContext must be
 * created/resumed inside a user gesture (UI-08); the engine itself never
 * creates one (ENG-07).
 */

let ctx: AudioContext | null = null;
let engine: BuilderEngine | null = null;

export async function ensureBuilder(): Promise<BuilderEngine> {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  if (!engine) engine = new BuilderEngine(ctx);
  return engine;
}

/** The engine if it was ever created (null before first ensureBuilder()). */
export function getBuilderEngine(): BuilderEngine | null {
  return engine;
}

/**
 * Which library/studio item currently owns the shared engine. Lives at module
 * level so a transport survives its view unmounting: navigating away from
 * Library while audio plays and coming back must restore the Stop control
 * instead of showing a Play button over audible audio.
 */
let nowPlayingId: string | null = null;

export function setNowPlaying(id: string | null): void {
  nowPlayingId = id;
}

/**
 * The id of the item playing on the shared engine, or null. Also self-heals
 * the engine's one blind spot: a timed session that reaches its natural end
 * keeps isRunning true until stop() is called — detect that here (remaining
 * time exhausted) and stop it, so transport polls see a clean idle state.
 */
export function getNowPlaying(): string | null {
  if (!engine || !engine.isRunning) {
    nowPlayingId = null;
    return null;
  }
  const p = engine.progress();
  if (p.remainingSec !== null && p.remainingSec <= 0) {
    engine.stop();
    nowPlayingId = null;
    return null;
  }
  return nowPlayingId;
}

/** Stop custom-audio playback and clear the shared transport state. */
export function stopBuilderPlayback(): void {
  engine?.stop();
  nowPlayingId = null;
}
