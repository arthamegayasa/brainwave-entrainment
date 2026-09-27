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
 *
 * The tags belong to one page load: entries a reload or a restored tab left
 * behind count as the base, and Forward onto the entry of a layer closed
 * since steps back off it. Either would otherwise make one Back do nothing.
 */

const LAYER_KEY = "swarasantiLayer";
/** Tells this page load's entries from those an earlier load left in the history. */
const PAGE_LOAD = performance.timeOrigin;

interface LayerTag {
  load: number;
  depth: number;
}

/** How each open layer closes, bottom first. */
const layers: Array<() => void> = [];
/** Entries of layers closed on screen, removed in one step once the closing settles. */
let staleEntries = 0;

window.addEventListener("popstate", (event) => {
  const tag = (event.state as Record<string, LayerTag | undefined> | null)?.[LAYER_KEY];
  const depth = tag?.load === PAGE_LOAD ? tag.depth : 0;
  if (depth > layers.length) {
    window.history.go(layers.length - depth);
    return;
  }
  while (layers.length > depth) layers.pop()!();
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
    const tag: LayerTag = { load: PAGE_LOAD, depth: layers.length };
    window.history.pushState({ ...window.history.state, [LAYER_KEY]: tag }, "");
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
