import { useEffect, useEffectEvent } from "react";

/**
 * The app's history. Every page has its own address (ADR-027, `pages.ts`):
 * moving to another page adds an entry through `goToAddress`, and Back or
 * Forward onto another entry tells `subscribeAddress` listeners its address.
 *
 * Back inside the Player: each open layer, the Player and a sheet over it,
 * owns one more entry at the address of the page under it, tagged with its
 * depth. Back lands on the entry below and closes every layer deeper than it:
 * the top sheet first, then the Player, which shrinks into the Mini-player. A
 * layer closed on screen (⌄, ✕, End session, a nav tab) takes its entry back
 * out, so Back never lands on a stale one. A page address set while those
 * entries go waits for them: pushed on top, the next Back would land on the
 * closed layer's entry, and the removal would then step off the new page.
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
/** Set from the removal's `history.go` until its popstate arrives. */
let removing = false;
/** The page address to set once the removal lands. */
let pendingAddress: { path: string; replace: boolean } | null = null;
const addressListeners = new Set<(pathname: string) => void>();

function setAddress(path: string, replace: boolean): void {
  if (path === window.location.pathname) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
}

window.addEventListener("popstate", (event) => {
  if (removing) {
    removing = false;
    if (pendingAddress !== null) setAddress(pendingAddress.path, pendingAddress.replace);
    pendingAddress = null;
    return;
  }
  const tag = (event.state as Record<string, LayerTag | undefined> | null)?.[LAYER_KEY];
  const depth = tag?.load === PAGE_LOAD ? tag.depth : 0;
  if (depth > layers.length) {
    window.history.go(layers.length - depth);
    return;
  }
  while (layers.length > depth) layers.pop()!();
  for (const listener of addressListeners) listener(window.location.pathname);
});

/**
 * Shows `path` as a new history entry, or with `replace` in place of the
 * current one, which neither Back nor a reload then returns to.
 */
export function goToAddress(path: string, replace: boolean): void {
  if (removing || staleEntries > 0) pendingAddress = { path, replace };
  else setAddress(path, replace);
}

/** Calls `listener` with the address each Back or Forward lands on. */
export function subscribeAddress(listener: (pathname: string) => void): () => void {
  addressListeners.add(listener);
  return () => addressListeners.delete(listener);
}

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
        removing = true;
        window.history.go(-staleEntries);
        staleEntries = 0;
      });
    };
  }, [open]);
}
