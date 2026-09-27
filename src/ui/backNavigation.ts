import { useEffect, useEffectEvent } from "react";

/**
 * Back (Android Back, the browser's Back) inside the Player. The app has no
 * router: every view except the Personal URL is state (ADR-016), so Back
 * would leave the app. Each open layer, the Player and a sheet over it, owns
 * one history entry at the same address, tagged with its depth. Back lands on
 * the entry below and closes every layer deeper than it: the top sheet first,
 * then the Player, which shrinks into the Mini-player. A layer closed on
 * screen (⌄, ✕, End session) takes its entry back out, so Back never lands on
 * a stale one. Other views keep the browser's own Back.
 */

const DEPTH_KEY = "swarasantiLayer";

/** How each open layer closes, bottom first. */
const layers: Array<() => void> = [];
/** Entries of layers closed on screen, removed in one step once the closing settles. */
let staleEntries = 0;

window.addEventListener("popstate", (event) => {
  const depth = (event.state as Record<string, unknown> | null)?.[DEPTH_KEY];
  const kept = typeof depth === "number" ? depth : 0;
  while (layers.length > kept) layers.pop()!();
});

/**
 * While `open`, the layer owns a history entry and Back runs `close`, which
 * must make `open` false. Closing it any other way removes the entry.
 */
export function useBackLayer(open: boolean, close: () => void): void {
  const onBack = useEffectEvent(close);
  useEffect(() => {
    if (!open) return;
    const layer = () => onBack();
    layers.push(layer);
    window.history.pushState({ ...window.history.state, [DEPTH_KEY]: layers.length }, "");
    return () => {
      const index = layers.indexOf(layer);
      if (index === -1) return; // Back closed it: its entry is already behind
      // Layers above close with it (the Player takes its open sheet along).
      staleEntries += layers.length - index;
      layers.splice(index);
      queueMicrotask(() => {
        if (staleEntries === 0) return;
        window.history.go(-staleEntries);
        staleEntries = 0;
      });
    };
  }, [open]);
}
