import { describe, it, expect } from "vitest";
import { createListeningQueue, createPlayRecorder, SendError } from "../src/state/listening";
import type { AudioSnapshot, PendingEntry, Play, QueueStorage } from "../src/state/listening";

const SLEEPING: AudioSnapshot = {
  kind: "preset",
  id: "sleeping",
  name: "Sleeping",
  emoji: "🌙",
  band: "delta",
};

/**
 * The device's two clocks: the wall clock, starting 21:00 WIB, and the audio
 * clock (AudioContext.currentTime), which moves with it only while the audio
 * plays. Both only move when the test says so.
 */
function fakeClocks() {
  let wallMs = Date.parse("2026-09-26T21:00:00+07:00");
  let audioSec = 500; // the shared context has played before
  let playing = true;
  return {
    now: () => wallMs,
    audioSec: () => audioSec,
    advance: (sec: number) => {
      wallMs += sec * 1000;
      if (playing) audioSec += sec;
    },
    /** The audio stands still (paused, interrupted, frozen with the page) or plays again. */
    play: (on: boolean) => {
      playing = on;
    },
  };
}

function recorder(clock = fakeClocks()) {
  let n = 0;
  const rec = createPlayRecorder({
    now: clock.now,
    audioSec: clock.audioSec,
    newId: () => `play-${++n}`,
    timeZone: () => "Asia/Jakarta",
  });
  return { rec, clock };
}

describe("Play recorder", () => {
  it("a playback under 30 seconds is not a Play; 30 seconds is", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(29);
    expect(rec.stop()).toBeNull();

    rec.start(SLEEPING, 20);
    clock.advance(30);
    expect(rec.stop()).toMatchObject({ listenedSec: 30, outcome: "stopped" });
  });

  it("takes the time listened from the audio clock and start and end from the wall clock", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(60);
    clock.play(false); // nobody has to say so: the audio clock stands still
    clock.advance(120);
    clock.play(true);
    clock.advance(40);
    expect(rec.heardSec()).toBe(100);
    expect(rec.stop()).toMatchObject({
      startedAt: "2026-09-26T14:00:00.000Z",
      endedAt: "2026-09-26T14:03:40.000Z",
      listenedSec: 100,
    });
  });

  it("a natural end means completed", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(20 * 60);
    expect(rec.end()).toMatchObject({
      audio: SLEEPING,
      plannedMin: 20,
      listenedSec: 1200,
      outcome: "completed",
      timeZone: "Asia/Jakarta",
    });
  });

  it("a natural end noticed hours later is dated when the whole length had been heard", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(10 * 60);
    clock.play(false);
    clock.advance(5 * 60);
    clock.play(true);
    clock.advance(3 * 3600); // a locked phone held the tab overnight; the audio clock ran on
    expect(rec.end()).toMatchObject({
      endedAt: "2026-09-26T14:25:00.000Z",
      listenedSec: 1200,
      outcome: "completed",
    });
  });

  it("an early stop means stopped, with the time listened until then", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(7 * 60 + 30);
    expect(rec.stop()).toMatchObject({
      plannedMin: 20,
      listenedSec: 450,
      outcome: "stopped",
    });
  });

  it("a stop after the whole length was heard means completed at the end (it went unnoticed)", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(20 * 60 + 5);
    expect(rec.stop()).toMatchObject({
      endedAt: "2026-09-26T14:20:00.000Z",
      listenedSec: 1200,
      outcome: "completed",
    });
  });

  it("a stop after a long wall-clock gap the audio clock did not share is stopped, not completed", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(4 * 60);
    clock.play(false); // a call froze the audio while the page was frozen too
    clock.advance(3 * 3600);
    expect(rec.stop()).toMatchObject({
      endedAt: "2026-09-26T17:04:00.000Z",
      listenedSec: 240,
      outcome: "stopped",
    });
  });

  it("an open-ended (∞) session is open, with its duration", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, null);
    clock.advance(45 * 60);
    expect(rec.stop()).toMatchObject({ plannedMin: null, listenedSec: 2700, outcome: "open" });
  });

  it("a stop right after the audio plays again counts only the time heard before it stood still", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(90);
    clock.play(false);
    clock.advance(300);
    clock.play(true);
    expect(rec.stop()).toMatchObject({ listenedSec: 90, outcome: "stopped" });
  });

  it("a stop while the audio stands still counts only the time heard before", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(20);
    clock.play(false);
    clock.advance(600);
    expect(rec.stop()).toBeNull();
  });

  it("records nothing without a playback, and each playback once", () => {
    const { rec, clock } = recorder();
    expect(rec.stop()).toBeNull();
    expect(rec.heardSec()).toBe(0);
    rec.start(SLEEPING, 20);
    clock.advance(60);
    expect(rec.stop()).not.toBeNull();
    expect(rec.end()).toBeNull();
    expect(rec.stop()).toBeNull();
  });
});

function aPlay(id: string): Play {
  return {
    id,
    audio: SLEEPING,
    startedAt: "2026-09-26T14:00:00.000Z",
    endedAt: "2026-09-26T14:20:00.000Z",
    listenedSec: 1200,
    plannedMin: 20,
    outcome: "completed",
    timeZone: "Asia/Jakarta",
  };
}

/** The device's localStorage, kept across "reloads" of the queue. */
function memoryStorage(): QueueStorage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
}

/**
 * The server end of the sender: remembers every request it received, stores
 * rows by id like the database (a re-sent id is ignored), and can be told to
 * fail the next request, either before storing (offline, or an HTTP error
 * status) or after (the response was lost), or to hold its answer until the
 * test releases it. A row it rejects for good fails every request carrying
 * it, and such a request stores nothing, like one INSERT of many rows.
 */
function fakeServer() {
  const requests: string[][] = [];
  const rows = new Map<string, PendingEntry>();
  const rejections = new Map<string, SendError>();
  let failure: "offline" | "lost response" | number | null = null;
  let held: { arrived: () => void; answered: Promise<void> } | null = null;
  return {
    requests,
    rows,
    failNext(kind: "offline" | "lost response" | number) {
      failure = kind;
    },
    reject(id: string, status: number, code: string) {
      rejections.set(id, new SendError(status, code, `rejected ${id}`));
    },
    holdNext() {
      let arrived = () => {};
      let answer = () => {};
      const request = new Promise<void>((resolve) => (arrived = resolve));
      held = { arrived, answered: new Promise<void>((resolve) => (answer = resolve)) };
      return { request, answer };
    },
    send: async (entries: PendingEntry[]) => {
      const kind = failure;
      const hold = held;
      failure = null;
      held = null;
      const ids = entries.map((e) => ("play" in e ? e.play.id : e.download.id));
      requests.push(ids);
      if (hold) {
        hold.arrived();
        await hold.answered;
      }
      if (kind === "offline") throw new Error("Failed to fetch");
      if (typeof kind === "number") throw new SendError(kind, "", `HTTP ${kind}`);
      const rejected = ids.find((id) => rejections.has(id));
      if (rejected) throw rejections.get(rejected);
      entries.forEach((e, i) => {
        if (!rows.has(ids[i])) rows.set(ids[i], e);
      });
      if (kind === "lost response") throw new Error("Failed to fetch");
    },
  };
}

describe("offline queue", () => {
  it("survives a reload: a Play queued before it is sent after it", async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    server.failNext("offline");
    const before = createListeningQueue({ storage, send: server.send });
    before.enqueue({ userId: "ayu", play: aPlay("p1") });
    await before.flush("ayu");

    const after = createListeningQueue({ storage, send: server.send });
    await after.flush("ayu");

    expect([...server.rows.keys()]).toEqual(["p1"]);
  });

  it("flushes once: triggers that fire together (start, online, visible) send each entry once", async () => {
    const server = fakeServer();
    const queue = createListeningQueue({ storage: memoryStorage(), send: server.send });
    queue.enqueue({ userId: "ayu", play: aPlay("p1") });
    queue.enqueue({ userId: "ayu", play: aPlay("p2") });

    await Promise.all([queue.flush("ayu"), queue.flush("ayu"), queue.flush("ayu")]);
    await queue.flush("ayu");

    expect(server.requests).toEqual([["p1", "p2"]]);
  });

  it("never double-sends after a failed send: the retry carries the same ids, then stops", async () => {
    const server = fakeServer();
    const queue = createListeningQueue({ storage: memoryStorage(), send: server.send });
    queue.enqueue({ userId: "ayu", play: aPlay("p1") });

    server.failNext("offline");
    await queue.flush("ayu");
    server.failNext("lost response");
    await queue.flush("ayu");
    await queue.flush("ayu");
    await queue.flush("ayu");

    expect(server.requests).toEqual([["p1"], ["p1"], ["p1"]]);
    expect([...server.rows.keys()]).toEqual(["p1"]);
  });

  it("keeps a Play recorded while a send is in flight for the next flush", async () => {
    const server = fakeServer();
    const queue = createListeningQueue({ storage: memoryStorage(), send: server.send });
    queue.enqueue({ userId: "ayu", play: aPlay("p1") });

    const slow = server.holdNext();
    const inFlight = queue.flush("ayu");
    await slow.request;
    queue.enqueue({ userId: "ayu", play: aPlay("p2") });
    const overlapping = queue.flush("ayu");
    slow.answer();
    await Promise.all([inFlight, overlapping]);
    await queue.flush("ayu");

    expect(server.requests).toEqual([["p1"], ["p2"]]);
  });

  it("sends only the signed-in User's entries; another User's wait for them", async () => {
    const server = fakeServer();
    const queue = createListeningQueue({ storage: memoryStorage(), send: server.send });
    queue.enqueue({ userId: "ayu", play: aPlay("p1") });
    queue.enqueue({ userId: "budi", play: aPlay("p2") });

    await queue.flush("budi");
    await queue.flush("ayu");
    await queue.flush("budi");

    expect(server.requests).toEqual([["p2"], ["p1"]]);
  });

  it.each([400, 403])(
    "sets aside a Play the server rejects for good (%i), with its error code; later Plays sync and it is never sent again",
    async (status) => {
      const storage = memoryStorage();
      const server = fakeServer();
      server.reject("p1", status, "23514");
      const queue = createListeningQueue({ storage, send: server.send });
      queue.enqueue({ userId: "ayu", play: aPlay("p1") });
      queue.enqueue({ userId: "ayu", play: aPlay("p2") });

      await queue.flush("ayu");

      expect([...server.rows.keys()]).toEqual(["p2"]);
      expect(queue.rejected()).toEqual([{ entry: { userId: "ayu", play: aPlay("p1") }, status, code: "23514" }]);

      const sentBefore = server.requests.length;
      const afterReload = createListeningQueue({ storage, send: server.send });
      afterReload.enqueue({ userId: "ayu", play: aPlay("p3") });
      await afterReload.flush("ayu");
      await afterReload.flush("ayu");

      expect(server.requests.slice(sentBefore)).toEqual([["p3"]]);
      expect([...server.rows.keys()]).toEqual(["p2", "p3"]);
      expect(afterReload.rejected()).toEqual([
        { entry: { userId: "ayu", play: aPlay("p1") }, status, code: "23514" },
      ]);
    },
  );

  it.each([0, 401, 408, 429, 500])(
    "keeps a Play after a failure a retry can fix (%i) and delivers it once on the next flush",
    async (status) => {
      const server = fakeServer();
      const queue = createListeningQueue({ storage: memoryStorage(), send: server.send });
      queue.enqueue({ userId: "ayu", play: aPlay("p1") });

      server.failNext(status);
      await queue.flush("ayu");
      await queue.flush("ayu");
      await queue.flush("ayu");

      expect(server.requests).toEqual([["p1"], ["p1"]]);
      expect([...server.rows.keys()]).toEqual(["p1"]);
      expect(queue.rejected()).toEqual([]);
    },
  );

  it("a failure a retry can fix while the rejected Play is being singled out sets nothing aside; the next flush does", async () => {
    const server = fakeServer();
    server.reject("p1", 400, "23514");
    const queue = createListeningQueue({ storage: memoryStorage(), send: server.send });
    queue.enqueue({ userId: "ayu", play: aPlay("p1") });
    queue.enqueue({ userId: "ayu", play: aPlay("p2") });

    const rejectedBatch = server.holdNext();
    const flushing = queue.flush("ayu");
    await rejectedBatch.request;
    server.failNext("offline");
    rejectedBatch.answer();
    await flushing;

    expect(queue.rejected()).toEqual([]);
    expect(server.rows.size).toBe(0);

    await queue.flush("ayu");
    await queue.flush("ayu");

    expect(server.requests).toEqual([["p1", "p2"], ["p1"], ["p1", "p2"], ["p1"], ["p2"]]);
    expect([...server.rows.keys()]).toEqual(["p2"]);
    expect(queue.rejected()).toEqual([{ entry: { userId: "ayu", play: aPlay("p1") }, status: 400, code: "23514" }]);
  });
});
