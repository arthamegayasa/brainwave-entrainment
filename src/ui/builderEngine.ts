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
