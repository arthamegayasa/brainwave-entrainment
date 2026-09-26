import { describe, it, expect } from "vitest";
import { createListeningQueue, createPlayRecorder } from "../src/state/listening";
import type { AudioSnapshot, PendingEntry, Play, QueueStorage } from "../src/state/listening";

const SLEEPING: AudioSnapshot = {
  kind: "preset",
  id: "sleeping",
  name: "Sleeping",
  emoji: "🌙",
  band: "delta",
};

/** A clock that only moves when the test says so, starting 21:00 WIB. */
function fakeClock() {
  let ms = Date.parse("2026-09-26T21:00:00+07:00");
  return {
    now: () => ms,
    advance: (sec: number) => {
      ms += sec * 1000;
    },
  };
}

function recorder(clock = fakeClock()) {
  let n = 0;
  const rec = createPlayRecorder({
    now: clock.now,
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

  it("excludes paused time from the time listened, not from start and end", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(60);
    rec.pause();
    clock.advance(120);
    rec.resume();
    clock.advance(40);
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
    rec.pause();
    clock.advance(5 * 60);
    rec.resume();
    clock.advance(3 * 3600); // a locked phone held the tab overnight
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

  it("an open-ended (∞) session is open, with its duration", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, null);
    clock.advance(45 * 60);
    expect(rec.stop()).toMatchObject({ plannedMin: null, listenedSec: 2700, outcome: "open" });
  });

  it("a stop right after resume counts only the time heard before the pause", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(90);
    rec.pause();
    clock.advance(300);
    rec.resume();
    expect(rec.stop()).toMatchObject({ listenedSec: 90, outcome: "stopped" });
  });

  it("a stop while paused counts only the time heard before the pause", () => {
    const { rec, clock } = recorder();
    rec.start(SLEEPING, 20);
    clock.advance(20);
    rec.pause();
    clock.advance(600);
    expect(rec.stop()).toBeNull();
  });

  it("records nothing without a playback, and each playback once", () => {
    const { rec, clock } = recorder();
    expect(rec.stop()).toBeNull();
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
 * fail the next request, either before storing (offline) or after (the
 * response was lost), or to hold its answer until the test releases it.
 */
function fakeServer() {
  const requests: string[][] = [];
  const rows = new Map<string, PendingEntry>();
  let failure: "offline" | "lost response" | null = null;
  let held: { arrived: () => void; answered: Promise<void> } | null = null;
  return {
    requests,
    rows,
    failNext(kind: "offline" | "lost response") {
      failure = kind;
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
      requests.push(entries.map((e) => ("play" in e ? e.play.id : e.download.id)));
      if (hold) {
        hold.arrived();
        await hold.answered;
      }
      if (kind === "offline") throw new Error("Failed to fetch");
      for (const e of entries) {
        const id = "play" in e ? e.play.id : e.download.id;
        if (!rows.has(id)) rows.set(id, e);
      }
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
});
