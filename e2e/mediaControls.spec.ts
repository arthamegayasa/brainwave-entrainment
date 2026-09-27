import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { advanceAudioClock, audioStates, openSessions, recordAudioContexts, setUpPreset } from "./helpers";

type MediaAction = "play" | "pause" | "stop";
interface RecordedMedia {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  position: MediaPositionState | null;
  actions: Partial<Record<MediaAction, () => void>>;
  element: HTMLAudioElement | null;
  invoke: (action: MediaAction) => void;
}
declare global {
  interface Window {
    __mediaControls: RecordedMedia;
  }
}

async function recordMediaControls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const media: RecordedMedia = {
      metadata: null,
      playbackState: "none",
      position: null,
      actions: {},
      element: null,
      invoke(action) {
        const handler = this.actions[action];
        if (!handler) throw new Error(`Missing Media controls action ${action}`);
        handler();
      },
    };
    window.__mediaControls = media;
    const nativeCreateElement = document.createElement.bind(document);
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const element = nativeCreateElement(tag, options);
      if (tag.toLowerCase() === "audio") media.element = element as HTMLAudioElement;
      return element;
    }) as typeof document.createElement;
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        get metadata() { return media.metadata; },
        set metadata(value: MediaMetadata | null) { media.metadata = value; },
        get playbackState() { return media.playbackState; },
        set playbackState(value: MediaSessionPlaybackState) { media.playbackState = value; },
        setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
          if (action === "play" || action === "pause" || action === "stop") {
            if (handler) media.actions[action] = () => handler({ action });
            else delete media.actions[action];
          }
        },
        setPositionState(position?: MediaPositionState) {
          media.position = position?.duration === undefined ? null : { ...position };
        },
      },
    });
  });
}

test.beforeEach(async ({ page }) => {
  await recordAudioContexts(page);
  await recordMediaControls(page);
  await openSessions(page);
});

test("Media controls hold, resume and end a Preset without losing its place or credit", async ({ page }) => {
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect.poll(() => page.evaluate(() => window.__mediaControls.element?.paused)).toBe(false);
  const meta = await page.evaluate(() => ({
    title: window.__mediaControls.metadata?.title,
    artist: window.__mediaControls.metadata?.artist,
    artwork: window.__mediaControls.metadata?.artwork,
    duration: window.__mediaControls.position?.duration,
  }));
  expect(meta).toEqual({
    title: "Meditating",
    artist: "SwaraSanti",
    artwork: [expect.objectContaining({ src: expect.stringContaining("/scenes/deep-meditation-768.webp"), sizes: "768x512" })],
    duration: 900,
  });
  await advanceAudioClock(page, 301);
  await page.evaluate(() => window.__mediaControls.invoke("pause"));
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await expect(page.getByText("Paused")).toBeVisible();
  const position = await page.evaluate(() => window.__mediaControls.position?.position);
  expect(position).toBeGreaterThanOrEqual(300);
  const held = await page.locator(".timer").textContent();
  await page.waitForTimeout(600);
  await expect(page.locator(".timer")).toHaveText(held ?? "");
  await expect.poll(() => page.evaluate(() => window.__mediaControls.element?.paused)).toBe(true);
  await page.evaluate(() => window.__mediaControls.invoke("play"));
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect.poll(() => page.evaluate(() => window.__mediaControls.element?.paused)).toBe(false);
  await expect(page.locator(".timer")).not.toHaveText(held ?? "");
  await page.evaluate(() => window.__mediaControls.invoke("stop"));
  await expect(page.getByText("Session #1 this week")).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    metadata: window.__mediaControls.metadata,
    state: window.__mediaControls.playbackState,
    position: window.__mediaControls.position,
    actions: Object.keys(window.__mediaControls.actions),
    paused: window.__mediaControls.element?.paused,
  }))).toEqual({ metadata: null, state: "none", position: null, actions: [], paused: true });
});

test("device audio-focus loss holds a Play until resumed from Media controls", async ({ page }) => {
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await page.evaluate(() => window.__mediaControls.element?.pause());
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  const held = await page.locator(".timer").textContent();
  await page.waitForTimeout(600);
  await expect(page.locator(".timer")).toHaveText(held ?? "");
  await expect(page.getByRole("alert")).toContainText("Your device paused the audio");
  await page.evaluate(() => window.__mediaControls.invoke("play"));
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(page.locator(".timer")).not.toHaveText(held ?? "");
});

test("device restoring the media element resumes the same Play and AudioContext", async ({ page }) => {
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await page.evaluate(() => window.__mediaControls.element?.pause());
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  const held = await page.locator(".timer").textContent();
  await page.evaluate(() => window.__mediaControls.element?.play());
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect(page.locator(".timer")).not.toHaveText(held ?? "");
});

test("a rejected media resume keeps the Play held until a User gesture succeeds", async ({ page }) => {
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await page.evaluate(() => {
    const element = window.__mediaControls.element!;
    element.pause();
    element.play = () => Promise.reject(new DOMException("gesture needed", "NotAllowedError"));
  });
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await page.evaluate(() => window.__mediaControls.invoke("play"));
  await expect(page.getByRole("alert")).toContainText("Your device paused the audio");
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await page.evaluate(() => Reflect.deleteProperty(window.__mediaControls.element!, "play"));
  await page.getByRole("button", { name: "Resume audio" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect.poll(() => page.evaluate(() => window.__mediaControls.element?.paused)).toBe(false);
});

test("open-ended Plays never expose a Media controls position", async ({ page }) => {
  await setUpPreset(page, "Meditating", "∞");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => page.evaluate(() => window.__mediaControls.element?.paused)).toBe(false);
  expect(await page.evaluate(() => window.__mediaControls.position)).toBeNull();
  await page.evaluate(() => window.__mediaControls.invoke("pause"));
  expect(await page.evaluate(() => window.__mediaControls.position)).toBeNull();
});

test("audio-focus loss still holds the next Play after ending a prior Play", async ({ page }) => {
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => page.evaluate(() => window.__mediaControls.element?.paused)).toBe(false);
  await page.getByRole("button", { name: /End Session/ }).click();
  await setUpPreset(page, "Meditating", "15 min");
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  await expect.poll(() => page.evaluate(() => window.__mediaControls.element?.paused)).toBe(false);
  await page.evaluate(() => window.__mediaControls.element?.pause());
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await expect(page.getByRole("alert")).toContainText("Your device paused the audio");
});

test("Studio preview exposes Media controls and pauses from the OS", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("serenade.role.override", "clinician"));
  await page.reload();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.locator(".builder-transport").getByRole("button", { name: /Play/ }).click();
  await expect.poll(() => audioStates(page)).toEqual(["running"]);
  expect(await page.evaluate(() => window.__mediaControls.metadata?.title)).toBe("Studio preview");
  expect(await page.evaluate(() => window.__mediaControls.position)).toBeNull();
  await page.evaluate(() => window.__mediaControls.invoke("pause"));
  await expect.poll(() => audioStates(page)).toEqual(["suspended"]);
  await expect.poll(() => page.evaluate(() => window.__mediaControls.element?.paused)).toBe(true);
  await page.evaluate(() => window.__mediaControls.invoke("stop"));
  await expect.poll(() => page.evaluate(() => window.__mediaControls.metadata)).toBeNull();
});
