/**
 * Behavioral progress state (quick-260707-a47, D-05): journey steps (goal
 * gradient), time-of-day recommendations (smart defaults), chosen goals
 * (IKEA-effect personalization), weekly streaks (loss aversion), and the
 * reciprocity card threshold. Pure TypeScript — NO React imports — persisted
 * under localStorage key `serenade.progress.v1` with the same storage()/
 * try-catch resilience pattern as prefs.ts.
 */

export interface CompletedSession {
  /** ISO timestamp of the completion. */
  at: string;
  /** Preset id or custom-session id that was completed. */
  ref: string;
}

export interface ProgressState {
  version: 1;
  /** ISO timestamp of the first visit — journey step 1. */
  discoveredAt: string | null;
  /** Preset ids picked in the goal picker, in chosen order. */
  chosenGoals: string[];
  /** True once the picker was answered OR skipped. */
  goalPickerDone: boolean;
  completedSessions: CompletedSession[];
  reciprocityDismissed: boolean;
}

const KEY = "serenade.progress.v1";
/** Cap stored completions; oldest entries are dropped beyond this. */
const MAX_SESSIONS = 400;

const DEFAULTS: ProgressState = {
  version: 1,
  discoveredAt: null,
  chosenGoals: [],
  goalPickerDone: false,
  completedSessions: [],
  reciprocityDismissed: false,
};

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(): ProgressState {
  const s = storage();
  if (!s) return structuredClone(DEFAULTS);
  try {
    const raw = s.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    return {
      version: 1,
      discoveredAt:
        typeof parsed.discoveredAt === "string" ? parsed.discoveredAt : null,
      chosenGoals: Array.isArray(parsed.chosenGoals)
        ? parsed.chosenGoals.filter((g): g is string => typeof g === "string")
        : [],
      goalPickerDone: parsed.goalPickerDone === true,
      completedSessions: Array.isArray(parsed.completedSessions)
        ? parsed.completedSessions.filter(
            (c): c is CompletedSession =>
              typeof c === "object" &&
              c !== null &&
              typeof (c as CompletedSession).at === "string" &&
              typeof (c as CompletedSession).ref === "string",
          )
        : [],
      reciprocityDismissed: parsed.reciprocityDismissed === true,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function write(state: ProgressState): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — stay in-memory */
  }
}

/**
 * Load progress; on first call ever, records the discovery timestamp
 * (journey step 1) and persists — journeyPercent() is therefore never 0.
 */
export function loadProgress(): ProgressState {
  const state = read();
  if (!state.discoveredAt) {
    state.discoveredAt = new Date().toISOString();
    write(state);
  }
  return state;
}

/** Persist the picked goals (in order) — completes journey step 2. */
export function setChosenGoals(ids: string[]): void {
  const state = loadProgress();
  state.chosenGoals = ids.filter((id) => typeof id === "string");
  state.goalPickerDone = true;
  write(state);
}

/** Mark the goal picker as seen WITHOUT completing step 2 (recoverable). */
export function skipGoalPicker(): void {
  const state = loadProgress();
  state.goalPickerDone = true;
  write(state);
}

/** Record a finished session (natural end or >= 5 minutes listened). */
export function recordSessionCompleted(ref: string, now: Date = new Date()): void {
  const state = loadProgress();
  state.completedSessions.push({ at: now.toISOString(), ref });
  if (state.completedSessions.length > MAX_SESSIONS) {
    state.completedSessions = state.completedSessions.slice(-MAX_SESSIONS);
  }
  write(state);
}

/** The four goal-gradient journey steps (D-05), in order. */
export function journeySteps(): Array<{ label: string; done: boolean }> {
  const state = loadProgress();
  const sessions = state.completedSessions.length;
  return [
    { label: "Discovered Serenade", done: state.discoveredAt !== null },
    { label: "Personalized your goals", done: state.chosenGoals.length > 0 },
    { label: "First session completed", done: sessions >= 1 },
    { label: "3 sessions completed", done: sessions >= 3 },
  ];
}

/** Journey completion 0-100; step 1 auto-completes, so this is >= 25. */
export function journeyPercent(): number {
  const steps = journeySteps();
  const done = steps.filter((s) => s.done).length;
  return Math.round((done / steps.length) * 100);
}

/**
 * Time-of-day smart default (D-05). Returns a preset ID — the UI resolves
 * names via getPreset. Windows (local time):
 *   05:00-10:59 focus · 11:00-14:59 power-nap · 15:00-17:59 energy ·
 *   18:00-20:59 healing-relaxation · 21:00-04:59 deep-sleep
 */
export function recommendedPresetId(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 11) return "focus";
  if (h >= 11 && h < 15) return "power-nap";
  if (h >= 15 && h < 18) return "energy";
  if (h >= 18 && h < 21) return "healing-relaxation";
  return "deep-sleep";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-first weekday index: Mon = 0 … Sun = 6 (getDay() 0 maps to 6). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  day.setDate(day.getDate() - mondayIndex(d));
  return day;
}

/** Completions inside the current Mon-Sun week only. */
export function sessionsThisWeek(now: Date = new Date()): number {
  const from = startOfWeek(now).getTime();
  const to = from + 7 * 24 * 60 * 60 * 1000;
  return loadProgress().completedSessions.filter((c) => {
    const t = new Date(c.at).getTime();
    return t >= from && t < to;
  }).length;
}

/** boolean[7] indexed Mon..Sun — true on days with >= 1 completion. */
export function weeklyStreakDots(now: Date = new Date()): boolean[] {
  const from = startOfWeek(now).getTime();
  const to = from + 7 * 24 * 60 * 60 * 1000;
  const dots = [false, false, false, false, false, false, false];
  for (const c of loadProgress().completedSessions) {
    const at = new Date(c.at);
    const t = at.getTime();
    if (t >= from && t < to) dots[mondayIndex(at)] = true;
  }
  return dots;
}

/**
 * Consecutive calendar days (local time) with >= 1 completion, ending today —
 * a streak that ended yesterday still counts, so a morning visit before
 * today's session shows the live streak instead of 0.
 */
export function currentStreakDays(now: Date = new Date()): number {
  const days = new Set(
    loadProgress().completedSessions.map((c) =>
      startOfDay(new Date(c.at)).getTime(),
    ),
  );
  const cursor = startOfDay(now);
  if (!days.has(cursor.getTime())) {
    cursor.setDate(cursor.getDate() - 1); // allow a yesterday-ending streak
    if (!days.has(cursor.getTime())) return 0;
  }
  let streak = 0;
  while (days.has(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Reciprocity card (D-05): show after the 2nd completion until dismissed. */
export function shouldShowReciprocity(): boolean {
  const state = loadProgress();
  return state.completedSessions.length >= 2 && !state.reciprocityDismissed;
}

export function dismissReciprocityCard(): void {
  const state = loadProgress();
  state.reciprocityDismissed = true;
  write(state);
}

export function totalSessions(): number {
  return loadProgress().completedSessions.length;
}
